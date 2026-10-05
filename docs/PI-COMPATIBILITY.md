# Pi compatibility

Status: normative. Verified 2026-10-04.

## Pinned baseline

| Field | Value |
|---|---|
| Latest stable release | **v1.0.3** (non-prerelease; supersedes v1.0.2 published 2026-10-04) |
| Released | 2026-10-05 |
| Upstream repository | https://github.com/earendil-works/pi |
| Tag commit | v1.0.3 tag (verified 2026-10-05 against npm `@earendil-works/pi-coding-agent@1.0.3`) |
| npm package | `@earendil-works/pi-coding-agent@1.0.3` |
| TUI package | `@earendil-works/pi-tui@1.0.3` (lockstep release) |
| Node requirement | ≥ 22.19 (per upstream) |

The old npm scope `@mariozechner/pi-coding-agent` is stale at 0.73.1 (last
modified 2026-05) and must not be used.

## Verification procedure

Before starting work in any implementation repository:

1. `GET https://api.github.com/repos/earendil-works/pi/releases` — latest
   non-draft, non-prerelease tag.
2. `npm view @earendil-works/pi-coding-agent version` — must equal the tag.
3. If both agree with the pin above → proceed. If they moved → stop, update this
   document and `manifest.json`, rerun the full test matrix on the new baseline,
   and land that as a dedicated compatibility PR before any feature work.

## Required public API surface (v1.0.2)

The stack depends only on these public surfaces. Anything else is off-limits
without an ADR.

### Extension runtime

- Extension entry: default-export factory `(pi: ExtensionAPI) => void | Promise<void>`,
  loaded via jiti; TS sources run directly.
