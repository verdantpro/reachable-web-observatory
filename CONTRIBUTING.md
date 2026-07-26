# Contributing

Thank you for helping improve the Reachable Web Observatory. Contributions are
normally welcome across the Go collector and scanner, React interface,
documentation, methodology, tests, and accessibility.

> **Source-code contributions are temporarily paused.** Publication of the Go
> reimplementation was authorized, but downstream source licensing is being
> clarified with elixx, creator of the original Python system behind
> [What’s on HTTP](https://whatsonhttp.com/). Issue reports and factual
> documentation corrections remain welcome. See [PROVENANCE.md](PROVENANCE.md)
> and [LICENSING.md](LICENSING.md).

## Before opening a change

- Use a short-lived branch named for the change.
- Open an issue first for changes that alter sampling, retention, public-record
  exposure, scanning conduct, or provider interpretation.
- Never include captured credentials, private vulnerability details, API keys,
  production exports, or unnecessary host-level data in issues and fixtures.
- Keep compatibility-sensitive `VIBESCAN_*` settings and the v1 wire contract
  stable unless the change includes an explicit migration plan.

## Local checks

```bash
cd vibescan-go
gofmt -w .
go vet ./...
go test -short -race ./...

cd ../vibescan-ui
npm ci
npm run lint
npm test
npm run build
```

Browser capture tests require Chromium and are skipped by `-short`.

## Pull requests

Keep each pull request focused. Explain the user-visible or operational effect,
the tests run, and any changes to methodology, security posture, deployment, or
data semantics. Screenshots are helpful for material UI changes.

Use either Conventional Commits or the repository's existing
`Area: imperative summary` style consistently. Do not submit source-code changes
until the licensing notice above is removed. Any accepted original Observatory
metadata must be accompanied by explicit agreement that it may be distributed
under CC-BY-4.0 as described in `LICENSING.md`.
