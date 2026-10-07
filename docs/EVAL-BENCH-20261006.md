# Evaluation — Agent efficiency baseline & first cacheability optimizations (2026-10-06)

Phase: performance/cacheability baseline + first real context & tool-loadout
optimizations (Agent Body v2 execution, phases 1A–1M). Pi pin: **1.0.4**
(latest stable, verified against npm at session start).

## Revisions measured

| Repo | Baseline branch/SHA | After SHA |
|---|---|---|
| pi-context-manager | `feat/cacheability-baseline` @ d470b5d | a56cf07 |
| pi-code-runtime-next | `feat/tool-schema-bench` @ 376e92d | cacf586 |

Baseline = the commits that add the benchmark infrastructure but none of the
optimizations. `benchmark/results/baseline.json` / `after.json` are the raw
merged results (byte-identical across repeated runs — enforced by
`--check-determinism`).

## Methodology

See [benchmark/README.md](../benchmark/README.md). In one sentence: real Pi
`SessionManager.inMemory()` projections over deterministic fixtures, real
hygiene/evidence/recall pipeline, byte-accurate stable-prefix comparison
(`src/core/cacheability.ts`), per-run byte-diff determinism gate.
Terminology: **stable prefix** is a local byte metric; it is evidence of
prompt-prefix cacheability and is **not** a provider cache-hit rate — only
the provider can report that, and none of these numbers claim one. Token
figures are estimates (chars/4), labeled as such.

## Before / after

| Metric | Before | After | Change |
|---|---:|---:|---:|
| projected context bytes (A, final turn) | 23979 | 23979 | — |
| estimated projected tokens (A, final turn) | 5995 | 5995 | — |
| stable prefix bytes (A, avg consecutive) | 12086 | 12086 | — |
| stable prefix ratio (A, avg) | 0.999888 | 0.999888 | — |
| stable prefix ratio (C, avg) | 0.999888 | 0.999888 | — |
| first changed byte (A, final pair) | 20014 | 20014 | — |
| model-visible tool calls (A) | 6 | 6 | — |
| tool-result original bytes (A) | 16680 | 16680 | — |
| archives (B) | 1 | 1 | — |
| recalls (B) | 1 | 1 | — |
| context bytes before hygiene (B) | 21231 | 21231 | — |
| context bytes after hygiene (B) | 1507 | 1507 | — |
| model-visible result bytes after archive (B) | 220 | 220 | — |
| recall exact match (B) | true | true | — |
| active tool count (context-manager, fresh session) | 1 | 0 | −1 |
| model-visible tool bytes (context-manager, fresh session) | 424 | 0 | −424 |
| tool schema bytes (code-runtime) | 3127 | 3127 | — |
| tool total bytes incl. descriptions (runtime) | 4426 | 4426 | — |
| active tool count (runtime) | 6 | 6 | — |
| code_job status polls required | 0 | 0 | — |
| code_job wait calls | 1 | 1 | — |

Projection metrics are **unchanged by design**: the optimization work touched
tool declarations and observability, not projection content — identical
numbers are the regression proof that no correctness invariant moved.
The one improvement is the fresh-session tool block: `pinx_recall` no longer
occupies the model-visible tool block until evidence exists (−424 bytes on
every fresh session; restored automatically at the first archive).

## Baseline findings (now measured, previously unquantified)

- **Repeated coding turns (A):** avg stable-prefix ratio 0.999888 —
  effectively full prefix stability across consecutive turns (the sole
  changed byte is the JSON array terminator artifact, see README).
- **Large read-only output (B):** 21,231 → 1,507 projected bytes (−93%,
  ~5,308 → ~377 estimated tokens) by archiving one 19,189-char grep output
  to the evidence store; marker is 220 bytes + 139-byte head preview;
  recalled content is sha256-exact (`recallExactMatch: true`); stable prefix
  before the rewrite point: 821 bytes, then stability resumes.
- **Repeated unchanged state (C):** ratio 0.999888 — repeated exposure of
  the same state does not churn the projection (nothing re-renders it).
