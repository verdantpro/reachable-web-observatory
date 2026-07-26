import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import type { MapEntry } from "../api";
import { loadLand } from "../lib/worldLand";
import "./InteractiveWorldMap.css";

const W = 960;
const H = 480;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

type View = { scale: number; x: number; y: number };
type Projected = { point: MapEntry; key: string; x: number; y: number };
type Cluster = { id: string; x: number; y: number; points: Projected[] };

const pointKey = (p: MapEntry) => `${p.ip}:${p.port}`;
const isRisk = (p: MapEntry) =>
  (p.vuln_count ?? 0) > 0 || p.verdict === "suspicious" || p.verdict === "malicious";

function pointPlace(p: MapEntry) {
  return [p.geo.city, p.geo.country_iso].filter(Boolean).join(", ")
    || p.geo.country
    || "unknown location";
}

function clusterPlaces(cluster: Cluster) {
  return [...new Set(cluster.points.map(({ point }) => pointPlace(point)))];
}

function markerLabel(p: MapEntry) {
  const place = pointPlace(p);
  const protocol = p.secured ? "HTTPS" : "HTTP";
  const risk = isRisk(p) ? `, ${p.vuln_count || 0} host-associated CVEs, ${p.verdict || "flagged"}` : "";
  return `${p.ip}:${p.port}, ${protocol}, ${place}${risk}`;
}

