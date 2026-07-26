package store

import (
	"context"
	"errors"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// DailyRollup is a once-per-day snapshot of the retained observation collection, used to chart how
// exposure shifts over time. Keyed by UTC date (_id), so re-computing a day is
// idempotent.
type DailyRollup struct {
	Date       string    `bson:"_id" json:"date"` // "2006-01-02" (UTC)
	At         time.Time `bson:"at" json:"-"`     // when computed
	Services   int       `bson:"services" json:"services"`
	Hosts      int       `bson:"hosts" json:"hosts"`
	Cleartext  int       `bson:"cleartext" json:"cleartext"`
	Secure     int       `bson:"secure" json:"secure"`
	Flagged    int       `bson:"flagged" json:"flagged"` // CVE-associated OR reputation-flagged
	Exposed    int       `bson:"exposed" json:"exposed"` // CVE-associated
	Malicious  int       `bson:"malicious" json:"malicious"`
	Suspicious int       `bson:"suspicious" json:"suspicious"`
}

// ComputeDailySnapshot aggregates the whole results collection into today's
// rollup (a point-in-time snapshot of the retained collection, not a windowed flow).
func (m *Mongo) ComputeDailySnapshot(ctx context.Context) (DailyRollup, error) {
	if m == nil || m.results == nil {
		return DailyRollup{}, errors.New("store unavailable")
	}
	flaggedMatch := bson.D{{Key: "$or", Value: bson.A{
		bson.D{{Key: "vuln_count", Value: bson.D{{Key: "$gt", Value: 0}}}},
		bson.D{{Key: "verdict", Value: bson.D{{Key: "$in", Value: bson.A{"suspicious", "malicious"}}}}},
	}}}
	facet := bson.D{
		{Key: "total", Value: bson.A{bson.D{{Key: "$count", Value: "count"}}}},
		{Key: "hosts", Value: bson.A{
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: "$ip"}}}},
			bson.D{{Key: "$count", Value: "count"}},
		}},
		{Key: "secure", Value: bson.A{
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: bson.D{{Key: "$eq", Value: bson.A{"$secured", true}}}}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
		}},
		{Key: "flagged", Value: bson.A{
			bson.D{{Key: "$match", Value: flaggedMatch}},
			bson.D{{Key: "$count", Value: "count"}},
		}},
		{Key: "exposed", Value: bson.A{
			bson.D{{Key: "$match", Value: bson.D{{Key: "vuln_count", Value: bson.D{{Key: "$gt", Value: 0}}}}}},
			bson.D{{Key: "$count", Value: "count"}},
		}},
		{Key: "verdicts", Value: bson.A{
			bson.D{{Key: "$match", Value: bson.D{{Key: "verdict", Value: bson.D{{Key: "$in", Value: bson.A{"suspicious", "malicious"}}}}}}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: "$verdict"}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
		}},
	}

	cur, err := m.results.Aggregate(ctx, mongo.Pipeline{bson.D{{Key: "$facet", Value: facet}}}, options.Aggregate().SetAllowDiskUse(true))
	if err != nil {
		return DailyRollup{}, err
	}
	defer cur.Close(ctx)

	var rows []struct {
		Total    []countOnly  `bson:"total"`
		Hosts    []countOnly  `bson:"hosts"`
		Secure   []securedRow `bson:"secure"`
		Flagged  []countOnly  `bson:"flagged"`
		Exposed  []countOnly  `bson:"exposed"`
		Verdicts []kv         `bson:"verdicts"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return DailyRollup{}, err
	}

	now := time.Now().UTC()
	r := DailyRollup{Date: now.Format("2006-01-02"), At: now}
	if len(rows) == 1 {
		f := rows[0]
		if len(f.Total) == 1 {
			r.Services = f.Total[0].Count
		}
		if len(f.Hosts) == 1 {
			r.Hosts = f.Hosts[0].Count
		}
		for _, s := range f.Secure {
			if s.Secured {
				r.Secure = s.Count
			} else {
				r.Cleartext = s.Count
			}
		}
		if len(f.Flagged) == 1 {
			r.Flagged = f.Flagged[0].Count
		}
		if len(f.Exposed) == 1 {
			r.Exposed = f.Exposed[0].Count
		}
		for _, v := range f.Verdicts {
			switch v.ID {
			case "malicious":
				r.Malicious = v.Count
			case "suspicious":
				r.Suspicious = v.Count
			}
		}
	}
	return r, nil
}

// RunRollupWorker snapshots the retained collection shortly after startup and then every
// `interval`, upserting today's rollup. Idempotent — repeated writes for the same
// day just refresh it, so one point per day accumulates. Blocks until ctx is done.
func (m *Mongo) RunRollupWorker(ctx context.Context, interval time.Duration, debug bool) {
	if interval <= 0 {
		interval = 6 * time.Hour
	}
	select {
	case <-ctx.Done():
		return
	case <-time.After(30 * time.Second): // let Mongo settle before the first pass
	}

	snapshot := func() {
		if !m.Available() {
			return
		}
		cctx, cancel := context.WithTimeout(ctx, 60*time.Second)
		defer cancel()
		r, err := m.ComputeDailySnapshot(cctx)
		if err != nil {
			if debug {
				log.Printf("[rollup] snapshot: %v", err)
			}
			return
		}
		if err := m.UpsertDailyRollup(cctx, r); err != nil {
			if debug {
				log.Printf("[rollup] upsert: %v", err)
			}
			return
		}
		if debug {
			log.Printf("[rollup] %s: services=%d flagged=%d cleartext=%d", r.Date, r.Services, r.Flagged, r.Cleartext)
		}
	}

	snapshot()
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			snapshot()
		}
	}
}

// UpsertDailyRollup writes (or overwrites) the snapshot for its date.
func (m *Mongo) UpsertDailyRollup(ctx context.Context, r DailyRollup) error {
	if m == nil || m.rollups == nil {
		return nil
	}
	_, err := m.rollups.UpdateOne(ctx,
		bson.M{"_id": r.Date},
		bson.M{"$set": bson.M{
			"at":         r.At,
			"services":   r.Services,
			"hosts":      r.Hosts,
			"cleartext":  r.Cleartext,
			"secure":     r.Secure,
			"flagged":    r.Flagged,
			"exposed":    r.Exposed,
			"malicious":  r.Malicious,
			"suspicious": r.Suspicious,
		}},
		options.Update().SetUpsert(true),
	)
	return err
}

// ReadDailyRollups returns up to `days` most-recent daily snapshots in
// chronological (oldest-first) order.
func (m *Mongo) ReadDailyRollups(ctx context.Context, days int) ([]DailyRollup, error) {
	if m == nil || m.rollups == nil {
		return nil, nil
	}
	if days <= 0 {
		days = 90
	}
	cur, err := m.rollups.Find(ctx, bson.M{},
		options.Find().SetSort(bson.D{{Key: "_id", Value: -1}}).SetLimit(int64(days)))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var desc []DailyRollup
	if err := cur.All(ctx, &desc); err != nil {
		return nil, err
	}
	// Reverse to chronological order.
	out := make([]DailyRollup, len(desc))
	for i, r := range desc {
		out[len(desc)-1-i] = r
	}
	return out, nil
}
