package store

import (
	"context"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type recordingBufferStore struct {
	available bool
	ops       []UpsertOp
}

func (s *recordingBufferStore) Available() bool { return s.available }

func (s *recordingBufferStore) BulkUpsert(_ context.Context, ops []UpsertOp) (map[int]bool, error) {
	s.ops = append(s.ops, ops...)
	return nil, nil
}

func TestBufferPersistAndFlushPreservesBSONDates(t *testing.T) {
	target := &recordingBufferStore{available: true}
	buffer, err := NewBuffer(t.TempDir(), target, time.Second, false)
	if err != nil {
		t.Fatal(err)
	}
	observedAt := time.Date(2026, 7, 26, 12, 34, 56, 789_000_000, time.UTC)
	op := UpsertOp{
		IPInt:      3405803785,
		IPStr:      "203.0.113.9",
		Port:       443,
		ReceivedAt: observedAt,
		Doc:        map[string]any{"updated_at": observedAt, "product": "nginx"},
	}

	if err := buffer.Persist([]UpsertOp{op}); err != nil {
		t.Fatal(err)
	}
	if files := buffer.listFiles(); len(files) != 1 {
		t.Fatalf("spool files = %d, want 1", len(files))
	}

	buffer.flushOnce(context.Background())

	if files := buffer.listFiles(); len(files) != 0 {
		t.Fatalf("spool files after successful flush = %d, want 0", len(files))
	}
	if len(target.ops) != 1 {
		t.Fatalf("flushed ops = %d, want 1", len(target.ops))
	}
	got := target.ops[0]
	if got.IPInt != op.IPInt || got.IPStr != op.IPStr || got.Port != op.Port {
		t.Fatalf("flushed identity = %+v", got)
	}
	if !got.ReceivedAt.Equal(observedAt) {
		t.Fatalf("received_at = %s, want %s", got.ReceivedAt, observedAt)
	}
	updatedAt, ok := got.Doc["updated_at"].(primitive.DateTime)
	if !ok {
		t.Fatalf("updated_at BSON type = %T, want primitive.DateTime", got.Doc["updated_at"])
	}
	if !updatedAt.Time().Equal(observedAt) {
		t.Fatalf("updated_at = %s, want %s", updatedAt.Time(), observedAt)
	}
}

func TestBufferRetainsSpoolWhileStoreUnavailable(t *testing.T) {
	target := &recordingBufferStore{}
	buffer, err := NewBuffer(t.TempDir(), target, time.Second, false)
	if err != nil {
		t.Fatal(err)
	}
	if err := buffer.Persist([]UpsertOp{{IPInt: 1, IPStr: "0.0.0.1", Port: 80}}); err != nil {
		t.Fatal(err)
	}

	buffer.flushOnce(context.Background())

	if files := buffer.listFiles(); len(files) != 1 {
		t.Fatalf("spool files = %d, want 1 while store unavailable", len(files))
	}
	if len(target.ops) != 0 {
		t.Fatalf("unexpected write attempt while store unavailable: %+v", target.ops)
	}
}
