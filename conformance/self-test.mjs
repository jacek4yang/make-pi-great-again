// Conformance self-tests: exit semantics + SUITE-RED retention, evaluated on
// synthetic suite results (no real repos needed).
import assert from "node:assert/strict";
import { evaluate } from "./lib.mjs";

function suite(sha, tests, exitCode = 0) {
  return { sha, tests, failed: tests.filter((t) => !t.ok).length, total: tests.length, exitCode };
}

const pass1 = { ok: true, name: "[C1] canonical history preserved", tags: ["C1"] };
const pass2 = { ok: true, name: "[R15] completion backlog never blocks", tags: ["R15"] };
const failC1 = { ok: false, name: "[C1] canonical history preserved", tags: ["C1"] };

// 1. all pass -> 50-equivalent subset exit 0
let ev = evaluate({
  "pi-context-manager": suite("s1", [pass1]),
  "pi-code-runtime-next": suite("s2", [pass2]),
  "pi-generation-recovery-next": suite("s3", []),
  "pi-ui-next": suite("s4", []),
}, { strict: true });
assert.equal(ev.results.C1.status, "PASS");
assert.equal(ev.results.R15.status, "PASS");
assert.equal(ev.results.C2.status, "MISSING");
assert.equal(ev.overallExit, 2, "strict + missing must exit 2");

// 2. non-strict with missing -> exit 0
ev = evaluate({
  "pi-context-manager": suite("s1", [pass1]),
  "pi-code-runtime-next": suite("s2", [pass2]),
  "pi-generation-recovery-next": suite("s3", []),
  "pi-ui-next": suite("s4", []),
});
assert.equal(ev.overallExit, 0);

// 3. suite subprocess nonzero => SUITE-RED even with zero parsed failures
ev = evaluate({
  "pi-context-manager": suite("s1", [pass1], 1), // exit 1, no not-ok lines
  "pi-code-runtime-next": suite("s2", [pass2]),
  "pi-generation-recovery-next": suite("s3", []),
  "pi-ui-next": suite("s4", []),
}, { strict: true });
assert.equal(ev.results.C1.status, "SUITE-RED");
assert.equal(ev.overallExit, 1, "suite-red must exit 1");

// 4. explicit invariant failure => SUITE-RED (a red suite is never narrowed
//    to a single-invariant FAIL) and exit 1
ev = evaluate({
  "pi-context-manager": suite("s1", [failC1]),
  "pi-code-runtime-next": suite("s2", [pass2]),
  "pi-generation-recovery-next": suite("s3", []),
  "pi-ui-next": suite("s4", []),
}, { strict: true });
assert.equal(ev.results.C1.status, "SUITE-RED");
assert.equal(ev.overallExit, 1);

// 4b. defensive FAIL branch: inconsistent input (no failed count, but a
//     tagged not-ok test) still attributes the failure to the invariant
ev = evaluate({
  "pi-context-manager": { sha: "s1", tests: [failC1], failed: 0, total: 1, exitCode: 0 },
  "pi-code-runtime-next": suite("s2", [pass2]),
  "pi-generation-recovery-next": suite("s3", []),
  "pi-ui-next": suite("s4", []),
}, { strict: true });
assert.equal(ev.results.C1.status, "FAIL");
assert.equal(ev.overallExit, 1);

// 5. exact tag matching: [C1] test never proves C12
ev = evaluate({
  "pi-context-manager": suite("s1", [pass1]),
  "pi-code-runtime-next": suite("s2", [pass2]),
  "pi-generation-recovery-next": suite("s3", []),
  "pi-ui-next": suite("s4", []),
});
assert.equal(ev.results.C12.status, "MISSING");

// 6. multi-tag test satisfies every declared invariant
ev = evaluate({
  "pi-context-manager": suite("s1", [{ ok: true, name: "[C4][C14] hash mismatch fails closed", tags: ["C4", "C14"] }]),
  "pi-code-runtime-next": suite("s2", []),
  "pi-generation-recovery-next": suite("s3", []),
  "pi-ui-next": suite("s4", []),
});
assert.equal(ev.results.C4.status, "PASS");
assert.equal(ev.results.C14.status, "PASS");

console.log("CONFORMANCE SELF-TESTS OK (7 checks)");
