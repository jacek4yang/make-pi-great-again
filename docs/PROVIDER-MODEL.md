# Provider & model policy

Status: normative.

## Rule

The stack is **provider-neutral**. Subscription-backed providers (OpenAI/ChatGPT,
xAI/SuperGrok, Anthropic/Claude, GitHub Copilot), API-key providers, custom
providers registered through `pi.registerProvider`, virtual models, and future
providers must all work through Pi's public provider/model/auth interfaces.

Forbidden in core logic:

```ts
if (provider === "openai-codex") ...
if (model.startsWith("gpt-")) ...
```

Provider checks live only inside a narrowly scoped **capability adapter** that
implements a capability interface and probes for support at runtime.

## Capabilities

Provider features are expressed as probed capabilities, never inferred from names:

```ts
interface ModelCapabilities {
  providerNativeCompaction: boolean;   // engine adapter for compaction
  reasoningReplay: boolean;            // recovery safe-prefix of thinking blocks
  toolCalling: boolean;
  structuredOutput: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
  cacheSemantics?: CacheSemantics;     // prefix-stability behavior model
}
```

Capability resolution order (documented per repo):

1. Pi public model metadata (`ctx.model`, `modelRegistry`) — context window,
   max tokens, input types.
2. Explicit capability probes against Pi public APIs (e.g. can the provider
   represent native compaction for this session? does the adapter own the
   mechanism?).
3. Declared config for the stack (opt-in adapter enablement).
4. Conservative defaults (`false` for optional capabilities).

Adapters must **fail closed**: if support cannot be proven, the capability is
absent. Never fake provider-native behavior; fall back to the generic engine.

## Authentication boundary

The stack never reads, parses, copies, migrates, logs, or owns:
`auth.json`, OAuth access/refresh tokens, cookies, subscription credentials,
API keys. Authentication is Pi's responsibility. Auxiliary model calls go
through `ctx.modelRegistry.streamSimple()` or the standard model pipeline, so
credentials are resolved by Pi.

## Auxiliary model roles

No hard-coded model is required as summarizer/pruner/verifier. Roles:

| Role | Used by |
|---|---|
| `primary` | never called by the stack (it is the user's agent model) |
| `summarize` | semantic reduction, compaction engines |
| `verify` | verification of engine output where configured |
| `prune` | batch pruning decisions when not deterministic |
| `memory` | optional long-term memory (Phase 7+, default off) |

Configuration binds a role to `{provider?, model?, thinkingLevel?}` explicitly.
Default when a role is unset: **deterministic/no-model behavior**.

Data-boundary rule: changing the provider that receives conversation content is
a data decision, never a silent cost optimization. The effective auxiliary
target is logged at session start (role → provider/model, no secrets), and
cross-provider auxiliary routing requires explicit configuration.

## Prompt-cache discipline

Context mutation can destroy provider prompt-cache prefixes. Every context
operation carries a cache-impact annotation (`prefixStable` | `prefixInvalidating`)
and the scheduler prefers prefix-stable batches, batching mutations at natural
boundaries (turn starts, compaction checkpoints). Token-saving claims must cite
provider-reported usage, never character counts.
