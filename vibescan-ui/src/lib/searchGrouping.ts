import type { Tile } from "../api";

export interface TileGroup {
  tile: Tile;
  ports: number[];
}

export function groupSearchTiles(tiles: Tile[], groupHosts: boolean): TileGroup[] {
  if (!groupHosts) return tiles.map((tile) => ({ tile, ports: [] }));
  const hosts = new Map<string, TileGroup>();
  for (const tile of tiles) {
    const existing = hosts.get(tile.ip);
    if (existing) existing.ports.push(tile.port);
    else hosts.set(tile.ip, { tile, ports: [tile.port] });
  }
  return [...hosts.values()].map((entry) => ({
    ...entry,
    ports: [...new Set(entry.ports)].sort((a, b) => a - b),
  }));
}
