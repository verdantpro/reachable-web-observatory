import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { api } from "../api";
import "./TopBar.css";

const NAV = [
  { to: "/", label: "OVERVIEW", end: true },
  { to: "/feed", label: "FEED" },
  { to: "/search", label: "SEARCH" },
  { to: "/stats", label: "STATS" },
  { to: "/data", label: "DATA" },
  { to: "/methodology", label: "METHODS" },
];

function useClock() {
  const [t, setT] = useState<Date | null>(null);
  useEffect(() => {
    setT(new Date());
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return t ? t.toISOString().slice(11, 19) : "--:--:--";
}

export default function TopBar() {
  const clock = useClock();
  const [insecure, setInsecure] = useState<number | null>(null);
  const [hosts, setHosts] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement>(null);
  const location = useLocation();

  // Collapse the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (restoreFocus: boolean) => {
      setMenuOpen(false);
      if (restoreFocus) window.requestAnimationFrame(() => menuButton.current?.focus());
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !menuButton.current?.contains(target)) close(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    api
      .stats(0)
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
          ref={menuButton}
          className="nav-toggle mono"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? "✕" : "☰"}
        </button>

        <nav ref={menu} id="primary-navigation" className={`nav${menuOpen ? " open" : ""}`}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link mono">
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="topbar-meta mono">
          {hosts != null && insecure != null && (
            <span className="insecure-count" title="Distinct hosts observed and cleartext HTTP services captured, across all time">
              <span className="status-desktop">◇ {hosts.toLocaleString()} hosts · <span className="insecure">▲</span> {insecure.toLocaleString()} cleartext</span>
              <span className="status-mobile" aria-label={`${hosts.toLocaleString()} hosts, ${insecure.toLocaleString()} cleartext services`}>
                {hosts.toLocaleString()}H · {insecure.toLocaleString()} HTTP
              </span>
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
