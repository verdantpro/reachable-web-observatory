# Provenance

Reachable Web Observatory originated as a Go reimplementation and extension of
the private Python system behind [What’s on HTTP](https://whatsonhttp.com/),
created by [elixx](https://github.com/elixx).

Justin Walters was given access to that system and rewrote its scanner and
collector in Go while preserving the v1 submission protocol, stored-data
compatibility, media hashing behavior, and deterministic service identity. The
later Observatory interface, research framing, analytics, infrastructure, and
independently collected dataset were developed and are maintained by Justin
Walters under Verdant Protocol.

The Go rewrite and subsequent work used AI coding assistance. Justin Walters is
responsible for the changes published in this repository.

The private Python source is not included or quoted here. Representative wire
envelopes and media-hash outputs are retained as test fixtures so compatibility
claims remain executable without publishing the original implementation.

Reachable Web Observatory is not represented as an official successor to What’s
on HTTP. What’s on HTTP remains elixx’s project. Elixx also described its
random-IP agent, HTTP detection, screenshot capture, and backend submission
architecture in the project’s
[public launch discussion](https://news.ycombinator.com/item?id=47431930).

## Contributions at a glance

| Work | Credit |
|---|---|
| What’s on HTTP and its original private Python system | elixx |
| Go scanner and collector reimplementation | Justin Walters, with AI coding assistance |
| Observatory UI, research framing, analytics, and deployment | Justin Walters, with AI coding assistance |
| Observatory observations and aggregate dataset | Independently collected by Reachable Web Observatory |

## Licensing status

Elixx authorized publication of the Go reimplementation, but that authorization
did not specify an open-source license. The repository previously displayed a
blanket MIT notice before authority to license portions based on the original
system under MIT had been documented.

No new source-code license is offered by this repository while downstream
licensing is clarified. The independently collected Observatory metadata and
applicable database rights remain available under CC-BY-4.0. See
[LICENSING.md](LICENSING.md) for the complete rights summary.
