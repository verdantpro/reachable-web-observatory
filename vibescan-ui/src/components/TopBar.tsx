import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { api } from "../api";
import "./TopBar.css";

const NAV = [
  { to: "/", label: "LIVE", end: true },
  { to: "/feed", label: "FEED" },
  { to: "/search", label: "SEARCH" },
  { to: "/stats", label: "STATS" },
  { to: "/data", label: "DATA" },
];

function useClock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return t.toISOString().slice(11, 19);
}

export default function TopBar() {
  const clock = useClock();
  const [insecure, setInsecure] = useState<number | null>(null);
  const [hosts, setHosts] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Collapse the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    api
      .stats(8760)
      .then((s) => {
        setInsecure(s.secure_capture_counts.insecure ?? 0);
        setHosts(s.totals.hosts ?? 0);
      })
      .catch(() => {
        setInsecure(null);
        setHosts(null);
      });
  }, []);

  return (
    <header className="topbar">
      <div className="wrap topbar-inner">
        <NavLink to="/" className="brand">
          <span className="brand-mark display">Reachable&nbsp;Web&nbsp;</span><span className="brand-accent display">Observatory</span>
        </NavLink>

        <button
          className="nav-toggle mono"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? "✕" : "☰"}
        </button>

        <nav className={`nav${menuOpen ? " open" : ""}`}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link mono">
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="topbar-meta mono">
          {hosts != null && insecure != null && (
            <span className="insecure-count" title="Distinct hosts observed and cleartext HTTP services captured, across all time">
              ◇ {hosts.toLocaleString()} hosts · <span className="insecure">▲</span> {insecure.toLocaleString()} cleartext
            </span>
          )}
          <span className="clock">
            <span className="live-dot" /> {clock} UTC
          </span>
        </div>
      </div>
    </header>
  );
}