export default function InteractiveWorldMap({
  points,
  selectedKey,
  onSelect,
  onClusterSelect,
}: {
  points: MapEntry[];
  selectedKey?: string;
  onSelect: (point: MapEntry) => void;
  onClusterSelect: (points: MapEntry[]) => void;
}) {
  const [land, setLand] = useState<FeatureCollection<Geometry> | null>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [hoveredID, setHoveredID] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    let alive = true;
    loadLand()
      .then((fc) => alive && setLand(fc))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const { paths, project } = useMemo(() => {
    const projection = geoNaturalEarth1();
    if (land) projection.fitSize([W, H], land);
    else projection.scale(170).translate([W / 2, H / 2]);
    const pathGen = geoPath(projection);
    return {
      paths: land ? land.features.map((feature) => pathGen(feature) || "") : [],
      project: (lon: number, lat: number) => projection([lon, lat]) ?? [0, 0],
    };
  }, [land]);

  const projected = useMemo<Projected[]>(
    () =>
      points.flatMap((point) => {
        const [x, y] = project(point.geo.lon, point.geo.lat);
        return Number.isFinite(x) && Number.isFinite(y)
          ? [{ point, key: pointKey(point), x, y }]
          : [];
      }),
    [points, project]
  );

  // Cluster in projected screen space. As the user zooms, the grid becomes
  // smaller in map coordinates and naturally separates nearby observations.
  const clusters = useMemo<Cluster[]>(() => {
    const cell = 34 / view.scale;
    const buckets = new Map<string, Projected[]>();
    for (const item of projected) {
      const id = `${Math.floor(item.x / cell)}:${Math.floor(item.y / cell)}`;
      const bucket = buckets.get(id);
      if (bucket) bucket.push(item);
      else buckets.set(id, [item]);
    }
    return [...buckets.entries()].map(([id, items]) => ({
      id,
      x: items.reduce((sum, item) => sum + item.x, 0) / items.length,
      y: items.reduce((sum, item) => sum + item.y, 0) / items.length,
      points: items,
    }));
  }, [projected, view.scale]);

  const hovered = clusters.find((cluster) => cluster.id === hoveredID) ?? null;
  const hoveredPlaces = hovered ? clusterPlaces(hovered) : [];

  const setZoom = (nextScale: number, anchorX = W / 2, anchorY = H / 2) => {
    setView((current) => {
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextScale));
      const ratio = scale / current.scale;
      return {
        scale,
        x: anchorX - (anchorX - current.x) * ratio,
        y: anchorY - (anchorY - current.y) * ratio,
      };
    });
    setHoveredID(null);
  };

  const resetView = () => {
    setView({ scale: 1, x: 0, y: 0 });
    setHoveredID(null);
  };

  const zoomCluster = (cluster: Cluster) => {
    const scale = Math.min(MAX_ZOOM, Math.max(view.scale * 1.9, 2));
    setView({ scale, x: W / 2 - cluster.x * scale, y: H / 2 - cluster.y * scale });
    setHoveredID(null);
  };

  const eventPoint = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return [W / 2, H / 2] as const;
    return [
      ((clientX - rect.left) / rect.width) * W,
      ((clientY - rect.top) / rect.height) * H,
    ] as const;
  };

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const [x, y] = eventPoint(event.clientX, event.clientY);
    setZoom(view.scale * (event.deltaY < 0 ? 1.25 : 0.8), x, y);
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!drag || !rect || drag.id !== event.pointerId) return;
    const dx = ((event.clientX - drag.x) / rect.width) * W;
    const dy = ((event.clientY - drag.y) / rect.height) * H;
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
    setHoveredID(null);
  };

  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.id === event.pointerId) {
      dragRef.current = null;
      setDragging(false);
    }
  };

  const activate = (cluster: Cluster) => {
    if (cluster.points.length > 1 && view.scale >= MAX_ZOOM - 0.01) {
      onClusterSelect(cluster.points.map(({ point }) => point));
    } else if (cluster.points.length > 1) {
      zoomCluster(cluster);
    }
    else onSelect(cluster.points[0].point);
  };

  const onMarkerKey = (event: KeyboardEvent<SVGGElement>, cluster: Cluster) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate(cluster);
    }
  };

  const httpCount = points.filter((point) => !point.secured).length;
  const riskCount = points.filter(isRisk).length;
  const summary = `${points.length} mapped hosts: ${points.length - httpCount} HTTPS, ${httpCount} cleartext HTTP, ${riskCount} at-risk. Drag to pan; use the controls or mouse wheel to zoom.`;

  return (
    <div className={`iwm${dragging ? " dragging" : ""}`}>
      <p className="sr-only">{summary}</p>
      <div className="iwm-zoom" aria-label="Map zoom controls">
        <button type="button" onClick={() => setZoom(view.scale * 1.5)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setZoom(view.scale / 1.5)} aria-label="Zoom out">−</button>
        <button type="button" onClick={resetView} disabled={view.scale === 1 && view.x === 0 && view.y === 0}>
          reset
        </button>
        <output className="mono" aria-label={`Map zoom ${view.scale.toFixed(1)} times`}>
          {view.scale.toFixed(1)}×
        </output>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="application"
        aria-label={summary}
        tabIndex={0}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={(event) => {
          const [x, y] = eventPoint(event.clientX, event.clientY);
          setZoom(view.scale * 1.7, x, y);
        }}
      >
        <defs>
          <filter id="iwm-glow" x="-200%" y="-200%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          <g className="iwm-land">
            {paths.map((path, index) => <path key={index} d={path} vectorEffect="non-scaling-stroke" />)}
          </g>
          <g className="iwm-markers">
            {clusters.map((cluster) => {
              const count = cluster.points.length;
              const point = cluster.points[0].point;
              const places = clusterPlaces(cluster);
              const placeSummary = places.length <= 3
                ? places.join("; ")
                : `${places.slice(0, 3).join("; ")}; and ${places.length - 3} more`;
              const selected = count === 1 && selectedKey === cluster.points[0].key;
              const risky = cluster.points.some(({ point: item }) => isRisk(item));
              const color = count > 1 ? "var(--violet)" : point.secured ? "var(--cyan)" : "var(--red)";
              const radius = (count > 1 ? Math.min(16, 8 + Math.log2(count) * 2) : selected ? 7 : 5) / view.scale;
              const label = count > 1
                ? `${count} nearby mapped hosts near ${placeSummary}. Activate to ${view.scale >= MAX_ZOOM - 0.01 ? "inspect the host list" : "zoom in"}.`
                : markerLabel(point);
              return (
                <g
                  key={cluster.id}
                  className={`iwm-marker${count > 1 ? " cluster" : ""}${selected ? " selected" : ""}`}
                  transform={`translate(${cluster.x},${cluster.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => activate(cluster)}
                  onKeyDown={(event) => onMarkerKey(event, cluster)}
                  onMouseEnter={() => setHoveredID(cluster.id)}
                  onMouseLeave={() => setHoveredID(null)}
                  onFocus={() => setHoveredID(cluster.id)}
                  onBlur={() => setHoveredID(null)}
                >
                  <circle className="iwm-hit" r={Math.max(radius, 13 / view.scale)} />
                  {selected && <circle className="iwm-selected-ring" r={11 / view.scale} />}
                  {risky && <circle className="iwm-risk-ring" r={8.5 / view.scale} />}
                  <circle className="iwm-dot" r={radius} style={{ fill: color }} />
                  {count > 1 && (
                    <text
                      className="iwm-cluster-count"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={9 / view.scale}
                    >
                      {count}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
      {hovered && (
        <div
          className="iwm-tooltip"
          role="tooltip"
          style={{
            left: `${((hovered.x * view.scale + view.x) / W) * 100}%`,
            top: `${((hovered.y * view.scale + view.y) / H) * 100}%`,
          }}
        >
          {hovered.points.length > 1 ? (
            <>
              <strong>{hovered.points.length} nearby hosts</strong>
              <span>{hoveredPlaces.slice(0, 4).join(" · ")}</span>
              {hoveredPlaces.length > 4 && (
                <span>+{hoveredPlaces.length - 4} more locations</span>
              )}
              <span>activate to separate markers</span>
            </>
          ) : (
            <>
              <strong>{hovered.points[0].point.ip}:{hovered.points[0].point.port}</strong>
              <span>{pointPlace(hovered.points[0].point)}</span>
              <span>
                {hovered.points[0].point.secured ? "HTTPS" : "HTTP"}
                {hovered.points[0].point.product ? ` · ${hovered.points[0].point.product}` : ""}
              </span>
            </>
          )}
        </div>
      )}
      <div className="iwm-help mono">drag to pan · wheel/double-click to zoom · select a marker for details</div>
    </div>
  );
}
