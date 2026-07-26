import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { useMeta } from "../lib/meta";
import "./About.css";

const RESEARCH = "research@verdantprotocol.com";

export default function About() {
  useMeta({
    title: "About — Reachable Web Observatory",
    description:
      "The Reachable Web Observatory is an open measurement study of the public-IPv4 web: its research question, who runs it, and how to cite it.",
    path: "/about",
  });

  // Support deep links to section anchors (e.g. /about#cite).
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash]);

  return (
    <div className="record">
      <div className="page wrap about">
        <div className="eyebrow">◊ About the study</div>
        <h1 className="about-title display">The Reachable Web Observatory</h1>
        <p className="about-tagline mono">A continuous random sample of the reachable public-IPv4 web</p>
        <p className="about-lede">
          An open measurement study of the ordinary, reachable web — and where observable exposure
          and third-party security signals concentrate across it.
        </p>

        <section className="about-sec">
          <h2 className="about-h">The question</h2>
          <p>
            Across a uniform random sample of the reachable public-IPv4 web, <em>where do
            CVE-associated and reputation-flagged services concentrate</em> — by network, geography,
            product, and port — and how does that exposure change over time? Rather than searching for
            known domains, the observatory samples public IPv4 space, keeps the latest record for each
            observed service, and stores daily aggregate snapshots for longitudinal analysis. See the{" "}
            <Link className="about-mail" to="/methodology">methodology</Link> for how the measurement
            works and its limitations.
          </p>
        </section>

        <section className="about-sec">
          <h2 className="about-h">Who runs it</h2>
          <p>
            The Observatory extension is developed and maintained by <strong>Justin Walters</strong>,
            an independent security researcher, under{" "}
            <a className="about-mail" href="https://verdantprotocol.com/" target="_blank" rel="noopener noreferrer">
              Verdant Protocol
            </a>
            . It is an <em>independent</em> project — not affiliated with a university and not reviewed
            by an institutional review board — conducted in line with the field's established ethics
            norms (see <Link className="about-mail" to="/ethics">ethics</Link>). Collaboration with
            academic or nonprofit partners is welcome; reach out at{" "}
            <a className="about-mail" href={`mailto:${RESEARCH}`}>{RESEARCH}</a>.
          </p>
          <p>
            Governance, funding, and conflicts are currently simple: Justin operates the project
            independently through Verdant Protocol, with no university, institutional sponsor, or
            external funder. Material collaborators or funding relationships will be disclosed here.
            Technical implementation belongs on the{" "}
            <Link className="about-mail" to="/architecture">architecture</Link> page.
          </p>
          <p>
            The Go scanner and collector reimplement and extend the private Python system behind{" "}
            <a className="about-mail" href="https://whatsonhttp.com/" target="_blank" rel="noopener noreferrer">
              What&apos;s on HTTP
            </a>
            , created by{" "}
            <a className="about-mail" href="https://github.com/elixx" target="_blank" rel="noopener noreferrer">
              elixx
            </a>
            . Justin performed the Go rewrite with AI coding assistance and later developed the
            Observatory interface, research framing, analytics, infrastructure, and independently
            collected dataset. The private Python source is not published here, and the Observatory is
            not presented as an official successor to What&apos;s on HTTP. Read the complete{" "}
            <a
              className="about-mail"
              href="https://github.com/verdantpro/reachable-web-observatory/blob/main/PROVENANCE.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              provenance record
            </a>
            .
          </p>
        </section>

        <section className="about-sec">
          <h2 className="about-h">How it works, briefly</h2>
          <p>
            Agents generate random public IPv4 addresses, check a few common web ports
            (<span className="mono">80, 443, 8000, 8080, 8443</span>), and — for hosts answering HTTP or
            HTTPS — record what an anonymous visitor would see: a screenshot, the banner, HTTP status,
            the TLS certificate name, coarse geolocation, and structural hashes. Eligible hosts can be
            enriched with attributed public CVE and reputation data when providers are available;
            coverage is not universal. Scanning runs continuously at a deliberately slow rate and honors
            an operator <Link className="about-mail" to="/scan-info">exclusion list</Link>.
            The Overview is a live view of <em>stored observations</em> — point-in-time snapshots, not
            real-time scans of the hosts shown. To be explicit: this is <em>non-invasive
            active measurement of publicly reachable services</em> — never authentication, exploitation,
            or "hacking back." The boundary is spelled out in the{" "}
            <Link className="about-mail" to="/ethics">ethics</Link> and{" "}
            <Link className="about-mail" to="/methodology">methodology</Link>.
          </p>
        </section>

        <section className="about-sec">
          <h2 className="about-h">A note on the data</h2>
          <p>
            Records contain only what an anonymous visitor could already see, but — because discovery
            is random — a capture can occasionally include something personal or sensitive. CVE and
            reputation labels come from third-party feeds (Shodan, VirusTotal, AbuseIPDB, GreyNoise, and
            others, each attributed on the record); they are associations, not verified findings, and
            can be wrong. If a record shouldn't be public, or a label is inaccurate, tell us and we will
            correct or remove it — see <Link className="about-mail" to="/disclosure">disclosure</Link>{" "}
            and <Link className="about-mail" to="/scan-info">opt-out</Link>. The dataset is open; see{" "}
            <Link className="about-mail" to="/data">data &amp; access</Link>.
          </p>
        </section>

        <section className="about-sec about-contact" id="cite">
          <h2 className="about-h">How to cite</h2>
          <p>Please cite the dataset (and note the snapshot date) when using it in published work:</p>
          <div className="about-cite mono">
            Walters, J. (2026). <em>Reachable Web Observatory: a continuous random sample of the public-IPv4
            web.</em> Verdant Protocol. https://observatory.verdantprotocol.com/
          </div>
        </section>
        <nav className="about-nav-actions" aria-label="Study resources">
          <Link className="btn" to="/data">↓ data &amp; access</Link>
          <Link className="btn" to="/methodology">methodology</Link>
          <Link className="btn" to="/ethics">ethics</Link>
          <a className="btn" href="https://github.com/verdantpro/reachable-web-observatory" target="_blank" rel="noopener noreferrer">
            source
          </a>
        </nav>
      </div>
    </div>
  );
}
