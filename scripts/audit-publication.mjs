#!/usr/bin/env node
// Publication security audit: scans worktrees AND full reachable git
// history of the Agent Body repositories for credential-like material.
// Bounded output: reports file + pattern-kind + line NUMBER only — never
// prints matched content. Exit 1 = publication blocked findings.
import { spawnSync } from "node:child_process";
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";

const WORKSPACE = process.env.PINX_WORKSPACE ?? resolve(join(dirname(fileURLToPath(import.meta.url)), "..", ".."));
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOS = [
  "make-pi-great-again",
  "pi-context-manager",
  "pi-code-runtime-next",
  "pi-generation-recovery-next",
  "pi-ui-next",
  "pi-policy-next",
  "pi-task-next",
  "pi-github-next",
];

// Pattern kinds -> regex. Ordered by specificity; matches report kind only.
const PATTERNS = [
  { kind: "github-pat", re: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { kind: "github-fine-grained", re: /github_pat_[A-Za-z0-9_]{60,}/ },
  { kind: "aws-access-key", re: /AKIA[0-9A-Z]{16}/ },
  { kind: "google-api-key", re: /AIza[0-9A-Za-z_-]{30,}/ },
  { kind: "private-key-block", re: /-----BEGIN (RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY/ },
  { kind: "slack-token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { kind: "jwt", re: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/ },
  { kind: "authorization-header", re: /(?<![-\w])(?:"?Authorization"?\s*[:=]\s*"?)(?:Bearer|Basic|token)\s+[A-Za-z0-9._-]{12,}/i },
  { kind: "password-assignment", re: /(?<![-\w])(?:password|passwd|pwd)\s*[:=]\s*["'][^"'{$\s]{6,}["']/i },
  { kind: "api-key-assignment", re: /(?<![-\w])(?:api[_-]?key|secret[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["'][A-Za-z0-9._-]{16,}["']/i },
  { kind: "connection-string", re: /(?:mongodb|postgres(?:ql)?|mysql|amqp):\/\/[^\s"'@]+:[^\s"'@]+@/i },
  { kind: "bearer-token-literal", re: /Bearer\s+[A-Za-z0-9._-]{25,}/ },
];

const ALLOW_DIRS = /(^|\/)(node_modules|\.git|pi-mono|rpiv-mono|fff|pi-codebuffer|pi-codex-native-compaction|pi-context-prune|pi-generation-recovery|pi-agent-profile|pi-web-search|pi-codex-account|pi-context-usage|references|experiments)\//;
const TEXT_EXT = new Set([".ts", ".tsx", ".mjs", ".cjs", ".js", ".json", ".md", ".yml", ".yaml", ".txt", ".sh", "", ".toml", ".lock"]);

function scanText(text, source) {
  const findings = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const { kind, re } of PATTERNS) {
      if (re.test(lines[i])) findings.push({ source, line: i + 1, kind });
    }
  }
  return findings;
}

function scanWorktree(repo, root) {
  const findings = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const rel = relative(root, p).split("\\").join("/");
      if (rel === ".git") continue;
      const st = statSync(p);
      if (st.isDirectory()) {
        if (ALLOW_DIRS.test(rel + "/")) continue;
        walk(p);
        continue;
      }
      if (ALLOW_DIRS.test(rel)) continue;
      if (st.size > 2_000_000) continue;
      if (!TEXT_EXT.has(extname(p).toLowerCase())) continue;
      if (/package-lock\.json$/.test(rel)) continue;
      try {
        findings.push(...scanText(readFileSync(p, "utf8"), `worktree:${rel}`));
      } catch { /* binary */ }
    }
  };
  walk(root);
  return findings;
}

function scanHistory(repo, root) {
  // `git log -p --all` over full history; repos are young and small.
  const res = spawnSync("git", ["-C", root, "log", "-p", "--all", "--no-color"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 512,
  });
  if (res.status !== 0) return [{ source: "history:GIT-ERROR", line: 0, kind: res.stderr.slice(0, 60) }];
  const findings = [];
  const lines = res.stdout.split("\n");
  let currentFile = "?";
  let inHunk = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("+++ b/")) { currentFile = line.slice(6); inHunk = false; continue; }
    if (line.startsWith("@@")) { inHunk = true; continue; }
    if (!inHunk || !line.startsWith("+")) continue;
    if (ALLOW_DIRS.test(currentFile)) continue;
    if (/package-lock\.json$/.test(currentFile)) continue;
    for (const { kind, re } of PATTERNS) {
      if (re.test(line)) findings.push({ source: `history:${currentFile}`, line: 0, kind });
    }
  }
  return findings;
}

let blocked = 0;
for (const repo of REPOS) {
  const root = join(WORKSPACE, repo);
  if (!existsSync(join(root, ".git"))) {
    console.log(`${repo}: SKIP (not found)`);
    continue;
  }
  const worktree = scanWorktree(repo, root);
  const history = scanHistory(repo, root);
  const findings = [...worktree, ...history];
  if (findings.length === 0) {
    console.log(`${repo}: CLEAN (worktree + history)`);
    continue;
  }
  // Deduplicate by source+kind; print counts only, never content.
  const byKey = new Map();
  for (const f of findings) {
    const key = `${f.source}|${f.kind}`;
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
  }
  blocked++;
  console.log(`${repo}: ${blocked ? "FINDINGS" : "CLEAN"}`);
  for (const [key, count] of byKey) {
    const [source, kind] = key.split("|");
    console.log(`  ${kind} x${count} — ${source}${source.startsWith("worktree") ? `:${source}` : ""}`);
  }
}
console.log(blocked === 0 ? "AUDIT RESULT: no blocking findings" : `AUDIT RESULT: ${blocked} repo(s) with findings — inspect before publication`);
process.exit(blocked === 0 ? 0 : 1);
