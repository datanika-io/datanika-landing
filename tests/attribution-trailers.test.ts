import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
// @ts-expect-error -- a plain ES module with no type declarations
import { CONTROL_SAMPLES, PATTERN, findings, render, summarise } from "../scripts/check-attribution-trailers.mjs";

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
