# Pi upgrade checklist (repeatable procedure)

1. Inspect the official release notes + package changelogs (coding-agent, ai, tui, agent-core).
2. `node scripts/check-pi-upstream.mjs` — confirm the new stable version.
3. Bump the exact devDependency in all four implementation repos; `npm install` (lockfiles update deterministically).
4. Audit public API usage: compile (`npm run typecheck`) against the new package — every TS2305/TS2339 is an API change to migrate.
5. Audit provider identifiers (e.g. the 1.0.3 `azure-openai-responses` → `azure` rename): grep src/config/fixtures.
6. Audit persisted-state compatibility: checkpoints, evidence refs, journals, job records — fail closed on identity mismatch, never reuse stale state.
7. Remove workarounds upstream now owns (check changelog "Fixed" section).
8. Run per-repo `npm run ci`.
9. Move `integration/2026-10-05` to the candidate heads; push (remote 3-OS CI must be green).
10. Run `node conformance/run-conformance.mjs --strict` — require 51/51 with zero MISSING.
11. Run `node integration/run-integration.mjs` — exact-SHA worktrees, cross-layer green.
12. Run `node integration/self-test.mjs` + `node conformance/self-test.mjs`.
13. Run the 30-second soak (`PINX_SOAK_MS=30000 node scripts/soak.mjs` from pi-generation-recovery-next).
14. Refresh integration/manifest.json SHAs; verify; update this repo's docs; push.
15. Merge integration branches to main only with owner authorization.
