import { build } from "vite";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const origin = "https://observatory.verdantprotocol.com";
const root = process.cwd();
const routesPath = process.env.RWO_ROUTES_PATH ??
  path.join(root, "../vibescan-go/internal/web/routes.json");
const routeDefinitions = JSON.parse(await readFile(routesPath, "utf8"));
const ROUTES = routeDefinitions.map((route) => route.path);
if (new Set(ROUTES).size !== ROUTES.length) {
  throw new Error("Route registry contains a duplicate path");
}
const clientDir = path.join(root, "dist");
const serverDir = path.join(root, "dist-ssr");

await build({
  logLevel: "warn",
  build: {
    ssr: path.join(root, "src/entry-server.tsx"),
    outDir: serverDir,
    emptyOutDir: true,
  },
});

const serverEntry = path.join(serverDir, "entry-server.js");
const { render } = await import(`${pathToFileURL(serverEntry).href}?v=${Date.now()}`);
const template = await readFile(path.join(clientDir, "index.html"), "utf8");
await writeFile(path.join(clientDir, "spa-shell.html"), template);

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function replaceMeta(document, route, meta) {
  const canonical = `${origin}${route === "/" ? "/" : route}`;
  const description = meta?.description ?? "";
  const robots = meta?.noIndex
    ? `noindex, ${meta.followWhenNoIndex ? "follow" : "nofollow, noarchive"}`
    : "index, follow";

  let output = document
    .replace(/<title>.*?<\/title>/s, `<title>${escapeAttribute(meta?.title ?? "Reachable Web Observatory")}</title>`)
    .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/s, `<meta name="description" content="${escapeAttribute(description)}" />`)
    .replace(/<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/s, `<meta name="robots" content="${robots}" />`)
    .replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${canonical}" />`)
    .replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${escapeAttribute(meta?.title ?? "")}" />`)
    .replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/s, `<meta property="og:description" content="${escapeAttribute(description)}" />`)
    .replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${escapeAttribute(meta?.title ?? "")}" />`)
    .replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/s, `<meta name="twitter:description" content="${escapeAttribute(description)}" />`);
  if (!/<meta\s+name="robots"/.test(output)) {
    output = output.replace("</head>", `    <meta name="robots" content="${robots}" />\n  </head>`);
  }
  return output;
}

for (const definition of routeDefinitions) {
  const route = definition.path;
  const { html, meta } = render(route);
  if (!html.includes("<h1") || !meta?.title || !meta?.description) {
    throw new Error(`Prerendered route ${route} is missing an H1 or required metadata`);
  }
  if (meta.path !== route || meta.title !== definition.title || meta.description !== definition.description) {
    throw new Error(`Rendered metadata for ${route} differs from the canonical route registry`);
  }
  const output = replaceMeta(template.replace('<div id="root"></div>', `<div id="root">${html}</div>`), route, meta);
  if (output.includes('<div id="root"></div>')) {
    throw new Error(`Prerendered route ${route} still contains an empty root`);
  }
  const file = route === "/" ? path.join(clientDir, "index.html") : path.join(clientDir, route.slice(1), "index.html");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, output);
}

await writeFile(path.join(clientDir, "prerendered-routes.json"), `${JSON.stringify(ROUTES, null, 2)}\n`);
const sitemapEntries = routeDefinitions.map((route) => {
  const loc = `${origin}${route.path === "/" ? "/" : route.path}`;
  return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>${route.changefreq}</changefreq>\n    <priority>${route.priority}</priority>\n  </url>`;
}).join("\n");
await writeFile(
  path.join(clientDir, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</urlset>\n`,
);
await rm(serverDir, { recursive: true, force: true });
