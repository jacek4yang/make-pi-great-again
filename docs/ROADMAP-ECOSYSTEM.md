# Ecosystem roadmap — phase: orchestration & productization (2026-10-06)

Status: **planned, not implemented.** This document records the owner directive
for the next phase so it survives across sessions. Nothing in this document is
implemented yet; do not cite it as current capability.

## Objective

Eliminate model-token waste caused by orchestration (CI checks, sleeps,
repeated GitHub/PR/state queries). Waiting, polling, caching, state
synchronization, progress tracking, and repeated GitHub queries belong in the
runtime — not in model reasoning.

## Planned plugin split (each a separate repository, ownership frozen)

| Repo | Ownership |
|---|---|
| `pi-policy-next` | Approval policy, sensitive-operation classification, scoped authorization, protected resources, policy decisions |
| `pi-task-next` | Durable agent task/TODO state, blockers, waiting state, hierarchy, issue candidates |
| `pi-github-next` | GitHub resource access (repo/PR/issue/review/release), caching (ETag/singleflight), rate limits, mutation journal |
| `pi-ci-next` | CI systems (GitHub Actions first), wait/wait_all barriers, failure digests, artifacts, policy-controlled mutations |
| `pi-fs-next` | Structured filesystem inspection (stat/list/tree/usage) + safe delete with dry-run and approval integration |

## Planned contract families (versioned, in integration/CONTRACTS.md when implemented)

`pinx.policy.request` · `pinx.policy.decision` · `pinx.task.changed` ·
`pinx.github.resource.changed` · `pinx.github.mutation` · `pinx.ci.watch` ·
`pinx.ci.progress` · `pinx.ci.terminal` · `pinx.runtime.job` ·
`pinx.runtime.outcome` · `pinx.context.generation` · `pinx.recovery` ·
`pinx.stack.health`

## Key invariants to add when implemented

- Approval-sensitive action cannot execute before a policy decision.
- Approval is invalid if the material action identity changes (e.g. PR head SHA).
- Job/CI completion waiting must not require model-driven polling.
- CI wait is pinned to immutable target identity (repo + commit SHA).
- Truncated output is never silent.
- GitHub mutation recovery must not duplicate known completed external side effects.

## Research requirements per new plugin

Before implementing: evaluate Pi official examples, active Pi ecosystem
plugins, Octokit/current GitHub libraries, mature CI-wait implementations.
Classify each candidate: reuse directly / reuse behind adapter / borrow design
only / reject. Record activity, maintenance, Windows/Linux support, license,
dependency footprint in a decision record.

## Non-negotiables carried into the new phase

Windows + Linux first-class · no floating latest deps · exact-SHA integration ·
fail-closed recovery · no implicit side-effect replay · structured contracts
only (never parse another plugin's display text) · bounded state everywhere ·
latest-stable Pi tracking with the upgrade checklist.

## Execution order (owner directive 2026-10-06, next session)

Phase 0 (DONE 2026-10-06): core RC sealed — integration/2026-10-05 heads:
cm f00aeb4 · runtime f29f17f · recovery 610dea4 · ui a9b2830; strict conformance
51/51 (C1-C16, R1-R16, V1-V13, U1-U6); exact-SHA integration gate green; all
four repos pinned to Pi 1.0.3 with check:pi gates.

Remaining, in strict order — fully complete each phase + its acceptance gate
before starting the next:

1. Ecosystem research (Pi official examples: permission gates, protected
   paths, destructive confirmation, todo, questions, output truncation, tool
   selection, sandbox, git integration, custom context, SSH, file watchers,
   UI; then ecosystem/adjacent implementations). Decision record per candidate.
2. Implement pi-policy-next (allow/deny/require-approval; normalized approval
   intent bound to material action identity; scopes: once/exact-target/
   explicit session-class; pinx.policy.request/decision). Gate: the policy
   test matrix in docs/ROADMAP-ECOSYSTEM.md §approval.
3. Implement pi-task-next (todo/in_progress/waiting/blocked/done/cancelled;
   waiting reason job|ci|approval|external; issue candidates separate from
   tasks; bounded projection). Gate: task lifecycle + reopen tests.
4. Harden code_job wait contract (verify existing R16 suite still green
   against Pi upgrades; keep R16 canonical).
5. Implement pi-github-next (structured resource projections, ETag/If-None-
   Match caching, singleflight, rate limits, durable mutation journal with
   intent digests; research Octokit vs bounded direct HTTP first).
6. Implement pi-ci-next (GitHub Actions backend; internal adaptive polling;
   wait/wait_all barriers bound to repo+commit SHA; superseded-target state;
   failure digest; policy-governed rerun/cancel/dispatch).
7. Integrate task + CI + policy (waiting reasons; approval-bound merges
   invalidated by head changes).
8. Implement pi-fs-next (stat/list/tree/usage/delete; dry-run; postcondition
   verification; no du/find dependency).
9. Unified health/diagnostics (pinx.stack.health; redacted JSON mode).
10. Output envelope contract (head+tail retention, explicit omitted counts,
    stderr distinct, durable full-output references).
11. Windows/Linux parity tests for every core feature; meta integration on
    both OS for platform-sensitive layers.

New canonical invariants when implemented (add to INVARIANTS.md + tags +
conformance): approval-before-side-effect; approval invalidation on identity
change; no model-driven job/CI polling; CI wait pinned to repo+SHA; explicit
truncation; delete postcondition verification. Derive the expected count from
invariants.json — never hardcode.
