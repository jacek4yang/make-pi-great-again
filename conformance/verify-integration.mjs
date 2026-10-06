#!/usr/bin/env node
// Cross-repository integration gate: verifies every sibling repository's
// integration/agent-body-v2 head matches the pinned manifest SHA, then runs the
// cross-layer integration suite in pi-context-manager at those revisions.
// Fails loudly on any revision mismatch (no blind sibling imports).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const metaRoot = resolve(here, "..");
const workspace = process.env.PINX_WORKSPACE ?? resolve(metaRoot, "..");
const manifest = JSON.parse(readFileSync(join(metaRoot, "integration", "manifest.json"), "utf8"));

let failed = false;
for (const entry of manifest.repositories) {
  const root = join(workspace, entry.repo);
  if (!existsSync(join(root, ".git"))) {
    console.error(`FAIL ${entry.repo}: repository missing at ${root}`);
    failed = true;
    continue;
  }
  const head = spawnSync("git", ["-C", root, "rev-parse", entry.integrationBranch], { encoding: "utf8" });
  const sha = head.stdout.trim();
  const match = sha === entry.sha;
  console.log(`${match ? "OK  " : "FAIL"} ${entry.repo} ${entry.integrationBranch} @ ${sha.slice(0, 12)} (pinned ${entry.sha.slice(0, 12)})`);
  if (!match) failed = true;
}
if (failed) {
  console.error("INTEGRATION MANIFEST MISMATCH — move integration branches to the pinned commits or refresh the manifest");
  process.exit(1);
}

// Run the cross-layer suite at the pinned revisions.
const cm = manifest.repositories.find((r) => r.repo === "pi-context-manager");
const root = join(workspace, cm.repo);
const res = spawnSync(process.execPath, [
  join(root, "node_modules", "tsx", "dist", "cli.mjs"),
  "--test", join(root, "test", "integration-stack.test.ts"),
], { cwd: root, encoding: "utf8", timeout: 300000 });
const out = (res.stdout ?? "") + (res.stderr ?? "");
console.log(out.split("\n").filter((l) => /^ℹ (tests|pass|fail)/.test(l)).join("\n"));
process.exit(res.status === 0 ? 0 : 1);
