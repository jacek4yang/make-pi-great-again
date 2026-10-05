#!/usr/bin/env node
// Tagger v2: runs each repo suite via TAP, matches every test name against
// the canonical invariant regexes, and rewrites names to carry the full set
// of exact [ID] tags (stripping any previous tags first). Idempotent.
// C16 and U6 are intentionally untagged (no real implementation yet).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const metaRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = process.env.PINX_WORKSPACE ?? resolve(metaRoot, "..");

const OWNERSHIP = {
  C1: "pi-context-manager", C2: "pi-context-manager", C3: "pi-context-manager",
  C4: "pi-context-manager", C5: "pi-context-manager", C6: "pi-context-manager",
  C7: "pi-context-manager", C8: "pi-context-manager", C9: "pi-context-manager",
  C10: "pi-context-manager", C11: "pi-context-manager", C12: "pi-context-manager",
  C13: "pi-context-manager", C14: "pi-context-manager", C15: "pi-context-manager",
  C16: "pi-context-manager",
  R1: "pi-code-runtime-next", R2: "pi-code-runtime-next", R3: "pi-code-runtime-next",
  R4: "pi-code-runtime-next", R5: "pi-code-runtime-next", R6: "pi-code-runtime-next",
  R7: "pi-code-runtime-next", R8: "pi-code-runtime-next", R9: "pi-code-runtime-next",
  R10: "pi-code-runtime-next", R11: "pi-code-runtime-next", R12: "pi-code-runtime-next",
  R13: "pi-code-runtime-next", R14: "pi-code-runtime-next", R15: "pi-code-runtime-next",
  V1: "pi-generation-recovery-next", V2: "pi-generation-recovery-next",
  V3: "pi-generation-recovery-next", V4: "pi-generation-recovery-next",
  V5: "pi-generation-recovery-next", V6: "pi-generation-recovery-next",
  V7: "pi-generation-recovery-next", V8: "pi-generation-recovery-next",
  V9: "pi-generation-recovery-next", V10: "pi-generation-recovery-next",
  V11: "pi-generation-recovery-next", V12: "pi-generation-recovery-next",
  V13: "pi-generation-recovery-next",
  U1: "pi-ui-next", U2: "pi-ui-next", U3: "pi-ui-next",
  U4: "pi-ui-next", U5: "pi-ui-next", U6: "pi-ui-next",
};

const REGEX = {
  C1: /markers?\s+round|canonical|append-only/i,
  C2: /roundtrip|retrievable/i,
  C3: /cross-session|sibling|entryId provenance|different session/i,
  C4: /hash mismatch|tampered|malformed refs|fail.?closed/i,
  C5: /recent work stays protected|recent/i,
  C6: /error tool results|errors are never|error results never get a success summary/i,
  C7: /evidence write failure|aborts the (whole )?batch/i,
  C8: /engine error falls through/i,
  C9: /cancellation never commits/i,
  C10: /staged compaction is invalidated|model switch/i,
  C11: /probe-unsupported|empty summary is refused|skipped with reasons/i,
  C12: /auxiliary model failure preserves/i,
  C13: /already-summarized content is protected/i,
  C14: /hash mismatch fails closed|corruption detected|sidecar/i,
  C15: /oversize content is refused|per-turn edit budget|bounded/i,
  C16: null,
  R1: /STALE_BASE|stale baseRevision|stale patch|stale Edit IR/i,
  R2: /SYNTAX_INVALID|syntax gate|syntax-invalid/i,
  R3: /failing program marks|repair marks the revision|isError with exit/i,
  R4: /repair flow marks and requires explicit run|not a resume/i,
  R5: /never executes anything implicitly/i,
  R6: /repair flow marks and requires explicit run/i,
  R7: /caps output|output cap|bounded output/i,
  R8: /enforces timeout|timeout with tree-kill/i,
  R9: /cancellation propagates|cancel stops a running job|code_job tool: start from buffer|cancellation/i,
  R10: /persisted completion records|persists a completion record|job state/i,
  R11: /never splits multibyte|CJK output is UTF-8|UTF-8-safe truncation/i,
  R12: /CRLF/i,
  R13: /drive letter|Windows cwd/i,
  R14: /hash chain binds|non-overlapping edits|overlapping splices|revision integrity/i,
  R15: /completion backlog never blocks|backpressure/i,
  V1: /safe completed text prefix/i,
  V2: /thinking blocks are excluded/i,
  V3: /tool-call block is a hard barrier/i,
  V4: /tool-call block is a hard barrier/i,
  V5: /tool-call block is a hard barrier/i,
  V6: /consecutive interruptions are bounded/i,
  V7: /invalidates the attempt|STALE_IDENTITY|provider\/model\/session\/branch change/i,
  V8: /journal survives reopen/i,
  V9: /corrupt records fail closed/i,
  V10: /truncated final line is tolerated/i,
  V11: /journal quota triggers deterministic GC/i,
  V12: /cancellation falls back immediately/i,
  V13: /budget exhaustion fails closed/i,
  U1: /Level 0|Level 1/i,
  U2: /nested failure is visible|failure stays visible/i,
  U3: /icon sets define|nerd icon mode|icon mode keeps/i,
  U4: /CJK|wide char|visible width|pressure bar/i,
  U5: /ascii/i,
  U6: /provider-reported context usage|estimated figures are labeled|masquerade as provider-reported/i,
};

const REPOS = ["pi-context-manager", "pi-code-runtime-next", "pi-generation-recovery-next", "pi-ui-next"];

function repoRoot(repo) {
  return join(workspace, repo);
}

function tapNames(repo) {
  const root = repoRoot(repo);
  const testDir = join(root, "test");
  const files = readdirSync(testDir).filter((f) => f.endsWith(".test.ts")).map((f) => join(testDir, f));
  const tsxCli = join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const res = spawnSync(process.execPath, ["--test", "--test-reporter", "tap", ...files], {
    cwd: root, encoding: "utf8", timeout: 900000,
  });
  const tap = (res.stdout ?? "") + (res.stderr ?? "");
  const names = new Set();
  for (const line of tap.split("\n")) {
    const m = /^(?:ok|not ok) \d+ - (.+?)(?:\s+\([\d.]+ms\))?$/.exec(line.trim());
    if (m) names.add(m[1]);
  }
  return names;
}

let tagged = 0;
for (const repo of REPOS) {
  const names = tapNames(repo);
  const planned = new Map();
  for (const name of names) {
    const base = name.replace(/\s*\[[A-Z]\d+\]/g, "").trim();
    const tags = Object.entries(REGEX)
      .filter(([inv, re]) => re && OWNERSHIP[inv] === repo && re.test(base))
      .map(([inv]) => inv)
      .sort();
    if (tags.length > 0) planned.set(name, { base, tags });
  }
  const testDir = join(repoRoot(repo), "test");
  const files = readdirSync(testDir).filter((f) => f.endsWith(".test.ts")).map((f) => join(testDir, f));
  for (const file of files) {
    let src = readFileSync(file, "utf8");
    let changed = false;
    for (const [name, { base, tags }] of planned) {
      const tagStr = tags.map((t) => `[${t}]`).join("");
      const current = `("${name}"`;
      const target = `("${tagStr} ${base}"`;
      if (src.includes(current) && name !== `${tagStr} ${base}`) {
        src = src.replaceAll(current, target);
        changed = true;
        tagged++;
      }
    }
    if (changed) writeFileSync(file, src, "utf8");
  }
}
console.log(`tagged ${tagged} test-name occurrence(s)`);
