import { Link } from "react-router";
import { imageURL, type Tile } from "../api";
import { timeAgo } from "../lib/time";
import StatusBadge from "./StatusBadge";
import "./SignalCard.css";

export default function SignalCard({ t, relatedPorts = [] }: { t: Tile; relatedPorts?: number[] }) {
  const flagged = t.verdict === "malicious" || t.verdict === "suspicious";
  const provenance = flagged || (t.vuln_count ?? 0) > 0;
  const srcLabel = t.sources && t.sources.length ? t.sources.join(", ") : "third-party feeds";
  const enriched = timeAgo(t.enriched_at);
  const protocolTransition = t.secured && [80, 8000, 8080].includes(t.port);
  return (
    <Link
      className={`card hud${t.verdict === "malicious" ? " card--flagged" : t.verdict === "suspicious" ? " card--suspect" : ""}`}
      to={`/signal/${t.ip}/${t.port}`}
    >
      <div className="card-shot">
        {t.image_url ? (
          <img
            src={imageURL(t.thumb_url || t.image_url)}
            srcSet={t.thumb_url ? `${imageURL(t.thumb_url)} 480w, ${imageURL(t.image_url)} 1147w` : undefined}
            sizes="(max-width: 520px) 100vw, (max-width: 900px) 50vw, 300px"
            alt={`Capture of ${t.ip}:${t.port}${t.product ? ` — ${t.product}` : ""}${t.http_status ? `, HTTP ${t.http_status}` : ""}`}
            loading="lazy"
            decoding="async"
            width={1147}
            height={720}
          />
        ) : (
          <div className="card-noshot mono">NO SCREENSHOT</div>
        )}
        <span className="card-callsign mono">
          {t.ip}:{t.port}{protocolTransition ? " → HTTPS" : ""}
        </span>
        {(flagged || t.vuln_count) && (
          <div className="card-badges">
            {flagged ? (
              <span
                className={`card-verdict mono ${t.verdict}`}
                title={`Reputation match from ${srcLabel}${enriched ? ` (${enriched})` : ""} — not independently verified, may be inaccurate`}
              >
                {t.verdict === "malicious" ? "provider reputation: malicious" : "provider reputation: suspicious"}
              </span>
            ) : null}
            {t.vuln_count ? (
              <span
                className="card-vuln mono"
                title={`${t.vuln_count} CVE${t.vuln_count > 1 ? "s" : ""} associated with this host by ${srcLabel} — provider-reported, not independently verified`}
              >
                {t.vuln_count} host-associated CVE record{t.vuln_count > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
        )}
      </div>
      <div className="card-meta">
        {relatedPorts.length > 1 && (
          <div className="card-ports mono" aria-label={`Same capture observed on ports ${relatedPorts.join(", ")}`}>
            {relatedPorts.map((port) => <span key={port}>:{port}</span>)}
          </div>
        )}
        <div className="row spread">
          <span className="mono card-product">
            {t.product || "unknown"}{t.product_version ? ` ${t.product_version}` : ""}
          </span>
          <span className="row" style={{ gap: 6 }}>
            {t.secured ? (
              <span className="lock" title="Final captured page used TLS after any redirect or protocol negotiation">
                {protocolTransition ? "→ HTTPS" : "HTTPS"}
              </span>
            ) : (
              <span className="insecure" title="Captured over cleartext HTTP (after any redirects)">HTTP</span>
            )}
            <StatusBadge status={t.http_status} />
          </span>
        </div>
        <div className="row spread card-sub">
          {t.whois && t.whois !== "unknown" ? (
            <span className="mono dim">{t.whois}</span>
          ) : (
            <span className="mono dim">{t.geo?.city || t.geo?.country || "—"}</span>
          )}
          {t.geo?.country_iso && <span className="mono dim">{t.geo.country_iso}</span>}
        </div>
        {t.match_reason && t.match_reason !== "filters" && (
          <div className="card-match mono">Matched in: {t.match_reason}</div>
        )}
        <div className="card-provenance mono">
          observed {timeAgo(t.updated_at) || t.updated_at || "at an unknown time"}
        </div>
        {provenance && (
          <div className="card-provenance mono" title="Reputation and CVE data come from third-party feeds and are not independently verified.">
            {srcLabel}
            {enriched ? ` · ${enriched}` : ""} · unverified
          </div>
        )}
      </div>
    </Link>
  );
}
