# Reference projects — research and decisions

Status: research record (2026-10-04). Pi baseline v1.0.2. Classification per
project: **adopt** (build on the idea), **adapt** (use with changes), **reject**
(do not bring in), **defer** (revisit later phase). No cargo-culting: each entry
states what was taken and what was left.

Local clones: `make-pi-great-again/references/<name>` (gitignored, shallow).

## earendil-works/pi (baseline)

Not a "reference" — the host. Public extension/TUI/session surfaces we depend on
are pinned in PI-COMPATIBILITY.md. Key facts learned during Phase 0:
`context_edit` entries are Pi-native append-only context changes; nested tool
calls are first-class (`parentToolCallId`, bounded `nestedCalls` records);
`session_before_compact` supports custom compaction; `turn_end` /
`agent_before_settle` accept boundary drafts (custom / custom_message /
context_edit / compaction); `ctx.modelRegistry.streamSimple()` gives
provider-neutral auxiliary model calls; `ctx.ui.setHeader/setFooter/
setEditorComponent` are documented component-replacement hooks.

## TUI projects

### ykn0309/pi-pretty-tui (MIT, active, ~4.9k LOC)

Collapsible activity timeline grouped per turn; re-registers built-in tools to
override only `renderCall`/`renderResult`; UI-only hidden session entries carry
nested-call snapshots across reload/tree navigation; `parentToolCallId` for
nested codemode calls; snapshot caps (256 calls, 4 KiB args / 8 KiB result per
call, 128 KiB total, 200-line preview, 8 nesting levels).

- **Adopt**: transcript-first activity-timeline data model; hard boundaries on
  user/steering/compaction messages; snapshot caps (ours: contract-bounded);
  credential-key redaction in argument snapshots.
- **Reject**: 4.3k-line monolith; prototype-patching Pi's private component
  classes (we use only documented hooks).

### OldSuns/pi-open-tui (MIT, active, ~6.2k LOC)

Header/footer/editor replacement via documented `ctx.ui` factories; Starship-style
footer; icon-mode negotiation (auto/nerd/unicode/ascii); per-turn telemetry
(TPS/TTFT/stalls) with conservative provider-reported math; inline-footer
priority truncation for narrow terminals; git porcelain parsing.

- **Adopt**: module split (header/footer/editor/telemetry/icons as separate
  units); icon-mode negotiation incl. SSH awareness; visible-width truncation
  everywhere; telemetry window (turn_start → message_end, tools excluded) and
  stall detection; narrow-terminal priority truncation.
- **Adapt with care**: git/runtime footer probes are subprocess costs — make
  them opt-in and cached.
