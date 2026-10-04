// Ablation + A/B driver: same task, same model, three arms, N runs.
//
//   baseline       : Pi 1.0.2 as shipped (no pinx packages)
//   ours-hygiene-off : pinx stack installed but PINX_HYGIENE=off (component
//                      ablation: isolates our extension's own overhead)
//   ours-full      : pinx stack with deterministic hygiene + recall active
//
// All arms get identical prompts and identical base agent config. Metrics come
// from provider-reported usage in the session JSONL — never from char counts.
// Uses the intern/glm-5.3 provider configured in the user's models.json; Pi
// owns auth. A temporary agent home is created per run (no auth.json copied).
//
// Usage: node run-ablation.mjs [runsPerArm]
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REAL_AGENT_DIR = join(process.env.USERPROFILE ?? "", ".pi", "agent");
// Windows-safe spawn target: pi's real node entry (no .cmd, no shell quoting).
const GLOBAL_NM = process.env.PINX_GLOBAL_NM ?? "D:/Applications/Scoop/persist/nodejs/bin/node_modules";
const PI_CLI_JS = join(GLOBAL_NM, "@earendil-works", "pi-coding-agent", "dist", "cli.js");
if (!existsSync(PI_CLI_JS)) {
  console.error("pi cli.js not found at", PI_CLI_JS);
  process.exit(1);
}
const MODEL = process.env.ABLATION_MODEL ?? "intern/glm-5.3";
const RUNS = Number(process.argv[2] ?? 3);
const OUT_DIR = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const RESULTS_DIR = join(OUT_DIR, "results");
mkdirSync(RESULTS_DIR, { recursive: true });

const BASE_PACKAGES = [
  "npm:@ff-labs/pi-fff",
  "npm:@narumitw/pi-lsp",
  "git:github.com/championswimmer/pi-context-usage",
];
const PINX_PACKAGES = ["D:\\Workspace\\pi-ui-next", "D:\\Workspace\\pi-context-manager"];

const ARMS = [
  { id: "baseline", packages: BASE_PACKAGES, env: {} },
  { id: "ours-hygiene-off", packages: [...BASE_PACKAGES, ...PINX_PACKAGES], env: { PINX_HYGIENE: "off" } },
  { id: "ours-full", packages: [...BASE_PACKAGES, ...PINX_PACKAGES], env: { PINX_HYGIENE_RECENT_MS: "1200", PINX_HYGIENE_ARCHIVABLE: "ffgrep" } },
];

const LONG_PATTERNS = ["status=500", "latency=1", "req-12", "took=2", "payload", "item/4", "status=200", "latency=9", "req-7", "took=1"];

const TURNS = process.env.ABLATION_LONG === "1"
  ? [
      "Investigate this repo. Step 1: use grep to search for 'BUG-TRACE' in logs/debug.log. Step 2: use the read tool on src/utils/format.js. Then reply with one short sentence about what you saw.",
      ...LONG_PATTERNS.map(
        (pattern) => `Use grep to search for '${pattern}' in logs/traffic.log. Reply with exactly one short sentence.`,
      ),
      "Now fix the actual bug so that `node test/run-tests.js` prints ALL TESTS PASSED. Use the edit tool on files under src/, then run `node test/run-tests.js` with bash to verify. Do not modify anything under logs/.",
      "Earlier you grepped logs/debug.log for BUG-TRACE. What was the exact BT-xxxx code on the FIRST matching line (not the EV-xxxx id)? If the evidence is archived, use the pinx_recall tool to check. Answer with just the BT code.",
    ]
  : [
  "Investigate this repo. Step 1: use grep to search for 'BUG-TRACE' in logs/debug.log. Step 2: use the read tool on src/utils/format.js. Then reply with one short sentence about what you saw.",
  "Now fix the actual bug so that `node test/run-tests.js` prints ALL TESTS PASSED. Use the edit tool on files under src/, then run `node test/run-tests.js` with bash to verify. Do not modify anything under logs/.",
  "Earlier you grepped logs/debug.log for BUG-TRACE. What was the exact BT-xxxx code on the FIRST matching line (not the EV-xxxx id)? If the evidence is archived, use the pinx_recall tool to check. Answer with just the BT code.",
];

