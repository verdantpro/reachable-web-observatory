import { Link, useParams, useSearchParams } from "react-router";
import DocPage from "../components/DocPage";
import { useMeta } from "../lib/meta";

export default function ExternalHost() {
  const { ip = "", port = "" } = useParams();
  const [params] = useSearchParams();
  const protocol = params.get("protocol") === "https" ? "https" : "http";
  const validIP = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip);
  const portNumber = Number(port);
  const valid = validIP && Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535;
  const destination = valid ? `${protocol}://${ip}:${portNumber}` : "";

  useMeta({
    title: "Leaving the Observatory — Reachable Web Observatory",
    description: "Safety notice before visiting a current external host.",
    noIndex: true,
  });

  return (
    <DocPage
      eyebrow="◊ External destination"
      title="You are leaving the stored observation"
      lede="The destination below is a current third-party host. It is not controlled or verified by the Observatory."
    >
      <section className="doc-sec">
        {!valid ? (
          <>
            <h2 className="doc-h">Invalid destination</h2>
            <p>The requested host or port is not valid.</p>
            <Link className="btn" to="/feed">Return to observations</Link>
          </>
        ) : (
          <>
            <h2 className="doc-h">Before continuing</h2>
            <ul className="doc-list">
              <li>The host may have changed since the timestamped Observatory capture.</li>
              <li>The content may be unsafe, misleading, sensitive, or unavailable.</li>
              <li>Your browser will connect directly and disclose your IP address to the destination.</li>
              <li>The Observatory does not endorse the host or independently verify its current state.</li>
            </ul>
            <div className="doc-cite">{destination}</div>
            <div className="doc-actions">
              <a className="btn btn-primary" href={destination} target="_blank" rel="noopener noreferrer nofollow">
                Continue to external host ↗
              </a>
              <Link className="btn btn-ghost" to={`/signal/${ip}/${port}`}>Return to stored observation</Link>
            </div>
          </>
        )}
      </section>
    </DocPage>
  );
}
