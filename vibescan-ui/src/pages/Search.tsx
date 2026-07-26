import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { api, type Tile } from "../api";
import SignalCard from "../components/SignalCard";
import ErrorState from "../components/ErrorState";
import { useMeta } from "../lib/meta";
import { groupSearchTiles } from "../lib/searchGrouping";
import "./grid.css";
import "./Search.css";

type SecFilter = "any" | "https" | "http";
type SortMode = "newest" | "relevance" | "vulns" | "ip";

const PAGE = 24;

export default function Search() {
  useMeta({
    title: "Search observations — Reachable Web Observatory",
    description: "Search stored web-service observations and host-level provider associations.",
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
  const [sort, setSort] = useState<SortMode>(() => {
    const value = params.get("sort");
    return value === "relevance" || value === "vulns" || value === "ip" ? value : "newest";
  });
  const [groupHosts, setGroupHosts] = useState(false);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalHosts, setTotalHosts] = useState(0);
  const [loadAnnouncement, setLoadAnnouncement] = useState("");
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
    if (sort !== "newest") next.set("sort", sort);
    setParams(next, { replace: true });
  }, [debounced, port, sec, status, hasVulns, verdict, sort, setParams]);

  const active = useMemo(
    () => debounced !== "" || port !== "" || sec !== "any" || status !== null || hasVulns || verdict !== "",
    [debounced, port, sec, status, hasVulns, verdict]
  );

  // Any query/filter change restarts pagination from the first page.
  useEffect(() => {
    setPage(0);
  }, [debounced, port, sec, status, hasVulns, verdict, sort]);

  useEffect(() => {
    if (!active) {
      setTiles([]);
      setHasMore(false);
      setTotal(0);
      setTotalHosts(0);
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
        sort,
        limit: PAGE,
        offset: page * PAGE,
      })
      .then((r) => {
        if (!alive) return;
        // page 0 replaces (fresh query); later pages append (load more).
        setTiles((prev) => (page === 0 ? r.entries : [...prev, ...r.entries]));
        setHasMore(r.has_more);
        setTotal(r.total ?? r.entries.length);
        setTotalHosts(r.total_hosts ?? new Set(r.entries.map((entry) => entry.ip)).size);
        if (page > 0) setLoadAnnouncement(`${r.entries.length} additional observations loaded.`);
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
  }, [debounced, port, sec, status, hasVulns, verdict, sort, active, page, reloadKey]);

  const statuses: [string, number | null][] = [
    ["any", null],
    ["200", 200],
    ["301", 301],
    ["403", 403],
    ["404", 404],
    ["500", 500],
  ];
  const reset = () => {
    setQ("");
    setDebounced("");
    setPort("");
    setSec("any");
    setStatus(null);
    setHasVulns(false);
    setVerdict("");
    setSort("newest");
  };
  const groupedTiles = useMemo(() => {
    return groupSearchTiles(tiles, groupHosts);
  }, [tiles, groupHosts]);

  return (
    <div className="page wrap">
      <div className="page-head">
        <div className="eyebrow">◊ Search</div>
        <h1 className="page-title display">Search observations</h1>
      </div>

      <div className="search-bar hud">
        <span className="search-prompt mono">▸</span>
        <input
          className="search-input mono"
          autoFocus
          aria-label="Search observations by banner, product, location, whois, IP, or page text"
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
              host-associated CVEs
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
        <div className="filter-group">
          <label className="filter-label mono" htmlFor="search-sort">Sort</label>
          <select
            id="search-sort"
            className="filter-select mono"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
          >
            <option value="newest">newest</option>
            <option value="relevance">relevance</option>
            <option value="vulns">CVE count</option>
            <option value="ip">IP address</option>
          </select>
        </div>
        <div className="filter-group">
          <button className={`chip mono${groupHosts ? " on" : ""}`} aria-pressed={groupHosts} onClick={() => setGroupHosts((value) => !value)}>
            group by host
          </button>
        </div>
      </div>
      {active && (
        <div className="page-hint mono">
          Filters describe stored service observations; CVE and reputation fields apply to the host.
          Text is tokenized at punctuation; wrap multiple words in quotes to search them as a phrase.
          {" "}<button className="chip mono" onClick={reset}>reset all</button>
        </div>
      )}

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
        <div className="empty" role="status" aria-live="polite">◌ SEARCHING…</div>
      ) : tiles.length === 0 && touched ? (
        <div className="search-empty" role="status">
          <h2>No matching observations</h2>
          <p>Try removing a filter, shortening the query, or searching for a product, location, or IP prefix.</p>
          <div className="search-examples mono">
            <button onClick={reset}>clear search and filters</button>
            <button onClick={() => setQ("nginx")}>try nginx</button>
            <button onClick={() => setQ("Apache")}>try Apache</button>
          </div>
        </div>
      ) : (
        <>
          <div className="page-sub mono search-count" aria-live="polite" aria-atomic="true">
            {total.toLocaleString()} matching {total === 1 ? "service observation" : "service observations"} across{" "}
            {totalHosts.toLocaleString()} {totalHosts === 1 ? "host" : "hosts"} · sorted by {sort}
          </div>
          <div className="sr-only" aria-live="polite">{loadAnnouncement}</div>
          <div className="signal-grid" aria-busy={loading}>
            {groupedTiles.map(({ tile, ports }) => (
              <SignalCard key={`${tile.ip}:${tile.port}`} t={tile} relatedPorts={ports} />
            ))}
          </div>
          <div className="page-more" aria-live="polite">
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
              tiles.length > 0 && <button className="btn" disabled>— end of results —</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
