# Migration plan (dormant)

Status: **inactive by policy.** Migration from the stable stack is not performed
during this project. This document records the future shape so experimental
repositories do not accidentally preclude it.

## Premise

The stable stack (`jacek4yang/pi-codebuffer`, `pi-context-prune`,
`pi-codex-native-compaction`, `pi-generation-recovery`) remains the production
baseline, read-only to this project. The experimental stack must first prove:
functional superiority, UI superiority, context-management superiority,
stability, safe failure behavior, latest-Pi compatibility, provider neutrality,
and maintainability.

Only after explicit owner approval does migration get designed. Until then:

```text
old stack = stable production/reference
new stack = experimental next generation
```

## Constraints the experimental stack already honors (to keep migration possible)

1. **No customType/string collisions.** New custom entry types, event bus
   channels, and state directories are namespaced (`pinx.*`) and must not reuse
   any identifier the stable stack uses (see REFERENCE-PROJECTS.md coexistence
   table).
2. **Coexistence.** Both stacks must be installable in the same Pi agent
   directory without interference; conflicts are resolved by disabling one side
   explicitly, and the UI layer renders stable-stack tools generically.
3. **No dependency on stable-stack internals.** The experimental stack reads
   only Pi-native data and its own state.

## Future migration steps (when approved)

1. Freeze feature work; run a soak comparison (Phase 8 evidence) per component.
2. For each component, define a mapping table: stable setting/entry/state →
   experimental equivalent; data that cannot be mapped is left in place,
   readable but inert.
3. Cutover is per component (UI first, then context, runtime, recovery), each
   with a rollback path (disable experimental package; stable stack untouched).
4. Stable repositories are never modified: migration switches the *user's*
   installed package set, not the old repos.

## What this document must never become

A promise of compatibility shims for old Pi versions, or a bridge that makes the
experimental stack depend on stable-stack formats. Bridges, if ever needed, are
one-time, owner-approved conversion tools living in the meta repo `scripts/`.
