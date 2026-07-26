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
  ["ALL", 0],
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

function countWithMinimumBase(flagged: Record<string, number>, total: Record<string, number>, minSample = 20): Record<string, number> {
  return Object.fromEntries(Object.entries(flagged).filter(([key]) => (total[key] ?? 0) >= minSample));
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function sumValues(data: Record<string, number>) {
  return Object.values(data).reduce((sum, value) => sum + value, 0);
}

function NetworkRateList({
  flagged,
  total,
  minBase,
  hrefFor,
}: {
  flagged: Record<string, number>;
  total: Record<string, number>;
  minBase: number;
  hrefFor: (label: string) => string;
}) {
  const rows = Object.entries(total)
    .filter(([, base]) => base >= minBase)
    .map(([label, base]) => ({ label, base, flagged: flagged[label] ?? 0, rate: percent(flagged[label] ?? 0, base) }))
    .sort((a, b) => b.rate - a.rate || b.base - a.base || a.label.localeCompare(b.label))
    .slice(0, 10);
  if (!rows.length) return <div className="bar-empty mono dim">not enough attributed hosts in this window</div>;
  return (
    <div className="network-rate-list">
      {rows.map((row) => (
        <div className="network-rate-row" key={row.label}>
          <Link className="bar-label mono bar-link" to={hrefFor(row.label)}>{row.label}</Link>
          <span className="network-rate-meta mono dim">{row.flagged} of {row.base} hosts</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${row.rate}%`, background: "var(--alert)" }} />
          </span>
          <strong className="network-rate-value mono">{row.rate}%</strong>
        </div>
      ))}
    </div>
  );
}

function CoverageItem({ label, value, total, note }: { label: string; value: number; total: number; note: string }) {
  const pct = percent(value, total);
  return (
    <div className="coverage-item">
      <div className="row spread coverage-head">
        <span className="mono">{label}</span>
        <strong className="mono">{pct}%</strong>
      </div>
      <span className="coverage-track"><span style={{ width: `${pct}%` }} /></span>
      <div className="coverage-meta mono dim">{value.toLocaleString()} of {total.toLocaleString()} services · {note}</div>
    </div>
  );
}

function downloadStatsTables(s: Stats) {
  const rows: string[][] = [["table", "label", "value"]];
  const add = (table: string, values: Record<string, number>) => {
    for (const [label, value] of Object.entries(values)) rows.push([table, label, String(value)]);
  };
  add("services_by_port", s.services_by_port);
  add("status_code_counts", s.status_code_counts);
  add("secure_capture_counts", s.secure_capture_counts);
  add("products", s.top_banners);
  add("host_associated_cves", s.top_cves);
  add("services_by_country", s.services_by_country);
  add("provider_verdicts", s.verdicts);
  add("hosts_by_network", s.hosts_by_network ?? {});
  add("flagged_hosts_by_network", s.flagged_hosts_by_network ?? {});
  add("hosts_by_organization", s.hosts_by_organization ?? {});
  add("coverage", {
    network_attributed: s.coverage?.network_attributed ?? 0,
    geolocated: s.coverage?.geolocated ?? 0,
    reputation_assessed: s.coverage?.reputation_assessed ?? 0,
  });
  const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `rwo-statistics-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function StatsPage() {
  useMeta({
    title: "Study findings — Reachable Web Observatory",
    description: "Descriptive statistics for sampled web-service observations and host-level provider associations.",
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
    // Never present a new window label over the previous window's aggregates.
    setS(null);
    api
      .stats(hours)
      .then((d) => {
        if (!alive) return;
        if (d.time_range_hours !== hours) {
          setError(true);
          return;
        }
        setS(d);
      })
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
  const windowDescription = hours === 0
    ? "all observations retained to date"
    : `the rolling ${hours === 1 ? "1 hour" : hours === 24 ? "24 hours" : `${hours / 24} days`} ending when this page was loaded`;

  const statusData: Record<string, number> = s
    ? { "200": s.status_code_counts["200"] || 0, "3xx": s.status_code_counts["3xx"] || 0, "4xx": s.status_code_counts["4xx"] || 0, "5xx": s.status_code_counts["5xx"] || 0 }
    : {};
  const responseTotal = sumValues(statusData);
  const successPct = percent(statusData["200"] ?? 0, responseTotal);
  const flaggedPct = percent(s?.flagged_services ?? 0, s?.totals.services ?? 0);
  const servicesPerHost = s?.totals.hosts ? s.totals.services / s.totals.hosts : 0;
  const networkHosts = s?.hosts_by_network ?? s?.total_by_org ?? {};
  const flaggedNetworkHosts = s?.flagged_hosts_by_network ?? s?.flagged_by_org ?? {};
  const organizationHosts = s?.hosts_by_organization ?? {};
  const networkCount = s?.network_count || Object.keys(networkHosts).length;
  const organizationCount = s?.organization_count || Object.keys(organizationHosts).length;
  const coverage = s?.coverage ?? {
    network_attributed: sumValues(s?.total_by_org ?? {}),
    geolocated: sumValues(s?.services_by_country ?? {}),
    reputation_assessed: sumValues(s?.verdicts ?? {}),
  };
  const networkRateMinimum = hours <= 1 ? 2 : hours <= 24 ? 5 : hours <= 168 ? 10 : 20;

  // Concentration: raw counts, or % flagged (rate) when the density toggle is on.
  const conc = s
    ? density
      ? {
          port: rateMap(s.flagged_by_port, s.services_by_port),
          product: rateMap(s.flagged_by_product, s.top_banners),
          country: rateMap(s.flagged_by_country, s.services_by_country),
        }
      : {
          port: countWithMinimumBase(s.flagged_by_port, s.services_by_port),
          product: countWithMinimumBase(s.flagged_by_product, s.top_banners),
          country: countWithMinimumBase(s.flagged_by_country, s.services_by_country),
        }
    : { port: {}, product: {}, country: {} };
  const concSuffix = density ? "%" : "";

  const flaggedMapPoints: MapPoint[] = (s?.flagged_points ?? [])
    .filter((p) => p.lat || p.lon)
    .map((p) => ({ ip: "", port: 0, lat: p.lat, lon: p.lon, insecure: p.insecure }));

  // Notable findings, computed from the aggregates.
  const stableRank = (data: Record<string, number>) =>
    Object.entries(data).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const topNetwork = stableRank(networkHosts)[0];
  const topPort = s ? stableRank(s.services_by_port)[0] : undefined;
  const topProduct = s ? stableRank(s.top_banners)[0] : undefined;
  const cleartextTrend = (() => {
    const pts = Object.entries(cleartextSeries).sort((a, b) => a[0].localeCompare(b[0]));
    return pts.length >= 2 ? pts[pts.length - 1][1] - pts[0][1] : 0;
  })();

  // Deep-links preserve the aggregate's time window. Networks use a dedicated
  // exact filter because a free-text query can match the same provider name in
  // unrelated banners, certificates, or captured page content.
  const searchHref = (filters: Record<string, string>, groupHosts = false) => {
    const params = new URLSearchParams(filters);
    params.set("time_range", String(s?.time_range_hours ?? hours));
    if (groupHosts) params.set("group", "hosts");
    return `/search?${params.toString()}`;
  };
  const portHref = (p: string) => searchHref({ port: p });
  const productHref = (p: string) => searchHref({ q: p });
  const networkHref = (network: string) => searchHref({ network }, true);
  const organizationHref = (organization: string) => searchHref({ q: organization });
  const countryHref = (c: string) => searchHref({ q: c });
  const tagHref = (t: string) => searchHref({ q: t });
  const verdictHref = (v: string) => searchHref({ verdict: v });

  return (
    <div className="page wrap">
      <div className="page-head">
        <div className="stats-head">
          <div>
            <div className="eyebrow">◊ Analysis</div>
            <h1 className="page-title display">Study findings</h1>
          </div>
          <div className="chips stats-range" aria-label={`Time window${loading ? ", loading" : ""}`}>
            <span className="stats-range-label mono">window</span>
            {RANGES.map(([label, h]) => (
              <button
                key={label}
                className={`chip mono${hours === h ? " on" : ""}`}
                aria-pressed={hours === h}
                aria-controls="stats-results"
                onClick={() => setHours(h)}
              >
                {label}
              </button>
            ))}
            {s && <button className="chip mono" onClick={() => downloadStatsTables(s)}>download CSV</button>}
          </div>
        </div>
        <p className="page-hint">
          Descriptive service-level results for {windowDescription}. These are sampled observations,
          not estimates of every public host. Every panel below follows this window except the explicitly
          labeled 90-day observation trend —{" "}
          <Link className="hint-link" to="/methodology">what these measure →</Link>
        </p>
      </div>

      {loading && !s ? (
        <div className="empty" role="status" aria-live="polite">◌ AGGREGATING…</div>
      ) : error && !s ? (
        <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />
      ) : !s ? (
        <div className="empty">TELEMETRY OFFLINE</div>
      ) : (
        <div id="stats-results" data-window-hours={s.time_range_hours} aria-busy={loading}>
          <div className="sr-only" aria-live="polite">
            Statistics loaded for {windowDescription}: {s.totals.hosts.toLocaleString()}{" "}
            {s.totals.hosts === 1 ? "host" : "hosts"} and {s.totals.services.toLocaleString()}{" "}
            {s.totals.services === 1 ? "service" : "services"}.
          </div>
          {(topNetwork || topPort || topProduct) && (
            <section className="highlights">
              <h2 className="eyebrow highlights-h">◊ Window snapshot</h2>
              <div className="highlights-grid">
                {topNetwork && (
                  <Link className="highlight" to={networkHref(topNetwork[0])}>
                    <div className="highlight-k mono">Largest observed network</div>
                    <div className="highlight-v" title={topNetwork[0]}>{topNetwork[0]}</div>
                    <div className="highlight-s mono dim">{topNetwork[1].toLocaleString()} distinct hosts</div>
                  </Link>
                )}
                {topPort && (
                  <Link className="highlight" to={portHref(topPort[0])}>
                    <div className="highlight-k mono">Most observed port</div>
                    <div className="highlight-v">{topPort[0]}</div>
                    <div className="highlight-s mono dim">{topPort[1].toLocaleString()} services</div>
                  </Link>
                )}
                {topProduct && (
                  <Link className="highlight" to={productHref(topProduct[0])}>
                    <div className="highlight-k mono">Most observed software</div>
                    <div className="highlight-v" title={topProduct[0]}>{topProduct[0]}</div>
                    <div className="highlight-s mono dim">{topProduct[1].toLocaleString()} services</div>
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
              <div className="tile-label eyebrow">{s.totals.hosts === 1 ? "Host" : "Hosts"}</div>
              <div className="tile-num display">{s.totals.hosts.toLocaleString()}</div>
              <div className="tile-sub mono dim">distinct IPv4 hosts</div>
            </div>
            <div className="tile panel hud">
              <div className="tile-label eyebrow">{s.totals.services === 1 ? "Service" : "Services"}</div>
              <div className="tile-num display">{s.totals.services.toLocaleString()}</div>
              <div className="tile-sub mono dim">retained ip:port records</div>
            </div>
            <div className="tile panel hud">
              <div className="tile-label eyebrow">Networks</div>
              <div className="tile-num display">{networkCount.toLocaleString()}</div>
              <div className="tile-sub mono dim">{organizationCount.toLocaleString()} owning organizations attributed by RDAP</div>
            </div>
            <div className="tile panel hud">
              <div className="tile-label eyebrow">Services / host</div>
              <div className="tile-num display">{servicesPerHost.toFixed(1)}</div>
              <div className="tile-sub mono dim">mean observed web services</div>
            </div>
            <div className="tile panel hud">
              <div className="tile-label eyebrow">HTTP 200</div>
              <div className="tile-num display secure">{successPct}%</div>
              <div className="tile-sub mono dim">{(statusData["200"] ?? 0).toLocaleString()} of {responseTotal.toLocaleString()} classified responses</div>
            </div>
            <div className="tile panel hud">
              <div className="tile-label eyebrow">Provider signals</div>
              <div className="tile-num display insecure">{flaggedPct}%</div>
              <div className="tile-sub mono dim">{s.flagged_services.toLocaleString()} services with a CVE association or adverse reputation label</div>
            </div>
          </div>
          <div className="doc-callout">
            <strong>Exploratory sample:</strong> this window contains {s.totals.hosts.toLocaleString()}{" "}
            distinct {s.totals.hosts === 1 ? "host" : "hosts"}. Results describe retained observations,
            not the entire public internet. Rate rankings apply a window-sensitive minimum base and always
            show their denominator; small absolute differences should not be interpreted as stable concentration.
          </div>

          <section className="panel panel-pad window-activity">
            <div className="section-heading">
              <div>
                <h2 className="eyebrow chart-head">◊ Observation activity</h2>
                <p className="concentration-note mono dim">Records updated inside the selected {hours === 0 ? "all-time" : RANGES.find(([, h]) => h === hours)?.[0]} window.</p>
              </div>
              <span className="window-badge mono">{hours === 0 ? "ALL" : RANGES.find(([, h]) => h === hours)?.[0]}</span>
            </div>
            <TimeSeries key={hours} data={s.submissions_over_time} unit="observations" />
          </section>

          <section className="panel panel-pad network-landscape">
            <div className="section-heading">
              <div>
                <h2 className="eyebrow chart-head">◊ Network landscape</h2>
                <p className="concentration-note mono dim">
                  RDAP ownership grouped at host level, so a host exposing several ports is counted once.
                  Labels link to matching observations.
                </p>
              </div>
              <span className="window-badge mono">
                {networkCount.toLocaleString()} networks · {organizationCount.toLocaleString()} orgs
              </span>
            </div>
            <div className="network-grid">
              <div>
                <h3 className="concentration-h mono">Most observed networks</h3>
                <BarList data={networkHosts} color="var(--amber)" limit={10} suffix=" hosts" hrefFor={networkHref} />
              </div>
              <div>
                <h3 className="concentration-h mono">Most observed organizations</h3>
                <BarList data={organizationHosts} color="var(--violet)" limit={10} suffix=" hosts" hrefFor={organizationHref} />
              </div>
              <div>
                <h3 className="concentration-h mono">Provider-signal share by network</h3>
                <p className="network-note mono dim">Minimum {networkRateMinimum} attributed hosts in this window.</p>
                <NetworkRateList
                  flagged={flaggedNetworkHosts}
                  total={networkHosts}
                  minBase={networkRateMinimum}
                  hrefFor={networkHref}
                />
              </div>
            </div>
          </section>

          <section className="panel panel-pad coverage">
            <div className="section-heading">
              <div>
                <h2 className="eyebrow chart-head">◊ Data coverage</h2>
                <p className="concentration-note mono dim">
                  Analysis coverage within this window. Missing enrichment is unknown, not clean.
                </p>
              </div>
            </div>
            <div className="coverage-grid">
              <CoverageItem label="Network attribution" value={coverage.network_attributed} total={s.totals.services} note="RDAP / WHOIS label" />
              <CoverageItem label="Geolocation" value={coverage.geolocated} total={s.totals.services} note="country available" />
              <CoverageItem label="Reputation assessment" value={coverage.reputation_assessed} total={s.totals.services} note="provider verdict available" />
              <CoverageItem label="CVE association" value={s.exposed_services} total={s.totals.services} note="third-party host association" />
            </div>
          </section>

          <section className="panel panel-pad concentration">
            <div className="row spread concentration-head">
              <h2 className="eyebrow chart-head">◊ Concentration — where provider signals cluster</h2>
              <div className="chips" aria-label="Concentration measure">
                <button className={`chip mono${!density ? " on" : ""}`} aria-pressed={!density} onClick={() => setDensity(false)}>count</button>
                <button className={`chip mono${density ? " on" : ""}`} aria-pressed={density} onClick={() => setDensity(true)}>% flagged</button>
              </div>
            </div>
            <p className="concentration-note mono dim">
              {density
                ? "Share of each group's services that carry a CVE association or reputation flag (minimum sample: 20 services per group). Percentages are descriptive, not population estimates."
                : `Among the ${s.flagged_services.toLocaleString()} services in this window carrying a CVE association or reputation flag, categories with at least 20 underlying service observations are shown:`}
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
                <h3 className="concentration-h mono">By country</h3>
                <BarList data={conc.country} color="var(--amber)" limit={8} suffix={concSuffix} hrefFor={countryHref} />
              </div>
            </div>
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
              ◊ 90-day observation trend{trends.length >= 2 ? ` · ${trends.length} daily snapshots` : ""}
            </h2>
            {trends.length >= 3 ? (
              <>
              <p className="concentration-note mono dim">
                Daily aggregate snapshots are historical context and intentionally independent of the selected window above.
              </p>
              <div className="trend-grid">
                <div className="trend-cell">
                  <h3 className="concentration-h mono">CVE- or reputation-flagged services</h3>
                  <TimeSeries data={atRiskSeries} unit="flagged services" />
                </div>
                <div className="trend-cell">
                  <h3 className="concentration-h mono">Cleartext share (%)</h3>
                  <TimeSeries data={cleartextSeries} unit="% cleartext" />
                </div>
              </div>
              </>
            ) : (
              <p className="concentration-note mono dim">
                Collecting daily snapshots — a trend is shown after at least three daily observations.
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
          </div>
        </div>
      )}
    </div>
  );
}
