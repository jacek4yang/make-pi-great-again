# pi-github-next — research decision record (2026-10-06)

Bounded research before implementation. Focus: the GitHub transport/auth
decision and what we deliberately build ourselves above it.

## Evaluated candidates

| Candidate | Version | Decision | Rationale |
|---|---|---|---|
| `@octokit/core` | 7.0.8 (latest) | **reuse behind adapter** | Official, actively maintained, clean token auth (`@octokit/auth-token`), typed request/response with headers (ETag visible), request-error classification, injectable `fetch` for deterministic tests. Solves transport/auth correctness we should not hand-roll. |
| `@octokit/plugin-retry` | 8.1.1 | reject (own retry layer) | We need deterministic, abort-aware, policy-visible retry classification with bounded backoff + jitter and explicit error taxonomy; a 15-line local layer is more testable than reconciling with plugin behavior. |
| `@octokit/plugin-throttling` | 11.0.5 | reject (own rate-limit layer) | Rate-limit STATE (limit/remaining/reset + secondary limits) must be first-class structured state for health/CI consumers; we parse the headers ourselves. |
| `@octokit/rest` | — | reject | Heavy endpoint surface; we expose purpose-specific projections, not 1:1 REST. |
| GitHub GraphQL API | — | reject for v1 | REST + conditional ETags cover the required projections; GraphQL would bypass ETag caching (no conditional requests). |
| Official auth helpers (`createTokenAuth`) | via @octokit/core | **reuse directly** | Token from environment (`GH_TOKEN`/`GITHUB_TOKEN`) — Pi remains credential-owner; no new vault, no storage. |
| GitHub MCP implementations / Pi GitHub plugins | — | reject | None maintained against Pi 1.0.4's extension API; all would be thin wrappers around the same REST endpoints with none of the cache/singleflight/mutation-truth requirements. |
| Adjacent coding-agent GitHub layers | — | **borrow design only** | Purpose-specific summary projections and durable mutation outcomes; no code reuse (closed-source). |
| `gh` CLI | — | reject for production path | Shell/encoding/version-drift/parsing hazards (brief §40). May serve humans for debugging only. |

## Consequence for architecture

`@octokit/core` transport behind a thin adapter (fetch injectable → fully
deterministic tests). Above it, and owned entirely by pi-github-next:
resource identity + version identity, bounded resource-aware cache with
per-kind TTL and If-None-Match/304 conditional validation, singleflight
coalescing, rate-limit state, retry classification, purpose-specific bounded
projections with explicit truncation envelopes, durable mutation journal with
intent digests and unknown-outcome reconciliation, and the `github` tool with
policy/task integration via structured contracts.
