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
      toc={[
        { id: "question", label: "Research question" },
        { id: "sampling", label: "Sampling" },
        { id: "capture", label: "Capture" },
        { id: "enrichment", label: "Enrichment" },
        { id: "analysis", label: "Analysis" },
        { id: "limitations", label: "Limitations & biases" },
        { id: "reproducibility", label: "Reproducibility" },
      ]}
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
          random sample over time, not a synchronized exhaustive sweep.
        </p>
        <p>
          The sampling unit is one IPv4 address. Go's standard <span className="mono">math/rand/v2</span>{" "}
          generator draws uniformly from all 32-bit values; candidates in the maintained special-use,
          private, documentation, multicast, loopback, and operator-exclusion CIDRs are rejected and
          redrawn. Addresses are unique within each batch of 10 but can be drawn again in later batches.
          Conditional on not being excluded, every eligible address has the same probability of being
          selected on each draw. The current agent runs at most two host workers concurrently.
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
          Discovery runs <span className="mono">nmap -sV -n -T3</span> by default and is bounded to five
          minutes per 10-address batch. A responding service is loaded in Chromium at a 1280×720
          viewport with a 15-second navigation budget, followed by a configurable settling delay
          (currently two seconds) before DOM text and a screenshot are captured. Ports 443 and 8443
          start with HTTPS; other ports start with HTTP and retry once with HTTPS only after an SSL
          protocol error. Redirects follow Chromium's normal behavior, and the recorded{" "}
          <span className="mono">secured</span> value reflects the final URL. Certificate errors are
          ignored so publicly reachable misconfigured TLS services remain observable. Captured page
          text is truncated to 32,760 bytes.
        </p>
        <p>
          The agent does not consult page-level robots directives before the initial public-page load:
          those directives govern automated content indexing, while this project performs a
          measurement of service reachability. It does honor the project exclusion list before any
          network contact and publishes a permanent opt-out process.
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
        <h3 className="doc-sub-h">Operational definitions</h3>
        <ul className="doc-list">
          <li><strong>Candidate address:</strong> an eligible IPv4 address returned by the rejection sampler.</li>
          <li><strong>Reachable service:</strong> one of the five configured ports that nmap reports open and whose page Chromium captures successfully.</li>
          <li><strong>Host:</strong> one distinct IPv4 address; a host can contribute multiple service records.</li>
          <li><strong>Service:</strong> the latest retained observation for one <span className="mono">ip:port</span>.</li>
          <li><strong>Cleartext:</strong> the final captured page URL used HTTP rather than HTTPS.</li>
          <li><strong>CVE-associated:</strong> InternetDB returned at least one host-level CVE identifier.</li>
          <li><strong>Provider-flagged:</strong> a configured reputation provider contributed evidence summarized as suspicious or malicious.</li>
        </ul>
        <p>
          Dashboard percentages are descriptive ratios within the selected retained-service window:
          count meeting the displayed condition divided by the displayed service denominator.
          Concentration percentages require at least 20 services in a displayed group. They are not
          presently weighted population estimates and do not include confidence intervals.
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
            <strong>Sampled, not exhaustive.</strong> Unlike exhaustive scanners (Rapid7 Project
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
            capture history is not retained, while daily aggregate snapshots preserve sample-level
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
