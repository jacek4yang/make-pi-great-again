# Agent efficiency benchmark

Deterministic, CI-usable measurement of the Agent Body v2 stack's
model-visible efficiency: projection stability (prompt-prefix cacheability),
hygiene/evidence behavior, and tool-schema footprint.

Run from the meta repository root:

```bash
node benchmark/run-benchmarks.mjs                     # merged JSON to stdout
node benchmark/run-benchmarks.mjs --save <label>      # also write benchmark/results/<label>.json
node benchmark/run-benchmarks.mjs --compare <a> <b>   # before/after table
node benchmark/run-benchmarks.mjs --check-determinism # each bench twice, byte-diff
```

## Where the code runs

The benches live **inside the implementation repositories** (no cross-repo
imports) and run through each repo's own tsx + node_modules, like the
conformance runner:

| Repo | Bench | What it measures |
|---|---|---|
| pi-context-manager | `bench/run.ts` | scenarios A/B/C + recall tool schema |
| pi-code-runtime-next | `bench/tool-schema.ts` | scenario D (tool schemas, job wait mechanism) |

Determinism contract: every value that reaches the measured projection is
fixed (timestamps, tool-call ids, usage, content); evidence ref ids are
injected via `EvidenceStore`'s `idFactory` (production stays randomUUID).
Two runs on the same revision produce byte-identical JSON — enforced by
`--check-determinism`.

## Terminology discipline

These are different concepts and are never conflated in reports:

- **prompt-prefix cacheability** — the property that consecutive model
  requests share a long byte-identical prefix. Measured here.
- **stable prefix** — the byte-identical head shared by two serialized
  projections (`commonPrefixBytes` / `commonPrefixRatio`). The primary
  metric. A LOCAL byte metric, not a provider measurement.
- **local resource cache hit** — evidence/recall retrieving locally stored
  bytes (C2/C4 verified). Measured in scenario B (`recallExactMatch`).
- **provider-reported cache hit** — only the provider can report this. The
  stack surfaces provider `cacheRead` usage figures when a provider reports
  them; the benchmark NEVER claims or infers one.

Token figures in this benchmark are **estimated** (chars/4) and labeled as
such; they are never presented as provider-reported.

## Serialization contract

Projected context = `JSON.stringify(SessionManager.buildSessionProjection().messages)`
over a real Pi `SessionManager.inMemory()` — the actual model-visible entries
(message / custom_message / branch_summary / compaction, with context_edit
rewrites applied), UTF-8 bytes.

Known artifact: between consecutive turns the JSON array terminator byte
(`]` → `,`) is the first changed byte. `commonPrefixBytes == bytesA - 1`
therefore means **full** prefix stability; `commonPrefixRatio` is bounded by
this artifact (≈ 0.9998 at these sizes), never above.

## Scenarios

- **A — repeated coding turns** (6 turns): small per-turn read outputs below
  the archive threshold. Measures pure prefix stability of appended turns.
- **B — large read-only output** (19,123-char grep): run through the real
  hygiene pipeline; measures before/after context bytes, evidence retained
  bytes, exact recall match, marker format.
- **C — repeated unchanged state** (4 turns re-reading identical state):
  measures whether repeated exposure destroys prefix stability.
- **D — tool loadout**: per-tool model-visible schema + description bytes,
  exposure/defaultActive, active count; code_job wait mechanism counters
  (status polls required vs wait calls — a mechanism measurement, not a
  model-behavior claim).

## What may legitimately change metrics

Semantic context edits (archiving a large output) legitimately lower the
stable-prefix ratio of the turn that performs them — that is the mechanism
reclaiming context, visible in scenario B (ratio ≈ 0.54 for the rewrite
turn, then stability resumes). Cosmetic/no-op turns must NOT change any
projection byte; this is gated by tests (`[C-STABLE]`) and scenario C.
