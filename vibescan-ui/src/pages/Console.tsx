import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
    title: "Reachable Web Observatory — a census of the public-IPv4 web",
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
    api.stats(8760).then(setStats).catch(() => {});
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

  return (
    <div className="console wrap">
      <div className="console-head">
        <div className="eyebrow">◊ Reachable Web Observatory · live census</div>
        <h1 className="console-h1 display" title="Total cleartext HTTP services captured across all time">
          {insecure != null ? insecure.toLocaleString() : "—"}{" "}
          <span className="console-h1-sub">cleartext HTTP services on record</span>
          <span className="console-h1-scope mono"> · all time</span>
        </h1>
        <p className="console-lede dim">
          An open, continuously-running measurement study of the <em>ordinary</em> reachable web — and
          where risk quietly accumulates across it.
        </p>

        <div className="console-purpose">
          <p>
            Most internet scanners hunt for known targets or try to inventory everything. This one is
            different: it draws a uniform-random sample of public-IPv4 addresses, captures what an
            anonymous visitor would see on a handful of common web ports, and enriches each host with
            public CVE and reputation data. It is a research instrument, not a search engine — a
            continuing time series of observations rather than a directory of the internet.
          </p>
          <p>
            The point is to understand where exposure <em>concentrates</em>. Cleartext services,
            software carrying known CVEs, and addresses flagged by threat-intelligence feeds are not
            spread evenly — they cluster in particular networks, regions, and products, and that
            clustering shifts over time. Measuring it is how a randomly-sampled census turns into a
            picture of systemic risk on the everyday web.
          </p>
          <p>
            Everything here is open: the live census below, the aggregate{" "}
            <Link className="console-more" to="/stats">statistics</Link>, every per-host record, the
            downloadable <Link className="console-more" to="/data">dataset</Link>, and the full{" "}
            <Link className="console-more" to="/methodology">methodology</Link> and{" "}
            <Link className="console-more" to="/ethics">ethics</Link>.
          </p>
        </div>

        <div className="console-frame">
          <div className="console-frame-q">
            <span className="eyebrow">◊ The question</span>
            <p>
              Across a uniform random sample of the reachable public-IPv4 web, <em>where do
              CVE-associated and reputation-flagged services concentrate</em> — by network, geography,
              product, and port — and how does that change over time?
            </p>
          </div>
          <div className="console-frame-look">
            <span className="eyebrow">◊ What to look for</span>
            <ul className="console-look-list">
              <li>How much of the reachable web still serves <strong>cleartext HTTP</strong></li>
              <li><strong>CVE-associated</strong> services clustering by network (ASN) and product</li>
              <li>Geographic <strong>concentration</strong> of flagged hosts</li>
              <li>How these shift <strong>over time</strong> as the census accrues</li>
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
            <span className="eyebrow">◊ Latest signals</span>
            <span className="mono dim">newest first · any status</span>
          </div>
          <div className="console-strip">
            {latest.slice(0, 6).map((t) => (
              <SignalCard key={`latest-${t.ip}:${t.port}`} t={t} />
            ))}
          </div>
        </section>
      )}

      <section className="panel panel-pad console-map">
        <div className="row spread console-section-head">
          <span className="eyebrow">◊ Signal origins</span>
          <span className="mono dim">geolocated · last {recent.length} captures</span>
        </div>
        <WorldMap points={points} />
      </section>

      <section className="console-recent">
        <div className="row spread console-section-head">
          <span className="eyebrow">◊ Recently observed</span>
          <Link className="mono console-more" to="/feed">
            full feed →
          </Link>
        </div>
        <div className="console-strip">
          {recent.slice(0, 6).map((t) => (
            <SignalCard key={`${t.ip}:${t.port}`} t={t} />
          ))}
        </div>
      </section>
    </div>
  );
}
