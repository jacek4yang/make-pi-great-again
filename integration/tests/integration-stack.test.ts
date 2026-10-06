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

const POLICY_ROOT = requireRoot("PINX_POLICY_ROOT");

const { EvidenceStore } = await import(pathToFileURL(join(CM_ROOT, "src/evidence/store.ts")).href);
const { planHygiene } = await import(pathToFileURL(join(CM_ROOT, "src/hygiene/hygiene.ts")).href);
const { DEFAULT_HYGIENE_POLICY } = await import(pathToFileURL(join(CM_ROOT, "src/core/types.ts")).href);
const { SourceStore } = await import(pathToFileURL(join(RT_ROOT, "src/runtime/store.ts")).href);
const { Journal, recordHash } = await import(pathToFileURL(join(REC_ROOT, "src/journal/journal.ts")).href);
const { computeSafeFrontier } = await import(pathToFileURL(join(REC_ROOT, "src/recovery/frontier.ts")).href);

const { actionFromToolCall, actionFromUserBash, approvalIntent } = await import(
  pathToFileURL(join(POLICY_ROOT, "src/core/intent.ts")).href
);
const { intentDigest } = await import(pathToFileURL(join(POLICY_ROOT, "src/core/digest.ts")).href);
const { decide } = await import(pathToFileURL(join(POLICY_ROOT, "src/core/policy.ts")).href);
const { ApprovalLedger } = await import(pathToFileURL(join(POLICY_ROOT, "src/core/ledger.ts")).href);
const { classifyShell } = await import(pathToFileURL(join(POLICY_ROOT, "src/core/shell.ts")).href);

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

test("integration: policy gates the stack — allow, block, approve, and refuse", async () => {
  const workspaceRoot = process.platform === "win32" ? "d:\\ws" : "/home/dev/ws";
  const homeDir = process.platform === "win32" ? "c:\\users\\dev" : "/home/dev";
  const ctx = {
    platform: process.platform === "win32" ? ("win32" as const) : ("linux" as const),
    isProjectTrusted: true,
    workspaceRoot,
    homeDir,
    agentDir: join(homeDir, ".pi", "agent"),
    protectedPaths: [],
    profile: "balanced" as const,
  };
  const now = 1_700_000_000_000;
  const ledger = new ApprovalLedger();

  const run = (action: ReturnType<typeof actionFromToolCall>) => {
    const digest = intentDigest(approvalIntent(action));
    return { digest, decision: decide({ action, digest, ctx, grants: ledger.list(), now }) };
  };

  // 1. Safe operation inside the trusted workspace is ALLOWED.
  const read = run(actionFromToolCall({ toolName: "read", input: { path: "src/a.ts" } }, ctx));
  assert.equal(read.decision.kind, "allow");

  // 2. Sensitive operation is BLOCKED pending approval (no grant present).
  const del = actionFromUserBash("rm -rf target", ctx);
  assert.equal(classifyShell("rm -rf target").findings[0]?.op, "recursive-delete");
  const sensitive = run(del);
  assert.equal(sensitive.decision.kind, "require-approval");

  // 3. The user approves the EXACT intent: the intended operation proceeds.
  ledger.grant(approvalIntent(del), "exact-action", now);
  const retried = run(actionFromUserBash("rm -rf target", ctx));
  assert.equal(retried.decision.kind, "allow");

  // 4. A materially DIFFERENT action is refused (P2: digest mismatch).
  const changed = run(actionFromUserBash("rm -rf other", ctx));
  assert.equal(changed.decision.kind, "require-approval");

  // 5. Cross-stack discipline: policy state never enters the context layer
  //    (it owns no context entries), and stack tools stay classified.
  assert.equal(
    run(actionFromToolCall({ toolName: "code", input: { source: "1+1" } }, ctx)).decision.kind,
    "allow",
    "trusted-workspace execution allowed",
  );
  assert.equal(
    run(actionFromToolCall({ toolName: "pinx_recall", input: { ref: "ev_x" } }, ctx)).decision.kind,
    "allow",
    "recall is read-class",
  );
});
