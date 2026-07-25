package store

import (
	"testing"
	"time"
)

func TestFormatBucket(t *testing.T) {
	at := time.Date(2026, time.July, 25, 14, 37, 0, 0, time.UTC)
	tests := []struct {
		name  string
		hours int
		want  string
	}{
		{name: "all time uses daily buckets", hours: 0, want: "2026-07-25"},
		{name: "one hour uses minute buckets", hours: 1, want: "2026-07-25 14:37"},
		{name: "bounded window uses hourly buckets", hours: 24, want: "2026-07-25 14:00"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := formatBucket(at, tt.hours); got != tt.want {
				t.Fatalf("formatBucket(%d) = %q, want %q", tt.hours, got, tt.want)
			}
		})
	}
}
