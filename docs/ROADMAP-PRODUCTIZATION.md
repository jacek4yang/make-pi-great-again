# Productization roadmap — pending execution

Status: **planned, not implemented.** Persisted from owner directive 2026-10-06
so the next session can execute in dependency order without re-reading the prompt.

## Core principle

TIME PASSING IS NOT A REASON TO INVOKE THE MODEL.
Waiting belongs in the runtime. Polling belongs in the integration plugin.
Progress belongs in the UI. Durable state belongs to the resource owner.
Reasoning resumes only when meaningful new information exists.

## Phase order (execute sequentially, each gate green before the next)

- **A** Seal current core RC (51 invariants, Pi 1.0.4, all CI green) — DONE
- **B** Cacheability audit: stable-prefix/session-stable/working-set/volatile-tail
  classification + benchmark tool comparing consecutive projected contexts
- **C** Context manager: active working set model (must-keep/working/recent/
  archivable/summarizable/cold), task-aware hygiene prioritization
- **D** Deterministic marker formatting, no volatile timestamps in model-visible
  markers
- **E** No summary-of-summary degradation: provenance tracking (exact/archived/
  deterministic-summary/semantic-summary), long compaction chain tests
- **F** Tool schema/loadout optimization: core always-visible tools minimal,
  specialized tools loaded on demand via Pi public exposure/deferred mechanisms
- **G** Fewer stronger tool calls: purpose-specific projections (PR summary,
  CI failure digest, fs usage)
- **H** Tool result envelope: truncated/originalBytes/retainedBytes/strategy/
  artifactRef — never silent truncation
- **I** Tool result deduplication: unchanged resources return concise confirmation
- **J** Implement pi-policy-next (allow/deny/require-approval, normalized
  approval intent bound to material action identity, scopes: once/exact-target/
  explicit session-class) — IMPLEMENTED 2026-10-06 (`feat/policy-core`,
  P1-P5 invariants, contracts `pinx.policy.request`/`pinx.policy.decision`,
  see `docs/RESEARCH-POLICY-20261006.md`)
- **K** Implement pi-task-next (durable task lifecycle, bounded projection,
  issue candidates distinct from tasks)
- **L** Task checkpoints (operational state, not chain-of-thought)
- **M** Implement pi-github-next (resource cache, ETag/conditional, singleflight,
  immutable commit caching, rate limits, durable mutation outcomes)
- **N** Implement pi-ci-next (GitHub Actions wait/wait_all/failure digest,
  internal adaptive polling, immutable SHA binding)
- **O** GitHub cache + model context co-design (delta for unchanged resources)
- **P** Implement pi-fs-next (stat/list/tree/usage/safe delete, no du/find)
- **Q** Resource snapshots + change detection (path+hash, resourceID+etag)
- **R** Context budget by semantic class
- **S** Low/high watermark pressure control with hysteresis
- **T** Per-tool output budget (not one global 50KB rule)
- **U** Event coalescing for high-frequency progress
- **V** Long-run process robustness (no zombie, no permanently running, exact-once waiters)
- **W** Network robustness (DNS/timeout/rate-limit/auth classification, bounded backoff)
- **X** Side-effect exactness (not-started/started/completed/failed/cancelled/unknown)
- **Y** Generation recovery + task recovery integration
- **Z** Session reopen experience (bounded resume projection)
- **AA** UI as human control plane (tasks/approvals/jobs/CI/progress widgets)
- **AB** Cache/context/tool observability metrics
- **AC** Real workload benchmarks (7 scenarios)
- **AD** Soak/chaos testing (partial writes, corrupt state, network failures)
- **AE** State quotas and GC documentation
- **AF** Security and approval bypass testing
- **AG** Cross-platform product quality (no WSL/MSYS required)
- **AH** Health and self-diagnosis command
- **AI** Recommended stack experience (zero-config good defaults)
- **AJ** Plugin installation/load order safety
- **AK** New invariants (P*/T*/G*/I*/F* families)
- **AL** PR-ready delivery (ChatGPT reviews and merges)

## Key rules

- Every new invariant: docs + tag + conformance + derive count from canonical source
- Research before build: classify reuse/adapter/borrow/reject with evidence
- Do not parse another plugin's display text
- Sensitive operation + uncertain impact => require approval
- Assistant prose is never side-effect truth
- Cache stability matters more than cosmetic variation
- One meaningful tool call > five mechanical calls
- One internal waiter > five model polls
