# vibescan-go

The Go backend for the **Reachable Web Observatory**. It replaced an earlier
Python prototype while preserving the signed v1 ingest envelope and stored-data
compatibility; executable golden tests retain that migration provenance.

The production binary serves **ingest + v2 read APIs + the embedded React UI**
from one process (same origin in prod — no CORS required).

## Status

| Component | State |
|-----------|-------|
| **Collector** (ingest API) | implemented |
| **v2 read APIs** (gallery, search, stats, detail, media) | implemented |
| **Embedded UI + deploy packaging** (Docker/Caddy, indexes, ECR) | implemented |
| **Agent** (nmap + Chromium capture, `cmd/agent`) | implemented (RDAP ownership + web ports) |
| Interactions (votes, tags, favorites, auth) | next |
| Workers (rollups, network/world map, SSE live) | later |

## Architecture

```
┌─────────────┐  v1 signed envelope   ┌──────────────────────────┐
│  Go agent   │ ────────────────────▶ │  collector (cmd)         │
│  nmap+CDP   │  ◀── blacklist ────── │  + v2 JSON APIs          │
└─────────────┘                       │  + embedded vibescan-ui  │
                                      └───────────┬──────────────┘
                              ┌───────────────────┼───────────────────┐
                              ▼                   ▼                   ▼
                           MongoDB            S3 / R2              GeoLite2
                           (results)         (captures)            (optional)
```

Wire protocol for agents is the **legacy v1** envelope (HMAC-SHA256 + gzip +
base64), so existing Python agents keep working while the Go agent is primary.

## Deploy

Target stack: **AWS EC2 t3.micro** (image pulled from **ECR**) + **MongoDB Atlas
M0** + **S3/CloudFront**, behind **Caddy**. The **Go agent** is intended to move
to a separate scanner VPS; that isolation and a publishable scanner IP are not
claimed until the move is complete.

**Full step-by-step runbook: [`deploy/DEPLOY.md`](deploy/DEPLOY.md).**

Two web-host modes live under `deploy/`:

- **Build elsewhere, pull on the server** (small hosts like the EC2 t3.micro) —
  `docker-compose.registry.yml` + `build-push.sh` (cross-builds `linux/amd64`
  and pushes to Amazon ECR). This is the path documented end-to-end in the
  runbook.
- **Build on the server** (≥2 GB RAM) — `docker-compose.yml`:

  ```bash
  cd deploy
  cp .env.example .env          # fill Mongo / S3 / domain / shared key
  docker compose build
  docker compose run --rm --entrypoint migrate app   # indexes first
  docker compose up -d
  ```

The multi-stage `Dockerfile` builds the UI, embeds it into the binary, and
produces a small Alpine image (~60 MB) containing:

| Binary | Role |
|--------|------|
| `vibescan` | default entrypoint — collector + APIs + UI |
| `migrate` | one-shot indexes + CIDR blacklist seed |

`internal/web/dist/` is **generated** by the UI build (`vibescan-ui`,
`VITE_API_BASE=""`), including build-time-prerendered route HTML and a separate
SPA shell for query-dependent and dynamic routes. A placeholder ships so the
module always builds. Indexes
are created on startup and via `cmd/migrate` (`internal/store/indexes.go`).
The migration command also supports opt-in, idempotent historical backfills:

```bash
VIBESCAN_BACKFILL_ENRICH=1 go run ./cmd/migrate   # re-denormalize cached CVE/enrichment data
VIBESCAN_BACKFILL_PRODUCTS=1 go run ./cmd/migrate # parse legacy banners into product fields
```

The completed **strangler migration** preserved the legacy v1 wire protocol, so
older agents can continue submitting while the Go agent is now primary.

## Collector

`cmd/collector` is the production ingest and read server. It serves:

| Route | Purpose |
|-------|---------|
| `POST /api/v1/results` | signed, gzip+base64 submission envelope (legacy v1) |
| `GET  /api/v1/blacklist` | enabled CIDR blacklist (agents cache ~hourly) |
| `GET  /api/health`, `GET /api/healthz` | health probes |
| `GET  /api/v2/*` | read APIs (below) |
| `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` | served with correct content types (not the SPA shell) |
| `/*` | embedded SPA (client-side routes fall back to `index.html`) |

