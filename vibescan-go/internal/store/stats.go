package store

import (
	"context"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/vibescan/vibescan-go/internal/geo"
	"github.com/vibescan/vibescan-go/internal/media"
)

// Stats is the aggregate snapshot returned by the /api/v2/stats endpoint. All
// figures are computed over the requested time window (see StatsAggregate).
type Stats struct {
	TimeRangeHours      int            `json:"time_range_hours"`
	Totals              StatsTotals    `json:"totals"`
	ServicesByPort      map[string]int `json:"services_by_port"`
	StatusCodeCounts    map[string]int `json:"status_code_counts"`
	SecureCaptureCounts map[string]int `json:"secure_capture_counts"`
	TopBanners          map[string]int `json:"top_banners"`
	SubmissionsByClient map[string]int `json:"submissions_by_client"`
	SubmissionsOverTime map[string]int `json:"submissions_over_time"`
	ExposedServices     int            `json:"exposed_services"` // services with >=1 known CVE
	TopTags             map[string]int `json:"top_tags"`         // Shodan tags across enriched hosts
	Verdicts            map[string]int `json:"verdicts"`         // reputation verdict distribution
	// Concentration of at-risk services (CVE-associated OR reputation-flagged) —
	// where exposure clusters, the study's core question.
	FlaggedServices  int            `json:"flagged_services"`
	FlaggedByPort    map[string]int `json:"flagged_by_port"`
	FlaggedByProduct map[string]int `json:"flagged_by_product"`
	FlaggedByOrg     map[string]int `json:"flagged_by_org"`
	FlaggedByCountry map[string]int `json:"flagged_by_country"`
	// Findings: most-prevalent CVEs, per-dimension totals (density denominators),
	// and flagged-host coordinates for the risk map.
	TopCVEs               map[string]int `json:"top_cves"`
	ServicesByCountry     map[string]int `json:"services_by_country"`
	TotalByOrg            map[string]int `json:"total_by_org"`
	HostsByNetwork        map[string]int `json:"hosts_by_network"`
	FlaggedHostsByNetwork map[string]int `json:"flagged_hosts_by_network"`
	HostsByOrganization   map[string]int `json:"hosts_by_organization"`
	NetworkCount          int            `json:"network_count"`
	OrganizationCount     int            `json:"organization_count"`
	Coverage              StatsCoverage  `json:"coverage"`
	FlaggedPoints         []GeoPoint     `json:"flagged_points"`
}

// StatsCoverage reports how many service records have enough metadata to
// support each analysis. Keeping these denominators explicit prevents sparse
// enrichment data from looking representative of the whole selected window.
type StatsCoverage struct {
	NetworkAttributed  int `json:"network_attributed"`
	Geolocated         int `json:"geolocated"`
	ReputationAssessed int `json:"reputation_assessed"`
}

// GeoPoint is one flagged host's location for the Stats risk map.
type GeoPoint struct {
	Lat      float64 `bson:"lat" json:"lat"`
	Lon      float64 `bson:"lon" json:"lon"`
	Insecure bool    `bson:"insecure" json:"insecure"`
}

// StatsTotals holds the headline counts.
type StatsTotals struct {
	Hosts    int `json:"hosts"`
	Services int `json:"services"`
}

// facetResult decodes the single $facet document produced by the pipeline.
type facetResult struct {
	Ports    []kv         `bson:"ports"`
	Status   []statusRow  `bson:"status"`
	Secure   []securedRow `bson:"secure"`
	Banners  []kv         `bson:"banners"`
	Hosts    []countOnly  `bson:"hosts"`
	Clients  []kvStr      `bson:"clients"`
	Times    []timeRow    `bson:"times"`
	Total    []countOnly  `bson:"total"`
	Exposed  []countOnly  `bson:"exposed"`
	Tags     []kv         `bson:"tags"`
	Verdicts []kv         `bson:"verdicts"`
	// Concentration of at-risk services.
	FlaggedTotal        []countOnly `bson:"flagged_total"`
	FlaggedPorts        []kv        `bson:"flagged_ports"`
	FlaggedProducts     []kv        `bson:"flagged_products"`
	FlaggedOrgs         []kvStr     `bson:"flagged_orgs"`
	FlaggedCountries    []kvStr     `bson:"flagged_countries"`
	TopCVEs             []kv        `bson:"top_cves"`
	ServicesCountry     []kvStr     `bson:"services_by_country"`
	TotalOrg            []kvStr     `bson:"total_by_org"`
	HostsNetwork        []kvStr     `bson:"hosts_by_network"`
	FlaggedHostsNetwork []kvStr     `bson:"flagged_hosts_by_network"`
	HostsOrganization   []kvStr     `bson:"hosts_by_organization"`
	Networks            []countOnly `bson:"network_count"`
	Organizations       []countOnly `bson:"organization_count"`
	NetworkCoverage     []countOnly `bson:"network_coverage"`
	GeoCoverage         []countOnly `bson:"geo_coverage"`
	ReputationCoverage  []countOnly `bson:"reputation_coverage"`
	FlaggedPoints       []GeoPoint  `bson:"flagged_points"`
}

