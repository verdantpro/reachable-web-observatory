import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, type Stats, type DailyRollup } from "../api";
import TimeSeries from "../components/TimeSeries";
import WorldMap, { type MapPoint } from "../components/WorldMap";
import ErrorState from "../components/ErrorState";
import { useMeta } from "../lib/meta";
import "./grid.css";
import "./Stats.css";

const RANGES: [string, number][] = [
  ["1H", 1],
  ["24H", 24],
  ["7D", 168],
  ["ALL", 8760],
];

// Status codes carry reserved state colors (never reused as categorical hues).
const STATUS_COLOR: Record<string, string> = {
  "200": "var(--lime)",
  "3xx": "var(--amber)",
  "4xx": "var(--red)",
  "5xx": "var(--red)",
};

const VERDICT_COLOR: Record<string, string> = {
  malicious: "var(--red)",
  suspicious: "var(--amber)",
  clean: "var(--accent)",
};

function BarRow({ label, value, max, color, suffix = "", href }: { label: string; value: number; max: number; color: string; suffix?: string; href?: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  const labelEl = href ? (
    href.startsWith("http") ? (
      <a className="bar-label mono bar-link" href={href} target="_blank" rel="noopener noreferrer">{label}</a>
    ) : (
      <Link className="bar-label mono bar-link" to={href}>{label}</Link>
    )
  ) : (
    <span className="bar-label mono">{label}</span>
  );
  return (
    <div className="bar-row" title={`${label}: ${value.toLocaleString()}${suffix}`}>
      {labelEl}
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className="bar-val mono">{value.toLocaleString()}{suffix}</span>
    </div>
  );
}

function BarList({ data, color = "var(--cyan)", limit = 10, suffix = "", hrefFor }: { data: Record<string, number>; color?: string; limit?: number; suffix?: string; hrefFor?: (label: string) => string | undefined }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
  const max = rows.length ? rows[0][1] : 0;
  if (!rows.length) return <div className="bar-empty mono dim">no data</div>;
  return (
    <div className="bar-list">
      {rows.map(([k, v]) => (
        <BarRow key={k} label={k} value={v} max={max} color={color} suffix={suffix} href={hrefFor?.(k)} />
      ))}
    </div>
  );
}

// Turn flagged-by-X + total-by-X into a % rate per bucket, dropping tiny samples.
function rateMap(flagged: Record<string, number>, total: Record<string, number>, minSample = 20): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, f] of Object.entries(flagged)) {
    const t = total[k];
    if (t && t >= minSample) out[k] = Math.round((f / t) * 100);
  }
  return out;
}

