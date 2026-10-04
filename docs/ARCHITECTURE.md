# Architecture

Status: normative for Phase 0–8. Changes require an ADR under `docs/adr/`.

## System overview

Four independent Pi extension packages plus one control repository. Pi hosts all of
them in one process; they communicate through Pi-native mechanisms (session entries,
tool results, event bus) and the contracts in `../integration/CONTRACTS.md`.

```text
┌────────────────────────────────────────────────────────────────────┐
│                              Pi v1.0.2                             │
│      ExtensionAPI · session entries · tool pipeline · pi-tui       │
└──────┬───────────────────┬───────────────────┬─────────────┬───────┘
       │                   │                   │             │
┌──────┴───────┐   ┌───────┴────────┐   ┌──────┴──────┐  ┌───┴──────────────┐
│  pi-ui-next  │   │pi-context-     │   │ pi-code-    │  │ pi-generation-   │
│  (consumer)  │   │manager         │   │ runtime-next│  │ recovery-next    │
│              │   │ (producer)     │   │ (producer)  │  │ (producer)       │
└──────────────┘   └────────────────┘   └─────────────┘  └──────────────────┘
        ▲                  │                   │                  │
        └──── structured presentation metadata / event bus ───────┘
```

- **Producers** emit structured events and persist state in Pi-native session
  entries (`custom`, `custom_message`, `context_edit`, `compaction`) plus bounded
  on-disk artifacts under a single per-package state directory.
- **Consumer** (`pi-ui-next`) renders timelines and tool calls from Pi-native data
  (`parentToolCallId`, nested-call records, tool-result `details`) and from the
  contract events. It never parses producer prose.

## Repository boundaries

Each implementation repository:

- installs as a Pi package (npm layout, `pi` manifest key, host packages in
  `peerDependencies` with `"*"`: `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`,
  `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`);
- depends on **no other stack repository at runtime** (contracts are shapes, not imports);
- keeps all persisted state under one state directory (see § State layout);
- owns its own tests, CI, and docs.

The meta repository owns contracts, manifests, evaluation results, and tooling. It
never contains implementation code.

## Data flow principles

1. **Pi-native first.** State that follows the active branch lives in tool-result
   `details`; durable non-context state in `custom` entries (`pi.appendEntry`);
   model-visible injected content in `custom_message`; context changes only via
   `context_edit` (append-only) or `compaction` entries. External files only for
   artifacts that exceed session-entry bounds (evidence blobs, journals), always
   referenced by ID from session state.
2. **Append-only history.** No code path rewrites or deletes session entries. Raw
   history is the recovery source of truth (see INVARIANTS).
3. **Capability probes, not provider names.** Provider-specific behavior sits behind
   capability adapters that probe Pi's public provider/model APIs. See PROVIDER-MODEL.
4. **Structured presentation metadata.** Producers attach typed metadata (contract
   events / `details` fields); UI renders it defensively.

## State layout

```text
~/.pi/agent/<state-root>/          # state-root per package, names reserved below
  pi-ui-next/                      # cached theme/golden settings only (no secrets)
  pi-context-manager/
    evidence/<session-id>/         # content-addressed evidence blobs (bounded)
    checkpoints/<session-id>/      # continuity checkpoints (if oversized)
  pi-code-runtime-next/
    sources/<session-id>/          # retained source handles (bounded)
    jobs/                          # background job journals
  pi-generation-recovery-next/
    journal/<session-id>/          # recovery journals (bounded, GC'd)
```

Windows: same layout under the user Pi agent dir. All writes atomic (temp +
rename), all reads bounded, symlink traversal refused. Session-scoped state is
branch-aware: artifacts record the session ID and entry ID that produced them.

## Cross-repository coupling rules

- No import coupling between implementation repos. Shared shapes are documented in
  `integration/CONTRACTS.md` and validated by fixtures (`fixtures/`).
- Event bus channels use the `pinx.` prefix (see CONTRACTS.md). Producers emit,
  consumer renders; absence of a producer must degrade gracefully.
- If a runtime contract package becomes genuinely required (Phase 7), it is a new,
  tiny, independently versioned repository — not a util dump.

## Failure behavior

Every long-lived operation (evidence write, checkpoint, compaction, recovery,
job) is bounded (timeout, quota) and fail-safe: on failure the pre-operation state
remains usable and the failure is surfaced through contract events. No operation
may leave model context unusable.