- Package layout: npm package with `pi` manifest key (`extensions`, optional
  `skills`/`prompts`/`themes`), `"keywords": ["pi-package"]`; host packages
  (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`,
  `@earendil-works/pi-agent-core`, `@earendil-works/pi-tui`, `typebox`) declared
  in `peerDependencies` with `"*"` and never bundled.
- Lifecycle events (load order): `project_trust`, `resources_discover`,
  `session_start` (reasons: startup/reload/new/resume/fork), `session_shutdown`,
  `session_info_changed`, `session_before_switch`, `session_before_fork`.
- Agent run events: `before_agent_start` (prompt + `systemPromptOptions`),
  `agent_start`, `turn_start`, `message_start/update/end`, `tool_call` (can
  block/mutate), `tool_result` (composable), `turn_end` (boundary drafts),
  `agent_end`, `agent_before_settle` (final actionable boundary),
  `agent_settled` (notification-only).
- Tool execution events: `tool_execution_start/update/end` with
  `parentToolCallId` for nested calls; nested `toolCallId` = `<parent id>/<n>`;
  bounded `nestedCalls` record on the calling tool's result.
- Context events: `context` (without system), `context_with_system` (full
  ownership, keep system at index 0).
- Session compaction: `session_before_compact` (cancel or return custom
  `{compaction: {summary, firstKeptEntryId, tokensBefore, usage?, details?}}`;
  preparation carries `messagesToSummarize`, `turnPrefixMessages`,
  `previousSummary`, `fileOps`, `tokensBefore`, `firstKeptEntryId`, `settings`),
  `session_compact`, `session_compact_failed`. Tree: `session_before_tree`,
  `session_tree`.
- Provider events: `before_provider_request`, `before_provider_headers`,
  `after_provider_response`, `provider_stream_event` (read-only, not persisted),
  `cache_warming_decision`, `model_select`, `thinking_level_select`.
- Other: `user_bash`, `input`, `ui_prompt_start/end`, `mcp_servers_change`.

### Registration surface

- `pi.registerTool` (TypeBox params; `execute` → `{content, details?}`;
  optional `outputSchema`+`structuredContent`; `exposure`
  direct/model-only/codemode/deferred/hidden; `namespace`; `annotations`;
  `prepareLoadout`; `renderCall`/`renderResult`).
- `pi.registerToolRenderer(resolver)` where resolver is
  `(toolName, next) => {renderShell?, renderCall?, renderResult?} | undefined`.
- `renderCall(args, theme, ctx: ToolRenderContext)` / `renderResult(result,
  options {expanded, isPartial}, theme, ctx) => Component`.
- `pi.registerCommand`, `registerShortcut`, `registerFlag`, `getFlag`.
- `pi.registerProvider`, `registerMcpServer`, `registerVirtualModel`.
- `pi.registerMessageRenderer(customType, renderer)`,
  `pi.registerEntryRenderer(customType, renderer)`,
  `pi.registerMarkdownTransformer`.
- `pi.sendMessage` / `pi.sendUserMessage` / `pi.appendEntry`.
- `pi.getActiveTools` / `setActiveTools` / `getAllTools` / `getSettings`.
- `pi.setModel` / `getThinkingLevel` / `setThinkingLevel`.
- `pi.events` (EventBus) for inter-extension communication.

### Context object

- `ctx.mode` ("tui" | rpc | json | print), `ctx.hasUI`, `ctx.cwd`,
  `ctx.sessionManager: ReadonlySessionManager` (`getBranch`,
  `buildContextEntries`, `buildSessionProjection`, `getEntry`, `getLeafId`,
  `getTree`, `getEntries`, `getHeader`), `ctx.modelRegistry.streamSimple()`
  for provider-neutral nested model calls, `ctx.model`, `ctx.thinkingLevel`,
  `ctx.signal`, `ctx.abort()`, `ctx.getContextUsage()`, `ctx.compact()`,
  `ctx.getSystemPrompt()`, `ctx.ui` (dialogs, notify, setStatus, setWidget,
  custom components), `ctx.shutdown()`.
- Command context adds `waitForIdle`, `newSession`, `fork`, `navigateTree`,
  `switchSession`, `reload` (command-only, may deadlock elsewhere).

### Session model

- JSONL session file, tree via `id`/`parentId` (v3 format).
- Entry types: `message`, `model_change`, `thinking_level_change`, `usage`,
  `compaction` (`summary`, `firstKeptEntryId`, `tokensBefore`, `usage?`,
  `fromHook?`, `details?`), `context_edit` (append-only `{targetId,
  replacement: {content} | null}`), `branch_summary`, `custom`
  (`customType`, not in LLM context), `custom_message` (`customType`, in LLM
  context, `display`), `label`, `session_info`.
- Boundary drafts (`turn_end`/`agent_before_settle` results): `{entries?:
  (custom | custom_message | context_edit | compaction)[], continue?: boolean}`.
- `convertToLlm(messages)` + `serializeConversation(...)` for custom
  summarization input.
- Compaction settings: `compaction.{enabled, reserveTokens=16384,
  keepRecentTokens=20000, modelOverrides}`.

### TUI

- `@earendil-works/pi-tui` components: `Text`, `Markdown`, `TruncatedText`,
  `Container`, `VStack`, `HStack`, `Box`, `Spacer`, `Input`, `Editor`
  (`CustomEditor` for editor replacement), `SelectList`, `SettingsList`,
  `ScrollView`, `Loader`, `MouseRegion`.
- Width helpers: `visibleWidth()`, `truncateToWidth()`, `sliceByColumn()`,
  `wrapTextWithAnsi()`. Cursor: `Focusable` + `CURSOR_MARKER`.
- Theme: semantic tokens via `theme.style()/fg()/bg()`, `theme.colors`,
  `theme.appearance`; `getMarkdownTheme()`. Styles must be reapplied per line;
  invalidate cached themed strings on state change.

## Explicitly out of scope

- Old-Pi shims, version fallback chains, deprecated event emulation.
- Reading or writing `auth.json`, provider tokens, or cookies (Pi owns auth).
- Replacing Pi's executor, session store, or provider layer.


## v1.0.2 → v1.0.3 migration notes (2026-10-05)

Audited upstream changes and their impact on this stack:

| Upstream change | Impact on pinx stack | Action |
|---|---|---|
| Azure provider renamed `azure-openai-responses` → `azure` | None: provider-neutral core; zero `azure` references in stack source; identity hashing unaffected | None (audit documented) |
| Codemode `image()` writes temp files + paths in result | pi-ui-next generic result preview shows text paths truthfully; no image-specific assumptions existed | None |
| Output files restricted to user-readable | Stack evidence/journal/source files now also 0600/0700 on POSIX (aligned, least-privilege) | Hardened |
| Home/End editor-cursor key change | pi-ui-next does not intercept editor navigation keys | None |
| OAuth refresh cancellation fix | Auth is Pi-owned; stack implements no OAuth logic | None |
| Codemode pnpm-update resilience | Stack holds no long-lived paths into Pi's install tree | None |
| Terminal read-EIO/setRawMode EIO fix | pi-ui-next wraps no terminal lifecycle | None |

Extension-level event-flow and component suites were re-run against the
published `@earendil-works/pi-coding-agent@1.0.3`; no public API used by this
stack changed (verified by compile + 292 component tests).
