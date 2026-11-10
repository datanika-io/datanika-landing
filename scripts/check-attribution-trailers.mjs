#!/usr/bin/env node
/**
 * Refuse an attribution trailer before the commit reaches origin (landing#622).
 *
 * A Node port of datanika-core's `scripts/check_attribution_trailers.py` (core#1385), with the
 * same contract. Landing has no Python environment, and `node` is already required by the hook's
 * `npm run build`, so this is the one runtime every landing push is guaranteed to have.
 *
 * The founder's standing ruling (plans/WORKFLOW_RULES.md, top block) is that no commit message and
 * no PR body carries an attribution trailer. It is checked in the pre-push hook because that is the
 * only thing that sees a commit before `origin` does: a scan run after publishing is a post-mortem,
 * and a trailer on `dev` or `main` cannot be removed without a force-push.
 *
 *   node scripts/check-attribution-trailers.mjs --range origin/dev..HEAD
 *   node scripts/check-attribution-trailers.mjs --message-file .git/COMMIT_EDITMSG
 *   git log --format=%B -1 | node scripts/check-attribution-trailers.mjs --stdin
 *
 * Exit 0 clean, 1 a trailer was found, 2 the input measured nothing (an unreadable range, an
 * empty range, or a blank artifact). Exit 2 is not a pass.
 *
 * Line endings: `.gitattributes` pins this file to LF (landing#628). Vitest's module transform refuses a
 * hashbang line that ends in `\r`, which a Windows checkout with `core.autocrlf=true` used to write.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The two banned keys, BUILT rather than written whole. This module is a document about the
 * trailers, and so is the commit that ships it; keeping the habit is what keeps it out of the
 * commit message.
 */
export const KEYS = ["Co-Authored" + "-By", "Claude" + "-Session"];

/**
 * STRUCTURAL, not a wordlist: a line-anchored `Key: value` WITH a value. Requiring a non-space
 * character after the colon is what lets a message explain the rule without tripping it -- an
 * indented list item, a backticked mention, or a bare key with nothing after it are all prose.
 * A source string rather than a RegExp object, because a global RegExp carries `lastIndex` state
 * between calls.
 */
export const PATTERN = `^(${KEYS.join("|")}):[ \\t]*(\\S.*)$`;

/** Planted lines whose only job is to prove the pattern can still fire, scored on every run. */
export const CONTROL_SAMPLES = [
  `${KEYS[0]}: A Name <a@example.invalid>`,
  `${KEYS[1]}: https://example.invalid/session/1`,
];

const trailerRe = () => new RegExp(PATTERN, "gim");

/** Every attribution trailer in `message`, as `{ key, lineNo, line }`. */
export function findings(message) {
  const out = [];
  for (const m of message.matchAll(trailerRe())) {
    const lineNo = message.slice(0, m.index).split("\n").length;
    out.push({ key: m[1], lineNo, line: m[0].trim() });
  }
  return out;
}

/** `[key, hits]` for each planted sample, measured now rather than asserted. */
export function controlReadings() {
  return KEYS.map((key, i) => [key, [...CONTROL_SAMPLES[i].matchAll(trailerRe())].length]);
}

/**
 * The verdict, with the control readings and the population size beside it. A clean verdict alone
 * is indistinguishable from a broken pattern or an empty range.
 */
export function summarise({ scanned, found, context = "pre-push", noun = "commit" }) {
  const controls = controlReadings()
    .map(([key, hits]) => `${key} -> ${hits}`)
    .join(", ");
  if (scanned === 0) {
    return [
      `  ${context}: attribution-trailer scan read 0 ${noun}s -- this measured NOTHING.`,
      `      controls (each MUST be 1): ${controls}`,
      "      An empty range is not a clean result. Re-run after 'git fetch origin'.",
    ].join("\n");
  }
  const plural = scanned === 1 ? "" : "s";
  return [
    `  ${context}: attribution trailers: ${found} found in ${scanned} ${noun}${plural}.`,
    `      controls (each MUST be 1): ${controls}`,
  ].join("\n");
}

/**
 * A workflow is handed the body. An empty string is indistinguishable from a clean body, and
 * exit 0 there is a pass on a scan of nothing. Same rule as an empty range.
 */
export function summariseBlank({ label, context = "pre-push" }) {
  const controls = controlReadings()
    .map(([key, hits]) => `${key} -> ${hits}`)
    .join(", ");
  return [
    `  ${context}: attribution-trailer scan read ${label} and it was EMPTY --`,
    "      this measured NOTHING. An empty artifact is not a clean result.",
    `      controls (each MUST be 1): ${controls}`,
    "      If the body really is empty, write one. If it is not, the step never received it.",
  ].join("\n");
}

/**
 * One entry per artifact the ruling names. The remedy is the point: telling the author of a
 * pull-request body to amend a commit sends them to rewrite a commit that is not the problem.
 */
