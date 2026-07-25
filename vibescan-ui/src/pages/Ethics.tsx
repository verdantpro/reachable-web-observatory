import { Link } from "react-router";
import DocPage from "../components/DocPage";
import { useMeta } from "../lib/meta";

export default function Ethics() {
  useMeta({
    title: "Ethics — Reachable Web Observatory",
    description:
      "The Reachable Web Observatory's ethics posture, grounded in the Menlo Report and the ZMap scanning best practices: minimal harm, transparency, opt-out, and disclosure.",
    path: "/ethics",
  });
  return (
    <DocPage
      eyebrow="◊ Ethics"
      title="Research ethics"
      lede="Internet measurement touches real networks and real people. This study follows the field's established ethical norms — and holds itself to them publicly."
    >
      <section className="doc-sec" id="frameworks">
        <h2 className="doc-h">Frameworks we follow</h2>
        <p>
          Conduct is guided by two touchstones of the internet-measurement community: the{" "}
          <a className="doc-link" href="https://www.dhs.gov/sites/default/files/publications/CSD-MenloPrinciplesCORE-20120803_1.pdf" target="_blank" rel="noopener noreferrer">
            Menlo Report
          </a>{" "}
          (ethical principles for information &amp; communication technology research) and the{" "}
          <a className="doc-link" href="https://github.com/zmap/zmap/wiki/Scanning-Best-Practices" target="_blank" rel="noopener noreferrer">
            ZMap scanning best practices
          </a>
          . Everything below is a commitment we invite you to hold us to.
        </p>
      </section>

      <section className="doc-sec" id="menlo">
        <h2 className="doc-h">Menlo Report principles</h2>
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr><th>Principle</th><th>How this study applies it</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Respect for persons</td>
                <td>
                  Only data an anonymous visitor could already see is collected; no individuals are
                  targeted or profiled. The scanning agent's own source is anonymized in each record.
                  Captures are point-in-time and can be removed on request.
                </td>
              </tr>
              <tr>
                <td>Beneficence</td>
                <td>
                  Harm is minimized: a deliberately slow scan rate, only five common web ports, no
                  authentication / exploitation / fuzzing, and an honored exclusion list. The aim is to
                  understand exposure, not to increase it.
                </td>
              </tr>
              <tr>
                <td>Justice</td>
                <td>
                  Sampling is uniform and untargeted, so no network or region is singled out for
                  scrutiny; findings and data are shared openly rather than held privately.
                </td>
              </tr>
              <tr>
                <td>Respect for law &amp; public interest</td>
                <td>
                  Transparent about who is scanning and why, responsive to abuse reports via a
                  human-monitored contact, and committed to responsible disclosure of what is found.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="doc-sec" id="best-practices">
        <h2 className="doc-h">ZMap best-practices checklist</h2>
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr><th>Practice</th><th>Status</th></tr>
            </thead>
            <tbody>
              <tr><td>Minimize scan rate &amp; footprint</td><td>Commitment — slow, continuous sampling on five ports only.</td></tr>
              <tr><td>Signal intent (rDNS, WHOIS, a webpage)</td><td>Partial — every HTTP fetch uses a self-identifying <Link className="doc-link" to="/scan-info">User-Agent</Link> and links here. The scanner address is not currently published.</td></tr>
              <tr><td>Provide an opt-out mechanism</td><td>Commitment — CIDR exclusion list, honored within about an hour (<Link className="doc-link" to="/ethics#opt-out">below</Link>).</td></tr>
              <tr><td>Test new scanning code locally first</td><td>Commitment — changes are exercised against our own systems before release.</td></tr>
              <tr><td>Coordinate with local network operators</td><td>Commitment — scanning runs from infrastructure whose operator is aware of it.</td></tr>
              <tr><td>Responsibly disclose findings</td><td>Commitment — see the <Link className="doc-link" to="/disclosure">disclosure policy</Link>.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="doc-sec" id="opt-out">
        <h2 className="doc-h">Opt out</h2>
        <p>
          Operators who do not want their addresses observed can be excluded permanently. Send the IP
          or CIDR range you control to the abuse contact; it is added to the exclusion list and agents
          stop capturing it within about an hour. Existing records for those addresses can be removed
          on request — there is no automatic expiry. Full instructions and the current traffic
          identification method are on the <Link className="doc-link" to="/scan-info">scan-info</Link>{" "}
          page.
        </p>
      </section>

      <section className="doc-sec" id="references">
        <h2 className="doc-h">References</h2>
        <div className="doc-cite">
          Kenneally, E. &amp; Dittrich, D. (2012). <em>The Menlo Report: Ethical Principles Guiding
          Information and Communication Technology Research.</em> U.S. Dept. of Homeland Security.
        </div>
        <div className="doc-cite">
          Durumeric, Z., Wustrow, E. &amp; Halderman, J. A. (2013). <em>ZMap: Fast Internet-Wide
          Scanning and its Security Applications.</em> USENIX Security. See "Scanning Best Practices."
        </div>
      </section>
    </DocPage>
  );
}
