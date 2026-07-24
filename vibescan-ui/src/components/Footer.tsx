import { Link } from "react-router-dom";
import "./Footer.css";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-inner mono">
        <span className="footer-note">
          Reachable Web Observatory · by Justin Walters, Verdant Protocol
        </span>
        <nav className="footer-links">
          <Link to="/about">About</Link>
          <Link to="/methodology">Methodology</Link>
          <Link to="/ethics">Ethics</Link>
          <Link to="/data">Data</Link>
          <Link to="/disclosure">Disclosure</Link>
          <Link to="/scan-info">Scanned? Opt out</Link>
          <a href="https://github.com/verdantpro/vibescan_rework" target="_blank" rel="noopener noreferrer">
            Source
          </a>
          <a href="https://verdantprotocol.com/" target="_blank" rel="noopener noreferrer">
            Garden
          </a>
        </nav>
      </div>
    </footer>
  );
}
