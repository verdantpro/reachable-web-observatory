# ADR 0002: Embed the UI and serve it same-origin

Status: Accepted  
Date: 2026-07-26

## Context

The production host is intentionally small. A separate Node service and static
deployment would add another release artifact, origin, and failure mode.

## Decision

Build and prerender the React application in the multi-stage container build,
embed the resulting files with `go:embed`, and serve UI, ingest, and read APIs
from one Go process and origin.

## Consequences

Production needs no Node runtime and browser API calls need no CORS. The public
read API retains a permissive CORS header for development and external research
clients. Deployment must verify both binary identity and embedded prerendered
content, because an API-only health check cannot detect a placeholder UI.
