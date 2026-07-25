import { Link } from "react-router";
import DocPage from "../components/DocPage";
import { useMeta } from "../lib/meta";

const ABUSE = "abuse@verdantprotocol.com";
const RESEARCH = "research@verdantprotocol.com";

export default function Disclosure() {
  useMeta({
    title: "Coordinated disclosure — Reachable Web Observatory",
    description:
      "How the Reachable Web Observatory handles vulnerable or compromised hosts it observes: best-effort operator notification and responsible, coordinated disclosure.",
    path: "/disclosure",
  });
  return (
    <DocPage
      eyebrow="◊ Disclosure"
      title="Coordinated disclosure"
      lede="The study measures exposure — so it regularly sees hosts that look vulnerable or compromised. This is how it handles that responsibly."
    >
      <section className="doc-sec" id="principles">
        <h2 className="doc-h">Principles</h2>
        <ul className="doc-list">
          <li>We observe; we do not exploit, confirm, or interact beyond loading a page a browser would.</li>
          <li>
            Individual observations are published openly, including the address, capture, service
            metadata, and third-party host associations described on the{" "}
            <Link className="doc-link" to="/data">data page</Link>.
          </li>
          <li>
            We preserve conflicting, clean, stale, missing, and adverse evidence rather than presenting
            a third-party association as a verified vulnerability or compromise.
          </li>
          <li>
            Record pages are public but marked for exclusion from search-engine indexes. Operators can
            request correction, removal, or exclusion from future scans.
          </li>
        </ul>
      </section>

      <section className="doc-sec" id="what-we-do">
        <h2 className="doc-h">When we observe a vulnerable or compromised host</h2>
        <p>
          Where third-party evidence suggests a host may be exploitable, serving malware, or acting as
          attack infrastructure, we make a <em>best-effort</em> attempt to notify the responsible party —
          typically the network's published abuse contact or CERT — with the minimum detail needed to
          locate and fix it. Because reputation and CVE signals come from{" "}
          <Link className="doc-link" to="/methodology#enrichment">third-party feeds</Link> and can be
          wrong or stale, notifications and public records frame them as leads to verify, not confirmed
          compromises.
        </p>
      </section>

      <section className="doc-sec" id="systemic">
        <h2 className="doc-h">Systemic findings</h2>
        <p>
          If the study independently confirms a <em>systemic</em> issue — a widespread default
          credential, an exposed management interface across a product line, or a vulnerable library at
          scale — we follow coordinated disclosure: notify the vendor or coordinating body first, allow
          a standard remediation window (typically 90 days), and only then publish analysis of the
          confirmed issue. Unverified provider associations remain clearly labelled as such.
        </p>
      </section>

      <section className="doc-sec" id="report-to-us">
        <h2 className="doc-h">Reporting something to us</h2>
        <p>
          If a record on this site exposes information that shouldn't be public, or you believe a
          finding is inaccurate, contact{" "}
          <a className="doc-link" href={`mailto:${ABUSE}`}>{ABUSE}</a> — a person monitors it. You can
          also request removal of records or exclusion from future scans via the{" "}
          <Link className="doc-link" to="/scan-info">scan-info</Link> page.
        </p>
        <div className="doc-callout accent">
          Good-faith security research and vulnerability reports are welcome. We will not pursue action
          against anyone who reports an issue with this project responsibly and in good faith.
        </div>
        <p>
          For research collaboration, dataset questions, and citation help, contact{" "}
          <a className="doc-link" href={`mailto:${RESEARCH}`}>{RESEARCH}</a>.
        </p>
        <h3>Response targets</h3>
        <ul className="doc-list">
          <li><strong>Acknowledgement:</strong> within two days.</li>
          <li><strong>Initial triage:</strong> within seven days when the report concerns the Observatory itself.</li>
          <li><strong>Updates:</strong> when material status changes, or at least every 14 days for an active investigation.</li>
          <li><strong>Record correction/removal:</strong> handled separately through the operator workflow and targeted within two days.</li>
        </ul>
        <p>
          Please do not send secrets by ordinary email. An encrypted reporting channel and published
          PGP key are not currently available; this limitation will be updated when one is deployed.
          Reports about third-party hosts should ordinarily go to that host's operator rather than to
          the Observatory.
        </p>
      </section>
    </DocPage>
  );
}
