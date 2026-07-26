import { build } from "vite";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROUTES = [
  "/",
  "/feed",
  "/search",
  "/stats",
  "/data",
  "/methodology",
  "/about",
  "/architecture",
  "/ethics",
  "/scan-info",
  "/disclosure",
];

const origin = "https://observatory.verdantprotocol.com";
const root = process.cwd();
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

for (const route of ROUTES) {
  const { html, meta } = render(route);
  if (!html.includes("<h1") || !meta?.title || !meta?.description) {
    throw new Error(`Prerendered route ${route} is missing an H1 or required metadata`);
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
await rm(serverDir, { recursive: true, force: true });
