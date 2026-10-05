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
