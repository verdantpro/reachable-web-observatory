import { Link } from "react-router";
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
            (<span className="mono">q, product, port, status, secured, has_vulns, tag, verdict, limit,
            offset</span>). Rate-limited and paginated.
          </li>
          <li>
            <strong>Live JSON API.</strong> The read endpoints under{" "}
            <span className="mono">/api/v2/</span> (gallery, search, stats, per-service detail,
            enrichment) power this site and are documented in the{" "}
            <a className="doc-link" href="https://github.com/verdantpro/vibescan_rework" target="_blank" rel="noopener noreferrer">
              repository
            </a>
            .
          </li>
          <li>
            <strong>Snapshots.</strong> Dated archival dumps are planned but are not published yet.
            Until then, record the export time and query parameters when citing a live export.
          </li>
        </ul>
        <div className="doc-actions">
          <a className="btn" href="/api/v2/export?format=json&limit=100" target="_blank" rel="noopener noreferrer">
            ↓ sample export (JSON)
          </a>
          <a className="btn" href="/api/v2/export?format=csv&limit=100" target="_blank" rel="noopener noreferrer">
            ↓ sample export (CSV)
          </a>
        </div>
      </section>

      <section className="doc-sec" id="schema">
        <h2 className="doc-h">Record schema</h2>
        <p>Each record describes one observed service. Core fields:</p>
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
        <div className="doc-callout">
          Individual records are public and can include exact addresses, screenshots, page source,
          service metadata, coarse geolocation, and host-level third-party enrichment. CVE and
          reputation fields are <em>third-party associations</em>, not verified findings — see{" "}
          <Link className="doc-link" to="/methodology#limitations">limitations</Link>. Host-level fields
          such as CVEs, CPEs, hostnames, and additional ports are not necessarily attributable to the
          particular web service in the record.
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
          Walters, J. (2026). <em>Reachable Web Observatory: a continuous census of the public-IPv4
          web.</em> Verdant Protocol. https://observatory.verdantprotocol.com/
        </div>
        <p>
          Please cite the dataset and note the snapshot date when using it in published work.
        </p>
      </section>
    </DocPage>
  );
}
