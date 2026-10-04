# Security requirements

Status: normative. Pi extensions run inside the Pi process with the user's OS
permissions; treat this stack as privileged local code.

## Hard prohibitions

Never:

- disable TLS verification or weaken transport security;
- log credentials, tokens, cookies, or full auth payloads;
- send conversation content to any provider not explicitly configured
  (auxiliary-model data-boundary rule, PROVIDER-MODEL.md);
- read/parse/own `auth.json`, OAuth tokens, cookies, or subscription credentials;
- follow unsafe symlinks for persistence (state roots and evidence stores check
  symlink boundaries and refuse traversal outside their root);
- trust repository-controlled paths without validation;
- silently retry destructive actions;
- execute arbitrary shell built from unvalidated configuration strings.

## Required controls

All persistence and execution paths use:

- **bounded reads / bounded writes** — size and count quotas on evidence,
  journals, sources, jobs; over-quota fails closed or truncates per contract;
- **atomic persistence** — temp file + rename, fsync where durability matters;
- **path validation** — every persisted path is resolved, containment-checked
  against its state root, and symlink-refused;
- **explicit ownership/provenance** — every artifact records session id,
  owning entry id, and content hash; retrieval verifies provenance and fails
  closed (C3/C4/C14);
- **cancellation** — every await honors an AbortSignal;
- **timeouts and quotas** — every engine/engine-call/job has a deadline and a
  budget (C8/C9/V11/V13/R7/R8);
- **fail-closed recovery** — uncertain safety falls back to Pi's default
  behavior rather than guessing (V3/V4).

## Dependencies

Before adding any dependency, answer in order:

1. Can current Pi APIs do this?
2. Can Node standard APIs do this?
3. Can a small local implementation do this safely?

Only then add it. Pin development dependencies (lockfile committed; CI uses
`npm ci`). Do not vendor Pi. Do not list host-provided Pi packages in
`dependencies` (peer with `"*"` only).

## Test hygiene

Tests construct disposable Pi homes; no test reads the user's real
`~/.pi/agent`, credentials, or sessions. Fixtures containing provider payloads
must be sanitized before commit.

## Failure transparency

Security-relevant refusals (path escape, provenance failure, quota breach,
unproven capability) surface as explicit errors/events — never silent no-ops.
