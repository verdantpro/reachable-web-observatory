import { Link, useSearchParams } from "react-router";
import type { MapMode } from "../api";
import ObservationMap from "../components/ObservationMap";
import { useMeta } from "../lib/meta";
import "./MapExplorer.css";

const VALID_MODES = new Set<MapMode>(["observations", "cleartext", "at-risk"]);
const VALID_WINDOWS = new Set([0, 24, 168, 720]);

export default function MapExplorer() {
  useMeta({
    title: "Map explorer — Reachable Web Observatory",
    description:
      "Explore the geographic distribution of sampled reachable web hosts by observation type, protocol, network, country, and time window.",
    path: "/map",
  });
  const [params, setParams] = useSearchParams();
  const requestedMode = params.get("layer") as MapMode | null;
  const mode = requestedMode && VALID_MODES.has(requestedMode) ? requestedMode : "observations";
  const requestedHours = Number(params.get("window"));
  const hours = params.has("window") && VALID_WINDOWS.has(requestedHours) ? requestedHours : 24;

  const update = (nextMode: MapMode, nextHours: number) => {
    const next = new URLSearchParams();
    if (nextMode !== "observations") next.set("layer", nextMode);
    if (nextHours !== 24) next.set("window", String(nextHours));
    setParams(next, { replace: true });
  };

  return (
    <div className="page wrap map-page">
      <header className="map-page-head">
        <div>
          <div className="eyebrow">◊ Geographic explorer</div>
          <h1 className="page-title display">Observation map</h1>
          <p className="map-page-lede">
            Explore where sampled reachable web hosts appear geographically, then narrow the view by
            time, transport security, exposure signals, country, or network.
          </p>
        </div>
        <div className="map-page-actions">
          <Link className="btn" to="/stats">View findings</Link>
          <Link className="btn" to="/methodology#limitations">Map limitations</Link>
        </div>
      </header>
      <ObservationMap
        variant="full"
        mode={mode}
        hours={hours}
        onModeChange={(nextMode) => update(nextMode, hours)}
        onHoursChange={(nextHours) => update(mode, nextHours)}
      />
    </div>
  );
}
