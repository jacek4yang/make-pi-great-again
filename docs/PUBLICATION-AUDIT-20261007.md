# Publication audit — Agent Body repositories (2026-10-07)

Owner-authorized conversion of the eight Agent Body repositories from
private to public, gated by this audit.

## Scope and method

- Repositories: make-pi-great-again, pi-context-manager,
  pi-code-runtime-next, pi-generation-recovery-next, pi-ui-next,
  pi-policy-next, pi-task-next, pi-github-next (+ pi-ci-next created
  public from birth).
- Secret scan: `scripts/audit-publication.mjs` — pattern scan over every
  worktree file AND full `git log -p --all` history (GitHub PATs,
  fine-grained PATs, AWS keys, Google keys, private key blocks, Slack
  tokens, JWTs, Authorization headers, password/api-key assignments,
  credential connection strings, bearer literals). Content never printed —
  only file + pattern-kind + counts.
- Workflow audit: all CI workflows are `pull_request` + `push` only, no
  `pull_request_target`/`workflow_run`, no `secrets.*` usage; least-privilege
  `permissions: contents: read` added to every workflow before publication.

## Findings

| Repository | Worktree scan | History scan | Verdict |
|---|---|---|---|
| make-pi-great-again | placeholder-only matches in `pi-extensions/` test fixtures (`sk-secret`, `Bearer header-secret`, `wrong-private-password`) — obviously fake test values | 0 real-class findings | PUBLISHED |
| pi-context-manager | clean | clean | PUBLISHED |
| pi-code-runtime-next | clean | clean | PUBLISHED |
| pi-generation-recovery-next | clean | clean | PUBLISHED |
| pi-ui-next | clean | clean | PUBLISHED |
| pi-policy-next | clean | clean | PUBLISHED |
| pi-task-next | clean | clean | PUBLISHED |
| pi-github-next | clean | clean | PUBLISHED |
| pi-ci-next | created public; same conventions | n/a | PUBLIC FROM BIRTH |

## Protection state

Pre-publication: all repos on the free plan — the rulesets/branch-protection
API is not available for private repos (403 "Upgrade to GitHub Pro…"), i.e.
NO rulesets existed to preserve. Nothing was weakened by the visibility
change; ChatGPT remains the merge authority by workflow (no auto-merge
enabled anywhere). Post-publication recommendation: add branch-protection
rulesets on `main` for each public repo (owner action; not done here to
avoid loosening/tightening decisions outside this session's mandate).

## Result

All eight repositories are PUBLIC with history, branches, PRs, issues, and
Actions intact (verified via `git ls-remote` + API after conversion). No
repository was blocked by a secret finding. Follow-up owner items: resolve
the Actions billing flag (docs/CI-BLOCKER-20261007.md) and add public
branch-protection rulesets.
