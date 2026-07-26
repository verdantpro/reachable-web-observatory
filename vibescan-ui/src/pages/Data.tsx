import { Link } from "react-router";
import { apiURL } from "../api";
import DocPage from "../components/DocPage";
import { useMeta } from "../lib/meta";

const FIELDS: [string, string][] = [
  ["ip / port", "The observed service endpoint."],
  ["banner / product", "Service banner and the parsed product/version, when present."],
  ["http_status", "HTTP status returned by the capture."],
  ["secured", "true = captured over TLS (HTTPS); false = cleartext HTTP."],
  ["cert_cn", "TLS certificate common name, when HTTPS."],
  ["geo", "Coarse IP-based geolocation (country, region, city, lat/lon, and accuracy radius)."],
  ["whois", "Network / organization from WHOIS, when available."],
  ["vuln_count", "Number of CVEs Shodan InternetDB associates with the host, not necessarily this service."],
  ["verdict", "A derived summary of third-party reputation evidence; not an independently verified finding."],
  ["sources", "Which enrichment feeds contributed to this record."],
  ["enriched_at", "When enrichment was last refreshed (RFC 3339)."],
  ["updated_at", "When the service was last observed (RFC 3339)."],
];

const CSV_FIELDS = [
  "ip", "port", "secured", "http_status", "product", "product_version", "banner",
  "cert_cn", "whois", "country_iso", "city", "lat", "lon", "vuln_count",
  "verdict", "sources", "enriched_at", "updated_at",
];

export default function Data() {
  useMeta({
    title: "Open data — Reachable Web Observatory",
    description:
      "Download the Reachable Web Observatory dataset (JSON/CSV) and query the API. Documented schema, rights-aware licensing, and citation.",
    path: "/data",
  });
  return (
    <DocPage
      eyebrow="◊ Open data"
      title="Data &amp; access"
      lede="The observations behind this study are open. Query them live or export a snapshot for offline analysis, with original Observatory metadata licensed separately from third-party material."
    >
      <section className="doc-sec" id="access">
        <h2 className="doc-h">How to get the data</h2>
        <ul className="doc-list">
          <li>
            <strong>Export API.</strong> <span className="mono">GET /api/v2/export?format=json|csv</span>{" "}
            returns records with the same filters as <Link className="doc-link" to="/search">search</Link>{" "}
            (<span className="mono">q, network, time_range, product, port, status, secured, has_vulns,
            tag, verdict, limit, offset, sort</span>). Sort values are <span className="mono">newest, relevance, vulns,
            ip</span>. Requests are rate-limited. Pagination is manual: request 1–2,000 records
            at a time with <span className="mono">limit</span>, then increase{" "}
            <span className="mono">offset</span> until an export contains fewer records than requested.
            Export responses do not include a total or next-page link.
            The response headers <span className="mono">X-RWO-Schema-Version</span> and{" "}
            <span className="mono">X-RWO-Generated-At</span> identify the contract and export time.
          </li>
          <li>
            <strong>Live JSON API.</strong> The read endpoints under{" "}
            <span className="mono">/api/v2/</span> (gallery, search, map, stats, per-service detail,
            enrichment) power this site and are documented in the{" "}
            <a className="doc-link" href="https://github.com/verdantpro/reachable-web-observatory" target="_blank" rel="noopener noreferrer">
              repository
            </a>
            .
            {" "}Machine-readable contracts are available as{" "}
            <a className="doc-link" href="/openapi.json">OpenAPI</a> and{" "}
            <a className="doc-link" href="/rwo-record.schema.json">JSON Schema</a>.
          </li>
          <li>
            <strong>Snapshots.</strong> Dated archival dumps are planned but are not published yet.
            Until then, record the export time and query parameters when citing a live export.
          </li>
        </ul>
        <div className="doc-actions">
          <a className="btn" href={apiURL("/api/v2/export?format=json&limit=100")} target="_blank" rel="noopener noreferrer">
            ↓ sample export (JSON)
          </a>
          <a className="btn" href={apiURL("/api/v2/export?format=csv&limit=100")} target="_blank" rel="noopener noreferrer">
            ↓ sample export (CSV)
          </a>
        </div>
        <h3 className="doc-sub-h">Examples</h3>
        <div className="doc-cite">curl 'https://observatory.verdantprotocol.com/api/v2/search?q=nginx&amp;sort=relevance&amp;limit=24'</div>
        <div className="doc-cite">curl -OJ 'https://observatory.verdantprotocol.com/api/v2/export?format=csv&amp;secured=false&amp;limit=1000'</div>
      </section>

      <section className="doc-sec" id="schema">
        <h2 className="doc-h">Record schema</h2>
        <p>
          Each record describes one observed service. The JSON export uses the same summary-record
          shape as gallery and search, including capture URLs and metadata when available. Its core
          fields are:
        </p>
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead><tr><th>Field</th><th>Meaning</th></tr></thead>
            <tbody>
              {FIELDS.map(([f, m]) => (
                <tr key={f}><td><code>{f}</code></td><td>{m}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          The flat CSV export is intentionally smaller. Its columns are{" "}
          <span className="mono">{CSV_FIELDS.join(", ")}</span>. In particular, CSV includes only
          country code, city, and coordinates from the richer JSON{" "}
          <span className="mono">geo</span> object.
        </p>
        <div className="doc-callout">
          Individual records are public and can include exact addresses, screenshots, page source,
          service metadata, coarse geolocation, and host-level third-party enrichment. CVE and
          reputation fields are <em>third-party associations</em>, not verified findings — see{" "}
          <Link className="doc-link" to="/methodology#limitations">limitations</Link>. Host-level fields
          such as CVEs, CPEs, hostnames, and additional ports are not necessarily attributable to the
          particular web service in the record. Exports contain summary records: they do not embed
          screenshot files or captured page source. JSON records can link to a screenshot and indicate
          whether captured text exists; retrieve available detail through the per-service API.
        </div>
      </section>

      <section className="doc-sec" id="license">
        <h2 className="doc-h">License</h2>
        <p>
          Original Observatory metadata, annotations, and applicable database rights are released under{" "}
          <a className="doc-link" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">
            Creative Commons Attribution 4.0 (CC-BY-4.0)
          </a>{" "}
          — free to use, share, and build on with attribution. That license does not grant rights the
          Observatory does not hold. Captured screenshots and page content, provider-supplied data,
          trademarks, privacy or publicity rights, and other third-party material remain subject to
          their respective owners' rights and provider terms. The source code is separately open-source
          under the <span className="mono">MIT</span> license.
        </p>
      </section>

      <section className="doc-sec" id="cite">
        <h2 className="doc-h">How to cite</h2>
        <div className="doc-cite">
          Walters, J. (2026). <em>Reachable Web Observatory: a continuous random sample of the public-IPv4
          web.</em> Verdant Protocol. https://observatory.verdantprotocol.com/
        </div>
        <p>
          Please cite the dataset and note the snapshot date when using it in published work.
        </p>
      </section>
    </DocPage>
  );
}
