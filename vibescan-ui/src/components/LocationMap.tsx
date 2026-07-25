import { useEffect, useState } from "react";
import { geoOrthographic, geoPath, geoGraticule10 } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { loadLand } from "../lib/worldLand";
import "./LocationMap.css";

const SIZE = 300;

// A self-hosted orthographic globe rotated to centre on the host's coarse
// IP-geolocation, with a marker. No external map tiles (keeps the strict CSP and
// leaks nothing), and the globe view honestly reflects country/region accuracy.
export default function LocationMap({ lat, lon }: { lat: number; lon: number }) {
  const [land, setLand] = useState<FeatureCollection<Geometry> | null>(null);

  useEffect(() => {
    let alive = true;
    loadLand()
      .then((l) => alive && setLand(l))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const r = SIZE / 2 - 6;
  const proj = geoOrthographic()
    .rotate([-lon, -lat])
    .scale(r)
    .translate([SIZE / 2, SIZE / 2])
    .clipAngle(90);
  const path = geoPath(proj);
  const marker = proj([lon, lat]);

  return (
    <div className="locmap">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Approximate location on the globe">
        <circle className="locmap-ocean" cx={SIZE / 2} cy={SIZE / 2} r={r} />
        <path className="locmap-grat" d={path(geoGraticule10()) ?? undefined} />
        {land && <path className="locmap-land" d={path(land) ?? undefined} />}
        {marker && (
          <g transform={`translate(${marker[0]},${marker[1]})`}>
            <circle className="locmap-pulse" r="8" />
            <circle className="locmap-dot" r="3.5" />
          </g>
        )}
      </svg>
    </div>
  );
}
