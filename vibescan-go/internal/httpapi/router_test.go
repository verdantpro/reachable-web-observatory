package httpapi

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/vibescan/vibescan-go/internal/buildinfo"
)

func TestHealthzReportsBuildIdentity(t *testing.T) {
	oldCommit, oldBuiltAt := buildinfo.Commit, buildinfo.BuiltAt
	buildinfo.Commit, buildinfo.BuiltAt = "abc123", "2026-07-26T12:00:00Z"
	t.Cleanup(func() {
		buildinfo.Commit, buildinfo.BuiltAt = oldCommit, oldBuiltAt
	})

	rec := httptest.NewRecorder()
	(&Server{}).handleHealthz(rec, httptest.NewRequest("GET", "/api/healthz", nil))

	if rec.Code != 200 {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var got struct {
		OK      bool   `json:"ok"`
		Commit  string `json:"commit"`
		BuiltAt string `json:"built_at"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if !got.OK || got.Commit != "abc123" || got.BuiltAt != "2026-07-26T12:00:00Z" {
		t.Fatalf("health response = %+v", got)
	}
}
