# AGENTS.md — operating rules for this stack

These rules bind any human or agent working in `make-pi-great-again` or the four
implementation repositories. The owner-written project brief is authoritative where
it is stricter than this file.

## Hard lines

1. **Never** merge a PR into `main` without explicit owner instruction. Stop at the
   merge gate (below).
2. **Never** publish a release without explicit owner instruction.
3. **Never** push, PR against, rebase, retag, or otherwise modify the stable
   repositories: `jacek4yang/pi-codebuffer`, `jacek4yang/pi-context-prune`,
   `jacek4yang/pi-codex-native-compaction`, `jacek4yang/pi-generation-recovery`,
   `jacek4yang/pi-agent-profile`. They are read-only references.
4. **Never** reduce test strictness to make a branch pass.
5. **Never** hide a failure or claim a check passed unless it actually ran against
   the current revision.
6. **Never** develop directly on `main`. One coherent unit per `feat/*` branch.
7. **Never** read the user's real `~/.pi/agent`, credentials, `auth.json`, or
   sessions in tests or tooling. Tests use disposable Pi homes.

## Pi compatibility rule

Support only the latest stable Pi release, pinned in `docs/PI-COMPATIBILITY.md`.
Before starting work in any implementation repo, verify the pin is still the latest
stable release (GitHub `earendil-works/pi` releases + npm `@earendil-works/pi-coding-agent`).
If Pi has moved, stop and prepare a dedicated compatibility baseline update — do not
write per-version fallbacks.

## Architecture discipline

Architecture documents and interfaces in this meta repository are authoritative.
If implementation reveals a flaw: document it, write a small ADR/proposal under
`docs/adr/`, keep the change isolated. Do not silently redesign across repositories.
No mass renames, no speculative abstractions, no new dependency without the
justification questions in `docs/SECURITY.md` § dependencies.

## Branch / commit discipline

- Branch names: `feat/<topic>`, `fix/<topic>`, `test/<topic>`, `docs/<topic>`.
- Commits: small enough to review, large enough to be meaningful completed work.
  Format `type(scope): summary`, e.g. `feat(context): add branch-scoped evidence references`.
- Never commit generated caches, secrets, personal sessions, credentials, provider
  payload dumps, or large temporary fixtures.

## Definition of done for a branch (merge gate)

A branch is not merge-ready until all applicable items hold:

- [ ] scope is coherent; diff reviewed; no unrelated modifications
- [ ] architecture contract preserved; public API change documented
- [ ] persistence format change documented
- [ ] typecheck passes; lint/static checks pass
- [ ] unit tests pass; integration tests pass
- [ ] real Pi load smoke passes (disposable Pi home, pinned Pi version)
- [ ] package install smoke passes (`pi install ./local-package` or `-e` load)
- [ ] required golden tests pass (ui) / invariant tests pass (context/runtime/recovery)
- [ ] latest-stable Pi compatibility verified
- [ ] no credential access, no hidden provider coupling, no unjustified dependency
- [ ] documentation updated

When ready: push the branch, open a PR with exact validation evidence, then **STOP**.
The owner decides whether it merges.

## CI policy

CI on all PRs; CI never auto-edits source, never pushes formatting commits to main,
never updates lockfiles on main, never publishes from ordinary commits. A PR fails
if formatting or lockfiles are wrong. Dependencies are updated through explicit
dependency PRs.

## Status reporting

After every substantial milestone report exactly:

```text
Repository:
Branch:
Commit:
Implemented:
Tests:
Pi version:
Known limitations:
Next action:
```

Keep durable project state in this meta repository (manifest, docs, evaluation
notes), not in chat history.
