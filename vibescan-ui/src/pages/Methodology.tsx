import { Link } from "react-router";
import DocPage from "../components/DocPage";
import { useMeta } from "../lib/meta";

export default function Methodology() {
  useMeta({
    title: "Methodology — Reachable Web Observatory",
    description:
      "How the Reachable Web Observatory samples, captures, and enriches the public-IPv4 web — and its limitations and biases.",
    path: "/methodology",
  });
  return (
    <DocPage
      eyebrow="◊ Methods"
      title="Methodology"
      lede="How the measurement works — sampling, capture, enrichment, analysis — and, just as importantly, where it is biased and what it cannot tell you."
    >
      <section className="doc-sec" id="question">
        <h2 className="doc-h">Research question</h2>
        <p>
          Across a uniform random sample of the reachable public-IPv4 web, <em>where do
          CVE-associated and reputation-flagged services concentrate</em> — by network (ASN /
          organization), geography, product and version, and port — and how does that exposure
          change over time?
        </p>
        <p>
          The observatory is organized around measuring that concentration, rather than building an
          exhaustive index of every host. It samples the ordinary, reachable web, keeps the latest
          record for each observed <span className="mono">ip:port</span> service, and stores daily
          aggregate snapshots for longitudinal analysis.
        </p>
      </section>

      <section className="doc-sec" id="sampling">
        <h2 className="doc-h">Sampling</h2>
        <p>
          Scanning agents generate <em>uniform random</em> public IPv4 addresses and probe a small,
          fixed set of common web ports (<span className="mono">80, 443, 8000, 8080, 8443</span>) with
          nmap. Reserved, private, and special-use ranges are excluded, and every candidate address is
          checked against an operator <Link className="doc-link" to="/scan-info">exclusion list</Link>{" "}
          before it is touched. Discovery runs continuously at a deliberately slow rate; this is a
          random sample over time, not a synchronized full-census sweep.
        </p>
      </section>

      <section className="doc-sec" id="capture">
        <h2 className="doc-h">Capture</h2>
        <p>
          For any address answering HTTP or HTTPS on those ports, an agent records what an anonymous
          visitor would see: a screenshot taken in a headless Chromium browser, the service banner,
          HTTP status, the TLS certificate common name, coarse IP-based geolocation, and structural
          hashes of the page (a perceptual hash of the screenshot and a hash of the DOM structure).
          Each record is a <em>point-in-time</em> snapshot keyed deterministically by{" "}
          <span className="mono">ip:port</span>, so re-observations update the same record rather than
          duplicating it.
        </p>
        <p>
          The agents do not sign in, submit credentials, exploit or fuzz anything. Network discovery
          checks only the five listed web ports; when a service responds, the agent loads the page a
          browser would and nothing more. Every HTTP page fetch carries a self-identifying{" "}
          <span className="mono">User-Agent</span> linking to the{" "}
          <Link className="doc-link" to="/scan-info">scan-info</Link> page, so operators can see who we
          are and opt out.
        </p>
      </section>

      <section className="doc-sec" id="enrichment">
        <h2 className="doc-h">Enrichment</h2>
        <p>
          When enrichment is enabled and the provider is reachable, eligible captured hosts are
          cross-referenced server-side against public security data. Shodan's keyless{" "}
          <span className="mono">InternetDB</span> can supply associated CVEs, tags, and other open
          ports; on the record view, additional configured feeds may be queried (VirusTotal, AbuseIPDB,
          GreyNoise, AlienVault OTX, ThreatFox, IPQualityScore, Pulsedive, IPinfo, ip-api, and RIPEstat).
          Missing credentials, provider errors, rate limits, or disabled enrichment can produce partial
          or absent results. Returned records preserve contributing <em>sources</em> and a{" "}
          <em>last-enriched</em> timestamp where available; these are provider associations, not
          independently verified findings.
        </p>
        <div className="doc-callout">
          A CVE association means a third party has linked the host's software or network to a known
          vulnerability identifier — it is not proof the host is exploitable or unpatched. Reputation
          assessments can be wrong or stale. CVEs, CPEs, hostnames, and additional ports from InternetDB
          describe the <em>host</em>, not necessarily the particular web service shown on the record.
          The observatory reports all of these <em>as third-party signals</em> and never as ground truth.
        </div>
      </section>

      <section className="doc-sec" id="analysis">
        <h2 className="doc-h">Analysis</h2>
        <p>
          The study aggregates these observations to ask where exposure clusters: the share of
          cleartext vs. TLS services, the distribution of CVE-associated hosts across ASNs and
          organizations, geographic concentration, which products and versions recur among flagged
          hosts, and how those distributions drift over time. The live <Link className="doc-link" to="/stats">statistics</Link>{" "}
          view is a window into these aggregates. Researchers can save a timestamped{" "}
          <Link className="doc-link" to="/data">live export</Link> for reproducible offline analysis;
          first-party dated archival exports are planned but are not yet published.
        </p>
      </section>

      <section className="doc-sec" id="limitations">
        <h2 className="doc-h">Limitations &amp; biases</h2>
        <p>Reading the data honestly means keeping these in view:</p>
        <ul className="doc-list">
          <li>
            <strong>Single vantage point.</strong> Observations come from one network egress. Hosts
            that block that network, or that respond differently by source, are under- or
            mis-represented.
          </li>
          <li>
            <strong>Sampled, not a full census.</strong> Unlike exhaustive scanners (Rapid7 Project
            Sonar, Censys), this is a random sample. It estimates <em>distributions</em>, not complete
            inventories, and rare phenomena may be missed.
          </li>
          <li>
            <strong>Survivorship &amp; scope.</strong> Only hosts answering HTTP/HTTPS on five common
            ports are captured — a deliberate, narrow slice of the internet, not "the internet."
          </li>
          <li>
            <strong>Point-in-time.</strong> A record reflects one moment; the host may have changed,
            moved, or gone away since. Re-observation replaces the prior service record; individual
            capture history is not retained, while daily aggregate snapshots preserve census-level
            trends.
          </li>
          <li>
            <strong>Third-party enrichment.</strong> CVE and reputation data inherit the coverage,
            latency, and error rates of the upstream feeds.
          </li>
          <li>
            <strong>Coarse geolocation.</strong> IP-based geo is approximate and can misattribute
            hosts, especially on cloud and CDN networks.
          </li>
        </ul>
      </section>

      <section className="doc-sec" id="reproducibility">
        <h2 className="doc-h">Reproducibility</h2>
        <p>
          The collection and analysis code is{" "}
          <a className="doc-link" href="https://github.com/verdantpro/vibescan_rework" target="_blank" rel="noopener noreferrer">
            open source
          </a>
          , and the live record schema and export interface are documented on the{" "}
          <Link className="doc-link" to="/data">data</Link> page. Dated archival snapshots are planned
          but are not yet published. The scanning conduct follows established
          norms for internet measurement — see <Link className="doc-link" to="/ethics">ethics</Link>.
        </p>
      </section>
    </DocPage>
  );
}
