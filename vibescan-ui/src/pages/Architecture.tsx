import { Link } from "react-router";
import DocPage from "../components/DocPage";
import { useMeta } from "../lib/meta";

type Row = [string, string, string];

const STACK: Row[] = [
  ["Scanner agent", "Go · nmap · headless Chromium (chromedp) · RDAP", "Concurrent network I/O with a real browser for faithful captures."],
  ["Collector / API", "Go 1.26 · net/http (method-pattern mux)", "One static binary; fast, easy to deploy, no runtime."],
  ["Datastore", "MongoDB (Atlas M0)", "Flexible per-service documents; deterministic idempotent upserts."],
  ["Object storage", "Cloudflare R2 / Amazon S3 + CloudFront", "Cheap, CDN-served screenshots kept out of the database."],
  ["Enrichment", "~10 threat-intel / reputation APIs, fanned out concurrently", "Server-side so keys never reach the browser; cached + throttled."],
  ["Frontend", "React 19 · TypeScript · Vite 8", "Typed, fast-building SPA embedded into the Go binary in prod."],
  ["Data viz", "Bespoke SVG charts · d3-geo world map", "Theme-consistent, dependency-light, exactly the shapes needed."],
  ["Reverse proxy", "Caddy (automatic HTTPS)", "Let's Encrypt certs + security headers with near-zero config."],
  ["Hosting", "AWS EC2 t3.micro · MongoDB Atlas · S3/CloudFront", "Small, cheap, standard cloud primitives."],
  ["CI/CD", "GitHub Actions → ECR → EC2 via AWS SSM", "Test-gated builds; OIDC deployment auth and SSM rollouts."],
];