- **Tool footprint (D):** runtime stack 6 tools / 3,127 schema bytes /
  4,426 bytes incl. descriptions; `code_buffer` (1,871) and `code_job`
  (1,343) dominate. Context-manager adds `pinx_recall` (424 bytes) — now
  conditional. code_job wait mechanism: 0 status polls, 1 wait call.

## Implemented behavior (this phase)

1. **Cacheability analyzer** — `pi-context-manager/src/core/cacheability.ts`:
   byte-accurate `compareProjections` / `compareProjectionSeries` + 9 tests
   (identical, tail, early change, CJK byte-boundary subtleties, 1 MiB perf,
   empty, binary-safe).
2. **Deterministic loadout optimization** — `pinx_recall` registered
   `defaultActive: false` (Pi public API), activated deterministically when
   evidence exists (`session_start` restore / first archive commit);
   `PINX_RECALL_ALWAYS=1` operator override. Failure path: logged via
   `pinx.activity`, retried next turn boundary — no capability loss.
3. **Working-set annotation** — deterministic `Classification.workingSet`
   (must-keep / active / archivable; recent / summarizable / cold-evidence
   reserved). Annotation only; dispositions and C5/C6 protections unchanged.
4. **Instrumentation** — `context.archived` activity now carries
   `modelVisibleChars` alongside original `chars`.
5. **Regression gates** — `[C-STABLE]` double-run byte-identity over the
   real pipeline; timestamp-free marker contract; `[C-LOAD]` activation
   lifecycle; `[C-WS]` working-set conservatism.
6. **Benchmark infrastructure** — per-repo benches + meta runner with
   determinism check and before/after comparison (this document).

## Tool classification (scenario D audit)

| Tool | Bytes (schema+desc) | Class | Action |
|---|---:|---|---|
| code | 307 | always useful | keep active |
| node | 298 | runtime-specific (redundant surface of `code`) | keep active — no deterministic hide condition that preserves first-turn capability |
| python | 297 | runtime-specific | keep active (same rationale) |
| bash | 310 | always useful | keep active |
| code_job | 1343 | runtime-specific (job entry point) | keep active — discovery entry point |
| code_buffer | 1871 | runtime-specific (buffer entry point) | keep active — discovery entry point |
| pinx_recall | 424 | context-specific | **conditional via `defaultActive:false` + deterministic activation** |

Pi public APIs used: `registerTool` `defaultActive` (types.d.ts:478),
`setActiveTools` / `getActiveTools` (types.d.ts:1249–1256), `getAllTools`
semantics, `ToolExposure` docs. No private APIs.

## Honest notes

- The stable-prefix ratios are bounded above (≈ 0.9998 at these sizes) by
  the JSON serialization terminator artifact — real provider requests have
  a similar array terminator; the metric is still exact for detecting churn.
- No provider-reported cache numbers exist for these scenarios; none are
  claimed. Provider-reported figures would come from `usage.cacheRead` in
  live runs and are out of scope for a deterministic benchmark.
- Runtime tool schemas were measured but not reduced: every remaining tool
  is a discovery entry point whose absence would break first-turn
  capability. Documented rather than forced.

## After pi-policy-next integration (2026-10-06)

The same deterministic benchmark was rerun after adding pi-policy-next to the
stack (`--compare after after-policy`): **every metric is unchanged** —
stable-prefix ratios, projected context bytes, tool schema bytes, tool
counts, hygiene behavior. Policy contributes zero steady-state prompt
overhead by construction: it registers no tools, injects nothing into model
context, and communicates only via `pinx.policy.*` EventBus events plus a
tool error when a call is actually blocked. Measured per-call policy cost
(`pi-policy-next/bench/policy-overhead.ts`): allow decision ≈ 0.06 µs, shell
classification ≈ 0.9 µs, intent digest ≈ 3 µs — no LLM anywhere on the
policy path.

