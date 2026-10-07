# Cross-repository contracts

Status: normative. Implementation repositories define their own types matching
these shapes; fixtures in `../fixtures/` validate producer output and consumer
tolerance. No runtime import coupling.

## Namespacing

All identifiers owned by this stack use the `pinx` prefix:

| Kind | Pattern | Example |
|---|---|---|
| Event bus channel | `pinx.<domain>.<event>` | `pinx.context.changed` |
| Custom entry `customType` | `pinx.<domain>.<kind>` | `pinx.context.checkpoint` |
| Tool result `details.shape` marker | `pinx.<domain>` | `details.shape = "pinx.exec"` |
| State directory | `<pi-agent-dir>/pinx/<repo>/…` | `pinx/context-manager/evidence/` |

`pinx` is reserved by this stack; the stable stack's identifiers are documented
in `docs/REFERENCE-PROJECTS.md` and are never reused.

Consumer rule: unknown `pinx.*` versions and unknown producers are skipped, not
errors. Producers increment `v` when a shape changes additively; breaking shape
changes change the kind name.

## 1. Activity events (producers → UI, event bus `pinx.activity`)

Emitted by context-manager, code-runtime, recovery for high-level operations
the UI must render without parsing prose:

```ts
interface PinxActivityEvent {
  v: 1;
  kind:
    | "context.archived"        // { chars, ref, preview? }
    | "context.hygiene"         // { candidates, replaced, protectedCount }
    | "context.compactionPlanned" | "context.compactionApplied"
    | "context.checkpoint"      // { checkpointId, summaryLine }
    | "recovery.replayedPrefix" // { boundary: "text"|"reasoning", entries: number }
    | "recovery.fallback"       // { reason }
    | "exec.revisionRepaired"   // { sourceId, fromRev, toRev }
    | "exec.jobCompleted"       // { jobId, status }
    | "exec.jobFailed";         // { jobId, status, reason }
  operationId?: string;         // correlates with tool_execution_start toolCallId when applicable
  summary: string;              // one human line, ≤ 100 chars
  detail?: Record<string, unknown>; // typed per kind, rendered at Level 2+
  ts: number;                   // epoch ms
}
```

UI renders `summary` verbatim and `detail` per kind tables. Unknown kinds render
as generic notices.

## 2. Context status snapshot (context-manager → UI, bus `pinx.context.status`)

```ts
interface PinxContextStatus {
  v: 1;
  contextWindow: number | null;   // provider-reported when known
  usedTokens: { value: number; source: "provider-reported" | "estimated" };
  breakdown: Array<{
    label: "workingSet" | "recent" | "protected" | "recoverable" | "reclaimable";
    tokens: number; source: "estimated" | "provider-reported";
  }>;
  activeEngine?: string;          // engine id, e.g. "generic-verified"
}
```

UI never invents subtotals; when this event is absent it falls back to Pi's own
context meter.

## 3. Evidence reference (persisted; referenced from context_edit markers,
   batch summaries, checkpoints)

```ts
interface PinxEvidenceRef {
  v: 1;
  id: string;            // store-relative id, e.g. "ev_01H…"
  sessionId: string;     // owning session
  entryId: string;       // owning session entry (provenance)
  sha256: string;        // of archived content
  bytes: number;
  mime?: "text/plain" | "text/x-diff" | "application/json";
  preview?: string;      // ≤ 240 chars head
  createdAt: string;     // ISO 8601
}
```

Inline marker format used inside replacement content:

```text
[Archived bash output · 18k chars · ref ev_01H…]
```

Retrieval contract: `pinx.evidence.read` (tool, context-manager) takes
`{ ref: PinxEvidenceRef | id, offset?, limit? }`; fails closed on any
provenance/hash/branch mismatch.

## 4. Checkpoint (persisted as `custom` entry, customType `pinx.context.checkpoint`)

```ts
interface PinxCheckpointData {
  v: 1;
  checkpointId: string;
  atEntryId: string;
  goal: string[];
  constraints: string[];
  decisions: Array<{ decision: string; rationale?: string }>;
  completed: string[];
  pending: string[];
  blockers: string[];
  files: Array<{ path: string; state: "read" | "modified" | "created" }>;
  tests?: Array<{ name: string; status: "pass" | "fail"; note?: string }>;
  evidenceRefs: PinxEvidenceRef[];
}
```

## 5. Execution metadata (code-runtime tool `details`, shape `pinx.exec`)

```ts
interface PinxExecDetails {
  v: 1;
  shape: "pinx.exec";
  sourceId?: string;      // retained source handle
  revision?: number;
  runtime?: "node" | "python" | "bash" | "quickjs";
  calls?: number;         // nested tool calls made
  durationMs?: number;
  jobId?: string;         // when backgrounded
  repairedFrom?: number;  // revision this run repaired
  replay?: boolean;       // true only for explicitly authorized replays
}
```

UI uses these fields for the compact `✓ code · revision 7 · 8 calls · 3.4s`
line; unknown fields are ignored.

## 6. Recovery state (recovery → UI, bus `pinx.recovery`; journal internal)

