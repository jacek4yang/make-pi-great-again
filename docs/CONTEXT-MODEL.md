# Context model (pi-context-manager)

Status: normative for `pi-context-manager`.

The product is **context management and session continuity** — compaction is one
engine at the bottom of the stack, not the product.

## Layer stack

```text
Context Observability
        ↓
Context Hygiene            (deterministic, zero-model)
        ↓
Recoverable Evidence       (bounded, branch-aware refs)
        ↓
Semantic Reduction         (batch-level, model-backed)
        ↓
Continuity Checkpoints     (live task state)
        ↓
Compaction Engines         (pluggable: generic/native/hybrid)
        ↓
Recall                     (bounded retrieval tools)
        ↓
Optional Long-term Memory  (default off)
```

Fundamental invariant (test-enforced, see INVARIANTS.md):

> Recover before summarize. Summarize before discard.
> No destructive context reduction unless the removed evidence remains
> recoverable from canonical session history or from a verified retrievable artifact.

## Layer 1 — observability

An inspectable context model, estimated/classified whenever Pi exposes enough
information: system, user, assistant text, reasoning, tool calls, tool results,
summaries, memory, recent, protected, reclaimable, recoverable.

Rules: never present byte counts as tokens; never present estimated tokens as
provider-reported; the presentation model distinguishes `estimated` vs
`provider-reported` (from `ctx.getContextUsage()`). The model is derivable from
`ctx.sessionManager.buildSessionProjection()` plus tool-result metadata — it
never mutates context.

## Layer 2 — deterministic hygiene

Zero-model reductions run before any LLM summarization.

Eligible: superseded read results, old successful grep/find/ls output, large
completed build logs, repeated diagnostics, old read-only tool results,
duplicated already-consumed output.

Protected (never touched): errors and failed commands, recent work (rolling
window), active checkpoints, user constraints/instructions, tool calls required
for provenance, mutating operations, unknown/unsafe tool output.

Mechanism: append-only `context_edit` entries (Pi-native) replacing eligible
content with bounded evidence markers:

```text
[Archived bash output · 18k chars · ref ctx_42]
$ npm test
PASS 143
```

The original evidence remains retrievable (Layer 3). Hygiene batches prefer
prefix-stable boundaries (cache discipline, PROVIDER-MODEL.md).

## Layer 3 — evidence store

Stable evidence references (`EvidenceRef`) with required properties:

- bounded (size/time quotas enforced at write),
- branch-aware and session-aware (ref records session id + owning entry id),
- content-verified (content hash),
- no sibling-branch leakage (retrieval checks ref ownership against the
  current branch path),
- no arbitrary filesystem traversal (refs are store IDs, not paths),
- fail closed on invalid provenance.

Operations: `read ref`, `search refs`, `inspect ref metadata`, `retrieve
paginated original output` — exposed as registered tools and as contract events
for the UI.

## Layer 4 — semantic reduction

Absorbs the useful ideas of pi-context-prune, improved: reduce **completed
logical work batches**, not arbitrary individual messages; prefer structured
summaries over prose:

```ts
interface BatchSummary {
  purpose: string;
  findings: string[];
  decisions: Decision[];
  changedFiles: FileChange[];
  tests: TestEvidence[];
  failures: FailureEvidence[];
  unresolved: string[];
  evidenceRefs: EvidenceRef[];
}
```

Original evidence stays available; already-summarized content is not
recursively summarized without explicit policy (C13); native
compaction/checkpoint boundaries cap how far back reduction may reach;
cache-aware scheduling applies (PROVIDER-MODEL.md).

## Layer 5 — continuity checkpoints

A checkpoint is live task state, **not** long-term memory:

```ts
interface ContinuityCheckpoint {
  goal: string[];
  constraints: string[];
  decisions: Decision[];
  completed: Milestone[];
  pending: Milestone[];
  blockers: Blocker[];
  files: FileState[];
  tests: TestEvidence[];
  evidenceRefs: EvidenceRef[];
}
```

Checkpoints survive long sessions, compaction, reopen, branch navigation, and
context reduction. They never duplicate the transcript; they reference evidence.
Persisted via `custom` entries (`pi.appendEntry`) with bounded external
artifacts when oversized; restored on `session_start` from
`ctx.sessionManager.getBranch()`.

## Layer 6 — compaction engines

Clean engine contract:

```ts
interface CompactionEngine {
  probe(ctx: RuntimeContext): CapabilityResult;   // can this engine run now?
  plan(ctx: RuntimeContext): CompactionPlan;
  compact(plan: CompactionPlan): Promise<CompactionResult>;
}
```

Initial engines: `generic-verified` (default), `deterministic` (fast path),
`provider-native` (behind capability adapter), `hybrid`. The stable
`pi-codex-native-compaction` is a **reference implementation** for one adapter,
not the product boundary; the core is never named after a provider. If the
native adapter's probe fails, another configured engine runs — native support is
never faked (C11).

Engines integrate through Pi's `session_before_compact` (custom compaction
return) and boundary drafts (`turn_end`/`agent_before_settle`).

## Layer 7 — optional memory

Not overbuilt initially. Separated: working context / session continuity /
project memory / cross-session memory. No always-running LLM workers by default;
light, local, recoverable, understandable; independently disableable.

## Session continuity

Restored on `session_start` (all reason kinds) by replaying the branch's
custom entries: checkpoints, pending evidence metadata, engine state. Reopen
must restore required continuity state (C16).
