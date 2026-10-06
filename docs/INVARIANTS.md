# Invariants

Non-negotiable. Every invariant lists the tests that enforce it; a PR that breaks
an invariant test cannot merge, and strictness is never reduced to pass.

## Core invariant (context stack)

> **Recover before summarize. Summarize before discard.**

> No destructive context reduction unless the removed evidence remains recoverable
> from canonical session history or from a verified retrievable artifact.

Canonical session history is never silently deleted: Pi's session JSONL is
append-only and this stack appends `context_edit`/`compaction` entries only.
Enforced by: context invariant tests (below).

## Context manager invariants

| # | Invariant | Test |
|---|---|---|
| C1 | Canonical history is not silently deleted | session file byte-diff before/after hygiene only gains entries |
| C2 | Archived evidence remains retrievable | archive → retrieve roundtrip equals original bytes/hash |
| C3 | Branch A cannot read evidence owned only by sibling branch B | cross-branch retrieval fails closed |
| C4 | Invalid provenance fails closed | corrupted/mismatched ref → error, no partial content |
| C5 | Recent work remains protected | hygiene never touches entries newer than the protected window |
| C6 | Errors are not silently discarded | error tool results never eligible for hygiene |
| C7 | Failed context reduction preserves originals | injected failure → context unchanged, error surfaced |
| C8 | Failed compaction preserves previous usable state | engine failure → prior compaction state still active |
| C9 | Cancelled compaction does not commit | abort during engine → no compaction entry |
| C10 | Provider/model switch invalidates incompatible staged work | staged plan tied to model caps is discarded on switch |
| C11 | Unsupported provider-native compaction falls back safely | probe says no → generic engine, never fake-native |
| C12 | Auxiliary model failure preserves original context | summarize call fails → no reduction committed |
| C13 | Already-summarized content is not recursively summarized without reason | summary-of-summary requires explicit policy flag |
| C14 | Evidence ref corruption is detected | hash mismatch → fail closed |
| C15 | Large artifacts are bounded | > quota writes rejected/truncated per contract |
| C16 | Session reopen restores required continuity state | reopen replays custom entries → checkpoint restored |

## Code runtime invariants

| # | Invariant | Test |
|---|---|---|
| R1 | Stale base revision rejected | edit against old revision → rejected, no commit |
| R2 | Syntax-invalid draft does not execute | parse gate blocks run |
| R3 | Failed source remains repairable | failed run → repair path available |
| R4 | Repair does not pretend to resume instruction pointer | result metadata marks repair-as-new-run |
| R5 | Replay requires explicit authorization/intent | no implicit replay of side-effectful runs |
| R6 | Completed side effects are never automatically replayed | interrupted-after-commit → no auto rerun |
| R7 | Bounded output | output truncation per contract, handle retained |
| R8 | Timeout enforced | long run killed at limit |
| R9 | Cancellation propagates | abort → child processes reaped |
| R10 | Background-job state survives reload | job journal replay → status queryable |
| R11 | UTF-8/CJK correct | multibyte boundaries respected in truncation |
| R12 | CRLF handling explicit | no silent newline rewriting |
| R13 | Windows paths accepted | drive-letter/UNC paths valid where OS allows |
| R14 | Revision integrity | concurrent edit attempts serialized via file mutation queue |
| R15 | Job admission never depends on notification delivery state; pending completion notices are bounded and ackable | backlog-of-30 regression test (pi-codebuffer#9) |
| R16 | Waiting for a running job must not require model-driven polling; wait suspension never cancels the underlying job | [WAIT]-tagged suite (timeout/abort/two-waiters/exactly-once) |

## Recovery invariants

| # | Invariant | Test |
|---|---|---|
| V1 | Safe text prefix restored only when proven | verified boundary → allowed |
| V2 | Safe reasoning prefix restored only when provider supports it | capability probe gates replay |
| V3 | Unsafe tool-call boundary falls back | ambiguous boundary → Pi default retry |
| V4 | Partial tool call never replayed | interrupted mid-call → no replay |
| V5 | Completed tool call boundary handled per policy | completed call → safe prefix or fallback |
| V6 | Multiple consecutive interruptions bounded | attempt counter stops runaway loops |
| V7 | Provider switch invalidates staged recovery | model change → staged prefix discarded |
| V8 | Session reopen restores journal safely | journal replay → state consistent |
| V9 | Journal corruption detected | bad line → fail closed to fallback, not crash |
| V10 | Journal truncation tolerated | partial last line → discard line, continue |
| V11 | Journal quota enforced | over-quota → GC oldest, never unbounded |
| V12 | Cancellation stops recovery | abort honored at every await |
| V13 | Retry budget exhaustion falls back | budget 0 → Pi default behavior, no retry storm |

## UI invariants

| # | Invariant | Test |
|---|---|---|
| U1 | Raw JSON is never the default human presentation | golden fixtures for every tool class |
| U2 | Failures remain visibly failures even when a parent op later succeeds | nested-failure golden |
| U3 | Themes never change semantic meaning of running/success/warning/failure/muted/selected | theme semantic golden set |
| U4 | Visible width handles CJK/wide chars correctly at 80/120/160 cols | width golden set |
| U5 | ASCII/Unicode/Nerd Font modes all render coherently | icon-mode golden set |
| U6 | Estimated tokens never presented as provider-reported | telemetry labels golden |

## Policy invariants (pi-policy-next)

| # | Invariant | Test |
|---|---|---|
| P1 | A policy-sensitive side effect cannot execute before a valid policy decision | gate tests: sensitive tool_call blocked pre-execution; unknown tool blocked; no-UI fail-closed; user_bash replaced by denial |
| P2 | A material action identity change invalidates an existing approval | digest tests: path/recursive/head/method/repo/command changes produce new digests; gate test: changed action requires fresh decision |
| P3 | Approval expiry/denial/cancel cannot be interpreted as allow | expired grant -> require-approval; deny is never stored; session-class grants are class-exact; ledger consume semantics |
| P4 | Unknown high-impact action fails toward approval, never silent allow | unknown class -> require-approval; uncertain shell classification escalates; escalation on doubt |
| P5 | Approval state/events never expose protected-resource contents | event payload audit; notifications carry paths/identity only, never contents |

## Testing rules

- Tests never read the user's real `~/.pi/agent`; they construct disposable homes.
- No paid credentials in core tests; provider paths use deterministic fixtures,
  live tests are separate and opt-in.
- Pi pinned exactly (PI-COMPATIBILITY.md); CI installs that version.
- Golden output changes are intentional: review the diff, update goldens in the
  same PR with rationale.
