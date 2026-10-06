#!/usr/bin/env node
// Executable conformance runner with EXACT invariant-tag matching.
//
// Test names carry explicit bracket tags: test("[C12] ...") proves C12. The
// runner parses bracketed IDs only — no regex substring guessing (the old
// regex mapping let C1 accidentally match C12).
//
// Exit behavior:
//   any repo suite failure        -> exit 1
//   any mapped invariant FAIL     -> exit 1
//   --strict and any MISSING      -> exit 2
//   runner/repo discovery failure -> exit 3
//
// Usage: node run-conformance.mjs [--strict] [invariant-id ...]
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OWNERSHIP, canonicalInvariantSetName } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const metaRoot = resolve(here, "..");
const strict = process.argv.includes("--strict");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

// Portable workspace discovery: env override, else sibling-of-meta-repo.
function workspaceRoot() {
  if (process.env.PINX_WORKSPACE) return resolve(process.env.PINX_WORKSPACE);
  return resolve(metaRoot, "..");
}
const workspace = workspaceRoot();

// OWNERSHIP is imported from lib.mjs — the single canonical invariant map.
// (The former inline duplicate here was a release-truth hazard.)

const REPOS = [...new Set(Object.values(OWNERSHIP))];

function repoRoot(repo) {
  return join(workspace, repo);
}

function gitSha(repo) {
  const root = repoRoot(repo);
  if (!existsSync(join(root, ".git"))) return "NO-REPO";
  const res = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() : "UNKNOWN";
}

function runRepoTests(repo) {
  const root = repoRoot(repo);
  const testDir = join(root, "test");
  if (!existsSync(testDir)) throw new Error(`repository unavailable or has no test dir: ${repo} (${testDir})`);
  const files = readdirSync(testDir).filter((f) => f.endsWith(".test.ts")).map((f) => join(testDir, f));
  if (files.length === 0) throw new Error(`no test files for ${repo}`);
  const tsxCli = join(root, "node_modules", "tsx", "dist", "cli.mjs");
  if (!existsSync(tsxCli)) throw new Error(`tsx not installed for ${repo} — run npm ci first`);
  const res = spawnSync(process.execPath, ["--test", "--test-reporter", "tap", ...files], {
    cwd: root,
    encoding: "utf8",
    timeout: 900000,
  });
  const tap = (res.stdout ?? "") + (res.stderr ?? "");
  const tests = [];
  let failed = 0;
  let total = 0;
  for (const line of tap.split("\n")) {
    const trimmed = line.trim();
    const m = /^(ok|not ok) \d+ - (.+?)(?:\s+\([\d.]+ms\))?$/.exec(trimmed);
    if (!m) continue;
    total++;
    const ok = m[1] === "ok";
    const rawName = m[2];
    const tags = [...rawName.matchAll(/\[([A-Z]\d+)\]/g)].map((x) => x[1]);
    if (!ok) failed++;
    tests.push({ ok, name: rawName, tags });
  }
  return { tests, failed, total };
}

// Run every repo suite exactly once.
const repoTests = {};
for (const repo of REPOS) {
  const root = repoRoot(repo);
  if (!existsSync(root)) {
    console.error(`FATAL: repository not found: ${root}`);
    process.exit(3);
  }
  process.stdout.write(`running ${repo} @ ${gitSha(repo)}... `);
  try {
    const t = runRepoTests(repo);
    t.sha = gitSha(repo);
    repoTests[repo] = t;
    console.log(`${t.total} tests, ${t.failed} failed`);
  } catch (e) {
    console.error(`FATAL: ${e.message}`);
    process.exit(3);
  }
}

const results = {};
let pass = 0, fail = 0, missing = 0;
let suiteFailures = 0;

for (const inv of INvariants()) {
  const repo = OWNERSHIP[inv];
  const info = repoTests[repo];
  if (info.failed > 0) {
    // The suite is red: nothing in it may be reported PASS.
    results[inv] = { status: "SUITE-RED", repo, sha: info.sha, note: `${info.failed} suite test(s) failed` };
    fail++;
    continue;
  }
  const tagged = info.tests.filter((t) => t.tags.includes(inv));
  if (tagged.length === 0) {
    results[inv] = { status: "MISSING", repo, sha: info.sha, note: "no test carries this exact invariant tag" };
    missing++;
    continue;
  }
  const failing = tagged.filter((t) => !t.ok);
  if (failing.length > 0) {
    results[inv] = { status: "FAIL", repo, sha: info.sha, note: failing.map((t) => t.name).join("; ").slice(0, 200) };
    fail++;
    continue;
  }
  results[inv] = { status: "PASS", repo, sha: info.sha, via: tagged.map((t) => t.name).slice(0, 3) };
  pass++;
}

function INvariants() {
  return Object.keys(OWNERSHIP).filter((id) => only.length === 0 || only.includes(id));
}

console.log("\n=== INVARIANT CONFORMANCE REPORT ===");
for (const [inv, r] of Object.entries(results)) {
  console.log(
    `${r.status.padEnd(7)} ${inv.padEnd(4)} [${r.repo} @ ${r.sha}]${r.note ? " — " + r.note : ""}${r.via ? " — via: " + r.via.join(" | ") : ""}`,
  );
}
console.log(`\nsummary: ${pass} PASS, ${fail} FAIL/SUITE-RED, ${missing} MISSING (of ${INvariants().length})`);
for (const [repo, info] of Object.entries(repoTests)) {
  console.log(`suite ${repo} @ ${info.sha}: ${info.total} tests, ${info.failed} failed`);
}
const reportPath = join(here, "conformance-report.json");
writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), workspace, results, perRepo: repoTests }, null, 2));
console.log("report:", reportPath);

// Release-truth enforcement: both manifests must describe the canonical
// invariant set derived from source. Stale counts fail the gate (exit 4).
const derivedSetName = canonicalInvariantSetName();
let manifestStale = false;
for (const file of ["manifest.json", "integration/manifest.json"]) {
  const path = join(metaRoot, file);
  if (!existsSync(path)) continue;
  const declared = JSON.parse(readFileSync(path, "utf8")).requiredInvariantSet;
  if (declared !== derivedSetName) {
    console.error(`STALE METADATA: ${file} requiredInvariantSet "${declared}" != canonical "${derivedSetName}"`);
    manifestStale = true;
  }
}
if (manifestStale) process.exit(4);

if (suiteFailures > 0 || fail > 0) process.exit(1);
if (strict && missing > 0) process.exit(2);
process.exit(0);
