#!/usr/bin/env node
// Executable conformance runner: maps R1-R15 / C1-C16 / V1-V13 / U1-U6 to the
// test suites in each implementation repository and reports per-invariant
// status. Exit code: 0 when no FAIL (MISSING is reported; --strict also
// fails on MISSING). Zero dependencies by policy.
//
// Usage: node run-conformance.mjs [--strict] [invariant-id ...]
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const metaRoot = resolve(here, "..");
const strict = process.argv.includes("--strict");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const map = JSON.parse(readFileSync(join(here, "invariants.json"), "utf8")).invariants;
const repos = {};
for (const spec of Object.values(map)) {
  (repos[spec.repo] ??= []).push(spec);
}

const REPO_ROOTS = {
  "pi-ui-next": "D:/Workspace/pi-ui-next",
  "pi-context-manager": "D:/Workspace/pi-context-manager",
  "pi-code-runtime-next": "D:/Workspace/pi-code-runtime-next",
  "pi-generation-recovery-next": "D:/Workspace/pi-generation-recovery-next",
};

function runRepoTests(repo) {
  const root = REPO_ROOTS[repo];
  if (!root) return { tap: "", ok: false, error: "no known root" };
  const testDir = join(root, "test");
  let files = [];
  try {
    files = readdirSync(testDir).filter((f) => f.endsWith(".test.ts")).map((f) => join(testDir, f));
  } catch {
    return { tap: "", ok: false, error: "no test dir" };
  }
  if (files.length === 0) return { tap: "", ok: false, error: "no test files" };
  const res = spawnSync(process.execPath, [
    join(root, "node_modules", "tsx", "dist", "cli.mjs"),
    "--test", "--test-reporter", "tap",
    ...files,
  ], { cwd: root, encoding: "utf8", timeout: 600_000, shell: false });
  // node:test exits non-zero on failing tests; TAP still carries results.
  return { tap: (res.stdout ?? "") + (res.stderr ?? ""), ok: res.status === 0, error: res.error?.message };
}

function parseTap(tap) {
  const names = [];
  let failed = 0;
  for (const line of tap.split("\n")) {
    const m = /^(?:ok|not ok) \d+(?: -|# SUBTEST)?\s*(.+?)(?:\s+\(.*\))?\s*$/.exec(line.trim());
    if (m) {
      const name = m[1].replace(/^#\s*SUBTEST\s*/, "").trim();
      names.push({ ok: line.startsWith("ok "), name });
      if (line.startsWith("not ok")) failed++;
    }
  }
  return { names, failed };
}

const results = {};
const perRepo = {};
for (const [repo] of Object.entries(repos)) {
  process.stdout.write(`running ${repo}... `);
  const { tap, ok, error } = runRepoTests(repo);
  const { names, failed } = parseTap(tap);
  perRepo[repo] = { tests: names.length, failed, suiteOk: ok, error };
  console.log(`${names.length} tests, ${failed} failed`);
  for (const [inv, spec] of Object.entries(map)) {
    if (spec.repo !== repo) continue;
    if (only.length > 0 && !only.includes(inv)) continue;
    const re = new RegExp(spec.test, "i");
    if (spec.test.includes("MISSING-PLACEHOLDER")) {
      results[inv] = { status: "MISSING", repo, note: "no executable test mapped yet" };
      continue;
    }
    const hit = names.filter((n) => re.test(n.name));
    const anyFail = hit.some((n) => !n.ok);
    results[inv] = hit.length === 0
      ? { status: "MISSING", repo, note: `no test matches /${spec.test}/i` }
      : anyFail
        ? { status: "FAIL", repo, note: hit.filter((n) => !n.ok).map((n) => n.name).join("; ").slice(0, 200) }
        : { status: "PASS", repo, via: hit.map((n) => n.name).slice(0, 3) };
  }
}

console.log("\n=== INVARIANT CONFORMANCE REPORT ===");
let pass = 0, fail = 0, missing = 0;
for (const [inv, r] of Object.entries(results)) {
  console.log(`${r.status.padEnd(7)} ${inv.padEnd(4)} [${r.repo}]${r.note ? " — " + r.note : ""}${r.via ? " — via: " + r.via.join(" | ") : ""}`);
  if (r.status === "PASS") pass++;
  else if (r.status === "FAIL") fail++;
  else missing++;
}
console.log(`\nsummary: ${pass} PASS, ${fail} FAIL, ${missing} MISSING (of ${Object.keys(results).length})`);
const reportPath = join(here, "conformance-report.json");
writeFileSync(reportPath, JSON.stringify({ results, perRepo }, null, 2));
console.log("report:", reportPath);
process.exit(fail > 0 ? 1 : strict && missing > 0 ? 2 : 0);
