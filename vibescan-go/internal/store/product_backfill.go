package store

import (
	"context"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/vibescan/vibescan-go/internal/media"
)

// BackfillProductIdentity normalizes legacy banners into the explicit product
// fields now written at ingest. It is idempotent and intentionally opt-in from
// cmd/migrate because a large historical collection may take time to scan.
func (m *Mongo) BackfillProductIdentity(ctx context.Context) (int64, error) {
	cur, err := m.results.Find(ctx,
		bson.M{"banner": bson.M{"$type": "string", "$ne": ""}},
		options.Find().SetProjection(bson.M{"banner": 1}),
	)
	if err != nil {
		return 0, err
	}
	defer cur.Close(ctx)

	var updated int64
	models := make([]mongo.WriteModel, 0, 500)
	flush := func() error {
		if len(models) == 0 {
			return nil
		}
		result, err := m.results.BulkWrite(ctx, models, options.BulkWrite().SetOrdered(false))
		if err != nil {
			return err
		}
		updated += result.ModifiedCount
		models = models[:0]
		return nil
	}

	for cur.Next(ctx) {
		var row struct {
			ID     primitive.ObjectID `bson:"_id"`
			Banner string             `bson:"banner"`
		}
		if err := cur.Decode(&row); err != nil {
			return updated, err
		}
		product := media.NormalizeProduct(row.Banner)
		set := bson.M{
			"product_family":        product.Family,
			"product_version":       product.Version,
			"product_major_version": product.MajorVersion,
		}
		models = append(models, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": row.ID}).
			SetUpdate(bson.M{"$set": set}))
		if len(models) == cap(models) {
			if err := flush(); err != nil {
				return updated, err
			}
		}
	}
	if err := cur.Err(); err != nil {
		return updated, err
	}
	return updated, flush()
}
