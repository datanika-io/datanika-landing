import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
// @ts-expect-error -- a plain ES module with no type declarations
import {
  ARTIFACTS,
  CONTROL_SAMPLES,
  PATTERN,
  findings,
  render,
  summarise,
  summariseBlank,
} from "../scripts/check-attribution-trailers.mjs";

/**
 * landing#622 -- attribution trailers must be refused BEFORE the commit reaches origin.
 *
 * `scripts/check-attribution-trailers.mjs` is a Node port of datanika-core's
 * `scripts/check_attribution_trailers.py` (core#1385), and these tests port core's. The hook's
 * behaviour under a REAL invocation -- refuses before the build, and the anti-vacuity case that
 * strips the gate -- is pinned by `scripts/test-pre-push-guard.sh`, cases 9-11, which drive the
 * hook itself rather than reading its text.
 *
 * Payloads are BUILT, never written as literal trailer lines: this file, the checker and the commit
 * that ships them are documents about the trailers.
 */

const ROOT = resolve(__dirname, "..");
const SCRIPT = resolve(ROOT, "scripts", "check-attribution-trailers.mjs");
const HOOK = resolve(ROOT, "scripts", "hooks", "pre-push");
const COAUTH = "Co-Authored" + "-By";
const SESSION = "Claude" + "-Session";
const msg = (subject: string, ...body: string[]) => [subject, ...body].join("\n\n");

describe("1. the detector discriminates -- controls first", () => {
  it("sees a planted co-author trailer", () => {
    expect(findings(msg("[Infra] x", `${COAUTH}: A B <a@b.c>`))).toHaveLength(1);
  });
  it("sees a planted session trailer", () => {
    expect(findings(msg("[Infra] x", `${SESSION}: https://example.test/s/1`))).toHaveLength(1);
  });
  it("reads zero on a clean message (meaningless without the two controls above)", () => {
    expect(findings(msg("[Infra] Ordinary work (refs #1)", "A body with no trailers."))).toEqual([]);
  });
  it("reports both trailers in one message", () => {
    const m = msg("[Infra] x", `${COAUTH}: A B <a@b.c>\n${SESSION}: https://example.test/s/1`);
    expect(findings(m)).toHaveLength(2);
  });
  it("gives the same answer twice in a row (no RegExp lastIndex state leaks between calls)", () => {
    const m = msg("[Infra] x", `${COAUTH}: A B <a@b.c>`);
    expect(findings(m)).toHaveLength(1);
    expect(findings(m)).toHaveLength(1);
  });
});

describe("1b. it does not fire on prose about the rule", () => {
  it("ignores a backticked mention", () => {
    expect(findings(msg("[Infra] x", `Never add \`${COAUTH}\` lines to a commit.`))).toEqual([]);
  });
  it("ignores a mid-line mention", () => {
    expect(findings(msg("[Infra] x", `The ${SESSION} line is refused by the hook.`))).toEqual([]);
  });
  it("ignores a key with no value", () => {
    expect(findings(msg("[Infra] x", `${COAUTH}:`))).toEqual([]);
  });
  it("ignores a list item naming the key", () => {
    expect(findings(msg("[Infra] x", `- ${COAUTH}: refused, see the hook`))).toEqual([]);
  });
});

describe("2. the verdict carries its own control", () => {
  it("states both control readings", () => {
    const text = summarise({ scanned: 3, found: 0 });
    expect(text.toLowerCase()).toContain("controls");
    expect(text).toContain(`${COAUTH} -> 1`);
    expect(text).toContain(`${SESSION} -> 1`);
  });
  it("states the population size", () => {
    expect(summarise({ scanned: 7, found: 0 })).toContain("7 commits");
  });
  it("says a zero population measured nothing, rather than reading as clean", () => {
    const empty = summarise({ scanned: 0, found: 0 });
    expect(empty).not.toEqual(summarise({ scanned: 4, found: 0 }));
    expect(empty).toContain("0 commits");
  });
  it("control samples really trip the pattern", () => {
    expect(CONTROL_SAMPLES.length).toBeGreaterThan(0);
    for (const sample of CONTROL_SAMPLES) expect(new RegExp(PATTERN, "im").test(sample)).toBe(true);
  });
});

