# ADR 0001: Preserve the v1 ingest contract

Status: Accepted  
Date: 2026-07-26

## Context

The Go implementation replaced an earlier Python prototype while scanner agents
and stored records already existed. A flag-day protocol migration would have
coupled collector rollout to every agent.

## Decision

Keep the signed, gzip-compressed v1 submission envelope and deterministic
service identity. Preserve representative legacy envelopes and media hashes as
golden fixtures in `internal/transport` and `internal/media`.

## Consequences

Go and older agents can coexist during migration. Compatibility changes require
new fixtures or an explicitly versioned protocol rather than silent drift.
