#!/usr/bin/env node
// Agent efficiency benchmark runner (make-pi-great-again).
//
// Orchestrates the per-repository deterministic benches and aggregates them:
//   pi-context-manager   scenarios A/B/C  (projection stability, archive/recall)
//   pi-code-runtime-next scenario D       (tool-schema footprint, job mechanism)
//
// Everything runs through the repos' own tsx with their own node_modules —
// no cross-repo imports, no bash, no GNU tools (Windows/Linux/macOS safe).
//
// Usage:
//   node benchmark/run-benchmarks.mjs                     # print merged JSON
//   node benchmark/run-benchmarks.mjs --save baseline     # write results file
//   node benchmark/run-benchmarks.mjs --compare baseline after
//   node benchmark/run-benchmarks.mjs --check-determinism # run twice, diff
//
// Terminology discipline:
//   The "stable prefix" reported here is a LOCAL byte metric between
//   serialized model-visible projections. It is evidence of prompt-prefix
//   cacheability, NOT a provider cache-hit rate — which only the provider
//   can report. Token figures are ESTIMATES unless explicitly labeled
//   provider-reported.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const metaRoot = resolve(here, "..");
const strict = process.argv.includes("--strict");

function workspaceRoot() {
  if (process.env.PINX_WORKSPACE) return resolve(process.env.PINX_WORKSPACE);
  return resolve(metaRoot, "..");
}
const workspace = workspaceRoot();

const BENCHES = [
  { repo: "pi-context-manager", script: "bench/run.ts" },
  { repo: "pi-code-runtime-next", script: "bench/tool-schema.ts" },
];

function repoRoot(repo) {
  return join(workspace, repo);
}

function gitSha(repo) {
  const root = repoRoot(repo);
  if (!existsSync(join(root, ".git"))) return "NO-REPO";
  const res = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() : "UNKNOWN";
}

function runBench({ repo, script }) {
  const root = repoRoot(repo);
  // Same resolution as the conformance runner: direct file path (tsx's
  // package exports do not expose dist/cli.mjs to require.resolve).
  const tsxCli = join(root, "node_modules", "tsx", "dist", "cli.mjs");
  if (!existsSync(tsxCli)) {
    throw new Error(`tsx not installed for ${repo} — run npm ci first`);
  }
  const res = spawnSync(process.execPath, [tsxCli, script], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`${repo} bench failed (${res.status}):\n${res.stderr?.slice(0, 2000)}`);
  }
  return JSON.parse(res.stdout);
}

function merged() {
  const out = {
    benchmark: "agent-efficiency",
    line: "integration/agent-body-v2",
    generatedBy: "benchmark/run-benchmarks.mjs",
    repos: {},
  };
  for (const bench of BENCHES) {
    out.repos[bench.repo] = {
      sha: gitSha(bench.repo),
      ...(bench.repo === "pi-context-manager" ? { scenarios: {}, toolSchema: {}, jobMechanism: {} } : {}),
      result: runBench(bench),
    };
  }
  out.contextManager = out.repos["pi-context-manager"].result;
  out.codeRuntime = out.repos["pi-code-runtime-next"].result;
  return out;
}

function pick(result, path) {
  let cur = result;
  for (const key of path) {
    cur = cur?.[key];
    if (cur === undefined) return undefined;
  }
  return cur;
}

