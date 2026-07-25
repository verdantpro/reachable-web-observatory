import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { api, type Tile } from "../api";
import SignalCard from "../components/SignalCard";
import ErrorState from "../components/ErrorState";
import { useMeta } from "../lib/meta";
import "./grid.css";

const PAGE = 60;

type Mode = "ranked" | "latest";

export default function Feed() {
  useMeta({
    title: "Feed — Reachable Web Observatory",
    description: "A live feed of recently captured web services discovered across the public internet.",
    path: "/feed",
  });
  const [mode, setMode] = useState<Mode>("ranked");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const groupedTiles = useMemo(() => {
    const groups = new Map<string, { tile: Tile; ports: number[] }>();
    for (const tile of tiles) {
      const identity = tile.dom_hash || tile.capture_hash || `${tile.port}`;
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
  }, [tiles]);
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
      })
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [offset, mode, reloadKey]);

  return (
    <div className="page wrap">
      <div className="page-head row spread">
        <div>
          <div className="eyebrow">◊ Feed</div>
          <h1 className="page-title display">Signal feed</h1>
          <div className="page-sub mono">
            {mode === "latest"
              ? "Newest captured services first — any status, as the agents find them."
              : "Curated across the census — HTTP 200 and clear screenshots first."}
          </div>
          <p className="page-hint">
            Cards carry third-party CVE &amp; reputation signals (not verified findings) —{" "}
            <Link className="hint-link" to="/methodology">how to read them →</Link>
          </p>
          {collapsedCount > 0 && (
            <p className="page-hint mono">
              {collapsedCount} visually duplicate same-host {collapsedCount === 1 ? "service is" : "services are"} grouped
              into port chips below; every service remains available in search.
            </p>
          )}
        </div>
        <div className="chips">
          <button className={`chip mono${mode === "ranked" ? " on" : ""}`} onClick={() => setMode("ranked")}>
            ranked
          </button>
          <button className={`chip mono${mode === "latest" ? " on" : ""}`} onClick={() => setMode("latest")}>
            latest
          </button>
        </div>
      </div>

      {error && tiles.length === 0 ? (
        <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />
      ) : tiles.length === 0 && !loading ? (
        <div className="empty">NO SIGNALS ON RECORD</div>
      ) : (
        <div className="signal-grid">
          {groupedTiles.map(({ tile, ports }) => (
            <SignalCard key={`${tile.ip}:${tile.port}`} t={tile} relatedPorts={ports} />
          ))}
        </div>
      )}

      <div className="page-more">
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
          tiles.length > 0 && <span className="mono dim">— end of feed —</span>
        )}
      </div>
    </div>
  );
}
