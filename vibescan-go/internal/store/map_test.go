package store

import (
	"testing"
	"time"
)

func TestMapMatchAppliesModeAndWindow(t *testing.T) {
	now := time.Date(2026, time.July, 26, 12, 0, 0, 0, time.UTC)
	match := mapMatchAt(MapOpts{Mode: "at-risk", TimeRangeHours: 168}, now)

	keys := map[string]bool{}
	for _, elem := range match {
		keys[elem.Key] = true
	}
	for _, key := range []string{"geoip.lat", "geoip.lon", "updated_at", "$or"} {
		if !keys[key] {
			t.Errorf("map match missing %s: %v", key, match)
		}
	}
}

func TestMapMatchAllTimeCleartext(t *testing.T) {
	match := mapMatchAt(MapOpts{Mode: "cleartext", TimeRangeHours: 0}, time.Now())
	keys := map[string]any{}
	for _, elem := range match {
		keys[elem.Key] = elem.Value
	}
	if _, ok := keys["updated_at"]; ok {
		t.Fatal("all-time map should not add an updated_at cutoff")
	}
	if secured, ok := keys["secured"]; !ok || secured != false {
		t.Errorf("cleartext mode secured filter = %v, want false", secured)
	}
}
