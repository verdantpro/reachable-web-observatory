package store

import (
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
)

func TestIsIPLike(t *testing.T) {
	cases := map[string]bool{
		"1.2.3.4":  true,
		"192.168":  true,
		"10.":      true,
		"8.8":      true,
		"nginx":    false,
		"200":      false, // pure digits, no dot → text search, not IP prefix
		"":         false,
		"1.2.3.a":  false,
		"host.com": false,
		"1 .2":     false,
	}
	for in, want := range cases {
		if got := isIPLike(in); got != want {
			t.Errorf("isIPLike(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestSearchMatchUsesExactNormalizedNetworkAndWindow(t *testing.T) {
	hours := 24
	now := time.Date(2026, time.July, 26, 12, 0, 0, 0, time.UTC)
	match := searchMatchAt(ListOpts{Network: "Akamai", TimeRangeHours: &hours}, now)

	var networkExpr bson.D
	var cutoff time.Time
	for _, elem := range match {
		switch elem.Key {
		case "$expr":
			expr := elem.Value.(bson.D)
			eq := expr[0].Value.(bson.A)
			networkExpr = eq[0].(bson.D)
			if got := eq[1]; got != "Akamai" {
				t.Errorf("network value = %v, want Akamai", got)
			}
		case "updated_at":
			updated := elem.Value.(bson.D)
			cutoff = updated[0].Value.(time.Time)
		}
	}
	if networkExpr == nil {
		t.Fatal("exact normalized network expression missing")
	}
	if want := now.Add(-24 * time.Hour); !cutoff.Equal(want) {
		t.Errorf("cutoff = %v, want %v", cutoff, want)
	}
}

func TestSearchMatchAllTimeDoesNotAddCutoff(t *testing.T) {
	hours := 0
	match := searchMatchAt(ListOpts{Network: "Akamai", TimeRangeHours: &hours}, time.Now())
	for _, elem := range match {
		if elem.Key == "updated_at" {
			t.Fatal("all-time network search should not add an updated_at cutoff")
		}
	}
}
