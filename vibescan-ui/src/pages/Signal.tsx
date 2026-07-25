import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api, imageURL, type SignalDetail } from "../api";
import CrossReference from "../components/CrossReference";
import LocationMap from "../components/LocationMap";
import { useMeta } from "../lib/meta";
import "./Signal.css";

function Note({
  label,
  value,
  mono,
  tone,
  hideEmpty,
}: {
  label: string;
  value?: string | number | null;
  mono?: boolean;
  tone?: "alert";
  hideEmpty?: boolean;
}) {
  if (hideEmpty && (value == null || value === "" || value === "unknown")) return null;
  return (
    <div className="fr-note">
      <dt>{label}</dt>
      <dd className={`${mono ? "hash" : ""}${tone === "alert" ? " alert" : ""}`}>{value ?? "—"}</dd>
    </div>
  );
}

export default function Signal() {
  const { ip = "", port = "" } = useParams();
  const [d, setD] = useState<SignalDetail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [sourceCopied, setSourceCopied] = useState(false);

  useMeta({
    title: ip && port ? `${ip}:${port} — Reachable Web Observatory record` : "Record — Reachable Web Observatory",
    description: "A point-in-time capture and telemetry record for a discovered web service.",
    noIndex: true,
  });

  useEffect(() => {
    let alive = true;
    setState("loading");
    api
      .signal(ip, port)
      .then((r) => {
        if (!alive) return;
        setD(r);
        setState("ok");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [ip, port]);

  if (state === "loading") return <div className="record"><div className="page wrap empty"><h1>Loading observation…</h1></div></div>;
  if (state === "error" || !d) {
    return (
      <div className="record">
        <div className="page wrap empty">
          <h1>Observation not found</h1>
          <p>The record may have been removed, or this address and port may never have been retained.</p>
          <div className="nf-actions">
            <Link className="btn" to="/feed">Browse observations</Link>
            <Link className="btn" to="/search">Search records</Link>
          </div>
        </div>
      </div>
    );
  }

  const s = d.service;
  const geo = s.geo;
  const seen = s.updated_at?.replace("T", " ").replace("Z", " UTC");
  const origin = geo ? [geo.city, geo.region, geo.country].filter(Boolean).join(" · ") : null;
  const submitter = d.anon || d.submitted_by === "0.0.0.0" ? "anonymous" : d.submitted_by;
  const isFallbackGeo =
    !!geo &&
    ((Math.abs(geo.lat - 37.751) < 0.001 && Math.abs(geo.lon + 97.822) < 0.001) ||
      (geo.accuracy_radius_km ?? 0) >= 500);
  const showCoordinates = !!geo && !isFallbackGeo && (geo.lat !== 0 || geo.lon !== 0);

  return (
    <div className="record">
      <div className="page wrap sig-record">
        <Link to="/feed" className="fr-back">← feed</Link>

        <header className="fr-casehead">
          <div>
            <span className="fr-eyebrow">Observation</span>
            <h1 className="fr-callsign">
              {s.ip}<span className="port">:{s.port}</span>
            </h1>
            <Link
              className="fr-live-link mono"
              to={`/external/${s.ip}/${s.port}?protocol=${s.secured ? "https" : "http"}`}
              title="Leaves the Observatory, reveals your IP address to the current third-party host, and may expose you to unsafe content."
            >
              Visit current host (external) ↗
            </Link>
            <span className="fr-live-warning mono">
              Not the stored observation · may be unsafe · destination receives your IP address
            </span>
          </div>
          <div className="fr-caseright">
            <span className={`fr-class ${s.secured ? "ok" : "alert"}`}>
              <b></b> {s.secured ? "Secured · TLS" : "Cleartext · No TLS"}
            </span>
            {seen && (
              <div className="fr-filed">
                <span>Observed</span>
                {seen}
              </div>
            )}
          </div>
        </header>

        <div className="fr-body">
          <figure className="fr-exhibit">
            <span className="fr-tick tl"></span><span className="fr-tick tr"></span>
            <span className="fr-tick bl"></span><span className="fr-tick br"></span>
            <div className="fr-exhibit-frame">
              {s.image_url ? (
                <img
                  src={imageURL(s.image_url)}
                  alt={`Captured screenshot of ${s.ip}:${s.port}`}
                  width={1147}
                  height={720}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="fr-noshot">No capture on record</div>
              )}
            </div>
            <figcaption className="fr-cap">
              <span>Capture{s.capture_hash ? ` · ${s.capture_hash.slice(0, 8)}` : ""}</span>
              <span>{s.capture_ext ? s.capture_ext.toUpperCase() : ""}</span>
            </figcaption>
          </figure>

          <aside className="fr-notes">
            <h2 className="fr-notes-h">Service metadata</h2>
            <dl>
              <Note label="Operator" value={s.whois} hideEmpty />
              <Note label="Origin" value={origin} hideEmpty />
              <Note label="Coord" value={showCoordinates ? `${geo!.lat.toFixed(4)}, ${geo!.lon.toFixed(4)}` : null} hideEmpty />
              <Note label="Country" value={geo?.country_iso} hideEmpty />
              <Note label="Server" value={s.product} hideEmpty />
              <Note
                label="Protocol"
                value={s.secured ? "HTTPS · TLS" : "HTTP — no transport encryption"}
                tone={s.secured ? undefined : "alert"}
              />
              <Note label="Status" value={s.http_status} />
              <Note label="Cert CN" value={s.cert_cn} hideEmpty />
              <Note label="pHash" value={s.screenshot_phash} mono hideEmpty />
              <Note label="DOM" value={s.dom_hash} mono hideEmpty />
              <Note label="Submitter" value={submitter} mono />
            </dl>
          </aside>
        </div>

        {showCoordinates && geo && (
          <section className="fr-sec fr-location">
            <h2 className="fr-sec-h">Approximate location</h2>
            <div className="fr-loc-body">
              <LocationMap lat={geo.lat} lon={geo.lon} />
              <dl className="fr-loc-facts">
                <Note label="Place" value={[geo.city, geo.region, geo.country].filter(Boolean).join(", ")} hideEmpty />
                <Note label="Coordinates" value={`${geo.lat.toFixed(4)}, ${geo.lon.toFixed(4)}`} mono />
                <Note label="Accuracy" value={geo.accuracy_radius_km ? `~${geo.accuracy_radius_km.toLocaleString()} km radius` : null} hideEmpty />
                <Note label="Country" value={geo.country_iso} hideEmpty />
                <Note label="Network" value={s.whois} hideEmpty />
              </dl>
            </div>
            <p className="fr-loc-caveat mono">
              Coarse, IP-based geolocation — an approximate region, not the server's precise position.
            </p>
          </section>
        )}
        {geo && isFallbackGeo && (
          <section className="fr-sec fr-location">
            <h2 className="fr-sec-h">Approximate location</h2>
            <p>
              Country-level geolocation only: {geo.country || geo.country_iso || "unknown country"}.
              Coordinates are suppressed because the provider did not return a meaningful position.
            </p>
          </section>
        )}

        <CrossReference ip={s.ip} />

        <section className="fr-sec">
          <h2 className="fr-sec-h">Record actions</h2>
          <p>
            This public record is a timestamped observation, not a current verification. If it is
            inaccurate, sensitive, or should be removed, use the operator workflow below.
          </p>
          <div className="doc-actions">
            <Link className="btn" to="/scan-info#removal">Report, correct, or remove this record</Link>
            <Link className="btn btn-ghost" to="/data#cite">Cite or export Observatory data</Link>
            <button
              className="btn btn-ghost"
              onClick={() => {
                const payload = JSON.stringify({
                  schema_version: "rwo-record-v1",
                  exported_at: new Date().toISOString(),
                  ...d,
                }, null, 2);
                const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = `rwo-${s.ip}-${s.port}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download this record (JSON)
            </button>
          </div>
        </section>

        <section className="fr-sec">
          <h2 className="fr-sec-h">Service banner</h2>
          <pre className="fr-pre">{s.banner || "— no banner —"}</pre>
        </section>

        {d.fulltext && (
          <details className="fr-sec">
            <summary className="fr-sec-h">Captured page text · {d.fulltext.length.toLocaleString()} chars</summary>
            <p className="fr-source-note mono">
              Captured from this service at observation time; public page content can contain version,
              endpoint, or personal information and may no longer match the current host. Review and
              copy it with care.
            </p>
            <div className="doc-actions">
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(d.fulltext);
                    setSourceCopied(true);
                    window.setTimeout(() => setSourceCopied(false), 2000);
                  } catch {
                    setSourceCopied(false);
                  }
                }}
              >
                {sourceCopied ? "Copied" : "Copy captured text"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const url = URL.createObjectURL(new Blob([d.fulltext], { type: "text/plain;charset=utf-8" }));
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `rwo-${s.ip}-${s.port}-captured-text.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download captured text
              </button>
            </div>
            <pre className="fr-pre fr-scroll">{d.fulltext}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
