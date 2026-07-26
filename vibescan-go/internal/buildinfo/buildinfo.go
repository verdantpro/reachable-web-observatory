// Package buildinfo exposes immutable release identity stamped into production
// binaries with go build -ldflags. Development builds retain explicit defaults.
package buildinfo

var (
	Commit  = "dev"
	BuiltAt = "unknown"
)
