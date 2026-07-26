import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { api, type MapEntry, type MapMode, type MapResponse } from "../api";
import InteractiveWorldMap from "./InteractiveWorldMap";
import ErrorState from "./ErrorState";
import "./ObservationMap.css";

const MODES: { value: MapMode; label: string; description: string }[] = [
  { value: "observations", label: "observations", description: "Newest geolocated service per host" },
  { value: "cleartext", label: "cleartext", description: "Hosts observed serving HTTP without TLS" },
  { value: "at-risk", label: "at-risk", description: "Hosts with CVE associations or reputation flags" },
];
const WINDOWS: [string, number][] = [["24H", 24], ["7D", 168], ["30D", 720], ["ALL", 0]];

const keyOf = (point: MapEntry) => `${point.ip}:${point.port}`;
const sortedCounts = (counts: Record<string, number>) =>
  Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

function windowText(hours: number) {
  if (hours === 0) return "all retained observations";
  if (hours === 24) return "the last 24 hours";
  if (hours % 24 === 0) return `the last ${hours / 24} days`;
  return `the last ${hours} hours`;
}

function observationAge(value: string) {
  const millis = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(millis) || millis < 0) return "just now";
  const minutes = Math.floor(millis / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ObservationMap({
  variant = "embedded",
  mode: controlledMode,
  hours: controlledHours,
  onModeChange,
  onHoursChange,
}: {
  variant?: "embedded" | "full";
  mode?: MapMode;
  hours?: number;
  onModeChange?: (mode: MapMode) => void;
  onHoursChange?: (hours: number) => void;
}) {
  const [localMode, setLocalMode] = useState<MapMode>("observations");
  const [localHours, setLocalHours] = useState(24);
  const mode = controlledMode ?? localMode;
  const hours = controlledHours ?? localHours;
  const [data, setData] = useState<MapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showHTTPS, setShowHTTPS] = useState(true);
  const [showHTTP, setShowHTTP] = useState(true);
  const [selected, setSelected] = useState<MapEntry | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<MapEntry[]>([]);
  const [rankMode, setRankMode] = useState<"countries" | "networks">("countries");
  const [focusCountry, setFocusCountry] = useState("");
  const [focusNetwork, setFocusNetwork] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    setSelected(null);
    setSelectedCluster([]);
    setFocusCountry("");
    setFocusNetwork("");
    api.observationMap(mode, hours, variant === "full" ? 1000 : 500)
      .then((result) => {
        if (!alive) return;
        setData(result);
      })
      .catch(() => {
        if (!alive) return;
        setError(true);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [mode, hours, variant, reloadKey]);

  const chooseMode = (nextMode: MapMode) => {
    if (controlledMode === undefined) setLocalMode(nextMode);
    onModeChange?.(nextMode);
  };
  const chooseHours = (nextHours: number) => {
    if (controlledHours === undefined) setLocalHours(nextHours);
    onHoursChange?.(nextHours);
  };

  const focusedPoints = useMemo(
    () =>
      (data?.entries ?? []).filter((point) => {
        if (focusCountry && point.geo.country_iso !== focusCountry) return false;
        if (focusNetwork && point.network !== focusNetwork) return false;
        return true;
      }),
    [data, focusCountry, focusNetwork]
  );
  const visiblePoints = useMemo(
    () =>
      focusedPoints.filter((point) => {
        if (point.secured && !showHTTPS) return false;
        if (!point.secured && !showHTTP) return false;
        return true;
      }),
    [focusedPoints, showHTTPS, showHTTP]
  );

  useEffect(() => {
    if (selected && !visiblePoints.some((point) => keyOf(point) === keyOf(selected))) {
      setSelected(null);
    }
    if (
      selectedCluster.length > 0 &&
      selectedCluster.some((point) => !visiblePoints.some((visible) => keyOf(visible) === keyOf(point)))
    ) {
      setSelectedCluster([]);
    }
  }, [selected, selectedCluster, visiblePoints]);

  const httpsCount = focusedPoints.filter((point) => point.secured).length;
  const httpCount = focusedPoints.length - httpsCount;
  const riskCount = focusedPoints.filter(
    (point) => point.vuln_count > 0 || point.verdict === "suspicious" || point.verdict === "malicious"
  ).length;
  const activeMode = MODES.find((item) => item.value === mode)!;
  const rankings = rankMode === "countries"
    ? sortedCounts(data?.countries ?? {})
    : sortedCounts(data?.networks ?? {});

  return (
    <div className={`observation-map ${variant}`}>
      <div className="omap-toolbar">
        <div className="omap-control">
          <span className="omap-label mono">Layer</span>
          <div className="chips">
            {MODES.map((item) => (
              <button
                type="button"
                key={item.value}
                className={`chip mono${mode === item.value ? " on" : ""}`}
                aria-pressed={mode === item.value}
                title={item.description}
                onClick={() => chooseMode(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="omap-control">
          <span className="omap-label mono">Window</span>
          <div className="chips">
            {WINDOWS.map(([label, value]) => (
              <button
                type="button"
                key={label}
                className={`chip mono${hours === value ? " on" : ""}`}
                aria-pressed={hours === value}
                onClick={() => chooseHours(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="omap-context">
        <div>
          <strong>{activeMode.description}</strong>
          <span>
            {" "}in {windowText(hours)}. One newest matching service represents each host.
          </span>
        </div>
        {data && (
          <div className="mono omap-sample">
            {data.displayed_hosts.toLocaleString()} mapped of {data.total_hosts.toLocaleString()} matching hosts
          </div>
        )}
      </div>

      <div className="omap-filterbar" aria-label="Visible map layers">
        <button
          type="button"
          className={`omap-legend-toggle https${showHTTPS ? " on" : ""}`}
          aria-pressed={showHTTPS}
          onClick={() => setShowHTTPS((value) => (value && !showHTTP ? value : !value))}
        >
          <i /> HTTPS <span>{httpsCount.toLocaleString()}</span>
        </button>
        <button
          type="button"
          className={`omap-legend-toggle http${showHTTP ? " on" : ""}`}
          aria-pressed={showHTTP}
          onClick={() => setShowHTTP((value) => (value && !showHTTPS ? value : !value))}
        >
          <i /> HTTP <span>{httpCount.toLocaleString()}</span>
        </button>
        <span className="omap-risk-legend mono"><i /> at-risk ring · {riskCount.toLocaleString()}</span>
        {(focusCountry || focusNetwork) && (
          <button
            type="button"
            className="chip mono on omap-focus"
            onClick={() => {
              setFocusCountry("");
              setFocusNetwork("");
            }}
          >
            focused: {focusCountry || focusNetwork} ×
          </button>
        )}
      </div>

      <div className="omap-grid">
        <div className="omap-stage" aria-busy={loading}>
          {error && !data ? (
            <ErrorState onRetry={() => setReloadKey((key) => key + 1)} />
          ) : (
            <>
              <InteractiveWorldMap
                points={visiblePoints}
                selectedKey={selected ? keyOf(selected) : undefined}
                onSelect={(point) => {
                  setSelected(point);
                  setSelectedCluster([]);
                }}
                onClusterSelect={(points) => {
                  setSelected(null);
                  setSelectedCluster(points);
                }}
              />
              {loading && <div className="omap-loading mono" role="status">◌ UPDATING MAP…</div>}
              {!loading && visiblePoints.length === 0 && (
                <div className="omap-empty mono" role="status">no hosts match the visible layers</div>
              )}
            </>
          )}
        </div>

        <aside className="omap-sidebar" aria-label="Map details and rankings">
          {selected ? (
            <div className="omap-detail">
              <div className="row spread">
                <span className="omap-label mono">Selected host</span>
                <button type="button" className="omap-close" onClick={() => setSelected(null)} aria-label="Close selected host details">×</button>
              </div>
              <h3 className="mono">{selected.ip}:{selected.port}</h3>
              <div className="omap-detail-status">
                <span className={selected.secured ? "secure" : "insecure"}>
                  {selected.secured ? "HTTPS" : "HTTP"}
                </span>
                {selected.http_status != null && <span>HTTP {selected.http_status}</span>}
                {selected.verdict && <span className={`verdict ${selected.verdict}`}>{selected.verdict}</span>}
              </div>
              <dl>
                <div><dt>Location</dt><dd>{[selected.geo.city, selected.geo.region, selected.geo.country].filter(Boolean).join(", ") || "Unknown"}</dd></div>
                <div><dt>Accuracy</dt><dd>{selected.geo.accuracy_radius_km ? `approximately ${selected.geo.accuracy_radius_km.toLocaleString()} km radius` : "IP-based, approximate"}</dd></div>
                <div><dt>Network</dt><dd>{selected.network || "Unknown"}</dd></div>
                <div><dt>Product</dt><dd>{[selected.product, selected.product_version].filter(Boolean).join(" ") || "Unknown"}</dd></div>
                <div><dt>Associated CVEs</dt><dd>{selected.vuln_count.toLocaleString()}</dd></div>
                <div><dt>Observed</dt><dd title={selected.updated_at}>{observationAge(selected.updated_at)}</dd></div>
              </dl>
              <div className="omap-actions">
                <Link className="btn btn-primary" to={`/signal/${selected.ip}/${selected.port}`}>Open observation →</Link>
                {selected.network && (
                  <Link
                    className="btn"
                    to={`/search?network=${encodeURIComponent(selected.network)}&time_range=${hours}&group=hosts`}
                  >
                    Network hosts
                  </Link>
                )}
              </div>
            </div>
          ) : selectedCluster.length > 1 ? (
            <div className="omap-cluster-detail">
              <div className="row spread">
                <span className="omap-label mono">Overlapping hosts</span>
                <button
                  type="button"
                  className="omap-close"
                  onClick={() => setSelectedCluster([])}
                  aria-label="Close overlapping host list"
                >
                  ×
                </button>
              </div>
              <h3>{selectedCluster.length} hosts at this approximate location</h3>
              <p>IP geolocation can place unrelated hosts at the same city or country centroid. Choose a host to inspect it.</p>
              <ul className="omap-cluster-list">
                {selectedCluster.map((point) => (
                  <li key={keyOf(point)}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(point);
                        setSelectedCluster([]);
                      }}
                    >
                      <span className="mono">{point.ip}:{point.port}</span>
                      <small>
                        {point.secured ? "HTTPS" : "HTTP"}
                        {point.product ? ` · ${point.product}` : ""}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="omap-rank-head">
                <span className="omap-label mono">Matching hosts by</span>
                <div className="chips">
                  <button
                    type="button"
                    className={`chip mono${rankMode === "countries" ? " on" : ""}`}
                    aria-pressed={rankMode === "countries"}
                    onClick={() => setRankMode("countries")}
                  >
                    country
                  </button>
                  <button
                    type="button"
                    className={`chip mono${rankMode === "networks" ? " on" : ""}`}
                    aria-pressed={rankMode === "networks"}
                    onClick={() => setRankMode("networks")}
                  >
                    network
                  </button>
                </div>
              </div>
              <ol className="omap-ranks">
                {rankings.map(([label, count]) => (
                  <li key={label}>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusCountry(rankMode === "countries" ? label : "");
                        setFocusNetwork(rankMode === "networks" ? label : "");
                      }}
                      title={`Focus mapped points for ${label}`}
                    >
                      <span className="mono">{label}</span>
                      <strong>{count.toLocaleString()}</strong>
                    </button>
                  </li>
                ))}
              </ol>
              <p className="omap-rank-note">
                Rankings count all matching geolocated hosts. Selecting a row focuses the bounded set of markers currently loaded.
              </p>
            </>
          )}
        </aside>
      </div>

      <p className="omap-method mono">
        Coarse IP-based geolocation—an approximate region, never a precise server location.
        The basemap is bundled locally; viewing it sends no requests to Google, OpenStreetMap, or another tile provider.
      </p>
    </div>
  );
}
