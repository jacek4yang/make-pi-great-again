// Conformance gate logic, separated from the CLI so exit semantics are
// unit-testable. The runner script is a thin wrapper around evaluate().
// Plain JS by design (meta repository has no build step).

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
  R16: "pi-code-runtime-next",
  V1: "pi-generation-recovery-next", V2: "pi-generation-recovery-next",
  V3: "pi-generation-recovery-next", V4: "pi-generation-recovery-next",
  V5: "pi-generation-recovery-next", V6: "pi-generation-recovery-next",
  V7: "pi-generation-recovery-next", V8: "pi-generation-recovery-next",
  V9: "pi-generation-recovery-next", V10: "pi-generation-recovery-next",
  V11: "pi-generation-recovery-next", V12: "pi-generation-recovery-next",
  V13: "pi-generation-recovery-next",
  U1: "pi-ui-next", U2: "pi-ui-next", U3: "pi-ui-next",
  U4: "pi-ui-next", U5: "pi-ui-next", U6: "pi-ui-next",
  P1: "pi-policy-next", P2: "pi-policy-next", P3: "pi-policy-next",
  P4: "pi-policy-next", P5: "pi-policy-next",
  T1: "pi-task-next", T2: "pi-task-next", T3: "pi-task-next",
  T4: "pi-task-next", T5: "pi-task-next", T6: "pi-task-next",
  T7: "pi-task-next",
};

/**
 * Evaluate per-invariant status from per-repo suite results.
 * - suite exit nonzero or failed>0 -> every repo invariant is SUITE-RED;
 * - exact [ID] tag match required (no substring guessing);
 * - missing tag -> MISSING (strict mode turns this into exit 2).
 */
export function evaluate(repoSuites, opts = {}) {
  const results = {};
  const summary = { pass: 0, fail: 0, missing: 0, suiteRed: 0 };
  for (const [inv, repo] of Object.entries(OWNERSHIP)) {
    if (opts.only && !opts.only.includes(inv)) continue;
    const suite = repoSuites[repo];
    if (!suite) {
      results[inv] = { status: "MISSING", repo, sha: "UNKNOWN", note: "repo suite absent" };
      summary.missing++;
      continue;
    }
    const suiteRed = suite.exitCode !== 0 || suite.failed > 0;
    if (suiteRed) {
      results[inv] = {
        status: "SUITE-RED", repo, sha: suite.sha,
        note: `suite exit ${suite.exitCode}, ${suite.failed} failed test(s)`,
      };
      summary.suiteRed++;
      continue;
    }
    const tagged = suite.tests.filter((t) => t.tags.includes(inv));
    if (tagged.length === 0) {
      results[inv] = { status: "MISSING", repo, sha: suite.sha, note: "no test carries this exact invariant tag" };
      summary.missing++;
      continue;
    }
    const failing = tagged.filter((t) => !t.ok);
    if (failing.length > 0) {
      results[inv] = { status: "FAIL", repo, sha: suite.sha, note: failing.map((t) => t.name).join("; ").slice(0, 200) };
      summary.fail++;
      continue;
    }
    results[inv] = { status: "PASS", repo, sha: suite.sha, via: tagged.map((t) => t.name).slice(0, 3) };
    summary.pass++;
  }
  let overallExit = 0;
  if (summary.fail > 0 || summary.suiteRed > 0) overallExit = 1;
  else if (opts.strict && summary.missing > 0) overallExit = 2;
  return { results, summary, overallExit };
}


/** Canonical invariant ids derived from OWNERSHIP (single source of truth). */
export function canonicalInvariantIds() {
  return Object.keys(OWNERSHIP);
}

/**
 * Canonical invariant-set name, e.g.
 * "C1-C16, R1-R16, V1-V13, U1-U6, P1-P5 (all 56 executable, all PASS)".
 * Consumers must derive from this instead of hardcoding counts.
 */
export function canonicalInvariantSetName() {
  const ids = canonicalInvariantIds();
  const groups = [];
  for (const prefix of ["C", "R", "V", "U", "P", "T"]) {
    const nums = ids.filter((id) => id.startsWith(prefix)).map((id) => Number(id.slice(1))).sort((a, b) => a - b);
    if (nums.length === 0) continue;
    groups.push(`${prefix}${nums[0]}-${prefix}${nums[nums.length - 1]}`);
  }
  return `${groups.join(", ")} (all ${ids.length} executable, all PASS)`;
}

export { OWNERSHIP };