export default function StatsPage() {
  useMeta({
    title: "Exposure Statistics — Reachable Web Observatory",
    description: "Aggregate statistics on discovered web services: ports, status codes, cleartext exposure, CVEs, and reputation.",
    path: "/stats",
  });
  const [hours, setHours] = useState(24);
  const [s, setS] = useState<Stats | null>(null);
  const [trends, setTrends] = useState<DailyRollup[]>([]);
  const [density, setDensity] = useState(false); // Concentration: count vs % flagged
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    api
      .stats(hours)
      .then((d) => alive && setS(d))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [hours, reloadKey]);

  // Longitudinal trend is window-independent — fetch once.
  useEffect(() => {
    let alive = true;
    api.trends(90).then((r) => alive && setTrends(r.days || [])).catch(() => {});
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const atRiskSeries: Record<string, number> = {};
  const cleartextSeries: Record<string, number> = {};
  for (const d of trends) {
    atRiskSeries[d.date] = d.flagged;
    const svc = d.cleartext + d.secure;
    cleartextSeries[d.date] = svc > 0 ? Math.round((d.cleartext / svc) * 100) : 0;
  }

  const secure = s?.secure_capture_counts.secured ?? 0;
  const insecure = s?.secure_capture_counts.insecure ?? 0;
  const total = secure + insecure;
  const insecurePct = total ? Math.round((insecure / total) * 100) : 0;

  const statusData: Record<string, number> = s
    ? { "200": s.status_code_counts["200"] || 0, "3xx": s.status_code_counts["3xx"] || 0, "4xx": s.status_code_counts["4xx"] || 0, "5xx": s.status_code_counts["5xx"] || 0 }
    : {};

  // Concentration: raw counts, or % flagged (rate) when the density toggle is on.
  const conc = s
    ? density
      ? {
          port: rateMap(s.flagged_by_port, s.services_by_port),
          product: rateMap(s.flagged_by_product, s.top_banners),
          org: rateMap(s.flagged_by_org, s.total_by_org),
          country: rateMap(s.flagged_by_country, s.services_by_country),
        }
      : { port: s.flagged_by_port, product: s.flagged_by_product, org: s.flagged_by_org, country: s.flagged_by_country }
    : { port: {}, product: {}, org: {}, country: {} };
  const concSuffix = density ? "%" : "";

  const flaggedMapPoints: MapPoint[] = (s?.flagged_points ?? [])
    .filter((p) => p.lat || p.lon)
    .map((p) => ({ ip: "", port: 0, lat: p.lat, lon: p.lon, insecure: p.insecure }));

  // Notable findings, computed from the aggregates.
  const stableRank = (data: Record<string, number>) =>
    Object.entries(data).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const topCve = s ? stableRank(s.top_cves)[0] : undefined;
  const highestShareOrg = s ? stableRank(rateMap(s.flagged_by_org, s.total_by_org))[0] : undefined;
  const topProduct = s ? stableRank(s.flagged_by_product)[0] : undefined;
  const cleartextTrend = (() => {
    const pts = Object.entries(cleartextSeries).sort((a, b) => a[0].localeCompare(b[0]));
    return pts.length >= 2 ? pts[pts.length - 1][1] - pts[0][1] : 0;
  })();

  // Deep-links from the bars into a pre-filtered Search (or NVD for CVEs). Product,
  // org, country, and tag ride the free-text `q` (matched by the $text index);
  // port and verdict use dedicated filters.
  const portHref = (p: string) => `/search?port=${encodeURIComponent(p)}`;
  const productHref = (p: string) => `/search?q=${encodeURIComponent(p)}`;
  const countryHref = (c: string) => `/search?q=${encodeURIComponent(c)}`;
  const tagHref = (t: string) => `/search?q=${encodeURIComponent(t)}`;
  const verdictHref = (v: string) => `/search?verdict=${encodeURIComponent(v)}`;
  const cveHref = (c: string) => `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(c)}`;

  return (
    <div className="page wrap">
      <div className="page-head row spread stats-head">
        <div>
          <div className="eyebrow">◊ Telemetry</div>
          <h1 className="page-title display">Broadcast stats</h1>
          <p className="page-hint">
            Every figure reflects the selected window (<span className="mono">ALL</span> = all time) —{" "}
            <Link className="hint-link" to="/methodology">what these measure →</Link>
          </p>
        </div>
        <div className="chips stats-range" aria-label="Time window">
          <span className="stats-range-label mono">window</span>
          {RANGES.map(([label, h]) => (
            <button key={label} className={`chip mono${hours === h ? " on" : ""}`} onClick={() => setHours(h)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && !s ? (
        <div className="empty">◌ AGGREGATING…</div>
      ) : error && !s ? (
        <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />
      ) : !s ? (
        <div className="empty">TELEMETRY OFFLINE</div>
      ) : (
        <>
          {(topCve || highestShareOrg || topProduct) && (
            <section className="highlights">
              <h2 className="eyebrow highlights-h">◊ Notable findings</h2>
              <div className="highlights-grid">
                {topCve && (
                  <a className="highlight" href={cveHref(topCve[0])} target="_blank" rel="noopener noreferrer">
                    <div className="highlight-k mono">Most prevalent CVE</div>
                    <div className="highlight-v">{topCve[0]}</div>
                    <div className="highlight-s mono dim">{topCve[1].toLocaleString()} hosts</div>
                  </a>
                )}
                {highestShareOrg && (
                  <div className="highlight">
                    <div className="highlight-k mono">Highest observed flagged share</div>
                    <div className="highlight-v" title={highestShareOrg[0]}>{highestShareOrg[0]}</div>
                    <div className="highlight-s mono dim">
                      {highestShareOrg[1]}% · n={s.total_by_org[highestShareOrg[0]].toLocaleString()}
                    </div>
                  </div>
                )}
                {topProduct && (
                  <Link className="highlight" to={productHref(topProduct[0])}>
                    <div className="highlight-k mono">Most-flagged software</div>
                    <div className="highlight-v" title={topProduct[0]}>{topProduct[0]}</div>
                    <div className="highlight-s mono dim">{topProduct[1].toLocaleString()} at-risk services</div>
                  </Link>
                )}
                <div className="highlight">
                  <div className="highlight-k mono">Cleartext HTTP</div>
                  <div className="highlight-v insecure">{insecurePct}%</div>
                  <div className="highlight-s mono dim">
                    {cleartextTrend === 0
                      ? "of services this window"
                      : `${cleartextTrend > 0 ? "▲" : "▼"} ${Math.abs(cleartextTrend)} ${Math.abs(cleartextTrend) === 1 ? "pt" : "pts"} over ${trends.length}d`}
                  </div>
                </div>
              </div>
            </section>
          )}

          <div className="stat-tiles">
            <div className="tile panel hud">
              <div className="tile-label eyebrow">Hosts</div>
              <div className="tile-num display">{s.totals.hosts.toLocaleString()}</div>
            </div>
            <div className="tile panel hud">
              <div className="tile-label eyebrow">Services</div>
              <div className="tile-num display">{s.totals.services.toLocaleString()}</div>
            </div>
            <div className="tile panel hud tile-insecure">
              <div className="tile-label eyebrow">Cleartext HTTP</div>
              <div className="tile-num display insecure">{insecurePct}%</div>
              <div className="tile-bar">
                <span className="tile-bar-fill" style={{ width: `${insecurePct}%` }} />
              </div>
              <div className="tile-sub mono dim">
                {insecure.toLocaleString()} insecure · {secure.toLocaleString()} https
              </div>
            </div>
            <div
              className="tile panel hud"
              title="Services whose host is associated with at least one CVE by Shodan InternetDB. This is a third-party association, not a confirmed or verified vulnerability."
            >
              <div className="tile-label eyebrow">CVE-associated</div>
              <div className="tile-num display insecure">{s.exposed_services.toLocaleString()}</div>
              <div className="tile-sub mono dim">host has ≥1 CVE · Shodan, provider-reported</div>
            </div>
          </div>

          <section className="panel panel-pad concentration">
            <div className="row spread concentration-head">
              <h2 className="eyebrow chart-head">◊ Concentration — where risk clusters</h2>
              <div className="chips" aria-label="Concentration measure">
                <button className={`chip mono${!density ? " on" : ""}`} onClick={() => setDensity(false)}>count</button>
                <button className={`chip mono${density ? " on" : ""}`} onClick={() => setDensity(true)}>% flagged</button>
              </div>
            </div>
            <p className="concentration-note mono dim">
              {density
                ? "Share of each group's services that are at-risk (minimum sample: 20 services per group). Percentages are descriptive, not population estimates."
                : `Among the ${s.flagged_services.toLocaleString()} at-risk services in this window (CVE-associated or reputation-flagged), where they concentrate:`}
            </p>
            <div className="concentration-grid">
              <div className="concentration-cell">
                <h3 className="concentration-h mono">By port</h3>
                <BarList data={conc.port} color="var(--alert)" limit={8} suffix={concSuffix} hrefFor={portHref} />
              </div>
              <div className="concentration-cell">
                <h3 className="concentration-h mono">By product</h3>
                <BarList data={conc.product} color="var(--alert)" limit={8} suffix={concSuffix} hrefFor={productHref} />
              </div>
              <div className="concentration-cell">
                <h3 className="concentration-h mono">By organization / network</h3>
                <BarList data={conc.org} color="var(--amber)" limit={8} suffix={concSuffix} hrefFor={countryHref} />
              </div>
              <div className="concentration-cell">
                <h3 className="concentration-h mono">By country</h3>
                <BarList data={conc.country} color="var(--amber)" limit={8} suffix={concSuffix} hrefFor={countryHref} />
              </div>
            </div>
          </section>

          <section className="panel panel-pad">
            <h2 className="eyebrow chart-head">◊ Most prevalent host-associated CVEs</h2>
            <p className="concentration-note mono dim">
              The specific vulnerabilities most often associated with hosts in this window — third-party,
              provider-reported associations, not confirmed exploitability.
            </p>
            <BarList data={s.top_cves} color="var(--alert)" limit={12} hrefFor={cveHref} />
          </section>

          <section className="panel panel-pad geo">
            <h2 className="eyebrow chart-head">◊ Geography</h2>
            <div className="geo-grid">
              <div className="geo-map">
                {flaggedMapPoints.length ? (
                  <WorldMap points={flaggedMapPoints} />
                ) : (
                  <div className="bar-empty mono dim">no geolocated flagged hosts yet</div>
                )}
              </div>
              <div className="geo-rank">
                <h3 className="concentration-h mono">Services by country</h3>
                <BarList data={s.services_by_country} color="var(--violet)" limit={10} hrefFor={countryHref} />
              </div>
            </div>
          </section>

          <section className="panel panel-pad trend">
            <h2 className="eyebrow chart-head">
              ◊ Exposure over time{trends.length >= 2 ? ` · last ${trends.length} days` : ""}
            </h2>
            {trends.length >= 2 ? (
              <div className="trend-grid">
                <div className="trend-cell">
                  <h3 className="concentration-h mono">At-risk services</h3>
                  <TimeSeries data={atRiskSeries} unit="at-risk services" />
                </div>
                <div className="trend-cell">
                  <h3 className="concentration-h mono">Cleartext share (%)</h3>
                  <TimeSeries data={cleartextSeries} unit="% cleartext" />
                </div>
              </div>
            ) : (
              <p className="concentration-note mono dim">
                Collecting daily snapshots — the longitudinal trend appears once a few days of history
                have accrued.
              </p>
            )}
          </section>

          <div className="stats-grid">
            <section className="panel panel-pad">
              <h2 className="eyebrow chart-head">◊ Services by port</h2>
              <BarList data={s.services_by_port} hrefFor={portHref} />
            </section>

            <section className="panel panel-pad">
              <h2 className="eyebrow chart-head">◊ Response status</h2>
              <div className="bar-list">
                {Object.entries(statusData).map(([k, v]) => (
                  <BarRow
                    key={k}
                    label={k}
                    value={v}
                    max={Math.max(...Object.values(statusData), 1)}
                    color={STATUS_COLOR[k]}
                  />
                ))}
              </div>
            </section>

            <section className="panel panel-pad">
              <h2 className="eyebrow chart-head">◊ Observed server banners</h2>
              <BarList data={s.top_banners} color="var(--violet)" limit={8} hrefFor={productHref} />
            </section>

            <section className="panel panel-pad">
              <h2 className="eyebrow chart-head">◊ Shodan tags</h2>
              <BarList data={s.top_tags} color="var(--accent-soft)" limit={8} hrefFor={tagHref} />
            </section>

            <section className="panel panel-pad">
              <h2 className="eyebrow chart-head">◊ Derived reputation summaries</h2>
              {Object.keys(s.verdicts || {}).length ? (
                <div className="bar-list">
                  {(["malicious", "suspicious", "clean"] as const).map((k) => (
                    <BarRow
                      key={k}
                      label={k}
                      value={s.verdicts[k] || 0}
                      max={Math.max(...Object.values(s.verdicts), 1)}
                      color={VERDICT_COLOR[k]}
                      href={verdictHref(k)}
                    />
                  ))}
                </div>
              ) : (
                <div className="bar-empty mono dim">no reputation data yet</div>
              )}
            </section>

            <section className="panel panel-pad stats-time">
              <h2 className="eyebrow chart-head">◊ Observations over time</h2>
              <TimeSeries data={s.submissions_over_time} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
