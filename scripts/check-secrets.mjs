#!/usr/bin/env node
// Fail when a tracked file carries a credential-shaped string or a private home path.
// Prints the file, line and rule only; never the matched value.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const ALLOW = /check-secrets: allow/;
const PLACEHOLDER = /your[-_]|example|xxxx|redacted|placeholder|dummy|changeme|sample|<[a-z]|\$\{/i;
const RULES = [
  ["private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["openai-key", /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{25,}|\bgithub_pat_[A-Za-z0-9_]{30,}/],
  ["aws-key", /\bAKIA[0-9A-Z]{16}\b/],
  ["tailscale-key", /\btskey-[a-z]+-[A-Za-z0-9]{8,}/],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ["google-key", /\bAIza[0-9A-Za-z_-]{30,}/],
  ["npm-token", /\bnpm_[A-Za-z0-9]{30,}/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./],
  ["assigned-secret", /\b(?:api[_-]?key|apikey|secret|password|passwd|token)\b\s*[:=]\s*["'][^"'\n]{24,}["']/i],
  ["home-path", /(?:\/home\/|\/Users\/)[a-z][a-z0-9_-]*\//],
];

let files;
try {
  files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
} catch {
  console.error("check-secrets: not a git checkout");
  process.exit(2);
}

const findings = [];
for (const file of files) {
  let size;
  try {
    size = statSync(file).size;
  } catch {
    continue;
  }
  if (size > 2_000_000) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\0")) continue;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (ALLOW.test(line)) continue;
    for (const [rule, pattern] of RULES) {
      const match = pattern.exec(line);
      if (!match) continue;
      if (PLACEHOLDER.test(match[0])) continue;
      findings.push(`${file}:${i + 1}  ${rule}`);
    }
  }
}

if (findings.length) {
  console.error("check-secrets: credential-shaped or private-path content in tracked files:");
  for (const finding of findings) console.error(`  ${finding}`);
  console.error("Remove the value. If it is intentional documentation, add `check-secrets: allow` on the line.");
  process.exit(1);
}
console.log(`check-secrets: ${files.length} tracked files clean`);
