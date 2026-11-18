import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `.github/scripts/promotion_refs.py` decides which issues a promotion closes. It is
 * Python in a Node repo, so nothing in `npm test` has ever executed it — which is
 * precisely how this repo missed the fix that core shipped in core#636 and kept running
 * the buggy version for all 7 of its generated promotion blocks (landing#315).
 *
 * Most of these are TEXT assertions, deliberately and with their limits stated: they cannot
 * catch a subtly wrong port, only a missing or mis-ported guard. One test executes the
 * script. It is the one that shows an unresolvable number is named, the rendered line
 * closes nothing, and Coverage still counts the commit. The base-branch filter stays
 * `main`; porting core's `master` comparison verbatim would re-list every earlier
 * promotion.
 */

const SCRIPT = resolve(__dirname, "..", ".github", "scripts", "promotion_refs.py");
const source = readFileSync(SCRIPT, "utf8");

describe("promotion_refs.py closing-reference guard", () => {
  it("skips pulls that merely contain the commit (core#635)", () => {
    // `GET /commits/{sha}/pulls` returns every pull whose branch contains the commit, so
    // an OPEN branch cut from `dev` donates its closing keywords to the promotion. The
    // merged_at check is the whole fix.
    expect(source).toContain("def introduced_the_commit(");
    expect(source).toMatch(/merged_at["']?\)?\s+is None/);
    expect(source).toContain("if not introduced_the_commit(pull):");
  });

  it("filters the base branch on `main`, not core's `master`", () => {
    // Porting core's helper verbatim would compare against "master", which is not this
    // repo's default branch: the filter would then match nothing and every earlier
    // promotion PR's references would be re-listed on every promotion.
    expect(source).toMatch(/base["']?,\s*\{\}\)\.get\(["']ref["']\)\s*!=\s*["']main["']/);
    expect(source).not.toMatch(/\.get\(["']ref["']\)\s*[!=]=\s*["']master["']/);
  });

  it("still keeps the base filter as well as the merge check", () => {
    // Neither subsumes the other: a previous promotion PR IS merged, so dropping the base
    // filter would re-list its references; and a base filter alone is the original bug.
    const fn = source.slice(source.indexOf("def introduced_the_commit("));
    const body = fn.slice(0, fn.indexOf("\ndef ", 1));
    expect(body).toContain("merged_at");
    expect(body).toContain("main");
  });
});

/**
 * landing#455 — the non-closing half.
 *
 * For five consecutive promotions this script reported `success` while deriving nothing.
 * It matches only closing keywords; every commit here writes `refs #N`, because
 * WORKFLOW_RULES §4 tells departments to (landing#273: `closes #272` on a 4-of-36 partial
 * fix retired the whole issue). So the automation was working exactly as designed and
 * covering nothing, and no signal ever went red.
 *
 * The fix is NOT to widen the closing regex — that is #273 again. It is to derive the
 * `refs` set separately and render it **without a keyword**, as candidates the promoter
 * reviews before merging.
 *
 * These tests execute the extracted patterns rather than searching for substrings, for the
 * reason this file's header already states: text assertions cannot catch a subtly wrong
 * port, and "which keywords count as authorship" is exactly that kind of detail.
 */

/** Pull a `NAME = re.compile(r"…")` literal out of the Python source. */
function py(name: string, src = source): string {
  const at = src.indexOf(`${name} = re.compile(`);
  expect(at, `${name} not found — the extractor is broken, not the script`).toBeGreaterThan(-1);
  const rest = src.slice(at);
  const firstLine = rest.slice(0, rest.indexOf("\n"));
  // A one-line `re.compile(...)` must not scan forward to the NEXT pattern's closing
  // paren — that silently concatenates two patterns into one that matches nothing.
  const scope = firstLine.includes(")") ? firstLine : rest.slice(0, rest.indexOf("\n)"));
  const parts = [...scope.matchAll(/r"((?:[^"\\]|\\.)*)"/g)];
  expect(parts.length, `no r"…" literal after ${name}`).toBeGreaterThan(0);
  return parts.map((m) => m[1]).join("");
}

/**
 * The one condition three tests anchor on, written once.
 *
 * It gained `and not elsewhere` in landing#493 and two tests had it spelled out verbatim,
 * in five places between them — so the correct change went red in two and would have gone
 * silently vacuous in the others, because `indexOf` on a missing anchor returns -1 and
 * `slice(-1, n)` is an empty string that matches nothing without complaining.
 */
const EMPTY_DERIVATION_GUARD = "if not refs and not tracking and not elsewhere:";

function trackedIn(subject: string): number[] {
  return [...subject.matchAll(new RegExp(py("TRACKING"), "gi"))]
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

describe("promotion_refs.py — tracking references (landing#455)", () => {
  it("extracts a non-trivial TRACKING pattern (anti-vacuity)", () => {
    // A length floor proves a pattern is non-empty, never that it is the right one —
    // so every assertion below executes it against real subjects as well.
    expect(py("TRACKING").length).toBeGreaterThan(30);
    expect(py("TRACKING_DECLARATION").length).toBeGreaterThan(30);
  });

  it("counts the authorship keywords this project actually writes", () => {
    // All four are real subjects from this repo's history or core's.
    expect(trackedIn("[Growth] Remove the per-seat price entirely (refs #396)")).toEqual([396]);
    expect(trackedIn("[Infra] Runbook (ref #904)")).toEqual([904]);
    expect(trackedIn("[QA] Widen the guard (part of #738)")).toEqual([738]);
    expect(trackedIn("[Product] Spec (towards #655)")).toEqual([655]);
  });

  it("does NOT count `see #N` — background reading is not authorship", () => {
    expect(trackedIn("[Infra] Something, see #602 for the mechanism")).toEqual([]);
  });

  it("does NOT count a bare mention", () => {
    expect(trackedIn("[Engineering] Same family as #602")).toEqual([]);
  });

  it("renders candidates with NO closing keyword", () => {
    // The whole safety property. A bare `#N` in a PR body closes nothing; that is what
    // lets this list be generated mechanically without re-creating #273.
    const at = source.indexOf("candidate_lines.append(");
    expect(at).toBeGreaterThan(-1);
    const line = source.slice(at, source.indexOf("\n", at));
    expect(line).toContain('f"- #{num}');
    expect(line).not.toMatch(/close|fix|resolve/i);
  });

  it("does not list an issue as a candidate when a commit genuinely closes it", () => {
    expect(source).toContain("tracking.pop(num, None)");
  });

  it("skips already-closed issues in the candidate list", () => {
    const at = source.indexOf("    for num in sorted(tracking):");
    expect(at, "the candidate loop moved — re-derive this anchor").toBeGreaterThan(-1);
    // ⚠️ The end anchor was `"\n    if not lines"` and landing#493 turned that `if` into a
    // multi-line condition, so `indexOf` returned -1 and `slice(at, -1)` silently took the
    // REST OF THE FILE. The assertion then passed by matching the *closing* loop instead —
    // green, and measuring nothing. Anchor on the next thing that is genuinely a boundary,
    // and assert the anchor was found.
    const end = source.indexOf("\n    unresolved_lines = [", at);
    expect(end, "the candidate loop's end anchor moved — re-derive it").toBeGreaterThan(at);
    const block = source.slice(at, end);
    expect(block).toContain('issue.get("state") == "closed"');
    // And prove the slice is the candidate loop, not a superset that happens to contain
    // the string: the closing loop's distinctive line must NOT be in it.
    expect(block).not.toContain("- Closes #{num}");
  });
});

/**
 * landing#493 — the 142-line divergence, and the bucket neither repo had.
 *
 * `promotion-pr-refs.yml` is 50 lines in both repos and delegates to the same path, so
 * *"landing has the same workflow"* was true and misleading; this script was 142 lines
 * behind core's for a week and nothing said so. Landing PR #492 then promoted 9 commits
 * while its block spoke for 3.
 *
 * These tests pin the FEATURES that divergence removed, not byte-equality with core —
 * landing legitimately differs (`main` vs `master`, the `post-promotion-reconcile.yml`
 * prose). A cross-repo byte comparison is not buildable here anyway: core is a different
 * repository and is not checked out during `npm test`.
 */
describe("promotion_refs.py — every promoted commit is accounted for (landing#493)", () => {
  function crossRepoIn(text: string): string[] {
    return [...text.matchAll(new RegExp(py("CROSS_REPO"), "gi"))].map((m) => `${m[1]}#${m[2]}`);
  }

  it("matches a keyword-qualified cross-repo reference", () => {
    expect(crossRepoIn("[Growth] Fix the annex (refs cloud#163)")).toEqual(["cloud#163"]);
    expect(crossRepoIn("[Infra] Port it (closes core#1040)")).toEqual(["core#1040"]);
  });

  it("does NOT match a bare cross-repo mention — a citation is not a declaration", () => {
    // Core measured this: an unqualified `([A-Za-z][\w.-]*)#(\d+)` harvested issue numbers
    // out of a body that merely cited them as already-shipped background, and reported the
    // batch fully accounted. A flattering coverage number is worse than a low one.
    expect(crossRepoIn("[QA] Same family as core#992, and see cloud#160")).toEqual([]);
    expect(crossRepoIn("Background: core#1040 explains the mechanism.")).toEqual([]);
  });

  it("treats `landing#N` as this repo, not another one", () => {
    // `repo_aliases` exists so our own prose does not render under "referenced in another
    // repository" — a confident wrong line is worse than a missing one.
    expect(source).toContain("def repo_aliases(");
    expect(source).toContain("if owner.lower() in mine:");
    const at = source.indexOf("def repo_aliases(");
    const block = source.slice(at, source.indexOf("\ndef ", at + 10));
    // {"datanika-landing", "landing"} — the split is what makes the short form work.
    expect(block).toContain('name.rsplit("-", 1)[-1]');
  });

  it("names commits it could not classify instead of dropping them", () => {
    expect(source).toContain("No issue reference derived");
    expect(source).toContain("unaccounted = [s for s in shas if not accounted.get(s)]");
    expect(source).toMatch(/Coverage: \*\*\{len\(shas\) - len\(unaccounted\)\}/);
  });

  it("gives an unresolvable reference its own bucket rather than silence", () => {
    // The number is named. The line carries no closing keyword. The commit stays in
    // Coverage — dropping it from the count was the silent half of landing#493.
    expect(source).toContain("Referenced a number that does not resolve — closing nothing");
    expect(source).toContain("does not resolve in this repository");
    expect(source).toContain("def _unresolvable(");
    expect(source).toContain('f"- `#{num}` — {why} · via {');
  });

  it("keeps an unresolvable reference inside Coverage", () => {
    const unaccountedAt = source.indexOf("unaccounted = [s for s in shas");
    const resolveAt = source.indexOf("def _unresolvable(");
    expect(unaccountedAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeGreaterThan(unaccountedAt);
    expect(source).toMatch(/Coverage: \*\*\{len\(shas\) - len\(unaccounted\)\}/);
    expect(source).toContain(
      "{len(unresolved)} reference(s) did not resolve to an issue here and",
    );
    expect(source).toContain("close nothing — see the section above.");
  });

  it("computes `unaccounted` BEFORE resolution, so the lookup cannot drop the commit", () => {
    const unaccountedAt = source.indexOf("unaccounted = [s for s in shas");
    const resolveAt = source.indexOf("def _unresolvable(");
    expect(unaccountedAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeGreaterThan(unaccountedAt);
  });

  it("distinguishes a 404 from a failed API call", () => {
    // 🚨 Conflating them renders a transient error as "this issue does not exist" — a
    // confident, wrong, permanent-looking line in a promotion body. Only a literal Not
    // Found is "does not resolve". A failed call is a different reason in the same
    // bucket, and neither reason drops the commit from Coverage.
    expect(source).toContain("def gh_issue(");
    const at = source.indexOf("def gh_issue(");
    const block = source.slice(at, source.indexOf("\ndef main(", at));
    expect(block).toContain('"not found" in stderr or "http 404" in stderr');
    expect(block).toContain('return ("error", None)');
    expect(block).toContain('return ("missing", None)');
    // A PR is not an issue: repos/{r}/issues/{n} returns PRs too, and a promotion body
    // must never list one as an issue to close.
    expect(block).toContain('data.get("pull_request")');
  });

  it("keeps a cross-repo-only batch out of the red check (would be a FALSE red)", () => {
    // Three commits all carrying `refs core#1040` derive no same-repo reference of either
    // kind. Without `elsewhere` in this condition the job fails saying not one reference
    // was derived, while every commit referenced something — and a job that goes red when
    // nothing is wrong teaches people to merge past it.
    expect(source).toContain("if not refs and not tracking and not elsewhere:");
  });
});

describe("promotion_refs.py — the landing#493 guards can fail", () => {
  const mutate = (from: string, to: string) => {
    expect(source.includes(from), `mutation anchor absent: ${from}`).toBe(true);
    return source.replace(from, to);
  };

  it("control: dropping the keyword requirement from CROSS_REPO is caught", () => {
    // The over-broad pattern core measured. It must harvest a bare mention, which is the
    // property the shipped assertions forbid.
    const loose = /([A-Za-z][\w.-]*)#(\d+)\b/gi;
    expect([..."[QA] Same family as core#992".matchAll(loose)].length).toBe(1);
    // ...and the shipped one must not.
    expect([..."[QA] Same family as core#992".matchAll(new RegExp(py("CROSS_REPO"), "gi"))]
      .length).toBe(0);
  });

  it("control: dropping the does-not-resolve reason is caught", () => {
    const broken = mutate(
      'unresolved[num] = ("does not resolve in this repository", via)',
      'unresolved[num] = ("missing", via)',
    );
    expect(broken).not.toContain(
      'unresolved[num] = ("does not resolve in this repository", via)',
    );
  });

  it("control: collapsing the 404 distinction is caught", () => {
    const broken = mutate('"not found" in stderr or "http 404" in stderr', "True");
    expect(broken).not.toContain('"not found" in stderr or "http 404" in stderr');
  });

  it("control: computing `unaccounted` after resolution is detectable by order", () => {
    // Positional, not a substring: moving the snapshot to after the lookup would let a
    // later discard drop the commit from Coverage while the section still names it.
    const a = source.indexOf("unaccounted = [s for s in shas");
    const b = source.indexOf("def _unresolvable(");
    expect(a, "unaccounted snapshot moved").toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
  });
});

describe("promotion_refs.py — it can report failure (landing#455)", () => {
  it("refuses to exit 0 on an empty derivation over a real promotion", () => {
    // Reporting success on every run WAS the defect. Proven by execution, not only here:
    // run against three real reference-free commits with the source-PR lookup unreachable,
    // the script prints ::error:: and exits 1.
    // ⚠️ `and not elsewhere` was added in landing#493 — a batch whose commits all carry
    // `refs core#1040` references something, so firing here would be a FALSE red. These
    // two assertions pinned the pre-#493 condition verbatim and went red on the correct
    // change, which is the guard working: the same shape as the deploy step that asserted
    // the Google Ads tag was PRESENT (landing#481), where a correct removal would have
    // failed every deploy. Updated deliberately, not widened.
    expect(source).toContain("if not refs and not tracking and not elsewhere:");
    expect(source).toMatch(/if len\(commits\) >= 3:/);
    expect(source).toContain("::error::");
    const at = source.indexOf(EMPTY_DERIVATION_GUARD);
    // 🚨 Assert the anchor was FOUND. Without this, `indexOf` returning -1 makes
    // `slice(-1, …)` an empty string and every assertion below it fails for a reason that
    // reads like the script losing the feature — or, with a `not.toMatch`, passes on
    // nothing at all. Two tests here already drifted that way.
    expect(at, "the empty-derivation guard moved — re-derive this anchor").toBeGreaterThan(-1);
    expect(source.slice(at, at + 1400)).toMatch(/return 1/);
  });

  it("keeps the threshold conservative — a 1- or 2-commit hotfix must not go red", () => {
    const at = source.indexOf(EMPTY_DERIVATION_GUARD);
    expect(at, "the empty-derivation guard moved — re-derive this anchor").toBeGreaterThan(-1);
    expect(source.slice(at, at + 1600)).toMatch(/return 0/);
  });

  it("decodes subprocess output as UTF-8", () => {
    // Without it `text=True` uses the platform locale codec; on a Windows dev box that is
    // cp1251 and every em dash in an issue title comes back as mojibake. It is correct on
    // the ubuntu runner, so the defect is invisible in CI and shows up only in the local
    // rehearsal path — the one place someone checks the block before promoting.
    expect(source).toMatch(/subprocess\.run\([^)]*encoding="utf-8"/s);
  });

  it("offers a rehearsal path that writes nothing", () => {
    expect(source).toMatch(/DRY_RUN/);
    const at = source.indexOf('os.environ.get("DRY_RUN"');
    const block = source.slice(at, at + 400);
    expect(block).toContain("return 0");
    // It must return BEFORE the body is written, or a rehearsal mutates the PR.
    expect(at).toBeLessThan(source.indexOf('run("gh", "pr", "edit"'));
  });
});

describe("promotion_refs.py — the tracking guard can fail", () => {
  function mutate(find: string, replace: string): string {
    const eol = source.includes("\r\n") ? "\r\n" : "\n";
    const anchor = find.replace(/\n/g, eol);
    expect(source.split(anchor).length - 1, `anchor did not match once: ${find}`).toBe(1);
    return source.replace(anchor, replace.replace(/\n/g, eol));
  }

  it("control: adding `see` to TRACKING is caught", () => {
    const broken = mutate(
      'r"\\b(?:refs?|part\\s+of|towards?|addresses|implements)\\s*:?\\s+#(\\d+)\\b"',
      'r"\\b(?:refs?|see|part\\s+of|towards?|addresses|implements)\\s*:?\\s+#(\\d+)\\b"',
    );
    const re = new RegExp(py("TRACKING", broken), "gi");
    expect([...("[Infra] Something, see #602".matchAll(re))].length).toBe(1);
  });

  it("control: a candidate line that carries a closing keyword is caught", () => {
    const broken = mutate(
      'candidate_lines.append(f"- #{num} — {title} · via {via}")',
      'candidate_lines.append(f"- Closes #{num} — {title} · via {via}")',
    );
    const at = broken.indexOf("candidate_lines.append(");
    const line = broken.slice(at, broken.indexOf("\n", at));
    expect(line).toMatch(/close/i);
  });

  it("control: removing the empty-derivation failure is caught", () => {
    const broken = mutate("        if len(commits) >= 3:", "        if False:");
    expect(broken).not.toMatch(/if len\(commits\) >= 3:/);
  });
});

describe("promotion_refs.py — an unresolvable number is named and closes nothing", () => {
  // Executes the script. The source assertions above pinned the opposite property
  // (un-account the commit), and a substring check cannot show that a rendered line
  // names the number without a closing keyword while Coverage still counts it.
  function rehearse(message: string): string {
    const root = mkdtempSync(join(tmpdir(), "landing-promo-"));
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(
      join(bin, "gh-fake.mjs"),
      [
        'const args = process.argv.slice(2).join(" ");',
        'if (/\\/issues\\/\\d+/.test(args)) {',
        '  process.stderr.write("gh: Not Found (HTTP 404)\\n");',
        "  process.exit(1);",
        "}",
        'process.stdout.write("[]\\n");',
        "",
      ].join("\n"),
    );
    if (process.platform === "win32") {
      // CreateProcess looks up `gh.exe` and skips a `gh.cmd`. A .cmd on PATH is
      // invisible to the script, which calls `gh` the same way CI does.
      const shim = join(bin, "ghshim.cs");
      writeFileSync(
        shim,
        [
          "using System;",
          "using System.Collections.Generic;",
          "using System.Diagnostics;",
          "using System.IO;",
          "class G {",
          "  static int Main(string[] args) {",
          "    string dir = AppDomain.CurrentDomain.BaseDirectory;",
          "    var psi = new ProcessStartInfo();",
          "    psi.FileName = \"node\";",
          "    psi.UseShellExecute = false;",
          "    var quoted = new List<string>();",
          "    quoted.Add(\"\\\"\" + Path.Combine(dir, \"gh-fake.mjs\") + \"\\\"\");",
          "    foreach (string a in args) quoted.Add(\"\\\"\" + a + \"\\\"\");",
          "    psi.Arguments = string.Join(\" \", quoted.ToArray());",
          "    var p = Process.Start(psi);",
          "    p.WaitForExit();",
          "    return p.ExitCode;",
          "  }",
          "}",
          "",
        ].join("\r\n"),
      );
      const csc = join(
        process.env.WINDIR ?? "C:\\Windows",
        "Microsoft.NET",
        "Framework64",
        "v4.0.30319",
        "csc.exe",
      );
      const compiled = spawnSync(csc, ["/nologo", `/out:${join(bin, "gh.exe")}`, shim], {
        encoding: "utf8",
      });
      if (compiled.status !== 0) {
        throw new Error(`csc failed\n${compiled.stdout}\n${compiled.stderr}`);
      }
    } else {
      const sh = join(bin, "gh");
      writeFileSync(sh, '#!/bin/sh\nexec node "$(dirname "$0")/gh-fake.mjs" "$@"\n');
      chmodSync(sh, 0o755);
    }
    // pre-push exports GIT_DIR (and the index). Inherited, `git commit` and
    // `git config` land on the repository being pushed: the rehearsal's empty
    // commits ship, and user.email is rewritten to the fixture address.
    const isolated = (): NodeJS.ProcessEnv => {
      const env: NodeJS.ProcessEnv = { ...process.env };
      for (const key of Object.keys(env)) {
        if (
          key.toLowerCase() === "path" ||
          key === "GIT_DIR" ||
          key === "GIT_WORK_TREE" ||
          key === "GIT_INDEX_FILE" ||
          key === "GIT_COMMON_DIR" ||
          key === "GIT_OBJECT_DIRECTORY" ||
          key === "GIT_PREFIX" ||
          key === "GIT_NAMESPACE" ||
          key === "GIT_IMPLICIT_WORK_TREE" ||
          key === "GIT_ALTERNATE_OBJECT_DIRECTORIES" ||
          key.startsWith("GIT_CONFIG_")
        ) {
          delete env[key];
        }
      }
      env.PATH = `${bin}${delimiter}${process.env.PATH ?? process.env.Path ?? ""}`;
      return env;
    };
    const git = (args: string[]) => {
      const result = spawnSync("git", args, {
        cwd: root,
        encoding: "utf8",
        env: isolated(),
      });
      if (result.status !== 0) {
        throw new Error(`git ${args.join(" ")} failed\n${result.stderr}`);
      }
    };
    git(["init", "-b", "main"]);
    git(["config", "user.email", "infra@example.com"]);
    git(["config", "user.name", "Infra"]);
    git(["commit", "--allow-empty", "-m", "base"]);
    const base = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      env: isolated(),
    });
    git(["commit", "--allow-empty", "-m", message]);
    const head = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      env: isolated(),
    });
    const py = process.platform === "win32" ? "python" : "python3";
    // A plain `{...process.env, PATH}` keeps Windows' original `Path` key. The
    // child then resolves `gh` from that one and the fixture never runs.
    const env = isolated();
    env.REPO = "datanika-io/datanika-landing";
    env.PR_NUMBER = "0";
    env.BASE_SHA = (base.stdout ?? "").trim();
    env.HEAD_SHA = (head.stdout ?? "").trim();
    env.DRY_RUN = "1";
    const result = spawnSync(py, [SCRIPT], {
      cwd: root,
      encoding: "utf8",
      env,
    });
    rmSync(root, { recursive: true, force: true });
    return `${result.stdout ?? ""}\n${result.stderr ?? ""}\nexit ${result.status}`;
  }

  it("names an unresolvable number and closes nothing", () => {
    const caller = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
    const out = rehearse("[Product] Spec: the sub-processor register (refs #676)");
    const callerAfter = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
    // The rehearsal must not move this checkout. Under pre-push, GIT_DIR points here.
    expect(callerAfter.stdout).toBe(caller.stdout);
    const line = out.split(/\r?\n/).find((item) => item.startsWith("- `#676`"));
    expect(line, out).toBeDefined();
    expect(line).toContain("does not resolve in this repository");
    expect(line).not.toMatch(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#\d+/i);
    expect(out).toContain("Referenced a number that does not resolve — closing nothing");
    expect(out).toMatch(/Coverage: \*\*1 of 1\*\*/);
    expect(out).toContain("did not resolve to an issue here and close nothing");
    expect(out).toContain("exit 0");
    // The Windows fixture compiles a gh.exe. Under a full vitest run that compile
    // shares the machine with the rest of the suite and exceeds the 5s default.
  }, 30_000);
});
