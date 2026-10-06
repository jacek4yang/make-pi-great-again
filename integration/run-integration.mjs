#!/usr/bin/env node
// Integration gate (BLOCKER 2): materialize every repository at the EXACT
// manifest SHA via detached git worktrees, verify HEAD == pinned SHA and a
// clean tree, then run component + cross-layer integration tests against
// those worktrees. The user's primary checkouts are never mutated.
//
// Exit: 0 green; 1 manifest/revision/setup/test failure.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const metaRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = process.env.PINX_WORKSPACE ?? resolve(metaRoot, "..");
const KNOWN_REPOS = ["pi-context-manager", "pi-code-runtime-next", "pi-generation-recovery-next", "pi-ui-next", "pi-policy-next", "pi-task-next"];

function validateManifest(manifest) {
  const errors = [];
  if (manifest.integrationLine !== "integration/agent-body-v2") errors.push(`integrationLine mismatch: ${manifest.integrationLine}`);
  if (manifest.contractVersion !== 1) errors.push(`contractVersion must be 1, got ${manifest.contractVersion}`);
  if (!/^\d+\.\d+\.\d+$/.test(manifest.pi?.version ?? "")) errors.push("pi.version missing or invalid");
  const seen = new Set();
  for (const r of manifest.repositories ?? []) {
    if (!KNOWN_REPOS.includes(r.repo)) errors.push(`unknown repository: ${r.repo}`);
    if (seen.has(r.repo)) errors.push(`duplicate repository entry: ${r.repo}`);
    seen.add(r.repo);
    if (!/^[0-9a-f]{40}$/.test(r.sha ?? "")) errors.push(`${r.repo}: invalid sha format`);
    if (!r.integrationBranch) errors.push(`${r.repo}: missing integrationBranch`);
  }
  for (const repo of KNOWN_REPOS) {
    if (!seen.has(repo)) errors.push(`missing repository entry: ${repo}`);
  }
  return errors;
}

// Integration branch ref must resolve AND equal the manifest SHA. An old
// valid manifest commit must NOT pass when the branch has advanced.
function verifyIntegrationRef(root, repo, manifestSha, integrationBranch) {
  const ref = spawnSync("git", ["-C", root, "rev-parse", "--verify", `refs/heads/${integrationBranch}`], { encoding: "utf8" });
  if (ref.status !== 0) return `FAIL ${repo}: integration branch ${integrationBranch} does not resolve locally`;
  const branchHead = ref.stdout.trim();
  if (branchHead !== manifestSha) {
    return `FAIL ${repo}: integration branch HEAD ${branchHead.slice(0, 12)} != manifest SHA ${manifestSha.slice(0, 12)} (manifest stale or branch advanced)`;
  }
  return null;
}

const manifest = JSON.parse(readFileSync(join(metaRoot, "integration", "manifest.json"), "utf8"));
const manifestErrors = validateManifest(manifest);
if (manifestErrors.length > 0) {
  console.error("FATAL: manifest validation failed:", manifestErrors.join("; "));
  process.exit(3);
}
const workRoot = mkdtempSync(join(tmpdir(), "pinx-integration-wt-"));
const worktrees = [];

function git(repo, args, opts = {}) {
  const root = join(workspace, repo);
  const res = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", ...opts });
  if (res.status !== 0) throw new Error(`git ${args.join(" ")} failed for ${repo}: ${res.stderr}`);
  return res.stdout.trim();
}

let failed = false;
try {
  // 1. Materialize exact pinned SHAs as detached worktrees.
  const roots = {};
  for (const entry of manifest.repositories) {
    const root = join(workspace, entry.repo);
    if (!existsSync(join(root, ".git"))) {
      console.error(`FAIL ${entry.repo}: repository missing at ${root}`);
      failed = true;
      continue;
    }
    // pinned commit must exist
    const cat = spawnSync("git", ["-C", root, "cat-file", "-e", `${entry.sha}^{commit}`], { encoding: "utf8" });
    if (cat.status !== 0) {
      console.error(`FAIL ${entry.repo}: pinned commit ${entry.sha.slice(0, 12)} does not exist`);
      failed = true;
      continue;
    }
    // integration branch ref must resolve and equal the manifest SHA
    const refProblem = verifyIntegrationRef(root, entry.repo, entry.sha, entry.integrationBranch ?? "integration/agent-body-v2");
    if (refProblem) {
      console.error(refProblem);
      failed = true;
      continue;
    }
    const wt = join(workRoot, entry.repo);
    git(entry.repo, ["worktree", "add", "--detach", wt, entry.sha]);
    worktrees.push({ repo: entry.repo, wt, primary: root });
    const head = spawnSync("git", ["-C", wt, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
    const status = spawnSync("git", ["-C", wt, "status", "--porcelain"], { encoding: "utf8" }).stdout.trim();
    if (head !== entry.sha) {
      console.error(`FAIL ${entry.repo}: worktree HEAD ${head.slice(0, 12)} != pinned ${entry.sha.slice(0, 12)}`);
      failed = true;
    } else if (status !== "") {
      console.error(`FAIL ${entry.repo}: worktree is dirty`);
      failed = true;
    } else {
      console.log(`OK   ${entry.repo} pinned @ ${head.slice(0, 12)} (worktree)`);
    }
    roots[entry.repo] = wt;
  }
  if (failed) throw new Error("manifest/revision verification failed");

  // 2. Install dependencies where the worktrees need them. The integration
  //    test needs only tsx; use it from a worktree after npm ci there.
  const cm = roots["pi-context-manager"];
  console.log("installing dependencies in pi-context-manager worktree...");
  const ci = spawnSync("npm", ["ci", "--loglevel=error"], { cwd: cm, encoding: "utf8", timeout: 600000, shell: process.platform === "win32" });
  if (ci.status !== 0) throw new Error(`npm ci failed in worktree: ${(ci.stderr ?? "").slice(-300)}`);
  const tsxCli = join(cm, "node_modules", "tsx", "dist", "cli.mjs");

  // 3. Cross-layer integration test against the exact worktree revisions.
  const env = {
    ...process.env,
    PINX_CM_ROOT: roots["pi-context-manager"],
    PINX_RT_ROOT: roots["pi-code-runtime-next"],
    PINX_REC_ROOT: roots["pi-generation-recovery-next"],
    PINX_POLICY_ROOT: roots["pi-policy-next"],
    PINX_TASK_ROOT: roots["pi-task-next"],
  };
  const res = spawnSync(process.execPath, [tsxCli, "--test", join(metaRoot, "integration", "tests", "integration-stack.test.ts")], {
    cwd: cm, encoding: "utf8", timeout: 600000, env,
  });
  const out = (res.stdout ?? "") + (res.stderr ?? "");
  console.log(out.split("\n").filter((l) => /^ℹ (tests|pass|fail)/.test(l)).join("\n") || out.slice(-400));
  if (res.status !== 0) {
    console.error("FAIL cross-layer integration suite");
    failed = true;
  } else {
    console.log("OK   cross-layer integration suite");
  }
} catch (e) {
  console.error(`FAIL: ${e.message}`);
  failed = true;
} finally {
  // 4. Safe cleanup: remove worktrees (primary checkouts untouched).
  for (const { repo, wt, primary } of worktrees) {
    const rm = spawnSync("git", ["-C", primary, "worktree", "remove", "--force", wt], { encoding: "utf8" });
    if (rm.status !== 0) console.error(`WARN: worktree cleanup failed for ${repo}: ${rm.stderr}`);
  }
  try { rmSync(workRoot, { recursive: true, force: true }); } catch {}
}

process.exit(failed ? 1 : 0);
