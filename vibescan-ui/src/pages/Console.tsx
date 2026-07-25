import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api, type SignalDetail, type Stats, type Tile } from "../api";
import Viewport from "../components/Viewport";
import WorldMap, { type MapPoint } from "../components/WorldMap";
import SignalCard from "../components/SignalCard";
import { useMeta } from "../lib/meta";
import "./Console.css";

// Auto-acquire cadence. Kept as one constant so the interval and the button
// label ("auto · 6s") can never drift apart.
const AUTO_SECONDS = 6;

export default function Console() {
  useMeta({
    title: "Reachable Web Observatory — a random sample of the public-IPv4 web",
    description:
      "An open measurement study of the reachable public-IPv4 web: random discovery, HTTP capture, geolocation, and CVE/reputation enrichment — mapping where exposure concentrates over time.",
    path: "/",
  });
  const [detail, setDetail] = useState<SignalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(false);
  const [error, setError] = useState(false);
  const [recent, setRecent] = useState<Tile[]>([]);
  const [latest, setLatest] = useState<Tile[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const timer = useRef<number | null>(null);

  const acquire = useCallback(async () => {
    setLoading(true);
    try {
      // Prefer the random-capture pool; if empty/unavailable, fall back to the
      // latest gallery tile so the viewport is never stuck on a dead API.
      let ip: string;
      let port: number;
      try {
        const cap = await api.randomCapture();
        ip = cap.ip;
        port = cap.port;
      } catch {
        const gal = await api.gallery(12);
        const pick = gal.entries[Math.floor(Math.random() * gal.entries.length)];
        if (!pick) throw new Error("no captures");
        ip = pick.ip;
        port = pick.port;
      }
      const d = await api.signal(ip, port, { brief: true });
      setDetail(d);
      setError(false);
    } catch {
      // Collector unreachable or the pool is empty — flag it (the viewport shows
      // an explicit message + retry) and leave any prior signal on screen.
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRails = useCallback(() => {
    api.gallery(48).then((r) => setRecent(r.entries)).catch(() => {});
    api.recent(12).then((r) => setLatest(r.entries)).catch(() => {});
  }, []);

  useEffect(() => {
    acquire();
    loadRails();
    api.stats(0).then(setStats).catch(() => {});
  }, [acquire, loadRails]);

  useEffect(() => {
    if (!auto) return;
    timer.current = window.setInterval(() => {
      acquire();
      // Keep the Latest rail live so new agent finds surface as they land.
      api.recent(12).then((r) => setLatest(r.entries)).catch(() => {});
    }, AUTO_SECONDS * 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [auto, acquire]);

  const points: MapPoint[] = recent
    .filter((t) => t.geo)
    .map((t) => ({ ip: t.ip, port: t.port, lat: t.geo!.lat, lon: t.geo!.lon, insecure: !t.secured }));

  const insecure = stats?.secure_capture_counts.insecure ?? null;
  const hosts = stats?.totals.hosts ?? null;
  const services = stats?.totals.services ?? null;
  const insecureShare = insecure != null && services ? Math.round((insecure / services) * 100) : null;
  const latestObserved = latest[0]?.updated_at ? new Date(latest[0].updated_at) : null;
  const latestTime = latestObserved
    ? latestObserved.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })
    : "—";
  const latestDate = latestObserved
    ? latestObserved.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" })
    : "not available";

  return (
    <div className="console wrap">
      <div className="console-head">
        <div className="eyebrow">◊ Continuous random-sample observatory</div>
        <h1 className="console-title display">Reachable Web Observatory</h1>
        <dl className="console-metrics" aria-label="All-time Observatory summary">
          <div className="console-metric">
            <dd className="display">{hosts?.toLocaleString() ?? "—"}</dd>
            <dt className="mono">distinct hosts</dt>
          </div>
          <div className="console-metric">
            <dd className="display">{services?.toLocaleString() ?? "—"}</dd>
            <dt className="mono">service records</dt>
          </div>
          <div className="console-metric">
            <dd className="display insecure">{insecureShare ?? "—"}%</dd>
            <dt className="mono">cleartext · {insecure?.toLocaleString() ?? "—"} services</dt>
          </div>
          <div
            className="console-metric"
            title={latestObserved?.toISOString() ?? "Latest observation time unavailable"}
          >
            <dd className="display">{latestTime}</dd>
            <dt className="mono">latest · {latestDate} UTC</dt>
          </div>
        </dl>
        <p className="console-lede dim">
          A continuously updated random sample of the reachable public-IPv4 web. Stored observations
          cover five common web ports; this is not a full internet inventory or a vulnerability scan.
        </p>

        <div className="console-purpose">
          <p>
            The Observatory draws a uniform-random sample of public-IPv4 addresses, captures what an
            anonymous visitor would see on a handful of common web ports, and enriches each host with
            public host-level CVE and reputation data. It is a research instrument, not a search engine — a
            sampled collection paired with daily aggregate snapshots, rather than a directory
            or a retained history of every capture.
          </p>
          <div className="doc-actions">
            <Link className="btn btn-primary" to="/feed">Explore observations</Link>
            <Link className="btn" to="/stats">View findings</Link>
            <Link className="btn" to="/methodology">Read method &amp; ethics</Link>
          </div>
        </div>

        <div className="console-frame">
          <div className="console-frame-q">
            <h2 className="eyebrow">◊ The question</h2>
            <p>
              Across a uniform random sample of the reachable public-IPv4 web, <em>where do
              CVE-associated and reputation-flagged services concentrate</em> — by network, geography,
              product, and port — and how does that change over time?
            </p>
          </div>
          <div className="console-frame-look">
            <h2 className="eyebrow">◊ What to look for</h2>
            <ul className="console-look-list">
              <li>How much of the reachable web still serves <strong>cleartext HTTP</strong></li>
              <li><strong>CVE-associated</strong> services clustering by network (ASN) and product</li>
              <li>Geographic <strong>concentration</strong> of flagged hosts</li>
              <li>How these shift <strong>over time</strong> as the sample accrues</li>
            </ul>
          </div>
        </div>

        <p className="console-browse dim">
          Draw a random capture below, or{" "}
          <Link className="console-more" to="/feed">
            browse all {hosts != null ? hosts.toLocaleString() : ""} hosts observed to date →
          </Link>{" "}
          (all-time totals; the Stats page defaults to a recent window).
        </p>
      </div>

      <Viewport
        detail={detail}
        loading={loading}
        auto={auto}
        autoSeconds={AUTO_SECONDS}
        error={error && !detail}
        onAcquire={acquire}
        onToggleAuto={() => setAuto((a) => !a)}
      />

      {latest.length > 0 && (
        <section className="console-recent">
          <div className="row spread console-section-head">
            <h2 className="eyebrow">◊ Latest observations</h2>
            <span className="mono dim">newest first · any status</span>
          </div>
          <div className="console-strip">
            {latest.slice(0, 4).map((t) => (
              <SignalCard key={`latest-${t.ip}:${t.port}`} t={t} />
            ))}
          </div>
        </section>
      )}

      <section className="panel panel-pad console-map">
        <div className="row spread console-section-head">
          <h2 className="eyebrow">◊ Observation origins</h2>
          <span className="mono dim">geolocated · last {recent.length} captures</span>
        </div>
        <WorldMap points={points} />
      </section>

      <section className="console-recent">
        <div className="row spread console-section-head">
          <h2 className="eyebrow">◊ Representative observations</h2>
          <Link className="mono console-more" to="/feed">
            full feed →
          </Link>
        </div>
        <div className="console-strip">
          {recent.slice(0, 4).map((t) => (
            <SignalCard key={`${t.ip}:${t.port}`} t={t} />
          ))}
        </div>
      </section>
    </div>
  );
}
