import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router";
import "../pages/doc.css";

/** Shared layout for the long-form research/policy pages. */
export default function DocPage({
  eyebrow,
  title,
  lede,
  toc,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  toc?: { id: string; label: string }[];
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
        {toc?.length ? (
          <nav className="doc-toc" aria-label="On this page">
            <strong className="mono">On this page</strong>
            <ol>
              {toc.map(({ id, label }) => (
                <li key={id}><a href={`#${id}`}>{label}</a></li>
              ))}
            </ol>
          </nav>
        ) : null}
        {children}
      </div>
    </div>
  );
}