```ts
interface PinxRecoveryStatus {
  v: 1;
  state: "idle" | "observing" | "recovering" | "fallback" | "exhausted";
  attempt?: number;
  maxAttempts?: number;
  boundary?: "text" | "reasoning" | "none";
  reason?: string;        // bounded, human-readable
}
```

## 7. Telemetry (any producer → UI, bus `pinx.telemetry`)

```ts
interface PinxTelemetrySample {
  v: 1;
  metric: "ttft" | "tps" | "toolDuration" | "generationDuration" | "streamStall"
        | "cacheRead" | "cacheWrite";
  value: number;
  source: "provider-reported" | "measured" | "estimated";
  unit: "ms" | "tok/s" | "tokens" | "count";
  scope?: string;         // e.g. toolCallId
  ts: number;
}
```

UI labels every figure with `source` (U6). Unknown metrics are ignored.

## 8. Policy events (policy -> UI/audit, buses `pinx.policy.request` / `pinx.policy.decision`)

Emitted for every policy-evaluated action. **Never** injected into model
context; routine ALLOW decisions stay below model reasoning (cacheability).
Payloads carry material identity only — never protected-resource contents.

```ts
interface PinxPolicyRequest {
  v: 1;
  digest: string;            // SHA-256 over the canonical ApprovalIntent
  actionClass: string;       // taxonomy class, e.g. "recursive-delete"
  op: string;                // operation verb
  tool: string;              // originating tool name
  source: "tool" | "user-bash";
  paths: string[];           // canonical, sorted
  recursive: boolean;
}

interface PinxPolicyDecision {
  v: 1;
  digest: string;            // same digest as the request
  decision: "allow" | "deny" | "require-approval";
  reason: string;            // shown to human on approval, to model on block
  actionClass: string;
  tool: string;
}
```

The `digest` is the approval identity (P2): any material change (path set,
recursive flag, git/GitHub ref, command) yields a different digest and a new
decision. Denials are never persisted as grants (P3).

## 9. Job terminal state (code-runtime -> consumers, bus `pinx.runtime.job`)

Emitted exactly once per background job when it reaches a terminal state.
Consumed by pi-task-next to resolve waiting tasks without polling.

```ts
interface PinxRuntimeJobTerminal {
  v: 1;
  jobId: string;
  label: string;
  runtime: "node" | "python" | "bash";
  state: "completed" | "failed" | "cancelled" | "timeout";
  exitCode: number | null;
}
```

## 10. Task events (task -> UI/audit, bus `pinx.task.changed`)

Emitted for every committed task mutation. **Never** injected into model
context; the model sees task state only through the bounded `context`-event
projection and task tool results.

```ts
interface PinxTaskChanged {
  v: 1;
  taskId: string;
  displayId: string;         // short id used in projection (T3, ...)
  revision: number;
  state: "todo" | "in_progress" | "waiting" | "blocked" | "done" | "cancelled";
  waitingKind?: "job" | "approval" | "ci" | "external";
  reason?: string;           // bounded operational reason
}
```

Task waiting identity binds to the policy action digest (`approval`) or the
runtime jobId (`job`) — resolution requires an exact match (P2/T3).

## 11. GitHub events (github -> UI/task, buses `pinx.github.resource.changed` / `pinx.github.mutation`)

`pinx.github.resource.changed` reports cache outcome semantics (memory-hit /
conditional-hit / network-fetch + snapshot id) for diagnostics — never model
context. `pinx.github.mutation` carries durable side-effect truth consumed
by pi-task-next for explicit issue-candidate promotion.

```ts
interface PinxGithubMutation {
  v: 1;
  operationId: string;       // journal operation id (reconciliation handle)
  operation: string;         // create_issue | comment | merge_pr | ...
  repository: string;        // owner/name
  state: "started" | "completed" | "failed" | "cancelled" | "unknown";
  resultRef?: string;        // gh:* ref once known
  issueCandidateId?: string; // promotion boundary: local candidate to mark promoted
}
```

Bounded identity only — no bodies, no credentials (G7).

## 13. CI events (ci -> UI/task, buses `pinx.ci.watch` / `pinx.ci.progress` / `pinx.ci.terminal`)

Versioned, structured, no human-text parsing. Progress is coalesced
(state/job-count changes only) and belongs to the UI — never model context.
`pinx.ci.terminal` resolves pi-task-next waiting(kind=ci) tasks.

```ts
interface PinxCiTerminal {
  v: 1;
  watchId: string;
  state: "success" | "failure" | "cancelled" | "skipped" | "neutral" | "superseded";
  resultRef?: string; // gh:run:<id> or watch failure-digest ref
}
```

Watch persistence is bounded (16 active / 64 terminal) and never trusted
over remote truth after reopen.

## Channel mechanics

Producers publish via `pi.events.emit(channel, payload)`; the UI subscribes on
`session_start` and unsubscribes on `session_shutdown`. Payloads are plain
JSON-serializable objects validated defensively by the consumer (size caps,
unknown-field tolerance). Bus events are not persisted; durable state uses the
custom entries / refs above.