function agentHome(arm, tag) {
  const home = mkdtempSync(join(tmpdir(), `pinx-abl-${arm}-`));
  // Minimal, IDENTICAL base config for every arm; treatment differs only by
  // the pinx packages. models.json carries the intern provider config.
  cpSync(join(REAL_AGENT_DIR, "models.json"), join(home, "models.json"));
  writeFileSync(join(home, "auth.json"), "{}");
  writeFileSync(
    join(home, "settings.json"),
    JSON.stringify({ packages: arm.packages, compaction: { enabled: true, reserveTokens: 16384, keepRecentTokens: 16000 } }, null, 2),
  );
  void tag;
  return home;
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Block until the provider answers a tiny probe (quota reset window). */
function probeUntilHealthy(maxTries = 40) {
  for (let i = 0; i < maxTries; i++) {
    const res = spawnSync(process.execPath, [PI_CLI_JS, "-p", "--model", MODEL, "Reply with exactly: OK"], {
      encoding: "utf8", timeout: 120_000, cwd: tmpdir(),
    });
    const out = (res.stdout ?? "") + (res.stderr ?? "");
    if (!out.includes("quota exceeded")) return true;
    console.log(`  provider quota exceeded; probe ${i + 1}/${maxTries}, waiting 3 min...`);
    sleep(180_000);
  }
  return false;
}

function runTurn(ws, home, sessionFile, prompt, arm) {
  const env = {
    ...process.env,
    PI_CODING_AGENT_DIR: home,
    ...arm.env,
  };
  const started = Date.now();
  const res = spawnSync(process.execPath, [PI_CLI_JS, "-p", "--session", sessionFile, "--model", MODEL, prompt], {
    cwd: ws,
    env,
    encoding: "utf8",
    timeout: 300_000,
  });
  return { ms: Date.now() - started, ok: res.status === 0 || (res.stdout ?? "").length > 0, stdout: (res.stdout ?? "").slice(-400), stderr: (res.stderr ?? "").slice(-400) };
}

function parseSession(sessionFile) {
  if (!existsSync(sessionFile)) return { turns: [], contextEdits: 0, evidenceRefs: 0, compactions: 0 };
  const entries = readFileSync(sessionFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const turns = [];
  for (const e of entries) {
    if (e.type === "message" && e.message?.role === "assistant" && e.message?.usage) {
      const u = e.message.usage;
      turns.push({ input: u.input ?? 0, output: u.output ?? 0, cacheRead: u.cacheRead ?? 0, total: u.totalTokens ?? 0 });
    }
  }
  let contextEdits = 0;
  let evidenceRefs = 0;
  let compactions = 0;
  for (const e of entries) {
    if (e.type === "context_edit") contextEdits++;
    if (e.type === "custom" && e.customType === "pinx.context.evidence") evidenceRefs++;
    if (e.type === "compaction") compactions++;
  }
  return { turns, contextEdits, evidenceRefs, compactions, rawEntries: entries };
}

function lastAssistantText(sessionFile) {
  if (!existsSync(sessionFile)) return "";
  const entries = readFileSync(sessionFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.type === "message" && e.message?.role === "assistant") {
      return (e.message.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    }
  }
  return "";
}

const onlyArms = (process.env.ABLATION_ARMS ?? "").split(",").filter(Boolean);
const arms = onlyArms.length > 0 ? ARMS.filter((a) => onlyArms.includes(a.id)) : ARMS;
const summary = [];
for (const arm of arms) {
  for (let run = 1; run <= RUNS; run++) {
    const ws = mkdtempSync(join(tmpdir(), `pinx-abl-ws-`));
    execFileSync(process.execPath, [join(OUT_DIR, "gen-workspace.mjs", ), ws], { encoding: "utf8" });
    const groundTruth = JSON.parse(readFileSync(join(ws, "ground-truth.json"), "utf8"));
    const home = agentHome(arm, run);
    const sessionFile = join(ws, "session.jsonl");

    const turnLog = [];
    for (let t = 0; t < TURNS.length; t++) {
      const r = runTurn(ws, home, sessionFile, TURNS[t], arm);
      turnLog.push({ turn: t + 1, ms: r.ms, ok: r.ok, tail: (r.stdout || r.stderr).trim().split("\n").pop() });
      if (t < TURNS.length - 1) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, t === 0 ? 2500 : 1500);
    }

    // Grade: run the test suite the agent was supposed to fix.
    const grade = spawnSync("node", ["test/run-tests.js"], { cwd: ws, encoding: "utf8", timeout: 60_000 });
    const testsPassed = grade.stdout?.includes("ALL TESTS PASSED") ?? false;

    // Grade retention probe against ground truth.
    const reply = lastAssistantText(sessionFile);
    const retention = reply.includes(groundTruth.firstBugTraceId);

    const metrics = parseSession(sessionFile);
    const record = {
      arm: arm.id,
      run,
      model: MODEL,
      testsPassed,
      retentionCorrect: retention,
      retentionReply: reply.slice(0, 200),
      totalInputTokens: metrics.turns.reduce((s, t) => s + t.input, 0),
      totalOutputTokens: metrics.turns.reduce((s, t) => s + t.output, 0),
      totalCacheReadTokens: metrics.turns.reduce((s, t) => s + t.cacheRead, 0),
      inputByTurn: metrics.turns.map((t) => t.input),
      assistantTurns: metrics.turns.length,
      contextEdits: metrics.contextEdits,
      evidenceRefs: metrics.evidenceRefs,
      compactions: metrics.compactions,
      wallClockMs: turnLog.reduce((s, t) => s + t.ms, 0),
      quotaDead,
      turnLog,
    };
    // Estimated context metric (provider usage is unreliable on this gateway):
    // max projected-context chars across assistant turns, from toolResult+user text.
    let maxContextChars = 0;
    let running = 0;
    const contextByAssistantTurn = [];
    const contentCharsByEntry = new Map();
    for (const e of metrics.rawEntries ?? []) {
      if (e.type === "message") {
        const m = e.message ?? {};
        if (m.role === "user" || m.role === "toolResult") {
          const chars = JSON.stringify(m.content ?? "").length;
          running += chars;
          contentCharsByEntry.set(e.id, chars);
        }
        if (m.role === "assistant") {
          contextByAssistantTurn.push(Math.round(running / 4));
          maxContextChars = Math.max(maxContextChars, running);
        }
      } else if (e.type === "compaction") {
        running = Math.floor(running * 0.3);
      } else if (e.type === "context_edit") {
        // The archived original leaves the projected context; the marker
        // (replacement content) takes its place.
        const original = contentCharsByEntry.get(e.targetId) ?? 0;
        const marker = JSON.stringify(e.replacement?.content ?? "").length;
        running = Math.max(0, running - original + marker);
      }
    }
    record.contextByAssistantTurnTok = contextByAssistantTurn;
    record.estimatedMaxContextChars = maxContextChars;
    record.estimatedContextK = Math.round(maxContextChars / 4 / 100) / 10;
    record.sessionFile = sessionFile;
    writeFileSync(join(RESULTS_DIR, `${arm.id}-run${run}.json`), JSON.stringify(record, null, 2));
    summary.push(record);
    console.log(`[${arm.id} run${run}] tests=${testsPassed} retention=${retention} estCtx=${record.estimatedContextK}k edits=${record.contextEdits} refs=${record.evidenceRefs} turns=${record.assistantTurns}${quotaDead ? " QUOTA-DEAD" : ""}`);
    if (process.env.ABLATION_KEEP !== "1") {
      rmSync(ws, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  }
}

writeFileSync(join(RESULTS_DIR, "summary.json"), JSON.stringify(summary, null, 2));
console.log("ABLATION COMPLETE ->", join(RESULTS_DIR, "summary.json"));
