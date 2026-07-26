// Package web embeds the built single-page UI and serves it with client-side
// routing support. The dist/ directory is populated by the UI build (see the
// Dockerfile); a placeholder ships in the repo so the module always builds.
package web

import (
	"embed"
	"encoding/json"
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

//go:embed routes.json
var routesJSON []byte

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
	cleanPath := strings.TrimSuffix(p, "/")
	if cleanPath == "" {
		cleanPath = "/"
	}
	_, ok := routeMetadata[cleanPath]
	return ok
}

// isClientRoute mirrors the public React routes. Unknown paths still receive
// the SPA shell so the branded not-found screen renders, but with HTTP 404.
func isClientRoute(p string) bool {
	if isPrerenderedRoute(p) {
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

type routeDefinition struct {
	Path        string `json:"path"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Heading     string `json:"heading"`
	Summary     string `json:"summary"`
}

var routeMetadata = loadRouteMetadata()

func loadRouteMetadata() map[string]pageMetadata {
	var definitions []routeDefinition
	if err := json.Unmarshal(routesJSON, &definitions); err != nil {
		panic("web: invalid routes.json: " + err.Error())
	}
	metadata := make(map[string]pageMetadata, len(definitions))
	for _, route := range definitions {
		if route.Path == "" || route.Title == "" || route.Description == "" ||
			route.Heading == "" || route.Summary == "" {
			panic("web: incomplete route definition for " + route.Path)
		}
		if _, exists := metadata[route.Path]; exists {
			panic("web: duplicate route definition for " + route.Path)
		}
		metadata[route.Path] = pageMetadata{
			title:       route.Title,
			description: route.Description,
			heading:     route.Heading,
			summary:     route.Summary,
		}
	}
	return metadata
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
