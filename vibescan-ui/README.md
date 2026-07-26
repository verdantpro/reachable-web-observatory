# vibescan-ui

Frontend for the **Reachable Web Observatory** (codename *VibeScan*) — the study
console plus the research pages (methodology, ethics, data, disclosure, scan-info).
React + TypeScript (Vite), talking to the Go v2 read APIs.

In production the built `dist/` is **embedded** into the `vibescan-go` collector
binary (see `vibescan-go/Dockerfile` and `vibescan-go/internal/web`) and served
same-origin with the API.

The production build prerenders public routes to complete HTML, then the browser
hydrates that markup with the same React application. Dynamic record pages retain
the SPA shell. Prerendering is build-time only; production runs no Node process.

## Concept

**"Field Record"** — an OSINT/evidence-board treatment of the sample: each host
is presented like a case file. Palette is the Verdant Protocol green (`#2f6f4f`
family, lifted for the dark ground) on a warm slate, with red reserved as a
semantic signal for cleartext/no-TLS. Type pairs an editorial serif for
statements (Iowan Old Style / Palatino / Georgia stack) with JetBrains Mono for
all telemetry/data, and Sora for running body copy. The signature is the
**capture-as-exhibit** treatment (screenshot pinned with registration ticks +
mono field notes) and the **live acquisition viewport** paired with a **world
map** of GeoIP origins. `HTTPS` reads green (secured), `HTTP` red (cleartext).

Design tokens live on `:root` in `src/theme.css`.

## Routes

| Path | Screen |
|------|--------|
| `/` | **Live** — acquisition viewport + latest/recent rails + world map + headline |
| `/feed` | **Feed** — captured services, `ranked` (readable captures first) or `latest` (strict recency) |
| `/search` | **Search** — query + product/port/status/protocol/CVE/tag/verdict filters |
| `/stats` | **Stats** — sample totals, concentration, geography, reputation, CVEs, and trends |
| `/signal/:ip/:port` | **Signal** — public exact-address record, screenshot, notes, page source, and live-host link |
| `/data` | **Data** — export/API access, schema, license, and citation |
| `/methodology` | **Methodology** — sampling, capture, enrichment, analysis, and limitations |
| `/ethics` | **Ethics** — collection boundaries, public-record policy, risk, and opt-out |
| `/architecture` | **Architecture** — agent, collector, storage, frontend, and deployment |
| `/scan-info` | **Scan info** — identifying scan traffic and requesting exclusion/removal |
| `/disclosure` | **Disclosure** — coordinated disclosure and data-correction policy |
| `/about` | **About** — project ownership, contact, scope, and research framing |
| `*` | **NotFound** — a real client-side 404 for unknown paths |

Each route sets its own `<title>`, description, canonical, and Open Graph / Twitter
tags via the `useMeta` hook (`src/lib/meta.ts`); baseline social tags + JSON-LD live
in `index.html`. Exact-address Signal pages add `noindex, nofollow, noarchive`; the
Go server also sends `X-Robots-Tag` for those routes. A global footer with research,
ethics, and removal contacts is on every page.

### Public records and presentation

- Exact observed IP/port pages, screenshots, captured source, and live-host links are
  intentionally public. The live-host control opens the observed third-party endpoint
  directly and carries an explicit safety/staleness warning.
- The scanner submission address is a different field and is redacted when an agent
  submits anonymously.
- The ranked feed is only a browsing view: it favors successful, legible captures.
  Latest, Search, exports, and direct Signal routes continue to surface the complete
  available dataset.
- CVEs, reputation labels, geolocation, ownership, and product identity retain source
  and freshness context. They are associations, not verified vulnerabilities or claims
  about an operator.
- `research@verdantprotocol.com` handles research questions and
  `abuse@verdantprotocol.com` handles exclusions, removals, disputes, and abuse reports.

## Run

Needs the Go collector serving the v2 API. The collector defaults to
**`http://127.0.0.1:8000`** (`PORT` env). Point the UI at it with `VITE_API_BASE`
(see `.env.example`).

```bash
# Terminal 1 — from vibescan-go/
go run ./cmd/collector          # :8000

# Terminal 2 — from vibescan-ui/
npm install
cp .env.example .env            # VITE_API_BASE=http://127.0.0.1:8000 recommended
npm run dev                     # http://localhost:5173
npm run build                   # typecheck + browser bundle + prerendered HTML → dist/
```

The Go API sends `Access-Control-Allow-Origin: *`, so the Vite dev server on a
different port works out of the box. `VITE_API_BASE` defaults to
`http://127.0.0.1:8000` in dev and `""` (same-origin) in a production build, so
the embedded app uses relative URLs even without an env file.

## Notes

- `src/api.ts` is the single typed client; relative `image_url`s are resolved
  against `VITE_API_BASE`. Failed calls throw a typed `ApiError` with an
  `offline` flag (honoring the collector's `503 {offline:true}`), so pages show a
  retryable "couldn't reach the collector" state (`components/ErrorState`) rather
  than a false "no results".
- The world map projects `public/world-110m.json` (from `world-atlas`) with
  `d3-geo`; points come from recent gallery entries' GeoIP (collector needs
  `GeoLite2-City.mmdb` for coordinates).
- Charts are hand-rolled to match the theme (single-hue for magnitude, reserved
  status colors for response codes).
- The `/about` page states the moderation / opt-out / takedown posture and points
  to the abuse contact; keep it in sync with what the collector actually enforces
  (e.g. the agent CIDR blacklist).
- The Signal page's **Cross-reference** section (`components/CrossReference`)
  lazy-loads `/api/v2/enrich/{ip}` for other open ports, CVEs, tags, ownership,
  and — from the ported threat feeds — a CLEAN/SUSPICIOUS/MALICIOUS verdict plus
  reputation/flags/IOCs (attributed per vendor). `SignalCard` shows `⚠ N CVEs`
  and reputation badges; Search filters on `has CVEs` and `verdict`; Stats has a
  CVE-associated + reputation facet — all fed by the collector's denormalized fields.
- Product filters and concentration tables use normalized `product_family` and
  `product_version` fields rather than treating an entire server banner as one product.
- Third-party reputation/CVE data is labelled as such: flagged cards carry a
  `source · when · unverified` provenance line (from the tile's `sources` /
  `enriched_at`), and metrics are scoped in copy ("· all time" vs the Stats window)
  so an InternetDB CVE association never reads as a confirmed vulnerability.
- Card thumbnails use the tile's `thumb_url` (a ~480px JPEG the collector generates
  in R2) and fall back to the full capture when none exists; full resolution loads
  only on the Signal detail page. All captures carry explicit `width`/`height` and
  lazy/async decoding to keep layout shift at zero.
- SEO/PWA artifacts ship from `public/`: `sitemap.xml` and `manifest.webmanifest`
  (served with correct content types by the Go embed handler, not the SPA shell).
  `og.png` is the 1200×630 social preview referenced by the baseline and route-level
  Open Graph / Twitter metadata. A repo screenshot is still optional.
- The header becomes a menu on narrow screens; route layouts are tested at desktop
  and mobile widths with no horizontal overflow. Design tokens live in `src/theme.css`.
- Deploy of the combined stack: **[`../vibescan-go/deploy/DEPLOY.md`](../vibescan-go/deploy/DEPLOY.md)**.