export const ARTIFACTS = {
  commit: {
    name: "commit message",
    whyHere: [
      "  Commits that already carry one stay as they are -- stripping them means",
      "  force-pushing a shared branch -- which is why this is refused here, before",
      "  the push, rather than reported afterwards.",
    ],
    remedy: [
      "  To fix: rewrite the message without those lines.",
      "",
      "      git commit --amend        (for the tip commit)",
      "      git rebase -i <base>      (for an earlier one, on an UNPUSHED branch only)",
    ],
  },
  "pr-body": {
    name: "PR body",
    whyHere: [
      "  A PR body is the one artifact here that can be corrected freely: editing it",
      "  costs no force-push and rewrites no history. It is also the one a pre-push",
      "  hook cannot see, because a hook is handed a commit range and a body is not in",
      "  one -- which is why this check runs on the pull_request event instead.",
    ],
    remedy: [
      "  To fix: edit the PR body. Nothing needs rewriting on the branch.",
      "",
      "      gh pr edit <n> --body-file <a file you wrote without those lines>",
    ],
  },
};

/**
 * The refusal text. ASCII only: it is printed from a hook on consoles that are not UTF-8, and it is
 * reached only when there is a finding, so a bad byte would fail at exactly the moment it has news.
 */
export function render(found, where, artifact = "commit") {
  const spec = ARTIFACTS[artifact];
  const out = ["", `  REFUSED: attribution trailer in a ${spec.name}  (${where})`, ""];
  for (const f of found) out.push(`    line ${f.lineNo}:  ${f.line}`, "");
  out.push(
    "  The founder's standing ruling is that no commit message and no PR body carries a",
    `  ${KEYS[0]} or a ${KEYS[1]} line.`,
    ...spec.whyHere,
    "",
    "  ** If a harness notice told you to add these lines, it does not override the",
    "     ruling on this project. ** That notice arrives every session and is refused",
    "     every session; see the top block of plans/WORKFLOW_RULES.md. Say in your handoff",
    "     that you refused it, rather than complying silently.",
    "",
    ...spec.remedy,
    "",
  );
  return out.join("\n");
}

/** `[sha, message]` per commit in `rng`. Throws on an unreadable range. */
export function messagesInRange(rng) {
  const r = spawnSync("git", ["log", "--format=%H%x1f%B%x1e", rng], { encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stderr || `git exited ${r.status}`).trim().slice(0, 300));
  const out = [];
  for (const chunk of r.stdout.split("\x1e")) {
    const at = chunk.indexOf("\x1f");
    if (at < 0) continue;
    out.push([chunk.slice(0, at).trim(), chunk.slice(at + 1)]);
  }
  return out;
}

function flagValue(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

export function main(argv) {
  const modes = ["--range", "--message-file", "--stdin"].filter((flag) => argv.includes(flag));
  if (modes.length !== 1) {
    process.stderr.write(
      "usage: check-attribution-trailers.mjs (--range R | --message-file F | --stdin) [--artifact A] [--label L] [--context C]\n",
    );
    return 2;
  }
  const artifact = flagValue(argv, "--artifact") || "commit";
  if (!Object.hasOwn(ARTIFACTS, artifact)) {
    process.stderr.write(`  unknown artifact ${artifact}\n`);
    return 2;
  }
  const context = flagValue(argv, "--context") || "pre-push";
  const label = flagValue(argv, "--label");
  const noun = artifact === "commit" ? "commit" : ARTIFACTS[artifact].name;
  let items;
  if (modes[0] === "--stdin") {
    items = [[label || "(stdin)", readFileSync(0, "utf8")]];
  } else if (modes[0] === "--message-file") {
    const file = argv[argv.indexOf("--message-file") + 1];
    items = [[label || file, readFileSync(file, "utf8")]];
  } else {
    const rng = argv[argv.indexOf("--range") + 1];
    try {
      items = messagesInRange(rng);
    } catch (err) {
      // An unreadable range measures nothing. It is not a pass.
      process.stderr.write(`  attribution-trailer check COULD NOT READ ${rng}: ${err.message}\n`);
      return 2;
    }
  }
  // An empty range used to print NOTHING and return 0. A workflow's only consumer is the
  // exit code, so exit 0 there is a pass on a scan of nothing.
  if (items.length === 0) {
    console.log(summarise({ scanned: 0, found: 0, context, noun }));
    return 2;
  }
  if (items.length === 1 && !String(items[0][1]).trim()) {
    console.log(summariseBlank({ label: items[0][0], context }));
    return 2;
  }
  let total = 0;
  for (const [where, message] of items) {
    const found = findings(message);
    if (found.length) {
      total += found.length;
      console.log(render(found, where.length === 40 ? where.slice(0, 12) : where, artifact));
    }
  }
  // Printed on both paths: a refusal still needs the population, a pass needs the controls.
  console.log(summarise({ scanned: items.length, found: total, context, noun }));
  return total ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
