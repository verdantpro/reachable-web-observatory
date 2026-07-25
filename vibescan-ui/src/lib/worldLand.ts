import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";

// Fetch + parse the bundled world atlas once per session, shared across every map
// (world map, per-record location globe) so SPA navigation doesn't re-download the
// ~107 KB TopoJSON. Self-hosted — no external requests.
let landPromise: Promise<FeatureCollection<Geometry>> | null = null;

export function loadLand(): Promise<FeatureCollection<Geometry>> {
  if (!landPromise) {
    landPromise = fetch("/world-110m.json")
      .then((r) => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((topo: any) => feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry>)
      .catch((e) => {
        landPromise = null; // allow a later retry after a transient failure
        throw e;
      });
  }
  return landPromise;
}
