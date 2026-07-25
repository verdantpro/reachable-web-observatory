import { Link } from "react-router";
import { useMeta } from "../lib/meta";
import "./NotFound.css";

export default function NotFound() {
  useMeta({
    title: "Not found (404) — Reachable Web Observatory",
    description: "The requested page could not be found.",
  });
  return (
    <div className="notfound">
      <div className="page wrap notfound-inner">
        <div className="nf-code mono">404</div>
        <h1 className="nf-title display">Page not found</h1>
        <p className="nf-lede">
          The requested page does not exist, may have moved, or may have been removed.
        </p>
        <div className="nf-actions">
          <Link className="btn" to="/">
            ← back to the console
          </Link>
          <Link className="btn" to="/search">
            search the census
          </Link>
        </div>
      </div>
    </div>
  );
}
