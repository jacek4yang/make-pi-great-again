# CI BLOCKER (2026-10-07): GitHub Actions billing flag

**Symptom:** every workflow job on every jacek4yang repository fails at
startup (~5 s, never executes a step) with:

> "The job was not started because recent account payments have failed or
> your spending limit needs to be increased. Please check the 'Billing &
> plans' section in your settings"

**Scope:** account-wide. Verified by re-running a previously-green run on
pi-task-next (also failed to start) and on fresh pushes to pi-github-next.

**Not the cause:** repository visibility (all Agent Body repos are now
public — standard public runners are free), workflow syntax, or the
previously-fixed per-repo Actions enablement.

**Required owner action:** GitHub → Settings → Billing & plans → resolve the
failed payment / raise the spending limit. No code change can fix this.

**Local validation meanwhile:** all repositories are fully validated locally
(strict conformance, exact-SHA integration, benches, soaks — see
docs/EVAL-BENCH-20261006.md). Once billing is resolved, every pushed branch
will run CI unattended; the workflows are unchanged and were green before
the quota exhaustion.

## RESOLVED (2026-10-07, later same day)

Making the repositories PUBLIC removed the private-minute billing
constraint: standard hosted runners on public repos are free, and the
billing flag no longer gates job startup. All previously blocked workflows
were re-run and completed successfully — every Agent Body repository now
has green CI (ubuntu + windows + macos), including the new public meta
workflow. No code change was required for the resolution; this record is
kept for provenance.
