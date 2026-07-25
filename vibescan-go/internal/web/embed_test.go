package web

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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
