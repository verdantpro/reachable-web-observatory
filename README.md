# Reachable Web Observatory

An **open internet-measurement study** of the reachable public-IPv4 web, built with **Go**
and **React**: random-sample scanning, HTTP capture, attributed third-party enrichment,
open data, a documented methodology, and an ethical opt-out/disclosure posture.

**Live:** https://observatory.verdantprotocol.com &nbsp;·&nbsp;
**Methodology:** [/methodology](https://observatory.verdantprotocol.com/methodology) &nbsp;·&nbsp;
**Ethics:** [/ethics](https://observatory.verdantprotocol.com/ethics) &nbsp;·&nbsp;
**Data:** [/data](https://observatory.verdantprotocol.com/data) &nbsp;·&nbsp;
**Scanned? Opt out:** [/scan-info](https://observatory.verdantprotocol.com/scan-info)

<!-- Add a hero screenshot at docs/screenshot.png, then uncomment:
![Observatory console](docs/screenshot.png)
-->

## The research question

> *Across a uniform random sample of the reachable public-IPv4 web, where do CVE-associated
> and reputation-flagged services concentrate — by network (ASN/org), geography, product/version,
> and port — and how does that exposure change over time?*

Rather than searching for known domains, the observatory samples public IPv4 space, captures
what an anonymous browser can see on common web ports, enriches each host with public security
data, keeps the latest record for each observed service, and stores daily aggregate snapshots
for longitudinal analysis. Conduct follows
the field's ethics norms — the [Menlo Report](https://www.dhs.gov/sites/default/files/publications/CSD-MenloPrinciplesCORE-20120803_1.pdf)
and the [ZMap scanning best practices](https://github.com/zmap/zmap/wiki/Scanning-Best-Practices):
slow rate, a self-identifying HTTP User-Agent, opt-out, and coordinated disclosure. The
scanner address is not currently published; the project says so plainly on its operator-facing
pages and will update them when scanning moves to dedicated infrastructure. Original Observatory
metadata and applicable database rights are open under CC-BY-4.0; third-party material is excluded.

**Independent project** — not affiliated with a university and not IRB-reviewed; collaboration
welcome. The Observatory extension is maintained by Justin Walters under **Verdant Protocol**.

The backend is a **Go reimplementation and extension** of the private Python
system behind [What’s on HTTP](https://whatsonhttp.com/), created by
[elixx](https://github.com/elixx). It was migrated via a **strangler** strategy:
the Go collector speaks the exact legacy v1 wire protocol, so existing agents
could keep submitting unchanged while components cut over one at a time. See
[Provenance](PROVENANCE.md) for the contribution history and current
source-rights status.

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

Scanner agent → HMAC-SHA256 signed + gzipped envelope → collector → MongoDB /
object storage → concurrent threat-intel enrichment → embedded React UI.

## Key technical decisions

- **Strangler migration** — the Go collector is byte-for-byte wire-compatible with the
  Python stack (verified by golden tests), so old and new agents coexist on one datastore.
- **One binary, same origin in prod** — ingest + v2 read APIs + the React UI are served
  from a single process; the UI is embedded via `go:embed` in a multi-stage image (~60 MB).
- **Designed for failure** — disk buffering (BSON) when MongoDB is unavailable, deterministic
  `_id` so upserts collide correctly, bounded-concurrency enrichment, per-client rate limits.
- **Rendering hostile pages safely** — captures run in containerized headless Chromium. Moving
  the scanner to a dedicated VPS, isolated from the collector, is planned but not represented as
  complete.
- **Enrichment without leaking keys** — server-side fan-out across InternetDB/Shodan and
  threat feeds (VirusTotal, AbuseIPDB, GreyNoise, OTX, ThreatFox, …); API keys never reach
  the browser, results are cached and throttled. Reputation/CVE data is surfaced with its
  source and last-enrichment time so a third-party association never reads as a verdict.
- **Cheap image delivery** — the collector generates ~480px JPEG thumbnails for the card grid;
  full-resolution captures load only on the detail page.
- **Deploy without inbound SSH or static keys** — image → ECR → EC2 rolled via AWS SSM,
  authenticated with **GitHub OIDC** (assumed role), gated on tests, with automatic rollback
  to the previous image when the deployed commit or prerendered UI fails verification.

The rationale behind the compatibility, same-origin deployment, and durable
buffering choices is recorded in [`docs/adr/`](docs/adr/).

## Security & ethics

The observatory only observes what an anonymous visitor could already see. It does **not** sign in,
submit credentials, exploit/fuzz, probe non-web services, or scan ports exhaustively. Scanning
runs continuously at a deliberately slow rate and every agent honors a CIDR exclusion list.
Public service records intentionally retain the exact observed IP address and port, screenshot,
page source, and an explicit link to open the live host. The live host may have changed and
opening it is a direct visit to a third-party system; the UI warns readers before they follow it.
The scanner's submission address is a separate field and anonymous agents redact it to
`0.0.0.0`. Third-party reputation/threat verdicts are attributed associations and may be wrong.
A human monitors `abuse@verdantprotocol.com` for opt-out, takedown, and abuse reports; research
correspondence goes to `research@verdantprotocol.com`. Full policy:
[`/ethics`](https://observatory.verdantprotocol.com/ethics).

## Repository layout

| Path | Role |
|------|------|
| [`vibescan-go/`](vibescan-go/) | Collector, v2 APIs, scanner agent, migrate, Docker/Caddy deploy — [README](vibescan-go/README.md) |
| [`vibescan-ui/`](vibescan-ui/) | React/Vite console (embedded into the Go image in prod) — [README](vibescan-ui/README.md) |

The private Python system behind What’s on HTTP is not included in the public
repository. Representative wire-format and media-hash outputs are preserved as
Go golden tests so compatibility claims remain executable and inspectable
without publishing the original implementation.

## Local development

```bash
# Backend collector (listens on :8000)
cd vibescan-go
export MONGO_URI="mongodb://localhost:27017"
export VIBESCAN_SHARED_KEY="dev-key"
go run ./cmd/collector

# Frontend (dev server, proxies to the collector)
cd vibescan-ui
npm install
npm run dev
```

MongoDB is optional at startup — the collector spools accepted submissions to disk and flushes
once the database recovers. Read routes show an unavailable state until MongoDB is reachable.
See [`vibescan-go/README.md`](vibescan-go/README.md) for the agent, enrichment, migration
backfills, and full v2 API reference.

## Test & deploy

```bash
# Backend  (-short skips browser/capture tests that need a real Chromium)
cd vibescan-go && go vet ./... && go test -short ./...

# Frontend
cd vibescan-ui && npm run lint && npm test && npm run build
```

**CI:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the above plus
`govulncheck` and a Trivy dependency/secret scan on every PR and push to `main`.

**Deploy:** push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
(test gate → build → ECR → **SSM** roll EC2, no open SSH, OIDC auth, auto-rollback). Full
runbook: [`vibescan-go/deploy/DEPLOY.md`](vibescan-go/deploy/DEPLOY.md).

## Known limitations

- Windowed stats are computed live per request (bounded `$facet` + 60s cache); daily rollups
  separately power the longitudinal trends series.
- Search uses a MongoDB `$text` index, not Atlas Search.
- Threat/reputation verdicts come from third-party feeds and can be inaccurate.
- Historical captures may lack generated thumbnails and fall back to their full image.
- The ranked feed prioritizes readable HTTP 200 captures for browsing convenience; the Latest
  feed, search, exports, and exact-address record pages keep the underlying observations
  available without that presentation ranking.
- The scanner has not yet moved to its planned dedicated VPS, and no scanner IP is published.
- Interactions (votes, tags, favorites, auth) and live SSE streaming are not yet in this layer.

## Provenance and licensing

Reachable Web Observatory originated as a Go reimplementation and extension of
the private Python system behind What’s on HTTP, created by elixx. Justin
Walters performed the Go rewrite with AI coding assistance and subsequently
developed the Observatory research framing, interface, analytics,
infrastructure, and independently collected dataset. The complete account is in
[`PROVENANCE.md`](PROVENANCE.md).

No new source-code license is currently offered while downstream licensing for
portions based on the original system is clarified; see [`LICENSE`](LICENSE) and
[`LICENSING.md`](LICENSING.md). Original Observatory metadata, annotations, and
applicable database rights remain licensed under **Creative Commons Attribution
4.0 (CC-BY-4.0)** under [`LICENSE-DATA`](LICENSE-DATA). Captured
screenshots/page content, provider-supplied data, trademarks, and other
third-party material remain subject to their respective owners' rights and
terms.

---

<!-- Maintainer checklist (GitHub UI — not versioned):
  • Set repo Description: "An open internet-measurement study using random IPv4 sampling to
    observe reachable web services, exposure patterns, and attributed security signals."
  • Add Topics: internet-measurement, ipv4, security-research, open-data, golang, react,
    network-measurement, data-visualization
  • Add docs/screenshot.png and uncomment the hero image above.
  • The 1200×630 social preview lives at vibescan-ui/public/og.png and is referenced
    by the Open Graph / Twitter tags in index.html and src/lib/meta.ts.
-->
