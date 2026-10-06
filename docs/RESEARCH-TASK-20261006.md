# pi-task-next — research decision record (2026-10-06)

Bounded research before implementation. Ground truth: installed
`@earendil-works/pi-coding-agent@1.0.4` declarations + dist runtime, Pi
official extension examples (todo.ts, plan-mode), prior policy-phase API
verification.

## Verified Pi 1.0.4 surfaces relevant to task state

| Surface | Verified semantics |
|---|---|
| `pi.on("context", h)` | Fired before EACH LLM call; handler may append messages (`{ messages }` return or in-place mutation); appended messages are TRANSIENT (per-request, never persisted — consumed by `transformContext` in the agent loop) |
| `pi.appendEntry(type, data)` | Persists a custom entry in the session JSONL on the ACTIVE branch; replayed via `sessionManager.getBranch()` on reopen; branch-sensitive (sibling branches invisible); the C16-proven pattern from pi-context-manager |
| `session_start` | `reason: "startup" \| "reload" \| "new" \| "resume" \| "fork"`; on reopen `getBranch()` returns the full active-branch entry path including custom entries |
| `StringEnum` discriminator | Official pattern (todo.ts) for one-tool-with-action design |
| `pi.events` | Plain EventEmitter; synchronous dispatch; no payload limits; handler throws are caught |
| Pi built-ins | No built-in todo/task tool (tool union: read/bash/powershell/edit/write/grep/find/ls) |

## Candidate decisions

| Candidate | Decision | Rationale |
|---|---|---|
| Pi official `todo.ts` example | **borrow design only** | Its branch-correct replay idea is right, but it stores state in tool-result details keyed to one tool — pi-task-next transitions also originate from EVENTS (job terminal, policy decision) that have no tool result. We generalize: append-only **custom entries** as a uniform branch-scoped mutation log (the C16 pattern from pi-context-manager), replayed on session_start/session_tree. |
| Pi custom entries | **reuse directly** | Canonical mutation log: durable, branch-sensitive, bounded replay, no separate database; survives session reopen; sibling-branch contamination impossible by construction. |
| Pi `context` event | **reuse directly** | The bounded task projection is injected transiently before each LLM call — deterministic bytes (T7), zero transcript growth, nothing to garbage-collect, no-task sessions inject nothing (cacheability §13). |
| Pi `plan-mode` example | reject | Tool-set restriction, not task state. |
| `StringEnum` action discriminator | **reuse directly** | Official pattern for the single `task` tool (schema measured). |
| Adjacent coding-agent task-state designs | **borrow design only** | State-machine + bounded active-view concepts; no code/dependency reuse. |

## Consequence for architecture

Pure core (no Pi imports): explicit state machine, revision-safe store with
deterministic branch replay, bounded projection, checkpoint validation,
dependency-cycle detection, quotas/GC, issue candidates. Pi integration:
one `task` tool (StringEnum discriminator), custom-entry mutation log,
`context`-event projection, `pinx.task.changed` events, consumption of
`pinx.policy.decision` and the new `pinx.runtime.job` contract.
