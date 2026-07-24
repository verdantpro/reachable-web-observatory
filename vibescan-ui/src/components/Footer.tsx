import { Link } from "react-router-dom";
import "./Footer.css";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-inner mono">
        <span className="footer-note">VibeScan · a random IPv4 census of the reachable web</span>
        <nav className="footer-links">
          <Link to="/about">About &amp; ethics</Link>
          <a href="https://github.com/verdantpro/vibescan_rework" target="_blank" rel="noopener noreferrer">
            Source
          </a>
          <Link to="/about#opt-out">Opt out / report</Link>
        </nav>
      </div>
    </footer>
  );
}