- **Reject**: last-set-wins header/footer conflicts with sibling extensions
  (document the conflict, don't multiply it).

### YoungJurry/pi-beautiful-tui (MIT, ~2.9k LOC)

13 coordinated themes as data with per-theme Nerd Font icon packs and guaranteed
ASCII fallbacks; strict side-effect manifesto (UI components + one JSON config
only).

- **Adapt**: theme-as-data model (palette keys + icon packs + ASCII fallback);
  the side-effect manifesto as our hygiene spec.
- **Reject**: shipping 13 visual themes at first (one semantic theme + modes);
  derivative telemetry copy.

## Context/compaction/memory projects

### alpertarhan/pi-smart-compact (MIT, active, ~40k LOC)

Most ambitious suite. Verify-persist-then-spill `context_edit` pipeline (large
tool output replaced by preview+ref only after artifact verification); EESV
compaction (Extract→Explore→Synthesize→Verify) with verification against
extracted facts; pressure-first policy (deterministic cleanup early, compaction
at 80% idle); approval gate before apply; anchor-cache trick for prompt-cache
prefixes; lazy tool exposure for stable schemas.

- **Adopt (ideas)**: verify-before-spill; pressure gates; approval gate before
  destructive compaction; anchor-cache prefix discipline; deterministic fact
  extraction as a verification target.
- **Reject**: the codebase (~41k LOC, Bun/195 MB memory engine dependencies);
  we target ~10% of the size with the same guarantees.

### ginwzy/pi-context-core (MIT, ~23.6k LOC)

Observation ledger persisted as custom entries; Observer/Reflector/Dropper
workers with token budgets; zero-LLM compaction producing structured sections;
persisted per-model cooldowns and fallback chains; provider-usage-first
pressure measurement.

- **Adapt**: worker budget pattern; persisted cooldowns for auxiliary model
  fallback; structured-section zero-LLM compaction output; ledger rebuilt by
  replay from custom entries.
- **Defer**: three always-running workers (our memory layer starts opt-in —
  matches the owner brief).
- **Reject**: fork-merge legacy config paths (`pi-blackhole` shims).

### carl-stone/pi-optmem (UNLICENSED — do not copy code)

OptMem adapter; key patterns: request-local memory injection via one
`display:false` custom message in the `context` hook (never appends history,
works on overflow retries); snapshot cache invalidated only on compaction/tree/
forget; fail-visible operations ("missing store is an error, never silently
recreated"); memories framed as historical data, not commands.

- **Adapt**: the integration pattern (request-local `context` injection,
  invalidation discipline, fail-visible storage, prompt hardening).
- **Reject**: the Python engine and any code (license contamination); Python
  subprocess dependency.

### thebabush/pi-memento (MIT, ~3.2k LOC)

Nested transactions over model-visible context with LIFO boundaries validated
against the session leaf; projection via `context` hook; fail-closed compaction
(cancels rather than bisecting an open transaction); `carryforward` forcing
function (every dead end leaves one durable lesson); full state rebuild from
append-only entries.

- **Adopt**: append-only projection + fail-closed compaction contract as the
  model for any context-editing feature; boundary validation against the leaf;
  rebuild-from-entries (zero state outside the session file); compaction must
  never bisect a protected interval (our checkpoints play this role).
- **Defer**: the full transaction protocol (model-facing overhead) — our
  checkpoints cover continuity without teaching the model a new protocol.

### KimiZhang314/pi-memory-outline (MIT, ~730 LOC)

8-section structured compaction summary with regex validation + cheap-model
topic-coverage verification and graded retry; zero-token topic outline of the
whole conversation browsable via a custom entry renderer; `setImmediate`
post-`session_compact` notification trick (TUI rebuilds the chat container
synchronously).

- **Adapt**: coverage verification against a prebuilt outline (cheap
  anti-amnesia loop); zero-token history browsing; the setImmediate TUI pitfall
  (encode in UI docs/tests).
- **Reject**: hard-coded model ids in source; prose-only memory files; no tests.

## Code-mode projects

### tanishqkancharla/pi-code-mode (MIT, ~940 LOC)

QuickJS-NG WASM isolate with `shouldInterruptAfterDeadline` CPU watchdog (kills
tight loops), frozen globals, JSON-marshaled host boundary, error
line/col enrichment for self-correction.

- **Adopt**: isolation + CPU-interrupt bounding model; frozen-globals/JSON
  marshal seam; error-location enrichment.
- **Reject**: fixed tool surface with no discovery.

### itzrnvr/pi-codemode (MIT, fork of @georgebashi/pi-codemode, ~3.3k LOC)

Type-check-before-run (ts.Program over a virtual FS, ~5 ms warm); JSON Schema →
TS interface generation for MCP tools; FTS tool discovery keeps prompt cost
constant; output sanitization (control-char stripping, UTF-8-boundary-safe
truncation); npm package injection with aliasing.

- **Adapt**: type-check-before-run; FTS discovery (`search_tools` /
  `describe_tools` shape); UTF-8-boundary-safe truncation and output
  sanitization (feeds our R7/R11 invariants).
- **Reject**: `node:vm` as the primary runtime (not a security boundary, sync
  loops hang) — we use Pi's native execution/QuickJS isolation with explicit
  bounding; hand-maintained type-def/runtime sync.

## Cross-project conclusions recorded for design

1. Durable state lives in custom session entries and is **rebuilt by replay** —
   reload/branch safety comes from this one decision. All four repos follow it.
2. Use documented hooks only (`ctx.ui.setHeader/setFooter/setEditorComponent`,
   `registerToolRenderer`, `registerEntryRenderer`); prototype patching is a
   maintenance trap.
3. Prompt-cache discipline is a first-class concern: anchor markers,
   prefix-stable batches, lazy-but-stable tool schemas.
4. `visibleWidth`, never `length`, for all truncation (CJK); TUI clears the chat
   container synchronously on compaction (defer notifications with
   `setImmediate`).
5. Hardcoded model ids in source are a defect class — model roles only
   (PROVIDER-MODEL.md).
6. Sandboxing honesty: code execution is not a security boundary; state bounds,
   provenance checks, and fail-closed behavior are the actual mitigations.

## Coexistence constraints (stable stack)

Survey of the four stable jacek4yang repositories (all MIT, Node ≥ 24,
`node --test` + tsx, Pi peer `*` / dev 1.0.2). The experimental stack must not
collide with any of the following.

### Reserved identifiers (never reused by the new stack)

| Kind | Reserved values |
|---|---|
| custom entry / message `customType` | `context-prune-summary`, `context-prune-index`, `context-prune-stats`, `context-prune-frontier`, `pi-codebuffer.v1`, `codebuffer.context.v1`, `codebuffer.jobs.v1`, `pi-generation-recovery.v1` |
| compaction `details.strategy` | `codex-remote-compaction-v2`, `openai-native-compact-v2`; summary sentinel `[Codex Remote Compaction V2 checkpoint]` |
| Commands | `/pruner`, `/native-compact`, `/generation-recovery`, `/codebuffer` |
| Tools | `context_tree_query`, `context_prune`, `codebuffer`; unified-mode `code`, `python`, `node`, `bash` + wrapped `read`/`write`/`edit` |
| Provider registration | `openai-codex` (api `openai-codex-responses`) |
| UI ids | status `context-prune`; widgets `context-prune-progress`, pruner-tree, `native-compaction` |
| `appendUsage` kind | `context_prune` |
| Settings/config | `~/.pi/agent/context-prune/*`; env `PI_CODEBUFFER`, `PI_CODEX_NATIVE_COMPACTION`, `PI_GENERATION_RECOVERY_*` |
| Disk paths under agent dir | `context-prune/`, `codebuffer-scratch-v1/`, `runtime/`, `native-compaction/`, `generation-recovery/`, `workflow.json` (read-only presets) |

The experimental stack uses `pinx.*` identifiers and `pinx/<repo>/` state
directories, registering no overlapping command, tool, provider, or widget id.

### Behavioral contracts to respect

1. **Provider-input rewriting disables native compaction.** The stable native
   compaction wrapper refuses sessions where another extension rewrites provider
   request input. The context manager therefore only uses the `context` event
   (message-level) and boundary drafts — never `before_provider_request`
   payload mutation.
2. **Recovery authorization.** Stable recovery treats Pi's persisted
   `context_edit {replacement: null}` on the failed assistant entry as the
   retry authorization and expects only its own bookkeeping between the failed
   assistant and the next user message. Producers must not insert entries into
   that interval; inter-extension coordination goes through `pinx.*` events.
3. **Compaction boundary discipline.** Producers never summarize or prune
   across Pi compaction boundaries (`firstKeptEntryId`); malformed boundaries
   fail closed.
4. **Append-only history.** No stable or experimental component deletes or
   rewrites session entries; all context change is `context_edit`/`compaction`
   appends.

### Ideas ported into the new stack (summary)

- From `pi-context-prune`: batch capture re-selected from the persisted branch;
  frontier advancing; accept/reject with budget; retry guard with fingerprints;
  summarizer identity/usage separation. Improvements: token-aware budgets,
  external bounded evidence store (no 2× JSONL duplication), hierarchical
  meta-summaries.
- From `pi-codex-native-compaction`: provider wrapper pattern with
  `onPayload`/`streamSimple`; sentinel replay validation; transaction guard +
  acknowledge; scheduler soft/hard thresholds; circuit breaker; migration
  provenance. Improvements: general `NativeCompactionEngine` adapter contract
  (engine per capability, not per provider name), settings-file config.
- From `pi-generation-recovery`: frontier/block tracking; hash-chained journals;
  authorization via Pi's own omissions; canonicalization with exact-overlap
  dedup; headroom estimation. Improvements: adapter abstraction so
  provider replay is a capability adapter, not an API-string gate at the core.
- From `pi-codebuffer`: Edit IR (`{baseHash, splices}` with exact-match
  compile), revision chains with hash verification and snapshots, recursion
  guards, host-plan approval for bash, job journals. Improvements: Windows
  support for scratch/runtime storage (stable refuses the platform), syntax
  gates beyond JS, retention windows that cannot evict mid-task.

