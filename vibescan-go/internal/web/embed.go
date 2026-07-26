// Package web embeds the built single-page UI and serves it with client-side
// routing support. The dist/ directory is populated by the UI build (see the
// Dockerfile); a placeholder ships in the repo so the module always builds.
package web

import (
	"embed"
	"html"
	"io/fs"
	"net/http"
	"path"
	"regexp"
	"strings"
)

//go:embed dist
var distFS embed.FS

//go:embed robots.txt
var robotsTXT []byte

//go:embed security.txt
var securityTXT []byte

// Handler serves the embedded SPA. Real asset requests are served from dist/;
// any other path falls back to index.html so client routes (/feed, /signal/…)
// resolve on a hard refresh.
func Handler() http.Handler {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		return http.NotFoundHandler()
	}
	fileServer := http.FileServer(http.FS(sub))
	index, _ := fs.ReadFile(sub, "index.html")
	spaShell, shellErr := fs.ReadFile(sub, "spa-shell.html")
	if shellErr != nil {
		spaShell = index
	}
	_, prerenderErr := fs.Stat(sub, "prerendered-routes.json")
	hasPrerenderedRoutes := prerenderErr == nil

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Individual observations remain publicly reachable but should not be
		// indexed or archived by search engines. The HTTP header also protects
		// non-JavaScript crawlers that never see the client-rendered meta tag.
		if strings.HasPrefix(r.URL.Path, "/signal/") {
			w.Header().Set("X-Robots-Tag", "noindex, nofollow, noarchive")
		}

		// Explicit non-SPA endpoints (avoid HTML shell for crawlers). These are
		// served with an explicit Content-Type and a real 404 when absent, so a
		// crawler never receives the SPA index.html in their place.
		switch r.URL.Path {
		case "/robots.txt":
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.Header().Set("Cache-Control", "public, max-age=3600")
			_, _ = w.Write(robotsTXT)
			return
		case "/.well-known/security.txt":
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.Header().Set("Cache-Control", "public, max-age=3600")
			_, _ = w.Write(securityTXT)
			return
		case "/sitemap.xml":
			serveDistFile(w, sub, "sitemap.xml", "application/xml; charset=utf-8")
			return
		case "/manifest.webmanifest":
			serveDistFile(w, sub, "manifest.webmanifest", "application/manifest+json; charset=utf-8")
			return
		}

		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name == "spa-shell.html" {
			http.NotFound(w, r)
			return
		}
		if name != "" {
			if info, statErr := fs.Stat(sub, name); statErr == nil && !info.IsDir() {
				// Hashed Vite assets under assets/ are immutable.
				if strings.HasPrefix(name, "assets/") {
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				}
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		// Static public routes have complete build-time-rendered documents.
		// A query-bearing Search route uses the empty SPA shell because its
		// initial UI depends on the query string and must hydrate without a
		// server/client markup mismatch.
		if hasPrerenderedRoutes && isPrerenderedRoute(r.URL.Path) &&
			!(strings.TrimSuffix(r.URL.Path, "/") == "/search" && r.URL.RawQuery != "") {
			prerendered := "index.html"
			if name != "" {
				prerendered = path.Join(name, "index.html")
			}
			if page, readErr := fs.ReadFile(sub, prerendered); readErr == nil {
				serveHTMLStatus(w, page, http.StatusOK)
				return
			}
		}
		if !isClientRoute(r.URL.Path) {
			w.Header().Set("X-Robots-Tag", "noindex, follow")
			serveIndexStatus(w, spaShell, r.URL.Path, http.StatusNotFound)
			return
		}
		serveIndexStatus(w, spaShell, r.URL.Path, http.StatusOK)
	})
}

func isPrerenderedRoute(p string) bool {
	switch strings.TrimSuffix(p, "/") {
	case "", "/", "/feed", "/search", "/stats", "/about", "/methodology",
		"/architecture", "/ethics", "/data", "/disclosure", "/scan-info":
		return true
	}
	return false
}

// isClientRoute mirrors the public React routes. Unknown paths still receive
// the SPA shell so the branded not-found screen renders, but with HTTP 404.
func isClientRoute(p string) bool {
	switch strings.TrimSuffix(p, "/") {
	case "", "/", "/feed", "/search", "/stats", "/about", "/methodology",
		"/architecture", "/ethics", "/data", "/disclosure", "/scan-info":
		return true
	}
	parts := strings.Split(strings.Trim(p, "/"), "/")
	return len(parts) == 3 && (parts[0] == "signal" || parts[0] == "external") &&
		parts[1] != "" && parts[2] != ""
}

// serveDistFile serves a build artifact from dist/ with an explicit Content-Type,
// or a real 404 if the UI build did not include it (never the SPA shell).
func serveDistFile(w http.ResponseWriter, sub fs.FS, name, contentType string) {
	b, err := fs.ReadFile(sub, name)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=3600")
	_, _ = w.Write(b)
}

type pageMetadata struct {
	title       string
	description string
	heading     string
	summary     string
}

