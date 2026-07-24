# Reachable Web Observatory

*(codename: VibeScan)*

An **open internet-measurement study** of the reachable public-IPv4 web, built with **Go**
and **React**: random-sample scanning, HTTP capture, CVE/reputation enrichment, open data,
a documented methodology, and an ethical opt-out/disclosure posture.

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
data, and treats every capture as one observation in a continuing time series. Conduct follows
the field's ethics norms — the [Menlo Report](https://www.dhs.gov/sites/default/files/publications/CSD-MenloPrinciplesCORE-20120803_1.pdf)
and the [ZMap scanning best practices](https://github.com/zmap/zmap/wiki/Scanning-Best-Practices):
slow rate, opt-out, published scanner ranges, and coordinated disclosure. Data is open (CC-BY-4.0).

**Independent project** — not affiliated with a university and not IRB-reviewed; collaboration
welcome. Maintained by an independent researcher under **Verdant Protocol**.

The backend is a **Go reimplementation** of an earlier Python prototype, migrated via a
**strangler** strategy — the Go collector speaks the exact legacy v1 wire protocol, so existing
agents keep submitting unchanged while components cut over one at a time.

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
- **Rendering hostile pages safely** — captures run in a containerized headless Chromium on a
  separate scanner host, isolated from the collector.
- **Enrichment without leaking keys** — server-side fan-out across InternetDB/Shodan and
  threat feeds (VirusTotal, AbuseIPDB, GreyNoise, OTX, ThreatFox, …); API keys never reach
  the browser, results are cached and throttled. Reputation/CVE data is surfaced with its
  source and last-enrichment time so a third-party association never reads as a verdict.
- **Cheap image delivery** — the collector generates ~480px JPEG thumbnails for the card grid;
  full-resolution captures load only on the detail page.
- **Deploy without inbound SSH or static keys** — image → ECR → EC2 rolled via AWS SSM,
  authenticated with **GitHub OIDC** (assumed role), gated on tests, with automatic rollback
  to the previous image when a post-deploy health check fails.

## Security & ethics

The observatory only observes what an anonymous visitor could already see. It does **not** sign in,
submit credentials, exploit/fuzz, probe non-web services, or scan ports exhaustively. Scanning
runs continuously at a deliberately slow rate, every agent honors a CIDR exclusion list, and the
agent's own source IP is anonymized in each record. Third-party reputation/threat verdicts are
the vendors' and may be wrong. A human monitors the abuse address for opt-out, takedown, and
abuse reports. Full policy: [`/about`](https://observatory.verdantprotocol.com/about).

## Repository layout

| Path | Role |
|------|------|
| [`vibescan-go/`](vibescan-go/) | Collector, v2 APIs, scanner agent, migrate, Docker/Caddy deploy — [README](vibescan-go/README.md) |
| [`vibescan-ui/`](vibescan-ui/) | React/Vite console (embedded into the Go image in prod) — [README](vibescan-ui/README.md) |

The legacy Python app (`vibescan_v2`) is a separate Git remote kept for dual-run / reference
and is **not** part of this repo.

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
once the database recovers. See [`vibescan-go/README.md`](vibescan-go/README.md) for the agent,
enrichment, and full v2 API reference.

## Test & deploy

```bash
# Backend  (-short skips browser/capture tests that need a real Chromium)
cd vibescan-go && go vet ./... && go test -short ./...

# Frontend
cd vibescan-ui && npm run lint && npm run build
```

**CI:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the above plus
`govulncheck` and a Trivy dependency/secret scan on every PR and push to `main`.

**Deploy:** push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
(test gate → build → ECR → **SSM** roll EC2, no open SSH, OIDC auth, auto-rollback). Full
runbook: [`vibescan-go/deploy/DEPLOY.md`](vibescan-go/deploy/DEPLOY.md).

## Known limitations

- Stats are computed live per request (bounded `$facet` + 60s cache), not from rollups.
- Search uses a MongoDB `$text` index, not Atlas Search.
- Threat/reputation verdicts come from third-party feeds and can be inaccurate.
- Thumbnails are generated going forward; captures made before the pipeline landed have none
  and fall back to the full image (a one-off backfill pass is a clean follow-up).
- Interactions (votes, tags, favorites, auth) and live SSE streaming are not yet in this layer.

## License

Source-available for evaluation and portfolio review only — **not** open source and **not**
licensed for reuse. See [`LICENSE`](LICENSE).

---

<!-- Maintainer checklist (GitHub UI — not versioned):
  • Set repo Description: "A distributed internet-observation platform built with Go and React:
    authenticated scanner agents, HTTP capture, threat-intelligence enrichment, search, telemetry
    and ethical opt-out controls."
  • Add Topics: golang, react, cybersecurity, internet-scanner, threat-intelligence, mongodb, aws,
    data-visualization
  • Add docs/screenshot.png and uncomment the hero image above.
  • Add a 1200×630 social preview at vibescan-ui/public/og.png (referenced by the
    Open Graph / Twitter tags in index.html and src/lib/meta.ts).
-->
