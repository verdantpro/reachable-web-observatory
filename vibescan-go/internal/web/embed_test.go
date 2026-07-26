package web

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"
)

func get(t *testing.T, h http.Handler, path string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Result()
}

func TestServesRobotsTxt(t *testing.T) {
	res := get(t, Handler(), "/robots.txt")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}
	if ct := res.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/plain") {
		t.Errorf("content-type = %q, want text/plain", ct)
	}
	body, _ := io.ReadAll(res.Body)
	if !strings.Contains(string(body), "Disallow: /signal/") {
		t.Errorf("robots.txt does not exclude record routes: %q", body)
	}
}

func TestServesSecurityTxt(t *testing.T) {
	res := get(t, Handler(), "/.well-known/security.txt")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}
	if ct := res.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/plain") {
		t.Errorf("content-type = %q, want text/plain", ct)
	}
}

func TestSecurityTxtExpiryHasAdvanceWarning(t *testing.T) {
	const prefix = "Expires: "
	var expiry string
	for line := range strings.SplitSeq(string(securityTXT), "\n") {
		if strings.HasPrefix(line, prefix) {
			expiry = strings.TrimSpace(strings.TrimPrefix(line, prefix))
			break
		}
	}
	if expiry == "" {
		t.Fatal("security.txt is missing Expires")
	}
	expiresAt, err := time.Parse(time.RFC3339, expiry)
	if err != nil {
		t.Fatalf("invalid security.txt Expires: %v", err)
	}
	if remaining := time.Until(expiresAt); remaining < 60*24*time.Hour {
		t.Fatalf("security.txt expires too soon (%s); renew it before deployment", remaining.Round(time.Hour))
	}
}

func TestSitemapAndManifestHaveCorrectContentType(t *testing.T) {
	// These ship in the embedded dist; they must be served with an explicit
	// non-HTML content type — never the SPA index.html shell.
	cases := []struct{ path, wantCT string }{
		{"/sitemap.xml", "application/xml"},
		{"/manifest.webmanifest", "application/manifest+json"},
	}
	h := Handler()
	for _, c := range cases {
		res := get(t, h, c.path)
		if res.StatusCode != http.StatusOK {
			t.Errorf("%s: status = %d, want 200", c.path, res.StatusCode)
			continue
		}
		if ct := res.Header.Get("Content-Type"); !strings.HasPrefix(ct, c.wantCT) {
			t.Errorf("%s: content-type = %q, want %q", c.path, ct, c.wantCT)
		}
	}
}

func TestUnknownRouteRendersSPAWithReal404(t *testing.T) {
	// Unknown routes still render the branded SPA error page, but crawlers and
	// clients must receive a truthful HTTP status.
	res := get(t, Handler(), "/some/client/route")
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", res.StatusCode)
	}
	if ct := res.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Errorf("content-type = %q, want text/html (SPA shell)", ct)
	}
	if got := res.Header.Get("X-Robots-Tag"); got != "noindex, follow" {
		t.Errorf("X-Robots-Tag = %q", got)
	}
}

func TestKnownClientRouteFallsBackToSPA(t *testing.T) {
	res := get(t, Handler(), "/methodology")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}
	body, _ := io.ReadAll(res.Body)
	html := string(body)
	if !strings.Contains(html, "<title>Methodology — Reachable Web Observatory</title>") {
		t.Errorf("route-specific title missing")
	}
	if !strings.Contains(html, `<main id="main-content"`) ||
		!strings.Contains(html, `<h1 class="doc-title display">Methodology</h1>`) {
		t.Errorf("crawler-readable prerendered content missing")
	}
}

func TestSignalRouteIsPublicButNoIndex(t *testing.T) {
	res := get(t, Handler(), "/signal/192.0.2.1/80")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}
	if got := res.Header.Get("X-Robots-Tag"); got != "noindex, nofollow, noarchive" {
		t.Errorf("X-Robots-Tag = %q", got)
	}
}

func TestEveryDeclaredRouteReturnsPrerenderedDocument(t *testing.T) {
	h := Handler()
	for route, meta := range routeMetadata {
		t.Run(route, func(t *testing.T) {
			res := get(t, h, route)
			if res.StatusCode != http.StatusOK {
				t.Fatalf("status = %d, want 200", res.StatusCode)
			}
			body, err := io.ReadAll(res.Body)
			if err != nil {
				t.Fatal(err)
			}
			if want := "<title>" + meta.title + "</title>"; !strings.Contains(string(body), want) {
				t.Errorf("document is missing %q", want)
			}
		})
	}
}

func TestPrerenderManifestMatchesDeclaredRoutes(t *testing.T) {
	raw, err := distFS.ReadFile("dist/prerendered-routes.json")
	if err != nil {
		t.Fatal(err)
	}
	var manifest []string
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatal(err)
	}
	declared := make([]string, 0, len(routeMetadata))
	for route := range routeMetadata {
		declared = append(declared, route)
	}
	sort.Strings(manifest)
	sort.Strings(declared)
	if strings.Join(manifest, "\n") != strings.Join(declared, "\n") {
		t.Fatalf("prerender manifest and Go route registry differ:\nmanifest=%q\ndeclared=%q", manifest, declared)
	}
}

func TestDynamicAndUnknownRouteClassification(t *testing.T) {
	for _, route := range []string{"/", "/map", "/about", "/architecture/", "/search"} {
		if !isPrerenderedRoute(route) {
			t.Errorf("isPrerenderedRoute(%q) = false", route)
		}
	}
	for _, route := range []string{"/signal/192.0.2.1/80", "/external/192.0.2.1/80", "/missing"} {
		if isPrerenderedRoute(route) {
			t.Errorf("isPrerenderedRoute(%q) = true", route)
		}
	}
}