describe("3. the refusal text", () => {
  const text = () => render(findings(msg("[Infra] x", `${COAUTH}: A B <a@b.c>`)), "abc1234");
  it("names the line and the key", () => {
    expect(text()).toContain("line 3");
    expect(text()).toContain(COAUTH);
  });
  it("names the ruling and the harness conflict, without scolding", () => {
    const t = text().toLowerCase();
    expect(t).toContain("founder");
    expect(t).toContain("harness");
    for (const scold of ["be careful", "you should have", "double-check"]) expect(t).not.toContain(scold);
  });
  it("is ASCII only", () => {
    expect([...text()].filter((c) => c.charCodeAt(0) > 127)).toEqual([]);
  });
  it("control: the ASCII check can see a non-ASCII character", () => {
    expect([..."a⚠b"].filter((c) => c.charCodeAt(0) > 127)).toEqual(["⚠"]);
  });
});

describe("4. it runs end to end, and the hook invokes it and ACTS on it", () => {
  const run = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", cwd: ROOT });
  const messageFile = (message: string) => {
    const f = join(mkdtempSync(join(tmpdir(), "trailer-")), "msg.txt");
    writeFileSync(f, message, "utf8");
    return f;
  };

  it("exits 1 on a trailer, and says REFUSED", () => {
    const r = run("--message-file", messageFile(msg("[Infra] x", `${SESSION}: https://example.test/s/1`)));
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("REFUSED");
  });
  it("exits 0 on a clean message", () => {
    const r = run("--message-file", messageFile(msg("[Infra] x", "Nothing to see.")));
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });
  it("exits 2 on an unreadable range, which is not a pass", () => {
    expect(run("--range", "no-such-ref..also-not-real").status).toBe(2);
  });

  const hookLines = () => readFileSync(HOOK, "utf8").split(/\r?\n/).map((l) => l.trim());
  it("the pre-push hook invokes it", () => {
    expect(hookLines().some((l) => !l.startsWith("#") && l.includes("check-attribution-trailers.mjs"))).toBe(true);
  });
  it("the hook acts on the result rather than only running it", () => {
    const lines = hookLines();
    const at = lines.findIndex((l) => !l.startsWith("#") && l.includes("check-attribution-trailers.mjs"));
    expect(at).toBeGreaterThanOrEqual(0);
    expect(lines.slice(at, at + 14).join("\n")).toContain("exit 1");
  });
  it("runs before the build, so a refused push does not first pay for it", () => {
    const text = readFileSync(HOOK, "utf8");
    const gate = text.indexOf("check-attribution-trailers.mjs");
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(gate).toBeLessThan(text.indexOf("npm run build"));
  });
  it("carries no exemption", () => {
    const src = readFileSync(SCRIPT, "utf8");
    for (const word of ["ALLOWLIST", "EXEMPT", "skip_if", "if author"]) expect(src).not.toContain(word);
  });
});