type kv struct {
	ID    string `bson:"_id"`
	Count int    `bson:"count"`
}
type kvStr struct {
	ID    string `bson:"_id"`
	Count int    `bson:"count"`
}
type statusRow struct {
	Class string `bson:"_id"` // "200" | "3xx" | "4xx" | "5xx" | "other"
	Count int    `bson:"count"`
}
type securedRow struct {
	Secured bool `bson:"_id"`
	Count   int  `bson:"count"`
}
type countOnly struct {
	Count int `bson:"count"`
}
type timeRow struct {
	Bucket time.Time `bson:"_id"`
	Count  int       `bson:"count"`
}

type statsEntry struct {
	at   time.Time
	data Stats
}

type statsCache struct {
	mu   sync.Mutex
	data map[int]statsEntry
}

var statsMemo = &statsCache{data: map[int]statsEntry{}}

const statsTTL = 60 * time.Second

// StatsAggregate computes stats in a single $facet pass with a short in-process
// cache. A positive timeRangeHours selects records updated within that window;
// zero selects the complete retained service collection.
func (m *Mongo) StatsAggregate(ctx context.Context, timeRangeHours, maxTimeMS int) (Stats, error) {
	statsMemo.mu.Lock()
	if cached, ok := statsMemo.data[timeRangeHours]; ok && time.Since(cached.at) < statsTTL {
		statsMemo.mu.Unlock()
		return cached.data, nil
	}
	statsMemo.mu.Unlock()

	var match bson.D
	if timeRangeHours > 0 {
		cutoff := time.Now().UTC().Add(-time.Duration(timeRangeHours) * time.Hour)
		match = bson.D{{Key: "updated_at", Value: bson.D{{Key: "$gte", Value: cutoff}}}}
	}

	// Bucket submissions by 5 minutes for the 1h view, hourly for bounded
	// windows, and daily for the unbounded all-time view.
	timeUnit, binSize := "hour", 1
	if timeRangeHours <= 1 {
		timeUnit, binSize = "minute", 5
	}
	if timeRangeHours == 0 {
		timeUnit, binSize = "day", 1
	}

	// Prefer the explicit normalized product family written at ingest. Legacy
	// records fall back to the old banner cleanup until they are re-observed or
	// backfilled.
	bannerClean := bson.A{
		bson.D{{Key: "$match", Value: bson.D{{Key: "banner", Value: bson.D{{Key: "$type", Value: "string"}, {Key: "$ne", Value: ""}}}}}},
		bson.D{{Key: "$project", Value: bson.D{{Key: "b", Value: bson.D{{Key: "$arrayElemAt", Value: bson.A{
			bson.D{{Key: "$split", Value: bson.A{
				bson.D{{Key: "$ifNull", Value: bson.A{"$product_family", "$banner"}}},
				"extrainfo:",
			}}}, 0,
		}}}}}}},
		bson.D{{Key: "$project", Value: bson.D{{Key: "b", Value: bson.D{{Key: "$cond", Value: bson.D{
			{Key: "if", Value: bson.D{{Key: "$eq", Value: bson.A{bson.D{{Key: "$indexOfCP", Value: bson.A{"$b", "product: "}}}, 0}}}},
			{Key: "then", Value: bson.D{{Key: "$substrCP", Value: bson.A{"$b", 9, bson.D{{Key: "$strLenCP", Value: "$b"}}}}}},
			{Key: "else", Value: "$b"},
		}}}}}}},
		bson.D{{Key: "$project", Value: bson.D{{Key: "b", Value: bson.D{{Key: "$trim", Value: bson.D{{Key: "input", Value: "$b"}}}}}}}},
		bson.D{{Key: "$match", Value: bson.D{{Key: "b", Value: bson.D{{Key: "$ne", Value: ""}}}}}},
		bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: "$b"}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
		bson.D{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}, {Key: "_id", Value: 1}}}},
		bson.D{{Key: "$limit", Value: 25}},
	}

	statusExpr := bson.D{{Key: "$switch", Value: bson.D{
		{Key: "branches", Value: bson.A{
			bson.D{{Key: "case", Value: bson.D{{Key: "$eq", Value: bson.A{"$http_status", 200}}}}, {Key: "then", Value: "200"}},
			bson.D{{Key: "case", Value: bson.D{{Key: "$and", Value: bson.A{
				bson.D{{Key: "$gte", Value: bson.A{"$http_status", 300}}}, bson.D{{Key: "$lt", Value: bson.A{"$http_status", 400}}},
			}}}}, {Key: "then", Value: "3xx"}},
			bson.D{{Key: "case", Value: bson.D{{Key: "$and", Value: bson.A{
				bson.D{{Key: "$gte", Value: bson.A{"$http_status", 400}}}, bson.D{{Key: "$lt", Value: bson.A{"$http_status", 500}}},
			}}}}, {Key: "then", Value: "4xx"}},
			bson.D{{Key: "case", Value: bson.D{{Key: "$and", Value: bson.A{
				bson.D{{Key: "$gte", Value: bson.A{"$http_status", 500}}}, bson.D{{Key: "$lt", Value: bson.A{"$http_status", 600}}},
			}}}}, {Key: "then", Value: "5xx"}},
		}},
		{Key: "default", Value: "other"},
	}}}

	// "At-risk" = CVE-associated OR reputation-flagged. The concentration facets
	// below break this subset down by port, product, organization, and country.
	flaggedMatch := bson.D{{Key: "$or", Value: bson.A{
		bson.D{{Key: "vuln_count", Value: bson.D{{Key: "$gt", Value: 0}}}},
		bson.D{{Key: "verdict", Value: bson.D{{Key: "$in", Value: bson.A{"suspicious", "malicious"}}}}},
	}}}
	// Reuse the banner-cleaning sub-pipeline, but only over at-risk services.
	flaggedProducts := append(bson.A{bson.D{{Key: "$match", Value: flaggedMatch}}}, bannerClean...)
	networkExpr := bson.D{
		{Key: "$trim", Value: bson.D{
			{Key: "input", Value: bson.D{
				{Key: "$arrayElemAt", Value: bson.A{
					bson.D{{Key: "$split", Value: bson.A{"$whois", " - "}}},
					0,
				}},
			}},
		}},
	}
	organizationExpr := bson.D{
		{Key: "$trim", Value: bson.D{
			{Key: "input", Value: bson.D{
				{Key: "$arrayElemAt", Value: bson.A{
					bson.D{{Key: "$split", Value: bson.A{"$whois", " - "}}},
					1,
				}},
			}},
		}},
	}

	facet := bson.D{
		{Key: "ports", Value: bson.A{
			bson.D{{Key: "$match", Value: bson.D{{Key: "port", Value: bson.D{{Key: "$exists", Value: true}}}}}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: bson.D{{Key: "$toString", Value: "$port"}}}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
			bson.D{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}, {Key: "_id", Value: 1}}}},
			bson.D{{Key: "$limit", Value: 100}},
		}},
		{Key: "status", Value: bson.A{
			bson.D{{Key: "$match", Value: bson.D{{Key: "http_status", Value: bson.D{{Key: "$type", Value: "number"}}}}}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: statusExpr}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
		}},
		{Key: "secure", Value: bson.A{
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: bson.D{{Key: "$eq", Value: bson.A{"$secured", true}}}}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
		}},
		{Key: "banners", Value: bannerClean},
		{Key: "hosts", Value: bson.A{
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: "$ip"}}}},
			bson.D{{Key: "$count", Value: "count"}},
		}},
		{Key: "clients", Value: bson.A{
			bson.D{{Key: "$match", Value: bson.D{
				{Key: "anon", Value: bson.D{{Key: "$ne", Value: true}}},
				{Key: "submitted_by", Value: bson.D{{Key: "$ne", Value: "0.0.0.0"}}},
			}}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: "$submitted_by"}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
			bson.D{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}, {Key: "_id", Value: 1}}}},
			bson.D{{Key: "$limit", Value: 50}},
		}},
		{Key: "times", Value: bson.A{
			bson.D{{Key: "$group", Value: bson.D{
				{Key: "_id", Value: bson.D{{Key: "$dateTrunc", Value: bson.D{
					{Key: "date", Value: "$updated_at"}, {Key: "unit", Value: timeUnit}, {Key: "binSize", Value: binSize},
				}}}},
				{Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}},
			}}},
			bson.D{{Key: "$sort", Value: bson.D{{Key: "_id", Value: 1}}}},
		}},
		{Key: "total", Value: bson.A{
			bson.D{{Key: "$count", Value: "count"}},
		}},
		// Enrichment exposure: services with >=1 known CVE, and top Shodan tags.
		{Key: "exposed", Value: bson.A{
			bson.D{{Key: "$match", Value: bson.D{{Key: "vuln_count", Value: bson.D{{Key: "$gt", Value: 0}}}}}},
			bson.D{{Key: "$count", Value: "count"}},
		}},
		{Key: "tags", Value: bson.A{
			bson.D{{Key: "$unwind", Value: "$shodan_tags"}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: "$shodan_tags"}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
			bson.D{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}, {Key: "_id", Value: 1}}}},
			bson.D{{Key: "$limit", Value: 15}},
		}},
		{Key: "verdicts", Value: bson.A{
			bson.D{{Key: "$match", Value: bson.D{{Key: "verdict", Value: bson.D{{Key: "$in", Value: bson.A{"clean", "suspicious", "malicious"}}}}}}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: "$verdict"}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
		}},
		// --- Concentration: where at-risk services cluster (the research question) ---
		{Key: "flagged_total", Value: bson.A{
			bson.D{{Key: "$match", Value: flaggedMatch}},
			bson.D{{Key: "$count", Value: "count"}},
		}},
		{Key: "flagged_ports", Value: bson.A{
			bson.D{{Key: "$match", Value: flaggedMatch}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: bson.D{{Key: "$toString", Value: "$port"}}}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
			bson.D{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}, {Key: "_id", Value: 1}}}},
			bson.D{{Key: "$limit", Value: 15}},
		}},
		{Key: "flagged_products", Value: flaggedProducts},
		{Key: "flagged_orgs", Value: bson.A{
			bson.D{{Key: "$match", Value: flaggedMatch}},
			bson.D{{Key: "$match", Value: bson.D{{Key: "whois", Value: bson.D{{Key: "$type", Value: "string"}, {Key: "$nin", Value: bson.A{"", "unknown"}}}}}}},
			// Match the tile's org label: the part before " - ".
			bson.D{{Key: "$project", Value: bson.D{{Key: "org", Value: bson.D{{Key: "$trim", Value: bson.D{{Key: "input", Value: bson.D{{Key: "$arrayElemAt", Value: bson.A{
				bson.D{{Key: "$split", Value: bson.A{"$whois", " - "}}}, 0,
			}}}}}}}}}}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: "$org"}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
			bson.D{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}, {Key: "_id", Value: 1}}}},
			bson.D{{Key: "$limit", Value: 12}},
		}},
		{Key: "flagged_countries", Value: bson.A{
			bson.D{{Key: "$match", Value: flaggedMatch}},
			bson.D{{Key: "$match", Value: bson.D{{Key: "geoip.country_iso", Value: bson.D{{Key: "$type", Value: "string"}, {Key: "$ne", Value: ""}}}}}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: "$geoip.country_iso"}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
			bson.D{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}, {Key: "_id", Value: 1}}}},
			bson.D{{Key: "$limit", Value: 15}},
		}},
		// --- Findings: top CVEs, geography totals, density denominators, risk map ---
		{Key: "top_cves", Value: bson.A{
			bson.D{{Key: "$unwind", Value: "$cves"}},
			// A host can have several recorded web ports. Count a CVE once
			// per host, not once per ip:port service document.
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: bson.D{
				{Key: "cve", Value: "$cves"},
				{Key: "ip", Value: "$ip"},
			}}}}},
			bson.D{{Key: "$group", Value: bson.D{
				{Key: "_id", Value: "$_id.cve"},
				{Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}},
			}}},
			bson.D{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}, {Key: "_id", Value: 1}}}},
			bson.D{{Key: "$limit", Value: 15}},
		}},
		{Key: "services_by_country", Value: bson.A{
			bson.D{{Key: "$match", Value: bson.D{{Key: "geoip.country_iso", Value: bson.D{{Key: "$type", Value: "string"}, {Key: "$ne", Value: ""}}}}}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: "$geoip.country_iso"}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
			bson.D{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}, {Key: "_id", Value: 1}}}},
			bson.D{{Key: "$limit", Value: 30}},
		}},
		{Key: "total_by_org", Value: bson.A{
			bson.D{{Key: "$match", Value: bson.D{{Key: "whois", Value: bson.D{{Key: "$type", Value: "string"}, {Key: "$nin", Value: bson.A{"", "unknown"}}}}}}},
			bson.D{{Key: "$project", Value: bson.D{{Key: "org", Value: bson.D{{Key: "$trim", Value: bson.D{{Key: "input", Value: bson.D{{Key: "$arrayElemAt", Value: bson.A{
				bson.D{{Key: "$split", Value: bson.A{"$whois", " - "}}}, 0,
			}}}}}}}}}}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: "$org"}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
			bson.D{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}, {Key: "_id", Value: 1}}}},
			bson.D{{Key: "$limit", Value: 150}},
		}},
		// Network ownership is reported at host granularity. The first WHOIS
		// segment is the RDAP network name used throughout the UI.
		{Key: "hosts_by_network", Value: bson.A{
			bson.D{{Key: "$match", Value: bson.D{{Key: "whois", Value: bson.D{{Key: "$type", Value: "string"}, {Key: "$nin", Value: bson.A{"", "unknown"}}}}}}},
			bson.D{{Key: "$project", Value: bson.D{
				{Key: "network", Value: networkExpr},
				{Key: "ip", Value: 1},
			}}},
			bson.D{{Key: "$match", Value: bson.D{{Key: "network", Value: bson.D{{Key: "$ne", Value: ""}}}}}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: bson.D{{Key: "network", Value: "$network"}, {Key: "ip", Value: "$ip"}}}}}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: "$_id.network"}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
			bson.D{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}, {Key: "_id", Value: 1}}}},
			bson.D{{Key: "$limit", Value: 50}},
		}},
		{Key: "flagged_hosts_by_network", Value: bson.A{
			bson.D{{Key: "$match", Value: flaggedMatch}},
			bson.D{{Key: "$match", Value: bson.D{{Key: "whois", Value: bson.D{{Key: "$type", Value: "string"}, {Key: "$nin", Value: bson.A{"", "unknown"}}}}}}},
			bson.D{{Key: "$project", Value: bson.D{
				{Key: "network", Value: networkExpr},
				{Key: "ip", Value: 1},
			}}},
			bson.D{{Key: "$match", Value: bson.D{{Key: "network", Value: bson.D{{Key: "$ne", Value: ""}}}}}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: bson.D{{Key: "network", Value: "$network"}, {Key: "ip", Value: "$ip"}}}}}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: "$_id.network"}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
			bson.D{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}, {Key: "_id", Value: 1}}}},
			bson.D{{Key: "$limit", Value: 50}},
		}},
		{Key: "hosts_by_organization", Value: bson.A{
			bson.D{{Key: "$match", Value: bson.D{{Key: "whois", Value: bson.D{{Key: "$type", Value: "string"}, {Key: "$regex", Value: " - "}}}}}},
			bson.D{{Key: "$project", Value: bson.D{
				{Key: "organization", Value: organizationExpr},
				{Key: "ip", Value: 1},
			}}},
			bson.D{{Key: "$match", Value: bson.D{{Key: "organization", Value: bson.D{{Key: "$ne", Value: ""}}}}}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: bson.D{{Key: "organization", Value: "$organization"}, {Key: "ip", Value: "$ip"}}}}}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: "$_id.organization"}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
			bson.D{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}, {Key: "_id", Value: 1}}}},
			bson.D{{Key: "$limit", Value: 50}},
		}},
		{Key: "network_count", Value: bson.A{
			bson.D{{Key: "$match", Value: bson.D{{Key: "whois", Value: bson.D{{Key: "$type", Value: "string"}, {Key: "$nin", Value: bson.A{"", "unknown"}}}}}}},
			bson.D{{Key: "$project", Value: bson.D{{Key: "network", Value: networkExpr}}}},
			bson.D{{Key: "$match", Value: bson.D{{Key: "network", Value: bson.D{{Key: "$ne", Value: ""}}}}}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: "$network"}}}},
			bson.D{{Key: "$count", Value: "count"}},
		}},
		{Key: "organization_count", Value: bson.A{
			bson.D{{Key: "$match", Value: bson.D{{Key: "whois", Value: bson.D{{Key: "$type", Value: "string"}, {Key: "$regex", Value: " - "}}}}}},
			bson.D{{Key: "$project", Value: bson.D{{Key: "organization", Value: organizationExpr}}}},
			bson.D{{Key: "$match", Value: bson.D{{Key: "organization", Value: bson.D{{Key: "$ne", Value: ""}}}}}},
			bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: "$organization"}}}},
			bson.D{{Key: "$count", Value: "count"}},
		}},
		{Key: "network_coverage", Value: bson.A{
			bson.D{{Key: "$match", Value: bson.D{{Key: "whois", Value: bson.D{{Key: "$type", Value: "string"}, {Key: "$nin", Value: bson.A{"", "unknown"}}}}}}},
			bson.D{{Key: "$count", Value: "count"}},
		}},
		{Key: "geo_coverage", Value: bson.A{
			bson.D{{Key: "$match", Value: bson.D{{Key: "geoip.country_iso", Value: bson.D{{Key: "$type", Value: "string"}, {Key: "$ne", Value: ""}}}}}},
			bson.D{{Key: "$count", Value: "count"}},
		}},
		{Key: "reputation_coverage", Value: bson.A{
			bson.D{{Key: "$match", Value: bson.D{{Key: "verdict", Value: bson.D{{Key: "$in", Value: bson.A{"clean", "suspicious", "malicious"}}}}}}},
			bson.D{{Key: "$count", Value: "count"}},
		}},
		{Key: "flagged_points", Value: bson.A{
			bson.D{{Key: "$match", Value: flaggedMatch}},
			bson.D{{Key: "$match", Value: bson.D{{Key: "geoip.lat", Value: bson.D{{Key: "$type", Value: "number"}}}}}},
			bson.D{{Key: "$project", Value: bson.D{
				{Key: "_id", Value: 0},
				{Key: "lat", Value: "$geoip.lat"},
				{Key: "lon", Value: "$geoip.lon"},
				{Key: "insecure", Value: bson.D{{Key: "$eq", Value: bson.A{"$secured", false}}}},
			}}},
			bson.D{{Key: "$limit", Value: 500}},
		}},
	}

	pipeline := mongo.Pipeline{}
	if len(match) > 0 {
		pipeline = append(pipeline, bson.D{{Key: "$match", Value: match}})
	}
	pipeline = append(pipeline, bson.D{{Key: "$facet", Value: facet}})

	opts := options.Aggregate().SetAllowDiskUse(true)
	if maxTimeMS > 0 {
		opts.SetMaxTime(time.Duration(maxTimeMS) * time.Millisecond)
	}
	cur, err := m.results.Aggregate(ctx, pipeline, opts)
	if err != nil {
		return Stats{}, err
	}
	defer cur.Close(ctx)

	var rows []facetResult
	if err := cur.All(ctx, &rows); err != nil {
		return Stats{}, err
	}

	out := Stats{
		TimeRangeHours:        timeRangeHours,
		ServicesByPort:        map[string]int{},
		StatusCodeCounts:      map[string]int{"200": 0, "3xx": 0, "4xx": 0, "5xx": 0},
		SecureCaptureCounts:   map[string]int{"secured": 0, "insecure": 0},
		TopBanners:            map[string]int{},
		SubmissionsByClient:   map[string]int{},
		SubmissionsOverTime:   map[string]int{},
		TopTags:               map[string]int{},
		Verdicts:              map[string]int{},
		FlaggedByPort:         map[string]int{},
		FlaggedByProduct:      map[string]int{},
		FlaggedByOrg:          map[string]int{},
		FlaggedByCountry:      map[string]int{},
		TopCVEs:               map[string]int{},
		ServicesByCountry:     map[string]int{},
		TotalByOrg:            map[string]int{},
		HostsByNetwork:        map[string]int{},
		FlaggedHostsByNetwork: map[string]int{},
		HostsByOrganization:   map[string]int{},
		FlaggedPoints:         []GeoPoint{},
	}
	if len(rows) == 1 {
		f := rows[0]
		for _, p := range f.Ports {
			out.ServicesByPort[p.ID] = p.Count
		}
		for _, s := range f.Status {
			if _, ok := out.StatusCodeCounts[s.Class]; ok {
				out.StatusCodeCounts[s.Class] += s.Count
			}
		}
		for _, s := range f.Banners {
			out.TopBanners[normalizedProductLabel(s.ID)] += s.Count
		}
		for _, s := range f.Secure {
			if s.Secured {
				out.SecureCaptureCounts["secured"] += s.Count
			} else {
				out.SecureCaptureCounts["insecure"] += s.Count
			}
		}
		for _, c := range f.Clients {
			key := geo.AnonymizeIP(c.ID)
			if c.ID == "" {
				key = "unknown"
			}
			out.SubmissionsByClient[key] += c.Count
		}
		for _, t := range f.Times {
			out.SubmissionsOverTime[formatBucket(t.Bucket, timeRangeHours)] = t.Count
		}
		if len(f.Hosts) == 1 {
			out.Totals.Hosts = f.Hosts[0].Count
		}
		if len(f.Total) == 1 {
			out.Totals.Services = f.Total[0].Count
		}
		if len(f.Exposed) == 1 {
			out.ExposedServices = f.Exposed[0].Count
		}
		for _, t := range f.Tags {
			out.TopTags[t.ID] = t.Count
		}
		for _, v := range f.Verdicts {
			out.Verdicts[v.ID] = v.Count
		}
		if len(f.FlaggedTotal) == 1 {
			out.FlaggedServices = f.FlaggedTotal[0].Count
		}
		for _, p := range f.FlaggedPorts {
			out.FlaggedByPort[p.ID] = p.Count
		}
		for _, p := range f.FlaggedProducts {
			out.FlaggedByProduct[normalizedProductLabel(p.ID)] += p.Count
		}
		for _, o := range f.FlaggedOrgs {
			if o.ID != "" {
				out.FlaggedByOrg[o.ID] = o.Count
			}
		}
		for _, c := range f.FlaggedCountries {
			out.FlaggedByCountry[c.ID] = c.Count
		}
		for _, c := range f.TopCVEs {
			out.TopCVEs[c.ID] = c.Count
		}
		for _, c := range f.ServicesCountry {
			out.ServicesByCountry[c.ID] = c.Count
		}
		for _, o := range f.TotalOrg {
			if o.ID != "" {
				out.TotalByOrg[o.ID] = o.Count
			}
		}
		for _, network := range f.HostsNetwork {
			if network.ID != "" {
				out.HostsByNetwork[network.ID] = network.Count
			}
		}
		for _, network := range f.FlaggedHostsNetwork {
			if network.ID != "" {
				out.FlaggedHostsByNetwork[network.ID] = network.Count
			}
		}
		for _, organization := range f.HostsOrganization {
			if organization.ID != "" {
				out.HostsByOrganization[organization.ID] = organization.Count
			}
		}
		if len(f.Networks) == 1 {
			out.NetworkCount = f.Networks[0].Count
		}
		if len(f.Organizations) == 1 {
			out.OrganizationCount = f.Organizations[0].Count
		}
		if len(f.NetworkCoverage) == 1 {
			out.Coverage.NetworkAttributed = f.NetworkCoverage[0].Count
		}
		if len(f.GeoCoverage) == 1 {
			out.Coverage.Geolocated = f.GeoCoverage[0].Count
		}
		if len(f.ReputationCoverage) == 1 {
			out.Coverage.ReputationAssessed = f.ReputationCoverage[0].Count
		}
		if len(f.FlaggedPoints) > 0 {
			out.FlaggedPoints = f.FlaggedPoints
		}
	}

	statsMemo.mu.Lock()
	statsMemo.data[timeRangeHours] = statsEntry{at: time.Now(), data: out}
	statsMemo.mu.Unlock()

	return out, nil
}

func normalizedProductLabel(raw string) string {
	if normalized := media.NormalizeProduct(raw).Family; normalized != "" {
		return normalized
	}
	return "Unknown"
}

func formatBucket(t time.Time, timeRangeHours int) string {
	if timeRangeHours == 0 {
		return t.UTC().Format("2006-01-02")
	}
	if timeRangeHours <= 1 {
		return t.UTC().Format("2006-01-02 15:04")
	}
	return t.UTC().Format("2006-01-02 15:00")
}