### Wire & data compatibility

Verified byte-for-byte against the Python implementation via golden tests
(`internal/transport`, `internal/media`):

- HMAC-SHA256 signing, gzip, base64 envelope (`common/transport.py`)
- Capture hash/ext, DOM-structure hash, pHash chunking
- Deterministic `_id = ObjectId(md5("ip:port")[:24])`, so upserts collide
  correctly with documents written by the Python collector
- Per-service document schema, GeoIP enrichment, `landing_image`, object-storage
  `r2:<key>` references, and disk buffering when MongoDB is unavailable

### Intentional deviations from `server.py`

- **No artificial sleep** before each bulk write.
- **Disk buffer uses BSON files** (not JSON) to preserve BSON date types exactly.
- Object-storage uploads for a submission are finalized in one bounded-concurrency
  pass before persistence (slightly higher orphaned-object risk on a mid-submission
  crash; functionally equivalent otherwise).
- **Generates a ~480px JPEG thumbnail** per capture on R2 upload (`internal/media`
  downscale → `thumb/<key>.jpg`), recorded as a `thumb` ref for the card grid.
  Best-effort: any failure is swallowed and the UI uses the full image.
- **`no_report` / `anon` redacts `submitted_by`** to `0.0.0.0` at ingest (and the
  public detail API re-redacts if `anon` is set). Python still stores the real
  client IP under `submitted_by` even when anonymized.

### Run locally

```bash
# Config via environment or a .env file (see deploy/.env.example).
export MONGO_URI="mongodb://localhost:27017"
export VIBESCAN_SHARED_KEY="dev-key"
export GEOLITE2_CITY_MMDB=./GeoLite2-City.mmdb   # optional
go run ./cmd/collector    # listens on :8000 (override with PORT)
```

MongoDB is optional at startup: if it’s unreachable the collector still serves
and spools accepted submissions to `cache/server_buffer/`, flushing once the
database recovers. Object storage accepts **`S3_*` (AWS) or `R2_*` (Cloudflare)**
env names interchangeably.

### Test

```bash
go vet ./...
go test -short ./...   # -short skips the browser/capture tests (need real Chromium)
go build ./...
govulncheck ./...      # optional: same check CI runs
```

CI (`.github/workflows/ci.yml`) runs formatting checks, `go vet`, race-enabled
`go test -short`, pinned `govulncheck`, UI lint/tests/build, CodeQL, and a
full-SHA-pinned Trivy dependency/secret scan. The Deploy workflow gates on a
fast test job, then verifies both the running commit and prerendered UI before
it declares a rollout successful.

## v2 read APIs