describe("6. a PR body, through the checker -- one test, three outcomes", () => {
  const runBody = (body: string) =>
    spawnSync(
      process.execPath,
      [
        SCRIPT,
        "--stdin",
        "--artifact",
        "pr-body",
        "--label",
        "PR #1 body",
        "--context",
        "attribution.yml",
      ],
      { input: body, encoding: "utf8" },
    );

  it("a planted trailer exits 1, a blank body exits 2, and a clean body exits 0", () => {
    const problems: string[] = [];

    const planted = runBody(`Some PR body.\n\n${COAUTH}: A B <a@b.c>\n`);
    const plantedOut = `${planted.stdout ?? ""}${planted.stderr ?? ""}`;
    if (planted.status !== 1) problems.push(`planted exited ${planted.status}, want 1:\n${plantedOut}`);
    if (!String(planted.stdout).includes("REFUSED")) problems.push("planted refusal did not say REFUSED");
    if (!String(planted.stdout).includes("gh pr edit")) {
      problems.push("planted refusal does not offer editing the pull request");
    }
    if (
      String(planted.stdout).includes("git commit --amend") ||
      String(planted.stdout).includes("git rebase -i")
    ) {
      problems.push("planted refusal tells the author to rewrite a commit");
    }

    for (const blank of ["", "\n", "   \n\t\n"]) {
      const got = runBody(blank);
      const shown = `${got.stdout ?? ""}${got.stderr ?? ""}`;
      if (got.status !== 2 || !String(got.stdout).includes("NOTHING")) {
        problems.push(`blank ${JSON.stringify(blank)} exited ${got.status}, want 2 with NOTHING:\n${shown}`);
      }
    }

    const clean = runBody("Some PR body with no trailers.\n\nrefs #731\n");
    const out = String(clean.stdout ?? "");
    if (clean.status !== 0) problems.push(`clean exited ${clean.status}:\n${out}${clean.stderr ?? ""}`);
    if (!out.includes("attribution.yml") || out.includes("pre-push") || !out.includes("PR body")) {
      problems.push(`verdict does not name where it ran:\n${out}`);
    }

    expect(problems, problems.join("\n")).toEqual([]);
  });
});

const WORKFLOW = resolve(ROOT, ".github", "workflows", "attribution.yml");

function stripComments(yaml: string): string {
  return yaml
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

function runBlocks(raw: string): string[] {
  const lines = stripComments(raw).split("\n");
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const block = lines[i].match(/^(\s*)run:\s*[|>][+-]?\s*$/);
    if (block) {
      const indent = block[1].length;
      const body: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === "") {
          body.push(lines[j]);
          continue;
        }
        if (lines[j].search(/\S/) <= indent) break;
        body.push(lines[j]);
      }
      blocks.push(body.join("\n"));
      continue;
    }
    const inline = lines[i].match(/^\s*run:\s+(\S.*)$/);
    if (inline) blocks.push(inline[1]);
  }
  return blocks;
}