var routeMetadata = map[string]pageMetadata{
	"/":             {"Reachable Web Observatory — a random sample of the public-IPv4 web", "An open measurement study using random IPv4 sampling to observe reachable web services.", "Reachable Web Observatory", "A continuously updated random sample of reachable public-IPv4 web services on five common ports."},
	"/feed":         {"Observation feed — Reachable Web Observatory", "Explore ranked and recent stored web-service observations.", "Observation feed", "Ranked and recent timestamped observations from the Observatory sample."},
	"/search":       {"Search observations — Reachable Web Observatory", "Search stored observations by service, network, location, and attributed provider evidence.", "Search observations", "Search the retained service observations and host-level provider associations."},
	"/map":          {"Map explorer — Reachable Web Observatory", "Explore sampled reachable web hosts by geography, protocol, network, exposure signals, and time window.", "Observation map", "An interactive host-level map with explicit time windows and coarse IP-based geolocation."},
	"/stats":        {"Study findings — Reachable Web Observatory", "Descriptive statistics for sampled reachable web-service observations.", "Study findings", "Descriptive service- and host-level statistics with explicit time windows and denominators."},
	"/data":         {"Open data — Reachable Web Observatory", "Download JSON or CSV exports and read the public API and schema documentation.", "Data and access", "Open exports, API documentation, schema, licensing, and citation guidance."},
	"/methodology":  {"Methodology — Reachable Web Observatory", "Sampling, capture, enrichment, analysis, reproducibility, and limitations.", "Methodology", "How the Observatory samples, captures, enriches, and analyzes reachable services."},
	"/about":        {"About — Reachable Web Observatory", "Purpose, governance, contact information, and citation for the Observatory.", "About the Observatory", "An independent open internet-measurement research project operated by Verdant Protocol."},
	"/architecture": {"Architecture — Reachable Web Observatory", "System data flow, operational boundaries, storage, and deployment architecture.", "Architecture", "How scanner observations flow through signed ingest, storage, enrichment, APIs, and the public interface."},
	"/ethics":       {"Ethics — Reachable Web Observatory", "Ethical principles, risk controls, operator identification, and opt-out commitments.", "Ethics", "The measurement boundaries, risk controls, transparency commitments, and operator protections."},
	"/disclosure":   {"Coordinated disclosure — Reachable Web Observatory", "Reporting, correction, removal, and coordinated-disclosure procedures.", "Coordinated disclosure", "How to report issues with the Observatory or request correction and removal."},
	"/scan-info":    {"Scanner information — Reachable Web Observatory", "Identify Observatory traffic and request exclusion or record removal.", "Scanner and opt-out information", "Information for network operators who observed traffic from this measurement project."},
}

var (
	titlePattern         = regexp.MustCompile(`(?s)<title>.*?</title>`)
	descriptionPattern   = regexp.MustCompile(`(?s)<meta\s+name="description"\s+content="[^"]*"\s*/?>`)
	canonicalPattern     = regexp.MustCompile(`<link\s+rel="canonical"\s+href="[^"]*"\s*/?>`)
	ogTitlePattern       = regexp.MustCompile(`<meta\s+property="og:title"\s+content="[^"]*"\s*/?>`)
	ogDescriptionPattern = regexp.MustCompile(`(?s)<meta\s+property="og:description"\s+content="[^"]*"\s*/?>`)
	ogURLPattern         = regexp.MustCompile(`<meta\s+property="og:url"\s+content="[^"]*"\s*/?>`)
)

func routeIndex(index []byte, requestPath string) []byte {
	cleanPath := strings.TrimSuffix(requestPath, "/")
	if cleanPath == "" {
		cleanPath = "/"
	}
	meta, ok := routeMetadata[cleanPath]
	if !ok {
		return index
	}
	origin := "https://observatory.verdantprotocol.com"
	url := origin + cleanPath
	if cleanPath == "/" {
		url = origin + "/"
	}
	body := string(index)
	body = titlePattern.ReplaceAllString(body, "<title>"+html.EscapeString(meta.title)+"</title>")
	body = descriptionPattern.ReplaceAllString(body, `<meta name="description" content="`+html.EscapeString(meta.description)+`" />`)
	body = canonicalPattern.ReplaceAllString(body, `<link rel="canonical" href="`+url+`" />`)
	body = ogTitlePattern.ReplaceAllString(body, `<meta property="og:title" content="`+html.EscapeString(meta.title)+`" />`)
	body = ogDescriptionPattern.ReplaceAllString(body, `<meta property="og:description" content="`+html.EscapeString(meta.description)+`" />`)
	body = ogURLPattern.ReplaceAllString(body, `<meta property="og:url" content="`+url+`" />`)
	fallback := `<noscript><main><h1>` + html.EscapeString(meta.heading) + `</h1><p>` +
		html.EscapeString(meta.summary) + `</p><p><a href="/methodology">Read the methodology</a> or <a href="/data">access the open data</a>.</p></main></noscript>`
	body = strings.Replace(body, `<div id="root"></div>`, `<div id="root"></div>`+fallback, 1)
	return []byte(body)
}

func serveIndexStatus(w http.ResponseWriter, index []byte, requestPath string, status int) {
	if index == nil {
		http.Error(w, "UI not built", http.StatusNotFound)
		return
	}
	serveHTMLStatus(w, routeIndex(index, requestPath), status)
}

func serveHTMLStatus(w http.ResponseWriter, document []byte, status int) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(status)
	_, _ = w.Write(document)
}
