# UI specification (pi-ui-next)

Status: normative for `pi-ui-next`.

## Goal

One coherent human-facing TUI enhancement layer for Pi. The problem is
**information architecture and readability**, not decoration. `pi-ui-next` is the
single owner of enhanced activity timeline, tool rendering, nested tool
rendering, Code Mode presentation, header, footer, editor framing, telemetry,
and context status presentation.

Fullscreen is never mandatory; the default normal-terminal experience must be
excellent. Multiple competing TUI plugins are an anti-goal.

## Visual levels (progressive disclosure)

Raw JSON is never the default human presentation.

- **Level 0 — conversation overview** (default):

```text
● Working · 18.4s

├─ ✓ Search      12 matches
├─ ✓ Read        src/context.ts
├─ ✓ Code        6 calls · 7.2s
├─ ✓ Edit        src/context.ts  +21 -8
└─ ✓ Tests       143 passed

Assistant
...
```

- **Level 1 — expanded activity**: one line per nested call
  (`▼ Code · 6 nested calls · 7.2s` then indented `✓ read src/context.ts`).
- **Level 2 — one operation detail**: labeled fields (`command`, `result`,
  `duration`) with `[show full output]` affordance.
- **Level 3 — raw diagnostics**: explicitly opened only (raw args, full
  stdout/stderr, full diff, source, revision/recovery metadata).

Keybindings for expansion are keyboard-first; every interaction has a keyboard
path even when mouse is available.

## Activity model

Built from **real Pi execution relationships** — `parentToolCallId` on
`tool_execution_*` events and the bounded `nestedCalls` record on tool results.
Nesting is never inferred from tool names, source parsing, text matching, or
timing.

One timeline represents: thought, tool, nested tool, notification, warning,
error, retry, compaction, context reduction, generation recovery, background
job. Calls preserve start order even when completion is parallel. Failures stay
visibly failures even when a parent operation later succeeds (U2).

## Code/CodeBuffer presentation

First-class renderers for `code`, `python`, `node`, `bash`, buffer revisions,
repair, Edit IR application, and background jobs. Default line is a compact
summary (`✓ code · revision 7 · 8 calls · 3.4s`); identity hashes, IR payloads,
and retention metadata live in detail views only.

## Tool renderers

Compact renderers for: read, grep, find, ls, edit, write, bash, code, python,
node, LSP, todo, web/search-like tools, and a **generic fallback** that keeps
unregistered third-party tools readable (summarized args + bounded result
preview + expansion affordance). Renderers implement Pi's
`registerToolRenderer` resolver chain and yield to registered tools via
`next()` when the registered renderer is preferable.

## Theme system

Learn from pi-open-tui and pi-beautiful-tui; do not copy wholesale. Support:
Nerd Font, Unicode, and ASCII icon modes; CJK width correctness (U4);
80/120/160-column layouts; light/dark semantic colors; a high-contrast option.
Decoration stays subordinate to readability.

Themes must not change the semantic meaning of: `running`, `success`,
`warning`, `failure`, `muted`, `selected` (U3). Use Pi's semantic theme tokens
(`theme.style()`, `theme.fg()`, `theme.colors`, `theme.appearance`); never
hard-code ANSI escapes; never cache themed strings without invalidation.

## Telemetry presentation

Presents: model/provider, thinking level, context usage, input/output tokens,
cache usage when known, TTFT, generation duration, TPS, stream stalls, tool
duration, overall run duration. Never fabricates metrics. Every figure is
labeled: `provider-reported`, `measured`, `estimated`, or `unknown` (U6).

## Context status

Renders the context manager's observability model (working set / recent /
protected / recoverable / reclaimable) when the producer is present; renders
Pi's plain context percentage otherwise. Never invents subtotals.

## Golden tests

Deterministic fixtures cover at least: 80/120/160 columns; ASCII/Unicode/Nerd
Font; CJK; long paths; long commands; multiline output; success; failure;
warning; running; cancelled; nested calls; parallel nested calls; large diff;
Code Mode; background job; context operation; recovery operation (U1–U5).
Golden diffs are reviewed and updated intentionally.
