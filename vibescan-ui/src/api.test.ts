import assert from "node:assert/strict";
import test from "node:test";
import { api, ApiError, searchQuery } from "./api.ts";

test("searchQuery preserves shareable filters and encodes values", () => {
  const query = searchQuery({
    q: "admin panel",
    network: "Akamai Technologies",
    timeRange: 0,
    port: 443,
    status: 200,
    secured: true,
    product: "nginx",
    hasVulns: true,
    tag: "cloud edge",
    verdict: "suspicious",
    sort: "vulns",
    limit: 24,
    offset: 48,
  });
  assert.deepEqual(Object.fromEntries(new URLSearchParams(query)), {
    q: "admin panel",
    network: "Akamai Technologies",
    time_range: "0",
    port: "443",
    status: "200",
    secured: "true",
    product: "nginx",
    has_vulns: "1",
    tag: "cloud edge",
    verdict: "suspicious",
    sort: "vulns",
    limit: "24",
    offset: "48",
  });
});

test("network failures become offline ApiError values", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => {
    throw new TypeError("network unavailable");
  };

  await assert.rejects(api.search({ q: "nginx" }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.offline, true);
    assert.equal(error.status, undefined);
    return true;
  });
});

test("ordinary 4xx responses remain request errors", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response('{"error":"bad query"}', {
    status: 400,
    headers: { "content-type": "application/json" },
  });

  await assert.rejects(api.search({ q: "nginx" }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.offline, false);
    assert.equal(error.status, 400);
    return true;
  });
});
