import assert from "node:assert/strict";
import test from "node:test";
import type { Tile } from "../api.ts";
import { groupSearchTiles } from "./searchGrouping.ts";

function tile(ip: string, port: number): Tile {
  return {
    ip, port, banner: "", product: "", http_status: 200, secured: port === 443,
    whois: "", image_url: "", capture_hash: "", capture_ext: "", has_fulltext: false,
    updated_at: "2026-07-25T00:00:00Z",
  };
}

test("groups services by host and sorts unique ports", () => {
  const grouped = groupSearchTiles([
    tile("203.0.113.1", 443),
    tile("203.0.113.2", 80),
    tile("203.0.113.1", 80),
    tile("203.0.113.1", 443),
  ], true);
  assert.equal(grouped.length, 2);
  assert.deepEqual(grouped[0].ports, [80, 443]);
});

test("preserves individual services when grouping is disabled", () => {
  const grouped = groupSearchTiles([tile("203.0.113.1", 80), tile("203.0.113.1", 443)], false);
  assert.equal(grouped.length, 2);
  assert.deepEqual(grouped.map((entry) => entry.ports), [[], []]);
});