export default function Architecture() {
  useMeta({
    title: "Architecture — Reachable Web Observatory",
    description:
      "A deep look at how the Reachable Web Observatory is built and hosted: a Go collector + scanner agent, React frontend, MongoDB, object storage, concurrent enrichment, and an SSM/OIDC deploy on AWS.",
    path: "/architecture",
  });
  return (
    <DocPage
      eyebrow="◊ Engineering"
      title="Architecture"
      lede="How the observatory is built, wired together, and hosted — including its data flow, operational boundaries, and deployment model."
    >
      <section className="doc-sec" id="overview">
        <h2 className="doc-h">The shape of the system</h2>
        <p>
          The observatory is a small distributed system with three moving parts: a <strong>scanner
          agent</strong> that discovers and captures hosts, a <strong>collector</strong> that ingests,
          stores, enriches, and serves the data, and a <strong>React frontend</strong> that is compiled
          and <em>embedded inside the collector's binary</em> so the whole product ships as one image.
          It is a Go + React monorepo backed by MongoDB and object storage, deployed on ordinary AWS
          primitives.
        </p>
        <figure className="arch-flow" aria-labelledby="arch-flow-caption">
          <div className="arch-node">
            <strong>Scanner host</strong>
            <span>Go agent · nmap · Chromium</span>
          </div>
          <div className="arch-arrow" aria-hidden="true">signed observations →</div>
          <div className="arch-node">
            <strong>Collector</strong>
            <span>Caddy · ingest · JSON API · embedded React UI</span>
          </div>
          <div className="arch-arrow" aria-hidden="true">records and media →</div>
          <div className="arch-node">
            <strong>Managed services</strong>
            <span>MongoDB Atlas · S3/R2 · CloudFront</span>
          </div>
          <figcaption id="arch-flow-caption">
            Visitors connect only to the collector. A separately deployable scanner agent submits signed
            observations; structured records and screenshots are stored in managed services.
          </figcaption>
        </figure>
        <p>
          Scanning currently runs from one low-rate host on an ordinary connection. Moving it to a
          dedicated VPS is planned; until that happens, this page does not claim dedicated scanner
          infrastructure or publish a scanner IP. The agent is packaged separately so it can ultimately
          isolate browser rendering and scan traffic from the public service and database.
        </p>
      </section>

      <section className="doc-sec" id="dataflow">
        <h2 className="doc-h">End-to-end data flow</h2>
        <ul className="doc-list">
          <li><strong>Discover.</strong> The agent generates uniform-random public IPv4 addresses and checks five common web ports with nmap, skipping anything on the exclusion list.</li>
          <li><strong>Capture.</strong> For hosts answering HTTP/HTTPS it drives a headless Chromium (via chromedp) to screenshot the page and record the banner, status, TLS certificate name, and structural hashes.</li>
          <li><strong>Submit.</strong> Results are packed into an HMAC-SHA256-signed, gzip-compressed envelope and POSTed to the collector — the same wire format the earlier Python agents used.</li>
          <li><strong>Ingest.</strong> The collector verifies the signature, decodes, computes a deterministic ID per <code>ip:port</code>, uploads the screenshot to object storage, and upserts the record into MongoDB (buffering to disk if the database is momentarily unavailable).</li>
          <li><strong>Enrich.</strong> A background worker cross-references each host against public CVE and reputation feeds, denormalizing the summary back onto the record.</li>
          <li><strong>Serve.</strong> Clean JSON APIs power the embedded React UI, which renders the live console, search, statistics, and the record pages.</li>
        </ul>
      </section>

      <section className="doc-sec" id="backend">
        <h2 className="doc-h">The collector (Go)</h2>
        <p>
          The collector is a single statically-linked Go 1.26 binary that serves <em>everything</em> —
          the ingest endpoint, the read APIs, and the embedded UI — from one process on one origin (so
          the browser needs no CORS in production). Routing uses Go's standard-library
          method-pattern mux; there is no web framework.
        </p>
        <p>Operational properties of the collector:</p>
        <ul className="doc-list">
          <li><strong>Designed for failure.</strong> If MongoDB is unreachable, accepted submissions are spooled to disk as BSON and flushed when it recovers — ingest never drops data because the database blinked.</li>
          <li><strong>Idempotent by construction.</strong> Each service's <code>_id</code> is derived deterministically from <code>ip:port</code>, so re-observing a host updates one document instead of duplicating it — essential for a continuously updated sample.</li>
          <li><strong>Bounded concurrency &amp; rate limits.</strong> Object-storage uploads run with a bounded worker pool; the public read APIs are throttled per client IP with an in-process token bucket.</li>
          <li><strong>Strangler migration.</strong> The Go collector speaks the exact legacy v1 wire protocol (HMAC + gzip + base64) of an earlier Python prototype, verified byte-for-byte with golden tests, so old and new agents could run side-by-side during the rewrite rather than a risky flag-day cutover.</li>
        </ul>
        <p>
          Supporting packages handle the media work — perceptual (dHash) and DOM-structure hashing,
          JPEG thumbnail generation via <code>golang.org/x/image/draw</code>, and product extraction from
          banners — plus GeoIP lookups against a MaxMind GeoLite2 database.
        </p>
      </section>

      <section className="doc-sec" id="agent">
        <h2 className="doc-h">The scanner agent (Go)</h2>
        <p>
          The agent is a separate Go program: random IPv4 batches → nmap discovery → optional headless
          Chromium capture → signed submit, with an RDAP lookup for network ownership. It runs
          deliberately slowly, honors the CIDR exclusion list it fetches from the collector, and sends a
          self-identifying <span className="mono">User-Agent</span> so operators can see who is visiting
          and how to opt out. It ships as its own container image (Debian + nmap + Chromium + fonts),
          because the browser and scanning tooling have heavier system dependencies than the collector.
        </p>
      </section>

      <section className="doc-sec" id="frontend">
        <h2 className="doc-h">The frontend (React + TypeScript)</h2>
        <ul className="doc-list">
          <li><strong>React 19 + TypeScript, built with Vite 8</strong>; client-side routing with React Router. A single typed API client wraps the collector's JSON endpoints and surfaces a clear <q>collector unreachable</q> state instead of a false <q>no results</q>.</li>
          <li><strong>Bespoke SVG visualizations.</strong> The time series and bar charts are hand-built SVG tuned to the design system; the world map projects TopoJSON with <code>d3-geo</code>. This keeps the bundle lean and the charts exactly on-theme.</li>
          <li><strong>Self-contained assets.</strong> Fonts are self-hosted (no external CDN requests); per-route metadata, a sitemap, a web manifest, and <code>Dataset</code> JSON-LD are generated for SEO and dataset discoverability.</li>
          <li><strong>Embedded in production.</strong> The built <code>dist/</code> is compiled <em>into</em> the Go binary with <code>go:embed</code>, so there is no separate static host, no second deploy, and no CORS — the UI and API are the same origin.</li>
        </ul>
      </section>

      <section className="doc-sec" id="storage">
        <h2 className="doc-h">Storage &amp; the data model</h2>
        <p>
          Structured records live in <strong>MongoDB</strong> (one document per <code>ip:port</code>
          service, plus separate collections for enrichment cache, the CIDR blacklist, and daily
          rollups). Screenshots — the bulk of the bytes — live in <strong>object storage</strong>
          (Cloudflare R2 or Amazon S3 served through CloudFront), referenced from the record by key, with
          a base64-in-MongoDB fallback when object storage is disabled. A small server-generated JPEG
          thumbnail is stored alongside each capture so the card grid loads roughly a tenth of the bytes
          of the full screenshot.
        </p>
      </section>

      <section className="doc-sec" id="enrichment">
        <h2 className="doc-h">The enrichment pipeline</h2>
        <p>
          When enrichment is enabled and providers are reachable, eligible hosts are cross-referenced
          server-side against Shodan's keyless InternetDB. On demand, any configured
          threat-intelligence and reputation sources (VirusTotal, AbuseIPDB, GreyNoise, AlienVault OTX,
          ThreatFox, IPQualityScore, Pulsedive, IPinfo, ip-api, RIPEstat), <em>fanned out
          concurrently</em>. Missing credentials, provider errors, rate limits, and disabled enrichment
          can produce partial or absent results. Returned evidence is cached (in memory and in MongoDB)
          and throttled by a shared outbound rate limiter; a background worker attempts to refresh recent
          hosts through available keyless sources. Every API key stays server-side and never reaches the
          browser. Contributing sources and the last-enrichment time are recorded so the UI can label
          reputation and CVE data as third-party associations rather than verified facts.
        </p>
      </section>

      <section className="doc-sec" id="build">
        <h2 className="doc-h">Build &amp; packaging</h2>
        <p>
          The product ships as a small container built with a <strong>multi-stage Dockerfile</strong>:
          stage one uses <code>node:22-alpine</code> to install and build the UI; stage two uses
          <code>golang:1.26-alpine</code> to embed that build and compile the <code>vibescan</code> and
          <code>migrate</code> binaries (<code>CGO_ENABLED=0 -trimpath</code>); the final stage is a
          minimal <code>alpine</code> image (~60 MB) that runs as a non-root user. The scanner agent has
          its own image. Building the UI and Go binary in one image guarantees the embedded assets always
          match the code.
        </p>
      </section>

      <section className="doc-sec" id="hosting">
        <h2 className="doc-h">Hosting &amp; infrastructure (AWS)</h2>
        <ul className="doc-list">
          <li><strong>Web host:</strong> an AWS <strong>EC2 t3.micro</strong> that pulls the image from <strong>Amazon ECR</strong> — the image is built elsewhere because the tiny host can't compile it.</li>
          <li><strong>Reverse proxy:</strong> <strong>Caddy</strong> fronts the Go app, terminating TLS with automatic Let's Encrypt certificates and applying the security headers (HSTS, a Content-Security-Policy, frame-ancestor and MIME-sniffing protection, a strict referrer policy, and a restrictive permissions policy).</li>
          <li><strong>Database:</strong> <strong>MongoDB Atlas M0</strong> in the same region to keep latency low.</li>
          <li><strong>Screenshots:</strong> a private <strong>S3</strong> bucket served publicly through <strong>CloudFront</strong> (or Cloudflare R2), so image bytes never transit the app.</li>
          <li><strong>Scanner:</strong> one low-rate host on an ordinary connection; migration to a dedicated VPS is planned.</li>
        </ul>
      </section>

      <section className="doc-sec" id="cicd">
        <h2 className="doc-h">CI/CD &amp; operations</h2>
        <p>
          Continuous integration (GitHub Actions) gates every change on <code>go vet</code>,
          <code>go test</code>, <code>govulncheck</code>, the UI lint and build, and a Trivy dependency
          scan. Deployment is deliberately locked down:
        </p>
        <ul className="doc-list">
          <li>Build the image, push it to <strong>ECR</strong>, then roll the EC2 host via <strong>AWS SSM</strong> Run Command. Automated deployments do not require SSH; separately allowlisted administrator SSH may be used for initial setup or maintenance.</li>
          <li>GitHub Actions uses <strong>OIDC</strong> to assume a scoped IAM role, so no long-lived AWS <em>deployment</em> key is stored in GitHub. The collector still uses narrowly scoped object-storage credentials from its protected server environment.</li>
          <li>A fast test job gates the deploy; a failed database migration fails the deploy (rather than being swallowed); and a failed post-deploy health check <strong>automatically rolls back</strong> to the previous image.</li>
        </ul>
        <p>
          Two background workers keep the data fresh: an <em>enrichment worker</em> that keeps recent
          hosts cross-referenced, and a <em>daily rollup worker</em> that snapshots aggregate sample statistics once a day
          so exposure can be charted over time. Full details are in the{" "}
          <Link className="doc-link" to="/methodology">methodology</Link>; the code is{" "}
          <a className="doc-link" href="https://github.com/verdantpro/vibescan_rework" target="_blank" rel="noopener noreferrer">open source</a>.
        </p>
      </section>

      <section className="doc-sec" id="decisions">
        <h2 className="doc-h">Why it's built this way</h2>
        <p>The recurring theme is <em>doing the boring, resilient thing</em> so a small system stays trustworthy:</p>
        <ul className="doc-list">
          <li><strong>One binary, same origin</strong> — fewer moving parts to deploy, secure, and reason about; no CORS.</li>
          <li><strong>Fail soft</strong> — disk buffering, idempotent writes, bounded concurrency, and rate limits mean transient failures degrade gracefully instead of losing data or falling over.</li>
          <li><strong>Make isolation deployable</strong> — the scanner ships independently from the collector so browser rendering and scan traffic can move to a dedicated VPS without changing the public service.</li>
          <li><strong>Keep secrets server-side</strong> — every third-party key stays in the collector; the browser receives provider results and derived summaries, never credentials.</li>
          <li><strong>Reduce deployment exposure</strong> — automated rollouts use SSM and short-lived OIDC credentials, are test-gated, and roll back after a failed health check.</li>
        </ul>
      </section>

      <section className="doc-sec" id="summary">
        <h2 className="doc-h">Stack at a glance</h2>
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead><tr><th>Layer</th><th>Technology</th><th>Why</th></tr></thead>
            <tbody>
              {STACK.map(([layer, tech, why]) => (
                <tr key={layer}><td>{layer}</td><td>{tech}</td><td>{why}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </DocPage>
  );
}
