// Cross-repository integration test — OWNED BY THE META REPOSITORY.
// Repo roots are injected by run-integration.mjs (worktrees pinned to exact
// manifest SHAs), so this file has no fragile ../../ sibling assumptions.
// Requires env: PINX_CM_ROOT, PINX_RT_ROOT, PINX_REC_ROOT.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function requireRoot(env) {
  const value = process.env[env];
  if (!value) throw new Error(env + " not set — run via integration/run-integration.mjs");
  return value;
}

const CM_ROOT = requireRoot("PINX_CM_ROOT");
const RT_ROOT = requireRoot("PINX_RT_ROOT");
const REC_ROOT = requireRoot("PINX_REC_ROOT");

const { EvidenceStore } = await import(pathToFileURL(join(CM_ROOT, "src/evidence/store.ts")).href);
const { planHygiene } = await import(pathToFileURL(join(CM_ROOT, "src/hygiene/hygiene.ts")).href);
const { DEFAULT_HYGIENE_POLICY } = await import(pathToFileURL(join(CM_ROOT, "src/core/types.ts")).href);
const { SourceStore } = await import(pathToFileURL(join(RT_ROOT, "src/runtime/store.ts")).href);
const { Journal, recordHash } = await import(pathToFileURL(join(REC_ROOT, "src/journal/journal.ts")).href);
const { computeSafeFrontier } = await import(pathToFileURL(join(REC_ROOT, "src/recovery/frontier.ts")).href);

const NOW = Date.now();
const OLD = NOW - DEFAULT_HYGIENE_POLICY.recentWindowMs - 60000;

test("integration: hygiene archive, retained source, and recovery journal agree on one session", async () => {
  const sessionId = "itest-session-1";
  const dir = mkdtempSync(join(tmpdir(), "pinx-integration-"));
  try {
    // 1. Context manager: archive a large old read output.
    const evidence = new EvidenceStore(join(dir, "evidence"));
    const item = { entryId: "entry-read-1", role: "toolResult", toolName: "read", chars: 9000, ts: OLD, isError: false };
    const plan = await planHygiene(sessionId, [{ item, content: "r".repeat(9000) }], evidence, DEFAULT_HYGIENE_POLICY, { minChars: 4000, maxEditsPerTurn: 8 }, NOW);
    assert.equal(plan.entries.length, 1);
    const ref = plan.entries[0].ref;
    assert.ok(await evidence.get(ref, { sessionId, entryId: ref.entryId }).then((c) => c.length === 9000));

    // 2. Code runtime: retain a source buffer revision for the fix.
    const sources = new SourceStore();
    sources.save("fix", "console.log('attempt')", "node");
    sources.patch("fix", 1, [{ kind: "replace", old: "attempt", new: "fixed" }]);
    assert.equal(sources.currentSource("fix").source, "console.log('fixed')");
    assert.equal(sources.get("fix").revisions[1].parentHash, sources.get("fix").revisions[0].hash);

    // 3. Recovery: journal the interrupted generation; tool calls never join
    //    the safe prefix, so no side effect can be duplicated (V3/V4/V5).
    const journal = new Journal(join(dir, "journal", sessionId + ".jsonl"));
    const blocks = [
      { kind: "text", complete: true, text: "Investigation complete. " },
      { kind: "toolCall", complete: true, toolName: "bash" },
    ];
    const frontier = computeSafeFrontier(blocks);
    const attempt = journal.append({
      kind: "attempt",
      attemptId: "att_it1",
      sessionId,
      frontier: frontier.frontier,
      safePrefix: frontier.safePrefix,
      evidenceRef: ref.id,
      buffer: { name: "fix", revision: sources.currentSource("fix").revision },
    });
    assert.equal(frontier.safePrefix.length, 1);
    assert.equal(attempt.hash, recordHash(null, attempt.data));

    // 4. Cross-component identity: journal provenance still resolves.
    assert.equal(ref.entryId, "entry-read-1");
    assert.equal(sources.currentSource("fix").revision, attempt.data.buffer.revision);
    const replayed = new Journal(join(dir, "journal", sessionId + ".jsonl")).read()[0];
    assert.equal(replayed.data.attemptId, "att_it1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
