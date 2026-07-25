import { Link } from "react-router-dom";
import "./Footer.css";

const REPO = "https://github.com/verdantpro/vibescan_rework";
const ABUSE = "abuse@verdantprotocol.com";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="footer-brand-name display">
              Reachable Web <span className="footer-brand-accent">Observatory</span>
            </div>
            <p className="footer-brand-tag">
              A continuous, ethically-conducted census of the public-IPv4 web.
            </p>
            <p className="footer-brand-by mono">by Justin Walters · Verdant Protocol</p>
            <a className="footer-garden mono" href="https://verdantprotocol.com/" target="_blank" rel="noopener noreferrer">
              verdantprotocol.com — the digital garden ↗
            </a>
          </div>

          <nav className="footer-col" aria-label="The study">
            <div className="footer-col-h mono">The study</div>
            <ul>
              <li><Link to="/about">About</Link></li>
              <li><Link to="/methodology">Methodology</Link></li>
              <li><Link to="/architecture">Architecture</Link></li>
              <li><Link to="/ethics">Ethics</Link></li>
            </ul>
          </nav>

          <nav className="footer-col" aria-label="Data and code">
            <div className="footer-col-h mono">Data &amp; code</div>
            <ul>
              <li><Link to="/data">Open data &amp; API</Link></li>
              <li><Link to="/stats">Statistics</Link></li>
              <li><a href={REPO} target="_blank" rel="noopener noreferrer">Source ↗</a></li>
            </ul>
          </nav>

          <nav className="footer-col" aria-label="For network operators">
            <div className="footer-col-h mono">For operators</div>
            <ul>
              <li><Link to="/scan-info">Scanned? Opt out</Link></li>
              <li><Link to="/disclosure">Disclosure</Link></li>
              <li><a href={`mailto:${ABUSE}`}>Contact / abuse</a></li>
            </ul>
          </nav>
        </div>

        <div className="footer-bottom mono">
          <span>© 2026 Reachable Web Observatory · codename VibeScan</span>
          <span className="footer-bottom-links">
            <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">
              Code: MIT
            </a>
            <span className="footer-dot">·</span>
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">
              Data: CC-BY-4.0
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
