import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { api, type Tile } from "../api";
import SignalCard from "../components/SignalCard";
import ErrorState from "../components/ErrorState";
import { useMeta } from "../lib/meta";
import "./grid.css";

const PAGE = 24;

type Mode = "ranked" | "latest";

export default function Feed() {
  useMeta({
    title: "Feed — Reachable Web Observatory",
    description: "Explore stored observations from a random sample of reachable public-IPv4 web services.",
    path: "/feed",
  });
  const [mode, setMode] = useState<Mode>("ranked");
  const [groupHosts, setGroupHosts] = useState(false);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadAnnouncement, setLoadAnnouncement] = useState("");
  const groupedTiles = useMemo(() => {
    const groups = new Map<string, { tile: Tile; ports: number[] }>();
    for (const tile of tiles) {
      const identity = groupHosts ? "host" : (tile.dom_hash || tile.capture_hash || `${tile.port}`);
      const key = `${tile.ip}:${identity}`;
      const existing = groups.get(key);
      if (existing) {
        if (!existing.ports.includes(tile.port)) existing.ports.push(tile.port);
      } else {
        groups.set(key, { tile, ports: [tile.port] });
      }
    }
    return [...groups.values()].map((group) => ({
      ...group,
      ports: group.ports.sort((a, b) => a - b),
    }));
  }, [tiles, groupHosts]);
  const collapsedCount = tiles.length - groupedTiles.length;

  // Switching mode restarts pagination from the top.
  useEffect(() => {
    setOffset(0);
  }, [mode]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    const fetcher = mode === "latest" ? api.recent : api.gallery;
    fetcher(PAGE, offset)
      .then((r) => {
        if (!alive) return;
        setTiles((prev) => (offset === 0 ? r.entries : [...prev, ...r.entries]));
        setHasMore(r.has_more);
        if (offset > 0) setLoadAnnouncement(`${r.entries.length} additional observations loaded.`);
      })
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [offset, mode, reloadKey]);

  return (
    <div className="page wrap">
      <div className="page-head">
        <div className="feed-head">
          <div>
            <div className="eyebrow">◊ Feed</div>
            <h1 className="page-title display">Observation feed</h1>
          </div>
          <div className="chips">
            <button className={`chip mono${mode === "ranked" ? " on" : ""}`} aria-pressed={mode === "ranked"} onClick={() => setMode("ranked")}>
              ranked
            </button>
            <button className={`chip mono${mode === "latest" ? " on" : ""}`} aria-pressed={mode === "latest"} onClick={() => setMode("latest")}>
              latest
            </button>
            <button className={`chip mono${groupHosts ? " on" : ""}`} aria-pressed={groupHosts} onClick={() => setGroupHosts((value) => !value)}>
              group by host
            </button>
          </div>
        </div>
        <div className="page-sub mono">
          {mode === "latest"
            ? "Newest stored observations first — any response status."
            : "Algorithmically ranked for viewability — HTTP 200 responses and clear screenshots first. This order is not representative of the sample."}
        </div>
        <p className="page-hint">
          Cards may carry host-level CVE associations and provider reputation labels, not verified service findings —{" "}
          <Link className="hint-link" to="/methodology">how to read them →</Link>
        </p>
        {collapsedCount > 0 && (
          <p className="page-hint mono">
            {collapsedCount} same-host {collapsedCount === 1 ? "service is" : "services are"} grouped
            into port chips below{groupHosts ? "" : " because the stored captures are visually equivalent"};
            every service remains available in search.
          </p>
        )}
      </div>

      {error && tiles.length === 0 ? (
        <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />
      ) : tiles.length === 0 && !loading ? (
        <div className="empty">NO OBSERVATIONS ON RECORD</div>
      ) : (
        <>
        <div className="sr-only" aria-live="polite">{loadAnnouncement}</div>
        <div className="signal-grid" aria-busy={loading}>
          {groupedTiles.map(({ tile, ports }) => (
            <SignalCard key={`${tile.ip}:${tile.port}`} t={tile} relatedPorts={ports} />
          ))}
        </div>
        </>
      )}

      <div className="page-more" aria-live="polite">
        {loading ? (
          <span className="mono dim">◌ scanning…</span>
        ) : error && tiles.length > 0 ? (
          <button className="btn" onClick={() => setReloadKey((k) => k + 1)}>
            ↻ retry
          </button>
        ) : hasMore ? (
          <button className="btn" onClick={() => setOffset((o) => o + PAGE)}>
            load more ↓
          </button>
        ) : (
          tiles.length > 0 && <button className="btn" disabled>— end of feed —</button>
        )}
      </div>
    </div>
  );
}
