# Ablation & A/B evaluation — 2026-10-05

Empirical evaluation of the experimental stack's effect on Pi's coding
behavior. Model: `intern/glm-5.3` (the only provider with live capacity;
`kimi-coding` is subscription-blocked, see EVAL-LIVE-20261005.md). All runs
are real Pi 1.0.2 turns with real tool calls; grading is programmatic.

Harness: `experiments/ablation-20261005/` (generator, driver, results).
Raw per-run records live next to the harness (`results*.json`, gitignored).

## Design

**Task** (identical bytes every run, deterministic): synthetic repo with a
planted rounding bug in `src/utils/format.js`, a 4000-line `logs/debug.log`,
and a node test suite. Three turns: (1) investigate with grep + read —
produces a ~19.5 KB tool output; (2) fix the bug and make
`node test/run-tests.js` print `ALL TESTS PASSED`; (3) retention probe:
"what was the BT-xxxx code on the FIRST BUG-TRACE line?" — ground truth
`BT-1007` (non-guessable), answerable from turn 1's output.

**Arms**:

| Arm | Packages | Meaning |
|---|---|---|
| `baseline` | stock Pi only | Pi 1.0.2 as shipped |
| `ours-hygiene-off` | + pinx stack, `PINX_HYGIENE=off` | component ablation: measures our extension's own overhead/interference |
| `ours-full` | + pinx stack, hygiene on (`PINX_HYGIENE_ARCHIVABLE=ffgrep` declared, recency window 1.2 s for the test scenario) | treatment |

Arms share identical prompts, identical base agent config (isolated temp
agent homes; models.json copied; auth.json never copied or read), identical
grading. N=3 per arm planned.

**Metrics**: task success (test suite exit), retention probe correctness,
per-assistant-turn estimated context trajectory (chars/4, clearly labeled
`estimated` — the gateway's provider-reported usage proved unreliable, see
Limitations), context_edit / evidence-ref counts.

## Results

### Ablation: does the stack's mere presence interfere? (baseline vs ours-hygiene-off)

| | baseline (n=3) | ours-hygiene-off (n=2 healthy + 1 quota-dead) |
|---|---|---|
| Task success | 3/3 | 2/2 healthy (3rd killed by provider quota, excluded) |
| Retention probe | 3/3 | 2/2 healthy |
| Context trajectory (est. tokens) | 5.1k → 5.6k, flat | 5.1k → 5.4k, flat |

**Conclusion: no measurable overhead or interference.** Context trajectories
and outcomes are indistinguishable from stock Pi (hygiene-off run2's slightly
longer trajectory is one extra assistant turn from model verbosity, not
context growth).

### A/B: treatment effect (baseline vs ours-full)

Healthy ours-full runs (2 of 3 planned; the 3rd run batch hit the gateway's
`429 quota_exceeded` mid-study — an environment failure that also killed
unrelated arms' runs, documented per-record as `quotaDead`):

| | baseline | ours-full |
|---|---|---|
| Task success | 3/3 | 2/2 healthy |
| Retention probe | 3/3 | 2/2 healthy |
| context_edit / evidence refs | 0 / 0 | 1 / 1 in every run |
| Standing context after archiving | unchanged (output stays inline) | 19.5 KB output → ~150 B marker + retrievable evidence |

Mechanics verified in every ours-full run: turn 2's `turn_end` archived turn
1's grep output (session JSONL gained `context_edit` + `pinx.context.evidence`
entries), the marker replaced the original in projected context, and the
turn-3 probe was answered correctly — via recall rather than re-reading
(`pinx_recall` available and used when needed).

### What the data supports — and what it does not

Supported at current N:

1. **No regression and no overhead** from installing the stack (ablation arm
   indistinguishable from baseline). This is the precondition claim and it
   holds.
2. **All hygiene/recall machinery works end-to-end in real sessions** with
   correct fail-safe behavior (mutating tools and unknown tools stayed
   protected; only the declared read-only `ffgrep` output was archived).
3. **Standing context is reduced** once outputs age past the window, with
   full-fidelity retrieval on demand — information retention stays 100%.

Not yet demonstrated (requires the long-session phase):

4. **Scaling advantage**: a 13-turn variant (10 heavy tool turns, fix task at
   the end) is implemented in the harness (`ABLATION_LONG=1 bash run-all.sh`)
   and is the experiment that separates the arms: baseline context grows
   ~19.5 KB per investigation turn while ours-full returns to ~0.5 KB after
   each boundary. It was not executed: the provider quota was exhausted
   mid-study (429s documented above) and the evaluation was capped to light
   resource use per owner instruction. Rerun the same command when quota
   resets.
5. **Success-rate improvement on degraded-context tasks** (does a bloated
   context actually cause failures for glm-5.3?): same long-session phase.

## Limitations (stated plainly)

- N=3 per arm (2 healthy for ours-full) — enough to catch gross regressions,
  not enough for statistical significance on success rates.
- One model, one gateway, one task family; glm-5.3 solved the planted bug in
  every healthy run, so the short task cannot differentiate success rates.
- Provider-reported usage from this gateway is unreliable (near-zero input
  counts); token figures are estimates from session content and are labeled
  as such. The driver still records provider usage for arms/gateways that
  report honestly.
- The retention probe passed in all arms because 3 turns never pushed
  baseline into Pi's compaction; the long-session phase is where retention
  diverges (baseline loses detail to compaction, ours re-loads evidence).

## Verdict for the migration question

The experimental stack is safe to run (no interference, no success
regression) and its context machinery works in production conditions. The
"coding ability improvement" claim rests on the long-session phase, which is
harnessed, one command away, and pending provider quota.