Clean JSON endpoints for the UI (all under `/api/v2`, CORS `*`, same process as
the collector). Keyed by `ip/port` rather than Mongo `_id`.

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v2/gallery?limit=&offset=&with_screenshots_only=&sort=` | Captured tiles; `sort=recent` = strict newest-first (any status), else the ranked feed |
| `GET /api/v2/search?q=&port=&status=&secured=&product=&limit=&offset=` | Filtered / `$text` free-text search |
| `GET /api/v2/services/{ip}/{port}?brief=` | Single service detail (incl. `fulltext`); `brief=1` omits `fulltext` |
| `GET /api/v2/enrich/{ip}` | Shodan / InternetDB cross-reference (ports, CVEs, tags, org); cached |
| `GET /api/v2/stats?time_range=<hours>` | Aggregate snapshot (`0` = all retained services; positive values = records updated within that many hours; one `$facet` pass, 60s cached): includes **concentration** by port/product/org/country, host-deduplicated **top CVEs**, geography (`services_by_country`, flagged-host points), and per-dimension totals for density views |
| `GET /api/v2/trends?days=<n>` | Daily aggregate snapshots (longitudinal exposure series) from the rollup worker |
| `GET /api/v2/export?format=json\|csv&…` | Open dataset export (same filters as search); rate-limited, paginated |
| `GET /api/v2/random-capture` | One random landing-page tile (`$sample`) |
| `GET /api/v2/image/{ip}/{port}` | Serves base64 captures; 302-redirects to object storage for `r2:` refs |

A gallery/search **tile** carries `ip, port, banner, product, http_status,
product_version, secured, whois, image_url, thumb_url, capture_hash/ext, has_fulltext,
screenshot_phash, dom_hash, cert_cn, updated_at, geo` plus the denormalized
enrichment summary `vuln_count, tags, extra_ports, verdict, sources, enriched_at`.
`image_url` resolves to the object-storage public URL (S3/CloudFront or R2) when
configured, otherwise `/api/v2/image/...`; `thumb_url` is the R2 URL of a generated
~480px JPEG thumbnail (empty for records captured before thumbnails, or when R2 is
disabled, so the UI falls back to the full image).

### Deferred (intentionally) in the read layer

- **Stats are computed live** over the requested window (bounded `$facet` +
  `maxTimeMS` + 60s cache, per-range), not from Redis/hourly rollups. A separate
  **daily rollup worker** (`VIBESCAN_ROLLUP_WORKER`, default on) snapshots the retained
  collection once per day into `stats_daily` for the longitudinal `/api/v2/trends` series.
- **Search uses a MongoDB `$text` index** (weighted over banner, geo
  city/country/region, cert_cn, whois, rdns, fulltext) for free text — so
  location queries like `shanghai` match the GeoIP subdocument. IP-like queries
  (containing a dot) route to an anchored, escaped `ip_str` prefix match instead
  (the text tokenizer splits on `.`). Not Atlas Search / Online Archive. Input is
  length-capped and regex-escaped, so no ReDoS surface. The text index is
  reconciled on startup (`indexes.go`): if its field set/weights change it is
  dropped and rebuilt once, otherwise left untouched.
- **Product identity is normalized at ingest** into `product_family`,
  `product_version`, and `product_major_version`. Search and statistics use the
  normalized family so version-bearing banners do not fragment one product into
  many misleading categories. `VIBESCAN_BACKFILL_PRODUCTS=1` applies the same
  parser to historical records through `cmd/migrate`.
- The public `/api/v2/*` endpoints are rate-limited per client IP (in-process
  token bucket; `VIBESCAN_READ_RATE_RPS` / `VIBESCAN_READ_RATE_BURST`, RPS ≤ 0
  disables).
- **Host enrichment** (`internal/enrich`): when enrichment is enabled and the
  provider is reachable, eligible captured IPs are cross-referenced against
  Shodan's free/keyless **InternetDB** (ports/CVEs/tags/hostnames) and, on the
  Signal view only when `SHODAN_API_KEY` is set, the paid **Host API**
  (org/ISP/ASN/product). Missing credentials, provider errors, and rate limits
  can produce partial or absent results. Returned results are cached (in-memory + the `enrichment`
  collection, `VIBESCAN_ENRICH_TTL_HOURS`) and throttled by a shared outbound
  limiter. A background worker (`VIBESCAN_ENRICH_WORKER`) keeps recent hosts
  enriched via InternetDB (free), denormalizing `vuln_count`/`shodan_tags`/
  `enrich_sources`/`enriched_at` onto results so tiles, `search?has_vulns=1&tag=`,
  the Stats CVE-associated facet, and the card provenance line ("source · when ·
  unverified") work across the retained collection. The API key never reaches the browser.
- **Threat intelligence** (`internal/enrich/threat.go`, ported from
  [scope-recon](https://github.com/nethoundsh/scope-recon)): on the on-demand
  Signal view, configured providers may cross-reference an IP through ip-api, RIPEstat, VirusTotal,
  AbuseIPDB, GreyNoise, AlienVault OTX, ThreatFox, IPQualityScore, Pulsedive, and
  IPinfo (fanned out concurrently), yielding a CLEAN/SUSPICIOUS/MALICIOUS
  `verdict`. Each source is gated by its own optional key (missing = skipped);
  keys stay server-side. ip-api + RIPEstat (keyless) also run in the worker.
  `search?verdict=` and a Stats verdict facet cover hosts that have been enriched.
- Votes, tags, favorites, auth, and live SSE streams are not in this layer yet.

### Public record policy

The read API intentionally exposes each observed service by exact IP address and
port, including its screenshot and captured source when available. The Signal UI
also retains a direct link to the live host, with a warning that the destination
is third-party and may have changed since capture. These target identifiers are
not anonymized or selectively hidden.

`submitted_by` identifies the submitting scanner, not the observed target. Agents
using `VIBESCAN_NO_REPORT=1` store `0.0.0.0` and set `anon`; the public detail API
also re-redacts anonymous legacy records. Signal routes are discouraged from search
indexing with both page metadata and the server's `X-Robots-Tag`. Removal and
correction requests go to `abuse@verdantprotocol.com`.

## Agent

`cmd/agent` is the production scanner: random IPv4 batches
→ nmap → optional Chromium capture → signed submit.

```bash
export VIBESCAN_SERVER_URL=http://127.0.0.1:8000
export VIBESCAN_SHARED_KEY=dev-key
export VIBESCAN_PORTS=80,443,8000,8080,8443
go run ./cmd/agent
```

Production packaging: `Dockerfile.agent` + `deploy/docker-compose.agent.yml` +
`deploy/agent.env.example`. See **§7 of [`deploy/DEPLOY.md`](deploy/DEPLOY.md)**.

| Env | Default | Notes |
|-----|---------|--------|
| `VIBESCAN_SERVER_URL` | _(required)_ | Collector base URL, no path |
| `VIBESCAN_SHARED_KEY` | `vibescan-default-key` | Must match collector |
| `VIBESCAN_PORTS` | `80,443,8000,8080,8443` | CSV web ports |
| `VIBESCAN_NMAP_OPTIONS` | `-n -T3` | Prefer `-T2` in production examples |
| `VIBESCAN_SCAN_THREADS` | `2` | Concurrent host record builds |
| `VIBESCAN_BATCH_SIZE` | `10` | Random IPs per nmap batch |
| `VIBESCAN_BROWSER_CONCURRENCY` | `2` | Concurrent Chromium captures |
| `VIBESCAN_CAPTURE_HTTP` | `1` | `0` = discover-only |
| `VIBESCAN_CAPTURE_DELAY` | `2.0` | Seconds to let a page settle before capture |
| `VIBESCAN_NO_REPORT` | off | Redact `submitted_by` (→ `0.0.0.0`) + set `anon` |
| `VIBESCAN_RDAP` | `1` | RDAP ownership lookup (cached /24) |
| `VIBESCAN_USER_AGENT` | identifying UA | Browser User-Agent for captures; defaults to a self-identifying string linking to `/scan-info` (signal intent) |
| `VIBESCAN_CHROME_PATH` | auto-detected | Optional explicit Chrome/Chromium executable |
## Layout

```
cmd/collector        entrypoint (ingest + v2 APIs + embedded UI)
cmd/agent            scanner: nmap discovery + Chromium capture + submit
cmd/migrate          one-shot: create MongoDB indexes + seed blacklist
internal/config      env / .env loading (S3_* and R2_* aliases)
internal/transport   v1 signed-envelope encode/decode (+ golden tests)
internal/media       capture / DOM / pHash hashing (+ golden tests)
internal/geo         IPv4 normalization, GeoIP lookup
internal/store       MongoDB upserts/reads/indexes, object storage, disk buffer, blacklist
internal/collector   ingest pipeline + blacklist cache
internal/scanner     agent loop, nmap, Chromium, collector client
internal/httpapi     HTTP routing/handlers (API + SPA)
internal/web         embedded UI (dist/ generated by vibescan-ui)
Dockerfile           multi-stage build (UI → embed → Go → slim runtime)
Dockerfile.agent     agent image (nmap + Chromium + agent binary)
deploy/              compose (build / registry / agent), Caddyfile,
                     .env.example, agent.env.example, build-push.sh, DEPLOY.md
```

## Related tree

| Path | Role |
|------|------|
| `../vibescan-ui` | React/Vite frontend (embedded into the Go image in production) |

The archived Python prototype is not published in this repository. Compatibility
with its v1 transport and hashing behavior is captured by golden fixtures in
`internal/transport` and `internal/media`.
