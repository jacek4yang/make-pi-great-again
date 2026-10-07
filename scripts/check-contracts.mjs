#!/usr/bin/env node
// Validates contract fixtures in ../fixtures against JSON Schemas in
// integration/contracts using Node's built-in type stripping + ajv-free
// minimal validation. Zero dependencies by policy (see docs/SECURITY.md).
// If a full JSON Schema validator is ever required, add it as an explicit
// devDependency in a dedicated PR.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = join(root, "fixtures");
const invalid = [];

const requiredTopLevel = {
  "pinx.activity": ["v", "kind", "summary", "ts"],
  "pinx.context.status": ["v", "usedTokens", "breakdown"],
  "pinx.evidence-ref": ["v", "id", "sessionId", "entryId", "sha256", "bytes", "createdAt"],
  "pinx.checkpoint": ["v", "checkpointId", "atEntryId", "goal", "constraints", "evidenceRefs"],
  "pinx.exec-details": ["v", "shape"],
  "pinx.recovery-status": ["v", "state"],
  "pinx.policy.request": ["v", "digest", "actionClass", "op"],
  "pinx.policy.decision": ["v", "digest", "decision", "reason"],
  "pinx.runtime.job": ["v", "jobId", "state"],
  "pinx.task.changed": ["v", "taskId", "state", "revision"],
  "pinx.github.mutation": ["v", "operationId", "state"],
  "pinx.ci.terminal": ["v", "watchId", "state"],
  "pinx.telemetry": ["v", "metric", "value", "source", "unit", "ts"],
};

let checked = 0;
for (const file of readdirSync(fixturesDir)) {
  if (!file.endsWith(".json")) continue;
  const base = file.replace(/\.invalid\.json$/, "").replace(/\.json$/, "").replace(/\.event$/, "");
  const isInvalid = file.endsWith(".invalid.json");
  const kind = requiredTopLevel[base] ? base : (base.split(".")[0] === "pinx" ? base.split(".").slice(0, 2).join(".") : base.split(".")[0]);
  let payload;
  try {
    payload = JSON.parse(readFileSync(join(fixturesDir, file), "utf8"));
  } catch (e) {
    invalid.push(`${file}: not valid JSON: ${e.message}`);
    continue;
  }
  const req = requiredTopLevel[base] ?? requiredTopLevel[kind];
  if (!req) continue; // not a contract fixture
  checked++;
  const problems = req.filter((k) => !(k in payload));
  if (isInvalid) {
    if (problems.length === 0) invalid.push(`${file}: marked invalid but has all required fields`);
    continue;
  }
  if (problems.length > 0) invalid.push(`${file}: missing ${problems.join(", ")}`);
  if (typeof payload.v !== "number") invalid.push(`${file}: v must be number`);
}

if (invalid.length > 0) {
  console.error("CONTRACT FIXTURE FAILURES:");
  for (const line of invalid) console.error("  - " + line);
  process.exit(1);
}
console.log(`contract fixtures OK (${checked} validated)`);