function onBlock(raw: string): string {
  const lines = stripComments(raw).split("\n");
  const start = lines.findIndex((l) => l.startsWith("on:"));
  if (start === -1) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^[A-Za-z_]/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/** True when merge_group is an event and no step that runs on it feeds the checker. */
function mergeGroupPassesWithoutReading(text: string): boolean {
  if (!/^ {2}merge_group:/m.test(onBlock(text))) return false;
  const lines = stripComments(text).split("\n");
  const stepsAt = lines.findIndex((l) => /^\s*steps:\s*$/.test(l));
  if (stepsAt === -1) return true;
  const chunks: string[] = [];
  let current: string[] = [];
  for (const line of lines.slice(stepsAt + 1)) {
    if (/^\s*- /.test(line) && current.length) {
      chunks.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) chunks.push(current.join("\n"));
  const reads = chunks.some((chunk) => {
    const gatedAway = /^\s*if:/m.test(chunk) && !chunk.includes("merge_group");
    if (gatedAway) return false;
    return (
      chunk.includes("check-attribution-trailers.mjs") &&
      (chunk.includes("--range") || chunk.includes("--stdin") || chunk.includes("--message-file"))
    );
  });
  return !reads;
}

const NOOP_MERGE_GROUP = `
name: Attribution
on:
  merge_group:
    types: [checks_requested]
jobs:
  attribution:
    steps:
      - run: exit 0
`;

const READING_MERGE_GROUP = `
name: Attribution
on:
  merge_group:
    types: [checks_requested]
jobs:
  attribution:
    steps:
      - if: github.event_name == 'merge_group'
        run: node scripts/check-attribution-trailers.mjs --range "$RANGE"
`;

describe("7. one carrier per artifact the ruling names", () => {
  it("the checker knows exactly those two artifacts", () => {
    expect(Object.keys(ARTIFACTS).sort()).toEqual(["commit", "pr-body"]);
  });
  it("the commit carrier is the pre-push hook", () => {
    expect(readFileSync(HOOK, "utf8")).toContain("check-attribution-trailers.mjs");
  });
  it("the pull-request carrier feeds the body to the checker", () => {
    const raw = readFileSync(WORKFLOW, "utf8");
    const body = runBlocks(raw).find((b) => b.includes("--artifact pr-body"));
    expect(body, "no run step scans with --artifact pr-body").toBeDefined();
    expect(body).toContain("check-attribution-trailers.mjs");
    expect(body).toContain("--stdin");
    expect(body).toContain("PR_BODY");
  });
});

describe("8. the pull-request carrier is wired safely, and merge_group reads the range", () => {
  it("triggers on edited", () => {
    const on = onBlock(readFileSync(WORKFLOW, "utf8"));
    expect(on).toContain("edited");
  });
  it("the body reaches the step through env, never through run interpolation", () => {
    const raw = readFileSync(WORKFLOW, "utf8");
    for (const block of runBlocks(raw)) {
      expect(block, block).not.toContain("pull_request.body");
    }
    expect(raw).toContain("PR_BODY: ${{ github.event.pull_request.body }}");
  });
  it("control: the injection detector can see an interpolated body", () => {
    const planted = 'run: |\n  echo "${{ github.event.pull_request.body }}"\n';
    expect(planted).toContain("pull_request.body");
  });
  it("merge_group scans the commit range, and an exit 0 job reads nothing", () => {
    const raw = readFileSync(WORKFLOW, "utf8");
    expect(onBlock(raw)).toContain("merge_group:");
    const range = runBlocks(raw).find((b) => b.includes("--range"));
    expect(range).toBeDefined();
    expect(range).toContain("BASE_SHA");
    expect(range).toContain("HEAD_SHA");
    expect(mergeGroupPassesWithoutReading(NOOP_MERGE_GROUP)).toBe(true);
    expect(mergeGroupPassesWithoutReading(READING_MERGE_GROUP)).toBe(false);
    expect(mergeGroupPassesWithoutReading(raw)).toBe(false);
  });
  it("the hook's own verdict still names the hook", () => {
    expect(summarise({ scanned: 1, found: 0 })).toContain("pre-push");
  });
});

describe("9. the refusal sends a pull-request author somewhere that exists", () => {
  const text = () => render(findings(msg("A PR body", `${COAUTH}: A B <a@b.c>`)), "PR #1 body", "pr-body");
  it("offers a pull-request edit rather than a rebase", () => {
    const t = text();
    expect(t).toContain("gh pr edit");
    expect(t).not.toContain("git commit --amend");
    expect(t).not.toContain("git rebase -i");
  });
  it("the commit refusal still offers the commit remedy", () => {
    const t = render(findings(msg("[QA] x", `${COAUTH}: A B <a@b.c>`)), "abc1234");
    expect(t).toContain("git commit --amend");
    expect(t).not.toContain("gh pr edit");
  });
  it("names the artifact it found the trailer in", () => {
    expect(text()).toContain("PR body");
  });
  it("the pull-request refusal and the blank verdict are ASCII, and they differ from a clean verdict", () => {
    expect([...text()].filter((c) => c.charCodeAt(0) > 127)).toEqual([]);
    const blank = summariseBlank({ label: "PR #1 body", context: "attribution.yml" });
    expect([...blank].filter((c) => c.charCodeAt(0) > 127)).toEqual([]);
    const clean = summarise({ scanned: 1, found: 0, context: "attribution.yml", noun: "PR body" });
    expect(blank).not.toEqual(clean);
    expect(blank).toContain("NOTHING");
    expect(clean).not.toContain("NOTHING");
  });
});
