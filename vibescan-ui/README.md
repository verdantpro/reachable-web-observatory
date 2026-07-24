# vibescan-ui

**VibeScan · Live Cleartext HTTP Acquisition** — frontend recon console for
HTTP/HTTPS discovery. React + TypeScript (Vite), talking to the Go v2 read APIs.

In production the built `dist/` is **embedded** into the `vibescan-go` collector
binary (see `vibescan-go/Dockerfile` and `vibescan-go/internal/web`) and served
same-origin with the API.

## Concept

**"Field Record"** — an OSINT/evidence-board treatment of the census: each host
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
| `/feed` | **Feed** — captured services, `ranked` (curated) or `latest` (recency) |
| `/search` | **Search** — query + port/status/protocol filters, `$text`-backed |
| `/stats` | **Stats** — telemetry dashboard (ports, status, servers, over-time) |
| `/signal/:ip/:port` | **Signal** — the case file: exhibit + field notes + banner + page source |
| `/about` | **About** — how it works, scope, and the opt-out / takedown / abuse posture |
| `*` | **NotFound** — a real client-side 404 for unknown paths |

Each route sets its own `<title>`, description, canonical, and Open Graph / Twitter
tags via the `useMeta` hook (`src/lib/meta.ts`); baseline social tags + JSON-LD live
in `index.html`. A global footer (About & ethics · opt-out contact) is on every page.

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
npm run build                   # typecheck + production bundle → dist/
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
  A 1200×630 `og.png` and a repo screenshot are the only assets left to add.
- Design tokens (`src/theme.css`) meet WCAG AA contrast on the dark ground; the
  header hides its subtitle and switches to a single-column signal strip on narrow
  mobile widths.
- Deploy of the combined stack: **[`../vibescan-go/deploy/DEPLOY.md`](../vibescan-go/deploy/DEPLOY.md)**.
