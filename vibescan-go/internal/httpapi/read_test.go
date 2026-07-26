package httpapi

import (
	"encoding/csv"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/vibescan/vibescan-go/internal/config"
	"github.com/vibescan/vibescan-go/internal/store"
)

func TestSearchFiltersSharedExportParameters(t *testing.T) {
	r := httptest.NewRequest("GET", "/api/v2/export?q=admin&network=Akamai&time_range=168&product=nginx&tag=cloud&verdict=suspicious&port=443&status=200&secured=true&has_vulns=1&sort=vulns", nil)
	opts := searchFilters(r)

	if opts.Query != "admin" || opts.Network != "Akamai" || opts.Product != "nginx" || opts.Tag != "cloud" || opts.Verdict != "suspicious" {
		t.Fatalf("string filters were not preserved: %+v", opts)
	}
	if opts.TimeRangeHours == nil || *opts.TimeRangeHours != 168 {
		t.Errorf("time_range = %v, want 168", opts.TimeRangeHours)
	}
	if opts.Sort != "vulns" {
		t.Errorf("sort = %q, want vulns", opts.Sort)
	}
	if opts.Port == nil || *opts.Port != 443 {
		t.Errorf("port = %v, want 443", opts.Port)
	}
	if opts.StatusCode == nil || *opts.StatusCode != 200 {
		t.Errorf("status = %v, want 200", opts.StatusCode)
	}
	if opts.Secured == nil || !*opts.Secured {
		t.Errorf("secured = %v, want true", opts.Secured)
	}
	if opts.HasVulns == nil || !*opts.HasVulns {
		t.Errorf("has_vulns = %v, want true", opts.HasVulns)
	}
}

func TestMapFilters(t *testing.T) {
	r := httptest.NewRequest("GET", "/api/v2/map?mode=at-risk&time_range=168&limit=750", nil)
	opts := mapFilters(r)
	if opts.Mode != "at-risk" || opts.TimeRangeHours != 168 || opts.Limit != 750 {
		t.Fatalf("map filters were not preserved: %+v", opts)
	}

	r = httptest.NewRequest("GET", "/api/v2/map?mode=bogus&time_range=-1&limit=5000", nil)
	opts = mapFilters(r)
	if opts.Mode != "observations" || opts.TimeRangeHours != 0 || opts.Limit != 1000 {
		t.Fatalf("map filters were not safely normalized: %+v", opts)
	}
}

func TestMatchReasonUsesVisibleFieldsAndSafeFallback(t *testing.T) {
	d := store.ServiceDoc{IPStr: "203.0.113.4", ProductFamily: "nginx", Whois: "Example Network"}
	if got := matchReason(d, "nginx"); got != "product or banner" {
		t.Errorf("product reason = %q", got)
	}
	if got := matchReason(d, "Example"); got != "network ownership" {
		t.Errorf("whois reason = %q", got)
	}
	if got := matchReason(d, "term-only-in-fulltext"); got != "captured page text or indexed metadata" {
		t.Errorf("fallback reason = %q", got)
	}
}

func TestHandleExportRejectsUnknownFormat(t *testing.T) {
	rr := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/v2/export?format=xml", nil)

	(&Server{}).handleExport(rr, r)

	if rr.Code != 400 {
		t.Errorf("status = %d, want 400", rr.Code)
	}
	if !strings.Contains(rr.Body.String(), "json") || !strings.Contains(rr.Body.String(), "csv") {
		t.Errorf("response should identify supported formats: %q", rr.Body.String())
	}
}

func TestWriteTilesCSVContractIncludesProductVersion(t *testing.T) {
	status := 200
	rr := httptest.NewRecorder()
	writeTilesCSV(rr, []tile{{
		IP: "203.0.113.9", Port: 443, Secured: true, HTTPStatus: &status,
		Product: "nginx", ProductVersion: "1.26.0", Banner: "nginx/1.26.0",
		Sources: []string{"internetdb", "shodan"},
	}})

	if got := rr.Header().Get("Content-Type"); got != "text/csv; charset=utf-8" {
		t.Errorf("Content-Type = %q", got)
	}
	rows, err := csv.NewReader(strings.NewReader(rr.Body.String())).ReadAll()
	if err != nil {
		t.Fatalf("parse CSV: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2", len(rows))
	}
	versionColumn := -1
	for i, name := range rows[0] {
		if name == "product_version" {
			versionColumn = i
			break
		}
	}
	if versionColumn == -1 {
		t.Fatal("CSV header does not contain product_version")
	}
	if got := rows[1][versionColumn]; got != "1.26.0" {
		t.Errorf("product_version = %q, want 1.26.0", got)
	}
}

func TestToTileSurfacesEnrichmentProvenanceAndThumb(t *testing.T) {
	s := &Server{cfg: &config.Config{R2PublicURL: "https://cdn.example"}}
	enrichedAt := time.Date(2026, 7, 1, 12, 0, 0, 0, time.UTC)
	d := store.ServiceDoc{
		IPStr:      "203.0.113.7",
		Port:       443,
		Capture:    "r2:2/2/203.0.113.7-443.png",
		Thumb:      "r2:thumb/2/2/203.0.113.7-443.jpg",
		VulnCount:  3,
		ShodanTags: []string{"cloud"},
		Verdict:    "malicious",
		Sources:    []string{"internetdb", "shodan"},
		EnrichedAt: enrichedAt,
		UpdatedAt:  enrichedAt,
	}

	tile := s.toTile(d)

	if tile.ImageURL != "https://cdn.example/2/2/203.0.113.7-443.png" {
		t.Errorf("image_url = %q", tile.ImageURL)
	}
	if tile.ThumbURL != "https://cdn.example/thumb/2/2/203.0.113.7-443.jpg" {
		t.Errorf("thumb_url = %q", tile.ThumbURL)
	}
	if tile.EnrichedAt != enrichedAt.Format(time.RFC3339) {
		t.Errorf("enriched_at = %q, want %q", tile.EnrichedAt, enrichedAt.Format(time.RFC3339))
	}
	if len(tile.Sources) != 2 || tile.Sources[0] != "internetdb" {
		t.Errorf("sources = %v", tile.Sources)
	}
}

func TestToTileWithoutThumbOrEnrichment(t *testing.T) {
	s := &Server{cfg: &config.Config{R2PublicURL: "https://cdn.example"}}
	d := store.ServiceDoc{
		IPStr:   "203.0.113.8",
		Port:    80,
		Capture: "r2:2/2/203.0.113.8-80.png",
		// No Thumb, no EnrichedAt.
	}
	tile := s.toTile(d)
	if tile.ThumbURL != "" {
		t.Errorf("thumb_url = %q, want empty (no thumb → UI falls back to full image)", tile.ThumbURL)
	}
	if tile.EnrichedAt != "" {
		t.Errorf("enriched_at = %q, want empty", tile.EnrichedAt)
	}
}
