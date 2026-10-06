# Model-visible volatility audit (Agent Body v2 stack)

Audit of every field the stack emits into **model-visible** context, for
prefix-stability risk. Design goal: **stable information early, volatile
information late**. Nothing here proposes hacks tied to a specific provider
cache implementation; the goal is a naturally deterministic, prefix-friendly
context.

Model-visible surfaces in Pi 1.0.4 (verified from the installed package's
declarations): `message` entries, `custom_message` entries (`pi.sendMessage`),
`branch_summary`, `compaction` summaries, and `context_edit` rewrites applied
during projection. `pi.appendEntry` custom entries are session-file/UI state
only — **never** model-visible (verified: `buildSessionProjection` maps plain
custom entries to `[]`).

## Inventory and classification

| Surface | Repo | Content | Classification | Verdict |
|---|---|---|---|---|
| Hygiene marker `[Archived <kind> output · N chars · ref ev_…]` | context-manager | kind, size, ref id, ≤200-char head preview | **semantically required in hot context** (ref id = retrieval identity) | Keep. No timestamp, no session id, no volatile status. Written once by a `context_edit`, then immutable. Gated by `[C-STABLE]` tests. |
| Marker head preview (first line, ≤200 chars) | context-manager | content slice | retrieval aid | Keep — deterministic slice, stable after write. |
| `pinx_recall` tool result | context-manager | archived content page | retrieval-only (late by construction — only appears when the model calls it) | Keep. No timestamps in output. |
| Deterministic compaction record | context-manager | tool counts, error heads, span heads | **useful, lives late** (appears only at a compaction boundary) | Keep. Zero timestamps. |
| `context.archived` / `pinx.context.status` / `pinx.activity` / `pinx.recovery` events | context-manager, recovery, runtime, ui | timestamps, counters, generation | **UI-only** (EventBus → terminal widget) | Keep out of model context. Never sent to the model. |
| Runtime tool result trailer `[node exited with code N · … in X.Xs]` | runtime | durationMs | **useful but lives late** — inside the tool result it belongs to; older turns are never rewritten | Keep. Does not affect cross-turn prefix stability. |
| Background job notification `[background jobs] ✓ label (runtime) completed · exit 0 · 1.2s` | runtime | durationMs, exit codes | **useful, lives late** (delivered at `agent_settled`, appended at the tail of context) | Keep. |
| Recovery continuation injection `[recovery] … verified completed prefix …` | recovery | static instruction + verified prefix text | **semantically required, lives late** (appended at the END of the message list, transient per LLM call) | Keep. `Date.now()` timestamp sits on the injected message — the tail, not the prefix. |
| Working-set annotation (`Classification.workingSet`) | context-manager | deterministic category | internal observability | Never model-visible. Reserved for future task-aware policy. |

## Findings and actions taken

1. **No volatile field was found in the early model-visible prefix.** The
   stack already keeps volatile data (timestamps, durations, counters) in
   UI-only events or in late, append-only messages.
2. **The one structural prefix cost was early tool declarations.** A tool
   registered active is declared to the model from turn 0 even when it can
   do nothing yet. Fixed for `pinx_recall`: registered `defaultActive:false`
   (Pi public API) and activated deterministically exactly when evidence
   exists — session_start restore or first archive commit. Fresh sessions
   shed 424 bytes of model-visible tool declarations; no capability is lost
   because recall has nothing to retrieve before evidence exists.
3. **Marker format tightened by contract tests** (`[C-STABLE]`): exact
   string, no ISO timestamps, no time-of-day, round-trip parse.
4. **Double-run byte-stability gate** (`[C-STABLE]`): the same semantic
   session through the real SessionManager + hygiene pipeline twice must
   serialize byte-identically (evidence identity injected).
5. **Generation discipline verified**: `context generation` increments only
   when a hygiene batch actually commits (plan non-empty); no-op turns
   append nothing (regression-tested in the C16 suite and loadout tests).

## What was deliberately NOT changed

- Evidence ref id randomness: identity, not semantics; it lives inside a
  marker written once, so it does not churn the prefix.
- Per-turn tool-result durations: they belong to their own turn and older
  turns are never rewritten.
- Runtime tool schemas (6 tools, 3,127 schema bytes): every tool is a
  discovery entry point (`code_job`/`code_buffer` are the only ways to start
  jobs/buffers; `code`/`node`/`python`/`bash` are the primary execution
  surfaces). Hiding any of them would remove a capability the model needs on
  an arbitrary first turn — no deterministic condition exists that does not
  lose capability. Re-measured and documented instead.
