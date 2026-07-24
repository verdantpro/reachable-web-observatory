import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import "../pages/doc.css";

/** Shared layout for the long-form research/policy pages. */
export default function DocPage({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  children: ReactNode;
}) {
  // Support deep links to section anchors (e.g. /ethics#opt-out).
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash]);

  return (
    <div className="doc-page">
      <div className="page wrap doc">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="doc-title display">{title}</h1>
        {lede ? <p className="doc-lede">{lede}</p> : null}
        {children}
      </div>
    </div>
  );
}
