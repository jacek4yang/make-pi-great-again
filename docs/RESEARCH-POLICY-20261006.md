# pi-policy-next — research decision record (2026-10-06)

Bounded research before implementation (per Agent Body v2 execution order).
Ground truth: installed `@earendil-works/pi-coding-agent@1.0.4` declarations;
Pi official extension examples; no exhaustive ecosystem survey.

## Verified Pi 1.0.4 public interception surfaces

| Surface | Semantics (verified in 1.0.4 d.ts + dist) |
|---|---|
| `pi.on("tool_call", h)` | Fired BEFORE every tool execution; handler awaited; returns `{ block?: boolean, reason?: string, terminate?: boolean }`; `event.input` mutable in place; **handler failure blocks (fail-safe)**; enforced in agent loop `beforeToolCall` |
| `pi.on("user_bash", h)` | For `!`/`!!` direct shell; cannot "block" by flag — blocks by returning `{ result: <denial BashResult> }` (full replacement) or throwing |
| `ctx.isProjectTrusted()` | Public boolean; only public read of current trust state |
| `pi.on("project_trust", h)` | Extension can own the trust decision (`{ trusted: "yes"/"no"/"undecided", remember? }`) — NOT used by policy (we integrate, not duplicate) |
| `ctx.ui.confirm/select/input` | Promise-returning, dialog-capable; awaited inside `tool_call` ⇒ the agent turn parks while the dialog is open (event-driven resume, no polling) |
| `tool_execution_start` | Observation-only (return value discarded) — NOT an enforcement point |

## Candidate decisions

| Candidate | Decision | Rationale |
|---|---|---|
| Pi official `permission-gate.ts` example | **borrow design only** | Correct primitive (`tool_call` + `ctx.ui.select` + `{ block: true }`), but its regex matching (`rm -rf`, `sudo`, `chmod 777`) is too narrow for a policy engine. We keep the primitive, replace the matching with structured classification. |
| Pi official `protected-paths.ts` example | **borrow design only** | Hard-block on protected paths via `tool_call` is exactly P-invariant shape; we generalize to configurable protected resources with normalized paths. |
| Pi official `confirm-destructive.ts` example | reject | Targets `session_before_switch`/`session_before_fork`, not tool gating; out of policy scope. |
| Pi official `plan-mode` example | **borrow design only** | Coarse tool-set restriction (`setActiveTools`) complements per-call gating; recorded as a future capability, not used in v1 (avoid approval-fatigue/toggle bloat). |
| Pi official `sandbox` example | reject | OS-level sandboxing is a different layer (execution isolation, not authorization); would add platform-specific dependency cost. |
| Pi `project_trust` mechanism | **reuse directly** | Policy consumes `ctx.isProjectTrusted()`; never re-prompts for trust. Trust reduces friction for in-workspace edits but never auto-allows high-impact classes. |
| `BashSpawnHook` (`createBashTool` wrapping) | reject for v1 | Belongs to the runtime owner's execution path; policy gates via `tool_call` observation of `bash` inputs. Documented as a future adapter if bypass analysis requires it. |
| Adjacent closed coding-agent permission modes (allow/ask/deny) | **borrow design only** | Conceptual model (decision enum + material-action identity + scope grants); no code or dependency reuse (not open source). |
| npm permission middleware packages | reject | None maintained against Pi 1.0.4's extension API; all would be adapters around the same two events. |

## Consequence for architecture

One enforcement primitive (`tool_call`), one direct-shell primitive
(`user_bash`), one trust read (`isProjectTrusted`), blocking dialogs for
approval (turn parks; no polling loop). Everything else — taxonomy,
normalization, digest, decision, grants — lives in a pure deterministic core
with no Pi imports, unit-testable on Windows and Linux alike.
