# make-pi-great-again

Control/meta repository for an experimental Pi enhancement stack.

Pi is the coding agent at [earendil-works/pi](https://github.com/earendil-works/pi)
(npm `@earendil-works/pi-coding-agent`). This repository does **not** contain plugin
implementation code. It owns architecture, integration contracts, compatibility
information, evaluation results, migration plans, and cross-repository tooling.

## Repository layout

Implementation repositories are **siblings** of this directory, each independently
installable/testable as a Pi package:

| Repo | Path | Purpose |
|---|---|---|
| `pi-ui-next` | `D:\Workspace\pi-ui-next` | Coherent human-facing TUI enhancement layer: activity timeline, tool/nested-tool renderers, Code Mode presentation, theme system, telemetry |
| `pi-context-manager` | `D:\Workspace\pi-context-manager` | Context management and session continuity: observability, hygiene, recoverable evidence, semantic reduction, checkpoints, compaction engines, recall |
| `pi-code-runtime-next` | `D:\Workspace\pi-code-runtime-next` | LLM-first compositional code execution: source retention, repair, Edit IR, bounded execution, background jobs |
| `pi-generation-recovery-next` | `D:\Workspace\pi-generation-recovery-next` | Provider-neutral generation-interruption recovery with narrowly scoped provider adapters |

`manifest.json` is the machine-readable record of the stack: local paths, remotes,
versions, tested Pi version, and status.

## Stable baseline (read-only)

The current production stack remains authoritative until explicit migration:

- `jacek4yang/pi-codebuffer`
- `jacek4yang/pi-context-prune`
- `jacek4yang/pi-codex-native-compaction`
- `jacek4yang/pi-generation-recovery`
- `jacek4yang/pi-agent-profile`

These repositories are never pushed to, never branched, and never modified by this
project. Local clones used for study are gitignored here and listed in
`docs/REFERENCE-PROJECTS.md` together with the third-party reference projects.

## Pi compatibility

The stack targets **exactly one Pi version: the latest stable release**. See
`docs/PI-COMPATIBILITY.md` for the pinned version, its commit, and the public API
surface the stack depends on. No legacy shims, no version fallback chains.

## Documentation map

| Document | Content |
|---|---|
| [AGENTS.md](AGENTS.md) | Operating rules for any agent working in this stack |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, repository boundaries, data flow |
| [docs/INVARIANTS.md](docs/INVARIANTS.md) | Non-negotiable invariants + the tests that enforce them |
| [docs/PI-COMPATIBILITY.md](docs/PI-COMPATIBILITY.md) | Pinned Pi version, required public APIs, upgrade policy |
| [docs/PROVIDER-MODEL.md](docs/PROVIDER-MODEL.md) | Provider-neutral design, capability adapters, auxiliary model roles |
| [docs/UI-SPEC.md](docs/UI-SPEC.md) | Visual levels, activity model, theme rules, golden tests |
| [docs/CONTEXT-MODEL.md](docs/CONTEXT-MODEL.md) | Context layer stack, evidence refs, checkpoints, engine contract |
| [docs/SECURITY.md](docs/SECURITY.md) | Security requirements for privileged local extensions |
| [docs/MIGRATION.md](docs/MIGRATION.md) | Future migration plan from the stable stack (dormant until approved) |
| [docs/REFERENCE-PROJECTS.md](docs/REFERENCE-PROJECTS.md) | Adopt/adapt/reject/defer decisions for researched projects |
| [integration/CONTRACTS.md](integration/CONTRACTS.md) | Cross-repository event/data contracts |

## Branching and merging

`main` in every repository is protected by convention. All work happens on
`feat/*` branches, lands through PRs with passing CI, and **is merged only on
explicit owner instruction**. See `AGENTS.md` for the merge gate and commit policy.
