import { Link } from "react-router-dom";
import DocPage from "../components/DocPage";
import { useMeta } from "../lib/meta";

const ABUSE = "abuse@verdantprotocol.com";

export default function ScanInfo() {
  useMeta({
    title: "You've been scanned — Reachable Web Observatory",
    description:
      "Traffic from this project is part of an academic-style internet measurement study. Who we are, why we scan, our scanner IP ranges, and how to opt out.",
    path: "/scan-info",
  });
  return (
    <DocPage
      eyebrow="◊ For network operators"
      title="About the traffic from this project"
      lede="If you found this page in your logs: the probe you saw is part of a research census of the public web. Here's who we are, why, and how to opt out."
    >
      <section className="doc-sec" id="what">
        <h2 className="doc-h">What this is</h2>
        <p>
          The Reachable Web Observatory is an open, continuously-running measurement study of the
          reachable public-IPv4 web. It generates random IP addresses, checks a handful of common web
          ports (<span className="mono">80, 443, 8000, 8080, 8443</span>), and — for hosts answering
          HTTP/HTTPS — records what an anonymous visitor would see, to study where exposure and risk
          concentrate. It <em>does not</em> log in, exploit, fuzz, or probe non-web services. Full
          details are in the <Link className="doc-link" to="/methodology">methodology</Link> and{" "}
          <Link className="doc-link" to="/ethics">ethics</Link>.
        </p>
      </section>

      <section className="doc-sec" id="ranges">
        <h2 className="doc-h">Our scanner IP ranges</h2>
        <p>
          So you can identify (or filter) our traffic, scanning originates from the following
          addresses:
        </p>
        <div className="doc-cite">
          {/* TODO: replace with the project's real scanner egress IPs / CIDRs. */}
          &lt;scanner IP / CIDR — to be published&gt;
        </div>
        <p>
          These hosts also carry reverse-DNS names and WHOIS abuse contacts pointing back to this
          project.
        </p>
      </section>

      <section className="doc-sec" id="opt-out">
        <h2 className="doc-h">Opt out — stop future scans</h2>
        <p>
          Email the IP or CIDR range you control to{" "}
          <a className="doc-link" href={`mailto:${ABUSE}?subject=${encodeURIComponent("Opt-out request (IP / CIDR)")}`}>
            {ABUSE}
          </a>
          . We add it to the exclusion list and agents stop capturing it within about an hour,
          permanently. You can also simply drop traffic from the ranges above at your firewall.
        </p>
        <div className="doc-actions">
          <a className="btn" href={`mailto:${ABUSE}?subject=${encodeURIComponent("Opt-out request (IP / CIDR)")}`}>
            ✉ request exclusion
          </a>
          <a className="btn" href={`mailto:${ABUSE}?subject=${encodeURIComponent("Takedown request (host / range)")}`}>
            ✉ request record removal
          </a>
        </div>
      </section>

      <section className="doc-sec" id="removal">
        <h2 className="doc-h">Remove existing records</h2>
        <p>
          Send the host(s) or range you want removed and we will delete those records. There is no
          automatic expiry — captures stay until removal is requested. Reports of abuse or content that
          shouldn't be public anywhere are handled promptly; see the{" "}
          <Link className="doc-link" to="/disclosure">disclosure policy</Link>.
        </p>
      </section>
    </DocPage>
  );
}
