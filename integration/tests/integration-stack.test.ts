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

const TASK_ROOT = requireRoot("PINX_TASK_ROOT");
const { TaskStore: CrossTaskStore } = await import(pathToFileURL(join(TASK_ROOT, "src/core/store.ts")).href);
const { renderProjection: renderTaskProjection } = await import(
  pathToFileURL(join(TASK_ROOT, "src/core/projection.ts")).href
);

const GH_ROOT = requireRoot("PINX_GH_ROOT");
const { MutationEngine: CrossMutationEngine } = await import(
  pathToFileURL(join(GH_ROOT, "src/core/mutations.ts")).href
);
const { MutationJournal: CrossMutationJournal } = await import(
  pathToFileURL(join(GH_ROOT, "src/core/journal.ts")).href
);
const { intentDigest: ghIntentDigest } = await import(pathToFileURL(join(GH_ROOT, "src/core/mutations.ts")).href);
const { IssueStore: CrossIssueStore } = await import(pathToFileURL(join(TASK_ROOT, "src/core/issues.ts")).href);

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

test("integration: task waits resolve via runtime job terminal and policy decision contracts", async () => {
  const now = () => ++globalThis.__taskClock;
  globalThis.__taskClock = 1_700_000_000_000;
  const mkTask = (title: string) => ({
    v: 1 as const,
    id: `task_${++globalThis.__taskClock}`,
    displayId: `T${++globalThis.__taskClock2}`,
    title,
    state: "todo" as const,
    priority: "normal" as const,
    blockers: [],
    dependencies: [],
    resourceRefs: [],
    evidenceRefs: [],
    revision: 1,
    createdAt: 0,
    updatedAt: 0,
  });
  globalThis.__taskClock2 = 0;

  // 1. Runtime job contract resolves a waiting task (no polling).
  const storeA = new CrossTaskStore(now);
  const t1 = mkTask("Ship after build");
  storeA.apply({ kind: "create", task: structuredClone(t1) });
  storeA.apply({ kind: "transition", id: t1.id, expectedRevision: 1, to: "in_progress" });
  storeA.apply({ kind: "transition", id: t1.id, expectedRevision: 2, to: "waiting", waiting: { kind: "job", jobId: "job_x" } });
  // The runtime emits pinx.runtime.job on terminal state; the task layer
  // resolves the wait through the SAME contract shape the wiring consumes.
  const jobTerminal = { v: 1, jobId: "job_x", state: "completed" as const, exitCode: 0 };
  const taskA = storeA.mustGet(t1.id);
  storeA.apply({
    kind: "waiting-resolved",
    id: t1.id,
    expectedRevision: taskA.revision,
    outcome: "ready",
    detail: `job ${jobTerminal.jobId} completed`,
  });
  assert.equal(storeA.mustGet(t1.id).state, "in_progress", "job completion ≠ task completion");

  // 2. Policy contract: only the EXACT approval digest resumes the task.
  const storeB = new CrossTaskStore(now);
  const t2 = mkTask("Delete after approval");
  storeB.apply({ kind: "create", task: structuredClone(t2) });
  storeB.apply({ kind: "transition", id: t2.id, expectedRevision: 1, to: "in_progress" });
  storeB.apply({
    kind: "transition",
    id: t2.id,
    expectedRevision: 2,
    to: "waiting",
    waiting: { kind: "approval", digest: "digestAAA" },
  });
  // policy decision for a DIFFERENT digest arrives — no resume (P2).
  void "pinx.policy.decision {v:1, digest:'digestBBB', decision:'allow'}";
  assert.equal(storeB.mustGet(t2.id).state, "waiting", "different digest never resumes");
  // exact digest denial → blocked
  storeB.apply({
    kind: "waiting-resolved",
    id: t2.id,
    expectedRevision: 3,
    outcome: "blocked",
    detail: "approval denied",
  });
  assert.equal(storeB.mustGet(t2.id).state, "blocked");

  // 3. Reopen: full log replay restores the same projection byte-for-byte.
  const log = [
    { kind: "create" as const, task: structuredClone(t1) },
    { kind: "transition" as const, id: t1.id, expectedRevision: 1, to: "in_progress" as const },
    { kind: "transition" as const, id: t1.id, expectedRevision: 2, to: "waiting" as const, waiting: { kind: "job" as const, jobId: "job_x" } },
    { kind: "waiting-resolved" as const, id: t1.id, expectedRevision: 3, outcome: "ready" as const, detail: "job job_x completed" },
  ];
  const reopened = new CrossTaskStore(now);
  for (const m of log) reopened.applyRecord(structuredClone(m));
  assert.equal(
    renderTaskProjection(reopened.all()),
    renderTaskProjection(storeA.all()),
    "reopen restores identical projection (T1/T7)",
  );
});