`benchmark/results/after-policy.json` records the run (pinned at cm a56cf07 /
rt cacf586 / policy f43e3b3a…).

## After pi-task-next integration (2026-10-06)

Rerun after adding pi-task-next and the `pinx.runtime.job` contract
(`--compare after-policy after-task`): **every core-stack metric unchanged**
— the task layer injects its bounded projection transiently via the Pi
`context` event and registers its tools separately, so the deterministic
core benchmark is untouched. Task-layer costs, measured in
`pi-task-next/bench/task-projection.ts` (`benchmark/results/after-task.json`
records the core rerun):

- no tasks: 0 model-visible bytes injected;
- stable active task: 59 bytes, byte-identical across turns;
- state change: first diff at the task-block boundary (injected tail);
- completed task: leaves hot projection (50 → 0 bytes);
- waiting task: 71 bytes with typed reason;
- reopen restore: identical projection, ~20 µs per full log replay;
- tool schemas: task 1,675 B + issue_candidate 518 B (default-active by
  design — long-horizon discoverability from turn 0);
- long-horizon soak: 630 transitions, 6 reopen cycles, terminal GC bounded
  at 50, checkpoints bounded at 8, zero stuck waiting tasks, replay-safe
  mutation log (a store aliasing bug was caught and fixed by this soak).

## After pi-github-next integration (2026-10-07)

Core-stack benchmark rerun (`--compare after-task after-github`): **every
metric unchanged** — the GitHub layer registers one tool, injects nothing
into model context, and its cache/health state is UI-only. GitHub-specific
measurements (`pi-github-next/bench/workload.ts`, `bench/soak.ts`):

- Scenario A — 10 identical logical PR reads → **2 underlying API calls**
  (8 full transfers avoided); 9 compact `unchanged` results (224 B → 58 B);
- Scenario B — 3 concurrent consumers → **2 API calls** (4 naive requests
  saved), single-agreed snapshot;
- Scenario C — external change detected via TTL expiry → If-None-Match
  revalidation → fresh data (no stale memory serve);
- Scenario D — mutation invalidates affected cache; post-mutation read is a
  network fetch, never a stale memory hit;
- Scenario E — issue-candidate promotion: exactly one mutation, durable
  journal record, task layer receives only the `gh:issue:*` ref;
- Scenario F — uncertain outcome reconciled: one dropped send + one
  proven-safe retry = **zero duplicate mutations**, journal survives reopen;
- Soak — 800 reads + 400 burst callers + 33 mutations: cache bounded
  (11 entries / 724 B), journal bounded (31 records), singleflight leak-free,
  zero unhandled rejections.

## After pi-ci-next integration (2026-10-07)

Core-stack benchmark (`--compare after-github after-ci`): **unchanged** —
CI progress never enters model context (I10); the ci tool injects nothing
into hot state. CI-layer measurements (`pi-ci-next/bench/orchestration.ts`,
`bench/soak.ts`):

- single long CI run: **5 model calls → 1** (internal adaptive polls: 5);
- 8-repo release barrier: **24 model calls → 1** (wait_all collect-all;
  10 underlying API requests);
- failure diagnosis: **6,428 → 212 model-visible bytes** (marker-selected
  excerpts, 2 API calls instead of whole-log injection);
- soak: 890 watches (300 sequential + 400 barrier callers + 100 supersede
  storms + 40 timeouts + 100 fault waits) + 20 failure digests — bounded
  registry (79 watches), no stuck waits, no duplicate terminal events,
  transient-fault waits surfaced as bounded errors, zero unhandled
  rejections.

Publication note (§8): all eight Agent Body repositories are PUBLIC as of
this session (audit: docs/PUBLICATION-AUDIT-20261007.md); the Actions
billing blocker persisted post-publication and requires owner action —
docs/CI-BLOCKER-20261007.md.

## Next phase

NEXT PHASE: pi-fs-next (final productization repository per
docs/ROADMAP-PRODUCTIZATION.md). Do not start it before the owner reviews
these branches.
