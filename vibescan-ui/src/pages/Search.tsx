import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { api, type Tile } from "../api";
import SignalCard from "../components/SignalCard";
import ErrorState from "../components/ErrorState";
import { useMeta } from "../lib/meta";
import "./grid.css";
import "./Search.css";

type SecFilter = "any" | "https" | "http";

const PAGE = 60;

export default function Search() {
  useMeta({
    title: "Search the Census — Reachable Web Observatory",
    description: "Search captured web services by banner, product, port, status, location, CVEs, and reputation.",
    path: "/search",
  });
  // Seed filters from the URL so deep-links (e.g. from Stats) land pre-filtered.
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const [debounced, setDebounced] = useState(() => (params.get("q") ?? "").trim());
  const [port, setPort] = useState(() => params.get("port") ?? "");
  const [sec, setSec] = useState<SecFilter>(() => {
    const v = params.get("secured");
    if (v === "https" || v === "1" || v === "true") return "https";
    if (v === "http" || v === "0" || v === "false") return "http";
    return "any";
  });
  const [status, setStatus] = useState<number | null>(() => {
    const st = params.get("status");
    return st ? Number(st) : null;
  });
  const [hasVulns, setHasVulns] = useState(() => {
    const v = params.get("has_vulns");
    return v === "1" || v === "true";
  });
  const [verdict, setVerdict] = useState(() => params.get("verdict") ?? "");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  // Keep the complete query state in the URL so a result set can be cited,
  // bookmarked, and restored with browser back/forward navigation.
  useEffect(() => {
    const next = new URLSearchParams();
    if (debounced) next.set("q", debounced);
    if (port) next.set("port", port);
    if (sec !== "any") next.set("secured", sec);
    if (status !== null) next.set("status", String(status));
    if (hasVulns) next.set("has_vulns", "1");
    if (verdict) next.set("verdict", verdict);
    setParams(next, { replace: true });
  }, [debounced, port, sec, status, hasVulns, verdict, setParams]);

  const active = useMemo(
    () => debounced !== "" || port !== "" || sec !== "any" || status !== null || hasVulns || verdict !== "",
    [debounced, port, sec, status, hasVulns, verdict]
  );

  // Any query/filter change restarts pagination from the first page.
  useEffect(() => {
    setPage(0);
  }, [debounced, port, sec, status, hasVulns, verdict]);

  useEffect(() => {
    if (!active) {
      setTiles([]);
      setHasMore(false);
      setTotal(0);
      setError(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setTouched(true);
    setError(false);
    api
      .search({
        q: debounced || undefined,
        port: port ? Number(port) : undefined,
        status: status ?? undefined,
        secured: sec === "any" ? undefined : sec === "https",
        hasVulns: hasVulns || undefined,
        verdict: verdict || undefined,
        limit: PAGE,
        offset: page * PAGE,
      })
      .then((r) => {
        if (!alive) return;
        // page 0 replaces (fresh query); later pages append (load more).
        setTiles((prev) => (page === 0 ? r.entries : [...prev, ...r.entries]));
        setHasMore(r.has_more);
        setTotal(r.total ?? r.entries.length);
      })
      .catch(() => {
        if (!alive) return;
        setError(true);
        if (page === 0) setTiles([]);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [debounced, port, sec, status, hasVulns, verdict, active, page, reloadKey]);

  const statuses: [string, number | null][] = [
    ["any", null],
    ["200", 200],
    ["301", 301],
    ["403", 403],
    ["404", 404],
    ["500", 500],
  ];

  return (
    <div className="page wrap">
      <div className="page-head">
        <div className="eyebrow">◊ Search</div>
        <h1 className="page-title display">Query the census</h1>
      </div>

      <div className="search-bar hud">
        <span className="search-prompt mono">▸</span>
        <input
          className="search-input mono"
          autoFocus
          aria-label="Search the census by banner, product, location, whois, IP, or page text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="banner, product, location, whois, IP, or page text…"
        />
      </div>

      <div className="filters">
        <div className="filter-group">
          <span className="filter-label mono">Port</span>
          <input
            className="filter-port mono"
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
            placeholder="any"
            inputMode="numeric"
            aria-label="Filter by port"
          />
        </div>
        <div className="filter-group">
          <span className="filter-label mono">Protocol</span>
          <div className="chips">
            {(["any", "http", "https"] as SecFilter[]).map((s) => (
              <button
                key={s}
                className={`chip mono${sec === s ? " on" : ""}`}
                aria-pressed={sec === s}
                onClick={() => setSec(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label mono">Status</span>
          <div className="chips">
            {statuses.map(([label, val]) => (
              <button
                key={label}
                className={`chip mono${status === val ? " on" : ""}`}
                aria-pressed={status === val}
                onClick={() => setStatus(val)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label mono">Exposure</span>
          <div className="chips">
            <button
              className={`chip mono${hasVulns ? " on" : ""}`}
              aria-pressed={hasVulns}
              onClick={() => setHasVulns((v) => !v)}
            >
              has CVEs
            </button>
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label mono">Reputation</span>
          <div className="chips">
            {["malicious", "suspicious", "clean"].map((v) => (
              <button
                key={v}
                className={`chip mono${verdict === v ? " on" : ""}`}
                aria-pressed={verdict === v}
                onClick={() => setVerdict((cur) => (cur === v ? "" : v))}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!active ? (
        <div className="search-empty">
          <h2>Search observed services</h2>
          <p>Search exact or partial IPs, banners, products, locations, network ownership, certificate names, or captured page text.</p>
          <div className="search-examples mono">
            <button onClick={() => setQ("nginx")}>nginx</button>
            <button onClick={() => setQ("Shanghai")}>Shanghai</button>
            <button onClick={() => setQ("192.0.")}>192.0.</button>
          </div>
          <p className="mono dim">Filters combine with the text query. The URL updates automatically for sharing and citation.</p>
        </div>
      ) : error && tiles.length === 0 ? (
        <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />
      ) : loading && page === 0 ? (
        <div className="empty">◌ SCANNING…</div>
      ) : tiles.length === 0 && touched ? (
        <div className="empty">NO MATCHING SIGNALS</div>
      ) : (
        <>
          <div className="page-sub mono search-count">
            {total.toLocaleString()} {total === 1 ? "match" : "matches"}
          </div>
          <div className="signal-grid">
            {tiles.map((t) => (
              <SignalCard key={`${t.ip}:${t.port}`} t={t} />
            ))}
          </div>
          <div className="page-more">
            {loading ? (
              <span className="mono dim">◌ scanning…</span>
            ) : error ? (
              <button className="btn" onClick={() => setReloadKey((k) => k + 1)}>
                ↻ retry
              </button>
            ) : hasMore ? (
              <button className="btn" onClick={() => setPage((p) => p + 1)}>
                load more ↓
              </button>
            ) : (
              tiles.length > 0 && <span className="mono dim">— end of results —</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
