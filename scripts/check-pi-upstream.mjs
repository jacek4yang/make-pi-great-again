#!/usr/bin/env node
// Upstream Pi freshness check: compares the pinned stable Pi version against
// the newest published stable @earendil-works/pi-coding-agent on npm.
// Exit 0 = current; exit 5 = update available (dedicated upstream-watch job);
// exit 3 = upstream unreachable. Prereleases are never treated as stable.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const metaRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(metaRoot, "integration", "manifest.json"), "utf8"));
const pinned = manifest.pi.version;

const res = await fetch("https://registry.npmjs.org/@earendil-works/pi-coding-agent", { signal: AbortSignal.timeout(30000) });
if (!res.ok) {
  console.error(`upstream unreachable: npm registry status ${res.status}`);
  process.exit(3);
}
const meta = await res.json();
const versions = Object.keys(meta.versions ?? {}).filter((v) => !/[-]/.test(v));
const latestStable = meta["dist-tags"]?.latest;

const report = {
  pinned_version: pinned,
  latest_stable_version: latestStable,
  stable_versions_tail: versions.slice(-5),
  status: pinned === latestStable ? "current" : "update-available",
};
console.log(JSON.stringify(report, null, 2));
if (report.status !== "current") {
  console.error(`UPDATE AVAILABLE: Pi ${latestStable} published; stack pinned to ${pinned}. Run the Pi upgrade checklist (docs/PI-UPGRADE-CHECKLIST.md).`);
  process.exit(5);
}