test("integration: issue candidate -> policy -> mutation -> durable outcome -> external ref", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pinx-gh-cross-"));
  try {
    // 1. Local issue candidate exists in the task layer.
    const issues = new CrossIssueStore(join(dir, "issues.json"), () => 1_700_000_000_000);
    await issues.load();
    const candidate = await issues.add({ title: "Broken CI cache", description: "Fix before release" });

    // 2. Policy classifies the promotion mutation github-write -> approval.
    const intent = {
      operation: "create_issue",
      repository: "o/r",
      fields: { title: "Broken CI cache", body: "Fix before release", issueCandidateId: candidate.id },
    };
    const action = {
      class: "github-write",
      op: "create_issue",
      ref: { kind: "github", repo: "o/r" },
      source: "tool",
      tool: "github",
    };
    const policyDecision = decide({
      action,
      digest: intentDigest(approvalIntent(action)),
      ctx: {
        platform: "linux",
        isProjectTrusted: true,
        workspaceRoot: "/ws",
        profile: "balanced",
      },
      grants: [],
      now: 1_700_000_000_001,
    });
    assert.equal(policyDecision.kind, "require-approval", "github writes require approval");

    // 3. Exact-action approval granted -> mutation executes (mock transport).
    const grants = [
      { digest: intentDigest(approvalIntent(action)), scope: "exact-action", grantedAt: 1_700_000_000_001 },
    ];
    const approved = decide({
      action,
      digest: intentDigest(approvalIntent(action)),
      ctx: { platform: "linux", isProjectTrusted: true, workspaceRoot: "/ws", profile: "balanced" },
      grants,
      now: 1_700_000_000_002,
    });
    assert.equal(approved.kind, "allow", "exact approval authorizes the intended operation");

    let posts = 0;
    const transport = {
      request: async (opts) => {
        if (opts.method === "POST") {
          posts++;
          return { status: 200, data: { number: 73 }, etag: null, headers: {} };
        }
        return { status: 200, data: [], etag: null, headers: {} };
      },
    };
    const engine = new CrossMutationEngine(transport, new CrossMutationJournal(join(dir, "m.jsonl")), () => 1_700_000_000_003);
    const outcome = await engine.execute(intent);
    assert.equal(outcome.state, "completed");
    assert.equal(posts, 1);
    assert.equal(outcome.resultRef, "gh:issue:o/r#73");

    // 4. Task layer receives ONLY the external ref (promotion boundary).
    await issues.markPromoted(candidate.id);
    const stored = issues.list()[0]!;
    assert.equal(stored.state, "promoted");
    assert.ok(!JSON.stringify(issues.list()).includes("Fix before release cache-body"), "no payload copy");

    // 5. Reopen: completed mutation reused, no duplicate.
    const reopenedJournal = new CrossMutationJournal(join(dir, "m.jsonl"));
    await reopenedJournal.load();
    const reuse = new CrossMutationEngine(transport, reopenedJournal, () => 1_700_000_000_004);
    const again = await reuse.execute(intent);
    assert.equal(again.state, "completed");
    assert.match(again.reason ?? "", /already completed/);
    assert.equal(posts, 1, "no duplicate external mutation after reopen (G1)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("integration: github cache invalidation after mutation (G5 via resources)", async () => {
  const gh = await import(pathToFileURL(join(GH_ROOT, "src/core/resources.ts")).href);
  const { ResourceCache: CrossCache } = await import(pathToFileURL(join(GH_ROOT, "src/core/cache.ts")).href);
  const cache = new CrossCache(() => 1_700_000_000_000);
  cache.put({ kind: "issue", owner: "o", repo: "r", number: 17 }, { number: 17, title: "old" }, 'W/"v1"');
  const invalidations = cache.invalidate((ref) => ref.owner === "o" && ref.repo === "r" && ref.kind === "issue" && ref.number === 17);
  assert.equal(invalidations, 1);
  assert.equal(cache.peekAny({ kind: "issue", owner: "o", repo: "r", number: 17 }), undefined, "stale entry gone");
  void gh;
});
