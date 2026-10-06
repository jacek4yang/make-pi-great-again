# Integration lines

The stack has exactly one current integration line:

- **`integration/agent-body-v2`** — the sole integration line for all
  productization work (Phase 1 onward). The exact-SHA integration gate
  (`integration/run-integration.mjs`) validates manifests against it.

## Legacy line (frozen — do not use, do not force-push)

- **`integration/2026-10-05`** was intended to freeze the completed
  reliability core, but during Phase 1 the pi-context-manager and
  pi-code-runtime-next branches were accidentally fast-forwarded onto it
  (it now also carries the benchmark/cacheability commits). Per the repair
  decision it is left **exactly as it is** — no history rewriting, no
  force-reset — and is simply no longer referenced by manifests or scripts.

## Core baseline preservation

The reliability-core revisions (pre-Phase-1) remain exactly reproducible
via the `core-baseline-20261005` tag in every implementation repository:

| Repo | Core baseline SHA |
|---|---|
| pi-context-manager | 24f0d86e90c3a0ab714e6f800c78746f845c2411 |
| pi-code-runtime-next | 7299764b3d1731acd531ff0867a1d2c157d15092 |
| pi-generation-recovery-next | f1c3230909423aaca7cc230df2c74364a9d673e5 |
| pi-ui-next | c9134b6fa561cdedcd62a07e632d4970fedfed54 |

These are ancestors of the current candidate heads, so the tag is a
zero-cost bookmark, not a fork.
