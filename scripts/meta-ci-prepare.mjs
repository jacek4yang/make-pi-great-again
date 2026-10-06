#!/usr/bin/env node
// Meta CI workspace preparation (public meta CI, brief §10-§11).
//
// Runs on a CLEAN hosted runner: clones every manifest repository at its
// EXACT pinned SHA from the public GitHub remote into a sibling workspace
// (no D:\Workspace, no local checkouts, no PAT — public read-only access),
// installs dependencies, then verifies manifest truth so the subsequent
// conformance + integration gates run against the real pinned revisions.
//
// Fails (exit non-zero) when: manifest invalid, repo missing, SHA not
// reachable on the public remote, npm ci fails, or the integration branch
// ref does not equal the pinned SHA (stale-truth guard).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const metaRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(metaRoot, "integration", "manifest.json"), "utf8"));

const REMOTE_BASE = process.env.PINX_REMOTE_BASE ?? "https://github.com/jacek4yang";
const workspace = process.env.PINX_WORKSPACE
  ? resolve(process.env.PINX_WORKSPACE)
  : mkdtempSibling();

function mkdtempSibling() {
  const base = join(process.env.RUNNER_TEMP ?? metaRoot, "pinx-ws-");
  const dir = `${base}${Math.random().toString(36).slice(2, 8)}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

function git(args, opts = {}) {
  const res = spawnSync("git", args, { encoding: "utf8", ...opts });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(res.stderr ?? res.stdout ?? "").slice(0, 400)}`);
  }
  return res.stdout.trim();
}

function npm(args, cwd) {
  const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const res = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: process.platform === "win32", timeout: 900_000 });
  if (res.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed in ${cwd}: ${(res.stderr ?? "").slice(-400)}`);
  }
}

// 1. Manifest structural validation (same rules as the integration gate).
if (manifest.integrationLine !== "integration/agent-body-v2") {
  throw new Error(`integrationLine mismatch: ${manifest.integrationLine}`);
}
if (!/^\d+\.\d+\.\d+$/.test(manifest.pi?.version ?? "")) throw new Error("pi.version invalid");
const seen = new Set();
const KNOWN = ["pi-context-manager", "pi-code-runtime-next", "pi-generation-recovery-next", "pi-ui-next", "pi-policy-next", "pi-task-next", "pi-github-next"];
for (const r of manifest.repositories) {
  if (!KNOWN.includes(r.repo)) throw new Error(`unknown repo in manifest: ${r.repo}`);
  if (seen.has(r.repo)) throw new Error(`duplicate repo: ${r.repo}`);
  seen.add(r.repo);
  if (!/^[0-9a-f]{40}$/.test(r.sha ?? "")) throw new Error(`${r.repo}: invalid sha`);
}
for (const repo of KNOWN) {
  if (!seen.has(repo)) throw new Error(`missing manifest repo: ${repo}`);
}
console.log(`manifest OK: ${manifest.repositories.length} repos @ integration/${manifest.integrationLine.split("/")[1]}`);

// 2. Clone each public repo and check out the EXACT pinned SHA.
for (const entry of manifest.repositories) {
  const target = join(workspace, entry.repo);
  if (!existsSync(target)) {
    git(["clone", "--quiet", `${REMOTE_BASE}/${entry.repo}.git`, target]);
  } else {
    git(["-C", target, "fetch", "--quiet", "origin"]);
  }
  git(["-C", target, "checkout", "--quiet", "--detach", entry.sha]);
  const head = git(["-C", target, "rev-parse", "HEAD"]);
  if (head !== entry.sha) throw new Error(`${entry.repo}: HEAD ${head} != pinned ${entry.sha}`);
  console.log(`cloned ${entry.repo} @ ${entry.sha.slice(0, 10)}`);
}

// 3. Stale-truth guard: the remote integration branch must equal the pin,
//    then materialize the local branch so the integration gate's ref check
//    resolves against verified truth.
for (const entry of manifest.repositories) {
  const target = join(workspace, entry.repo);
  const branchHead = git(["-C", target, "rev-parse", `origin/${entry.integrationBranch}`]);
  if (branchHead !== entry.sha) {
    throw new Error(`${entry.repo}: integration branch ${entry.integrationBranch} @ ${branchHead.slice(0, 10)} != pinned ${entry.sha.slice(0, 10)} (stale release truth)`);
  }
  git(["-C", target, "branch", "--quiet", "--force", entry.integrationBranch, entry.sha]);
}

// 4. Install dependencies per repo (component tests + benches need them).
for (const entry of manifest.repositories) {
  npm(["ci", "--loglevel=error", "--no-audit", "--no-fund"], join(workspace, entry.repo));
  console.log(`npm ci ${entry.repo}`);
}

console.log(`workspace ready: ${workspace}`);
console.log(`PINX_WORKSPACE=${workspace}`);
process.stdout.write(`::set-output name=workspace::${workspace}\n`);

function cleanupOnExit() {
  // best-effort; hosted runners discard the disk anyway
}
process.on("exit", cleanupOnExit);
void rmSync;
void createRequire;