// The metrics rows of the required comparison table. Each row maps to the
// merged result; missing values render as n/a rather than invented numbers.
const TABLE_ROWS = [
  ["projected context bytes (A, final turn)", ["contextManager", "scenarios", "A", "projections"], (v) => v?.at(-1)?.bytes],
  ["estimated projected tokens (A, final turn)", ["contextManager", "scenarios", "A", "projections"], (v) => v?.at(-1)?.estimatedTokens],
  ["stable prefix bytes (A, avg consecutive)", ["contextManager", "scenarios", "A", "consecutive"], (v) =>
    v?.comparisons?.length
      ? Math.round(v.comparisons.reduce((s, c) => s + c.commonPrefixBytes, 0) / v.comparisons.length)
      : undefined],
  ["stable prefix ratio (A, avg)", ["contextManager", "scenarios", "A", "consecutive"], (v) =>
    v?.averageStablePrefixRatio !== undefined ? v.averageStablePrefixRatio.toFixed(6) : undefined],
  ["stable prefix ratio (C, avg)", ["contextManager", "scenarios", "C", "consecutive"], (v) =>
    v?.averageStablePrefixRatio !== undefined ? v.averageStablePrefixRatio.toFixed(6) : undefined],
  ["first changed byte (A, final pair)", ["contextManager", "scenarios", "A", "consecutive"], (v) => v?.comparisons?.at(-1)?.firstChangedByte],
  ["model-visible tool calls (A)", ["contextManager", "scenarios", "A", "counters", "modelVisibleToolCalls"], (v) => v],
  ["tool-result original bytes (A)", ["contextManager", "scenarios", "A", "counters", "toolResultOriginalBytes"], (v) => v],
  ["archives (B)", ["contextManager", "scenarios", "B", "counters", "archives"], (v) => v],
  ["recalls (B)", ["contextManager", "scenarios", "B", "counters", "recalls"], (v) => v],
  ["context bytes before hygiene (B)", ["contextManager", "scenarios", "B", "projections"], (v) => v?.[0]?.bytes],
  ["context bytes after hygiene (B)", ["contextManager", "scenarios", "B", "projections"], (v) => v?.[1]?.bytes],
  ["model-visible result bytes after archive (B)", ["contextManager", "scenarios", "B", "counters", "toolResultModelVisibleBytes"], (v) => v],
  ["recall exact match (B)", ["contextManager", "scenarios", "B", "extra", "recallExactMatch"], (v) => v],
  ["tool schema bytes (context-manager)", ["contextManager", "toolSchema", "totalSchemaBytes"], (v) => v],
  ["active tool count (context-manager, fresh session)", ["contextManager", "toolSchema", "activeToolCount"], (v) => v],
  ["model-visible tool bytes (context-manager, fresh session)", ["contextManager", "toolSchema"], (v) =>
    v?.tools?.length && v.activeToolCount > 0
      ? v.tools.filter((t) => t.defaultActive).reduce((s, t) => s + t.totalBytes, 0) ||
        v.tools[0].totalBytes
      : 0],
  ["tool schema bytes (code-runtime)", ["codeRuntime", "totalSchemaBytes"], (v) => v],
  ["tool total bytes incl. descriptions (runtime)", ["codeRuntime", "totalBytes"], (v) => v],
  ["active tool count (runtime)", ["codeRuntime", "activeToolCount"], (v) => v],
  ["code_job status polls required", ["codeRuntime", "jobMechanism", "statusPollsRequired"], (v) => v],
  ["code_job wait calls", ["codeRuntime", "jobMechanism", "waitCalls"], (v) => v],
];

function valueAt(result, [base, ...path], pickFn) {
  return pickFn(pick(result, [base, ...path]));
}

function compareTable(a, b) {
  const rows = [];
  for (const [label, path, pickFn] of TABLE_ROWS) {
    const before = valueAt(a, path, pickFn);
    const after = valueAt(b, path, pickFn);
    let change = "";
    if (typeof before === "number" && typeof after === "number") {
      const delta = after - before;
      change = delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${delta}`;
    } else if (before !== after) {
      change = `${before} → ${after}`;
    } else {
      change = "—";
    }
    rows.push({ metric: label, before, after, change });
  }
  return rows;
}

function printTable(rows) {
  const w = (s) => String(s ?? "n/a");
  const metricWidth = Math.max(...rows.map((r) => r.metric.length), "Metric".length);
  const beforeWidth = Math.max(...rows.map((r) => w(r.before).length), "Before".length);
  const afterWidth = Math.max(...rows.map((r) => w(r.after).length), "After".length);
  const line = (l, m1, m2, m3) => `${l.padEnd(metricWidth)} | ${m1.padStart(beforeWidth)} | ${m2.padStart(afterWidth)} | ${m3}`;
  console.log(line("Metric", "Before", "After", "Change"));
  console.log("-".repeat(metricWidth + beforeWidth + afterWidth + 12));
  for (const r of rows) console.log(line(r.metric, w(r.before), w(r.after), w(r.change)));
}

function checkDeterminism() {
  let ok = true;
  for (const bench of BENCHES) {
    const r1 = JSON.stringify(runBench(bench));
    const r2 = JSON.stringify(runBench(bench));
    if (r1 !== r2) {
      console.error(`NOT DETERMINISTIC: ${bench.repo}`);
      ok = false;
    } else {
      console.log(`deterministic: ${bench.repo}`);
    }
  }
  if (!ok) process.exit(1);
}

function resultsDir() {
  return join(metaRoot, "benchmark", "results");
}

const args = process.argv.slice(2);

if (args.includes("--check-determinism")) {
  checkDeterminism();
} else if (args.includes("--compare")) {
  const idx = args.indexOf("--compare");
  const aName = args[idx + 1];
  const bName = args[idx + 2];
  if (!aName || !bName) {
    console.error("usage: --compare <nameA> <nameB>");
    process.exit(3);
  }
  const a = JSON.parse(readFileSync(join(resultsDir(), `${aName}.json`), "utf8"));
  const b = JSON.parse(readFileSync(join(resultsDir(), `${bName}.json`), "utf8"));
  printTable(compareTable(a, b));
} else {
  const saveIdx = args.indexOf("--save");
  const result = merged();
  const json = JSON.stringify(result, null, 2);
  if (saveIdx >= 0 && args[saveIdx + 1]) {
    mkdirSync(resultsDir(), { recursive: true });
    const file = join(resultsDir(), `${args[saveIdx + 1]}.json`);
    writeFileSync(file, json + "\n");
    console.error(`saved: ${file}`);
  }
  process.stdout.write(json + "\n");
}
void strict;
