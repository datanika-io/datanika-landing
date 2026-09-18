import { execFileSync } from "node:child_process";
import { closeSync, openSync, readSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A file that starts with `#!` checks out with LF on every platform (landing#622, follow-up).
 *
 * `scripts/check-attribution-trailers.mjs` begins with a hashbang. On a Windows worktree with
 * `core.autocrlf=true` it checked out as CRLF, and vitest's module transform then refused it
 * (`SyntaxError: Invalid or unexpected token`): `tests/attribution-trailers.test.ts` could not be
 * collected, the suite read `1 failed`, and the pre-push hook refused every landing push from
 * Windows, whatever the branch changed. CI stayed green because Linux checks out LF. Growth
 * measured it with a control: the same bytes pass in LF and fail again in CRLF.
 *
 * The fix is a line-ending rule in `.gitattributes`, not a CRLF-tolerant script, because the class
 * is "a hashbang file" and not "this one script": `*.sh` and `scripts/hooks/*` were already pinned
 * for the same reason, and the next `.mjs` with a hashbang would have repeated this.
 *
 * 🔑 WHY `git check-attr` AND NOT THE BYTES ON DISK. CI checks out LF whatever the rules say, so a
 * test that read the working copy would pass on Linux with the rule deleted -- a guard that cannot
 * fail where it runs. The attribute is the same on every platform, so this reads the attribute.
 */

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function startsWithHashbang(path: string): boolean {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const head = Buffer.alloc(2);
    return readSync(fd, head, 0, 2, 0) === 2 && head.toString("latin1") === "#!";
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function eolOf(paths: string[]): Map<string, string> {
  // `git check-attr -z` emits NUL-separated triples: <path> NUL <attribute> NUL <value> NUL
  const out = execFileSync("git", ["check-attr", "-z", "--stdin", "eol"], {
    input: paths.join("\0") + "\0",
    encoding: "utf8",
  }).split("\0");
  const eol = new Map<string, string>();
  for (let i = 0; i + 2 < out.length; i += 3) eol.set(out[i], out[i + 2]);
  return eol;
}

const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
const hashbang = tracked.filter(startsWithHashbang);

describe("hashbang files check out with LF (landing#622)", () => {
  it("finds the hashbang files, including the one that broke the hook", () => {
    // Control: a selector that matches nothing reports a clean bill of health.
    expect(hashbang).toContain("scripts/check-attribution-trailers.mjs");
    expect(hashbang.length).toBeGreaterThan(1);
  });

  it("reads a value other than lf for a file no rule pins", () => {
    // Control: the instrument can say "not lf", so an all-lf reading below is a measurement.
    expect(eolOf(["package.json"]).get("package.json")).not.toBe("lf");
  });

  it("pins every hashbang file to eol=lf", () => {
    const eol = eolOf(hashbang);
    const unpinned = hashbang.filter((p) => eol.get(p) !== "lf");
    expect(
      unpinned,
      `these start with #! but .gitattributes does not pin them to eol=lf, so a Windows checkout ` +
        `with core.autocrlf=true writes CRLF and the hashbang line ends in \\r`,
    ).toEqual([]);
  });
});
