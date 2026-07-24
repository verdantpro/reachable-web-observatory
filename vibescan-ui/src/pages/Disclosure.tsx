import { Link } from "react-router-dom";
import DocPage from "../components/DocPage";
import { useMeta } from "../lib/meta";

const ABUSE = "abuse@verdantprotocol.com";

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
          <li>We reduce risk rather than increase it — findings are never published in a form that makes an individual vulnerable host easier to attack.</li>
          <li>We act in good faith and give operators a reasonable, private window to respond before any aggregate detail is shared.</li>
        </ul>
      </section>

      <section className="doc-sec" id="what-we-do">
        <h2 className="doc-h">When we observe a vulnerable or compromised host</h2>
        <p>
          Where a record suggests a host is exploitable, serving malware, or acting as attack
          infrastructure, we make a <em>best-effort</em> attempt to notify the responsible party —
          typically the network's published abuse contact or CERT — with the minimum detail needed to
          locate and fix it. Because reputation and CVE signals come from{" "}
          <Link className="doc-link" to="/methodology#enrichment">third-party feeds</Link> and can be
          wrong, notifications are framed as leads to verify, not confirmed compromises.
        </p>
      </section>

      <section className="doc-sec" id="systemic">
        <h2 className="doc-h">Systemic findings</h2>
        <p>
          If the study uncovers a <em>systemic</em> issue — a widespread default credential, an exposed
          management interface across a product line, a vulnerable library at scale — we follow
          coordinated disclosure: notify the vendor or coordinating body first, allow a standard
          remediation window (typically 90 days), and only then publish aggregate findings that help
          the community without pinpointing exploitable targets.
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
      </section>
    </DocPage>
  );
}
