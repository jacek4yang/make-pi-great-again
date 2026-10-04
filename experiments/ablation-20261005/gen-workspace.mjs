// Generates the deterministic synthetic coding workspace for the ablation
// study. Same bytes for every run/arm; ground truth recorded for grading.
// Usage: node gen-workspace.mjs <target-dir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const target = process.argv[2];
if (!target) {
  console.error("usage: gen-workspace.mjs <target-dir>");
  process.exit(1);
}
mkdirSync(join(target, "src", "utils"), { recursive: true });
mkdirSync(join(target, "logs"), { recursive: true });
mkdirSync(join(target, "test"), { recursive: true });

// --- application code (contains the planted bug) ---
writeFileSync(join(target, "src", "utils", "format.js"), `// Formatting helpers.

// BUG-PLANTED: rounds 0.2875 to "29%" instead of "28.8%".
// The public contract (see test/run-tests.js) is one decimal place.
function formatPercent(x) {
  return (x * 100).toFixed(0) + "%";
}

function formatBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

module.exports = { formatPercent, formatBytes };
`);

writeFileSync(join(target, "src", "app.js"), `const { formatPercent, formatBytes } = require("./utils/format");

function report(items) {
  const total = items.reduce((sum, i) => sum + i.value, 0);
  return items
    .map((i) => i.name + ": " + formatPercent(i.value / total) + " of " + formatBytes(total))
    .join("\\n");
}

module.exports = { report };
`);

writeFileSync(join(target, "test", "run-tests.js"), `const assert = require("assert");
const { formatPercent, formatBytes } = require("../src/utils/format");

const failures = [];
function test(name, fn) {
  try { fn(); } catch (e) { failures.push(name + ": " + e.message); }
}

test("formatPercent uses one decimal place", () => {
  assert.strictEqual(formatPercent(0.2875), "28.8%");
  assert.strictEqual(formatPercent(0.5), "50.0%");
  assert.strictEqual(formatPercent(1), "100.0%");
});

test("formatBytes stays intact", () => {
  assert.strictEqual(formatBytes(512), "512 B");
  assert.strictEqual(formatBytes(2048), "2.0 KB");
});

if (failures.length > 0) {
  console.error("TESTS FAILED (" + failures.length + "):");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("ALL TESTS PASSED");
`);

// --- deterministic logs (large tool outputs drive context pressure) ---
let firstBugTraceId = null;
const debugLines = [];
for (let i = 0; i < 4000; i++) {
  const ts = `2026-10-05T09:${String(Math.floor(i / 60) % 60).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z`;
  if (i % 7 === 3) {
    const id = `BT-${String(1007 + Math.floor(i / 7)).padStart(4, "0")}`;
    if (firstBugTraceId === null) firstBugTraceId = id;
    debugLines.push(`${ts} WARN scheduler retry id=EV-${i} BUG-TRACE ${id} module=queue depth=${i % 13}`);
  } else {
    debugLines.push(`${ts} INFO scheduler tick id=EV-${i} module=queue depth=${i % 13} load=${(i % 97) / 100}`);
  }
}
writeFileSync(join(target, "logs", "debug.log"), debugLines.join("\n") + "\n");

const trafficLines = [];
for (let i = 0; i < 3000; i++) {
  trafficLines.push(`req-${i} GET /api/v1/item/${i % 500} took=${i % 300}ms status=${i % 5 === 0 ? 500 : 200} payload=${"p".repeat(24)}`);
}
writeFileSync(join(target, "logs", "traffic.log"), trafficLines.join("\n") + "\n");

writeFileSync(
  join(target, "ground-truth.json"),
  JSON.stringify({ firstBugTraceId, bugFile: "src/utils/format.js", expected: "ALL TESTS PASSED" }, null, 2),
);
console.log("workspace generated at", target, "| firstBugTraceId =", firstBugTraceId);
