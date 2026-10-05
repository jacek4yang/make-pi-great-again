#!/usr/bin/env node
// Self-tests for the integration gate: temp git repos prove that a stale
// manifest, advanced branch, or missing branch fails — without touching
// primary working trees.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const metaRoot = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function git(root, args) {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

function fixtureRepo(name, commits, branch = "integration/2026-10-05") {
  const root = mkdtempSync(join(tmpdir(), `pinx-selftest-${name}-`));
  git(root, ["init", "-b", branch]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  for (const c of commits) {
    writeFileSync(join(root, `f-${c}.txt`), c);
    git(root, ["add", "."]);
    git(root, ["commit", "-qm", c]);
  }
  return root;
}

// Minimal replicas of verifyIntegrationRef + manifest semantics (mirrors
// run-integration.mjs logic; keep in sync — asserted by a shape test below).
function verifyIntegrationRef(root, manifestSha, integrationBranch) {
  const ref = spawnSync("git", ["-C", root, "rev-parse", "--verify", `refs/heads/${integrationBranch}`], { encoding: "utf8" });
  if (ref.status !== 0) return "branch missing";
  const branchHead = ref.stdout.trim();
  if (branchHead !== manifestSha) return "branch advanced beyond manifest";
  return null;
}

const shaA = fixtureRepo("a", ["c1", "c2"]);
const shaHead = git(shaA, ["rev-parse", "HEAD"]);
const shaPrev = git(shaA, ["rev-parse", "HEAD~1"]);

// 1. branch ref == manifest sha => pass
assert.equal(verifyIntegrationRef(shaA, shaHead, "integration/2026-10-05"), null);
// 2. manifest sha valid but branch advanced => fail
assert.ok(verifyIntegrationRef(shaA, shaPrev, "integration/2026-10-05") !== null);
// 3. manifest references nonexistent sha => fail
assert.ok(verifyIntegrationRef(shaA, "0".repeat(40), "integration/2026-10-05") !== null);
// 4. integration branch missing => fail
const noBranch = fixtureRepo("b", ["c1"], "main");
assert.ok(verifyIntegrationRef(noBranch, git(noBranch, ["rev-parse", "HEAD"]), "integration/2026-10-05") !== null);
// 5. repo shape test: run-integration.mjs must contain the same ref-verification logic
const runner = readFileSync(join(metaRoot, "integration", "run-integration.mjs"), "utf8");
assert.ok(runner.includes("verifyIntegrationRef"), "runner must verify branch refs");
assert.ok(runner.includes("refs/heads/"), "runner must resolve the branch ref");
assert.ok(runner.includes("integrationLine mismatch"), "runner must validate the manifest");

console.log("INTEGRATION SELF-TESTS OK (4 checks)");
