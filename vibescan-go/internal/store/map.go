package store

import (
	"context"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/vibescan/vibescan-go/internal/geo"
)

// MapOpts selects the host-level observations shown by the public map.
type MapOpts struct {
	Limit          int
	TimeRangeHours int
	MaxTimeMS      int
	Mode           string // observations|cleartext|at-risk
}

// MapPointDoc is the deliberately small projection needed by the interactive
// map. Captures and page text are excluded so hundreds of points remain cheap.
type MapPointDoc struct {
	IP             int64      `bson:"ip"`
	IPStr          string     `bson:"ip_str"`
	Port           int        `bson:"port"`
	Banner         string     `bson:"banner"`
	ProductFamily  string     `bson:"product_family"`
	ProductVersion string     `bson:"product_version"`
	HTTPStatus     *int       `bson:"http_status"`
	Secured        bool       `bson:"secured"`
	Whois          string     `bson:"whois"`
	UpdatedAt      time.Time  `bson:"updated_at"`
	ReceivedAt     time.Time  `bson:"received_at"`
	GeoIP          *geo.GeoIP `bson:"geoip"`
	VulnCount      int        `bson:"vuln_count"`
	Verdict        string     `bson:"verdict"`
}

// MapCount is a host-level aggregate for a country or network.
type MapCount struct {
	ID    string `bson:"_id"`
	Count int    `bson:"count"`
}

// MapResult combines a bounded point sample with exact host-level summaries
// over the same mode and time window.
type MapResult struct {
	Points    []MapPointDoc
	Total     int
	Countries []MapCount
	Networks  []MapCount
}

type mapFacetResult struct {
	Points    []MapPointDoc `bson:"points"`
	Total     []countOnly   `bson:"total"`
	Countries []MapCount    `bson:"countries"`
	Networks  []MapCount    `bson:"networks"`
}

type mapCacheKey struct {
	Mode  string
	Hours int
	Limit int
}

type mapCacheEntry struct {
	at     time.Time
	result MapResult
}

var mapMemo = struct {
	sync.Mutex
	data map[mapCacheKey]mapCacheEntry
}{data: make(map[mapCacheKey]mapCacheEntry)}

const mapTTL = 30 * time.Second

func mapMatchAt(o MapOpts, now time.Time) bson.D {
	match := bson.D{
		{Key: "geoip.lat", Value: bson.D{{Key: "$type", Value: "number"}}},
		{Key: "geoip.lon", Value: bson.D{{Key: "$type", Value: "number"}}},
	}
	if o.TimeRangeHours > 0 {
		match = append(match, bson.E{
			Key:   "updated_at",
			Value: bson.D{{Key: "$gte", Value: now.Add(-time.Duration(o.TimeRangeHours) * time.Hour)}},
		})
	}
	switch o.Mode {
	case "cleartext":
		match = append(match, bson.E{Key: "secured", Value: false})
	case "at-risk":
		match = append(match, bson.E{Key: "$or", Value: bson.A{
			bson.D{{Key: "vuln_count", Value: bson.D{{Key: "$gt", Value: 0}}}},
			bson.D{{Key: "verdict", Value: bson.D{{Key: "$in", Value: bson.A{"suspicious", "malicious"}}}}},
		}})
	}
	return match
}

