import { useEffect } from "react";

const SITE = "Reachable Web Observatory";
// Canonical origin for the site (drives per-route canonical / OG / Twitter URLs).
const ORIGIN = "https://observatory.verdantprotocol.com";
const OG_IMAGE = `${ORIGIN}/og.png`;

export type RouteMeta = {
  /** Full document title, e.g. "Search observations — Reachable Web Observatory". */
  title: string;
  description?: string;
  /** Canonical path, e.g. "/search". Defaults to the current pathname. */
  path?: string;
  /** Prevent indexing for public-but-sensitive routes such as individual records. */
  noIndex?: boolean;
  /** Allow links to be followed on ordinary error pages while excluding the page itself. */
  followWhenNoIndex?: boolean;
};

let renderedMeta: RouteMeta | null = null;

/** Build-time SSR collector. Browser callers only use the effect below. */
export function resetRenderedMeta() {
  renderedMeta = null;
}

export function takeRenderedMeta() {
  return renderedMeta;
}

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Sets the document title and social/canonical metadata for the current route.
 * A single static baseline lives in index.html; this keeps it in sync per route
 * for in-app navigation and JS-capable crawlers.
 */
export function useMeta({ title, description, path, noIndex = false, followWhenNoIndex = false }: RouteMeta) {
  if (typeof document === "undefined") {
    renderedMeta = { title, description, path, noIndex, followWhenNoIndex };
  }
  useEffect(() => {
    document.title = title;
    const url = ORIGIN + (path ?? window.location.pathname);
    upsertLink("canonical", url);

    if (description) upsertMeta("name", "description", description);
    upsertMeta("name", "robots", noIndex
      ? `noindex, ${followWhenNoIndex ? "follow" : "nofollow"}${followWhenNoIndex ? "" : ", noarchive"}`
      : "index, follow");

    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:site_name", SITE);
    upsertMeta("property", "og:url", url);
    upsertMeta("property", "og:image", OG_IMAGE);
    if (description) upsertMeta("property", "og:description", description);

    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:image", OG_IMAGE);
    if (description) upsertMeta("name", "twitter:description", description);
  }, [title, description, path, noIndex, followWhenNoIndex]);
}
