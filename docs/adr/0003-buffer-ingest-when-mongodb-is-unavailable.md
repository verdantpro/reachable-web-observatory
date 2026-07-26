# ADR 0003: Buffer ingest when MongoDB is unavailable

Status: Accepted  
Date: 2026-07-26

## Context

Transient database outages should not discard valid, authenticated scanner
submissions or prevent the collector from starting.

## Decision

Persist failed upsert operations as atomically renamed BSON spool files and
flush them after MongoDB recovers. BSON is used so dates and other database
types survive the round trip. Deterministic service identifiers keep retries
idempotent.

## Consequences

The collector can accept and durably queue writes during an outage. Operators
must monitor spool-disk capacity. Tests cover date preservation, successful
flush deletion, and retention while the store is unavailable.