// MapObservations returns one newest matching service per host, plus exact
// country/network host counts over the same filtered population.
func (m *Mongo) MapObservations(ctx context.Context, o MapOpts) (MapResult, error) {
	cacheKey := mapCacheKey{Mode: o.Mode, Hours: o.TimeRangeHours, Limit: o.Limit}
	mapMemo.Lock()
	if cached, ok := mapMemo.data[cacheKey]; ok && time.Since(cached.at) < mapTTL {
		mapMemo.Unlock()
		return cached.result, nil
	}
	mapMemo.Unlock()

	match := mapMatchAt(o, time.Now().UTC())
	pointProjection := bson.D{
		{Key: "ip", Value: 1},
		{Key: "ip_str", Value: 1},
		{Key: "port", Value: 1},
		{Key: "banner", Value: 1},
		{Key: "product_family", Value: 1},
		{Key: "product_version", Value: 1},
		{Key: "http_status", Value: 1},
		{Key: "secured", Value: 1},
		{Key: "whois", Value: 1},
		{Key: "updated_at", Value: 1},
		{Key: "received_at", Value: 1},
		{Key: "geoip", Value: 1},
		{Key: "vuln_count", Value: 1},
		{Key: "verdict", Value: 1},
	}
	pipeline := mongo.Pipeline{
		bson.D{{Key: "$match", Value: match}},
		bson.D{{Key: "$sort", Value: bson.D{
			{Key: "updated_at", Value: -1},
			{Key: "received_at", Value: -1},
			{Key: "_id", Value: -1},
		}}},
		bson.D{{Key: "$group", Value: bson.D{
			{Key: "_id", Value: "$ip"},
			{Key: "doc", Value: bson.D{{Key: "$first", Value: "$$ROOT"}}},
		}}},
		bson.D{{Key: "$replaceRoot", Value: bson.D{{Key: "newRoot", Value: "$doc"}}}},
		bson.D{{Key: "$facet", Value: bson.D{
			{Key: "points", Value: bson.A{
				bson.D{{Key: "$sort", Value: bson.D{{Key: "updated_at", Value: -1}, {Key: "_id", Value: -1}}}},
				bson.D{{Key: "$limit", Value: o.Limit}},
				bson.D{{Key: "$project", Value: pointProjection}},
			}},
			{Key: "total", Value: bson.A{
				bson.D{{Key: "$count", Value: "count"}},
			}},
			{Key: "countries", Value: bson.A{
				bson.D{{Key: "$match", Value: bson.D{{Key: "geoip.country_iso", Value: bson.D{
					{Key: "$type", Value: "string"}, {Key: "$ne", Value: ""},
				}}}}},
				bson.D{{Key: "$group", Value: bson.D{
					{Key: "_id", Value: "$geoip.country_iso"},
					{Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}},
				}}},
				bson.D{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}, {Key: "_id", Value: 1}}}},
				bson.D{{Key: "$limit", Value: 12}},
			}},
			{Key: "networks", Value: bson.A{
				bson.D{{Key: "$match", Value: bson.D{{Key: "whois", Value: bson.D{
					{Key: "$type", Value: "string"}, {Key: "$nin", Value: bson.A{"", "unknown"}},
				}}}}},
				bson.D{{Key: "$project", Value: bson.D{{Key: "network", Value: normalizedNetworkExpr()}}}},
				bson.D{{Key: "$match", Value: bson.D{{Key: "network", Value: bson.D{{Key: "$ne", Value: ""}}}}}},
				bson.D{{Key: "$group", Value: bson.D{
					{Key: "_id", Value: "$network"},
					{Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}},
				}}},
				bson.D{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}, {Key: "_id", Value: 1}}}},
				bson.D{{Key: "$limit", Value: 12}},
			}},
		}}},
	}

	opts := options.Aggregate().SetAllowDiskUse(true)
	if o.MaxTimeMS > 0 {
		opts.SetMaxTime(time.Duration(o.MaxTimeMS) * time.Millisecond)
	}
	cur, err := m.results.Aggregate(ctx, pipeline, opts)
	if err != nil {
		return MapResult{}, err
	}
	defer cur.Close(ctx)
	var rows []mapFacetResult
	if err := cur.All(ctx, &rows); err != nil {
		return MapResult{}, err
	}
	if len(rows) == 0 {
		return MapResult{Points: []MapPointDoc{}, Countries: []MapCount{}, Networks: []MapCount{}}, nil
	}
	total := 0
	if len(rows[0].Total) > 0 {
		total = rows[0].Total[0].Count
	}
	result := MapResult{
		Points: rows[0].Points, Total: total,
		Countries: rows[0].Countries, Networks: rows[0].Networks,
	}
	mapMemo.Lock()
	mapMemo.data[cacheKey] = mapCacheEntry{at: time.Now(), result: result}
	mapMemo.Unlock()
	return result, nil
}
