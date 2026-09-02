import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `.github/scripts/reconcile_shipped_issues.py` is a port of core's reconciler (core#773).
 * It is Python in a Node repo, so `npm test` never executes it — the same standing hole
 * `promotion-refs-guard.test.ts` documents, and this file follows that precedent.
 *
 * ## What is being defended
 *
 * Not the logic — that has behavioural tests in core
 * (`tests/test_deploy/test_reconcile_shipped_issues.py`, 24 of them). What is defended here
 * is **the port**, because landing#315 is the recorded instance of a fix living in core
 * alone while this repo ran the buggy version for all seven of its generated promotion
 * blocks. Three values change on the way across and every one of them is silent when wrong:
 *
 * | | core | landing |
 * |---|---|---|
 * | `PROD_REF` default | `master` | `main` |
 * | `FOREIGN` strips | `landing`, `cloud` | `core`, `cloud` — **inverted, not extended** |
 * | local prefix | `core#N` | `landing#N` |
 *
 * The second row is the dangerous one. Core's line strips `landing#N`; carried across
 * verbatim it would blank **this repo's own references** and keep core's, so the reconciler
 * would label landing issues from core's numbering and miss every real one. Nothing about
 * that fails loudly: the script would scan its commits, extract references, find open
 * issues, pass all three anti-vacuity guards, and label the wrong set.
 *
 * ## Why these are not only text assertions
 *
 * `promotion-refs-guard.test.ts` states its own limit — *"they cannot catch a subtly wrong
 * port, only a missing or mis-ported guard."* A subtly wrong port is exactly the risk in
 * the `FOREIGN` row, so the three reference patterns are **extracted from the Python source
 * and executed** below against real commit subjects from this repo. That is a behavioural
 * test of the ported vocabulary, not a search for a substring. Their syntax is a common
 * subset of Python's `re` and JS `RegExp`; the extraction asserts it found each one.
 */

const SCRIPT = resolve(__dirname, "..", ".github", "scripts", "reconcile_shipped_issues.py");
const source = readFileSync(SCRIPT, "utf8");

const WORKFLOW = resolve(__dirname, "..", ".github", "workflows", "post-promotion-reconcile.yml");
const workflow = readFileSync(WORKFLOW, "utf8");

/**
 * Pull a `NAME = re.compile(r"…")` pattern literal out of the Python source.
 *
 * ⚠️ The single-line branch is not tidiness. The first version of this extractor always
 * scanned forward to the next `\n)`, which for a one-line `re.compile(...)` is the closing
 * paren of the NEXT pattern several lines down — so `SUBJECT_REF` came back as its own
 * literal concatenated with both of `BODY_REF`'s. Three vocabulary tests went red on a
 * defect that was entirely in the instrument.
 *
 * 🔑 And the anti-vacuity check below did NOT catch it: `pattern("SUBJECT_REF").length > 5`
 * was comfortably satisfied by the corrupted, longer string. A length floor proves a
 * pattern is non-empty, never that it is the right one.
 */
function pattern(name: string): string {
  const at = source.indexOf(`${name} = re.compile(`);
  expect(at, `${name} not found — the extractor is broken, not the script`).toBeGreaterThan(-1);
  const rest = source.slice(at);
  const firstLine = rest.slice(0, rest.indexOf("\n"));
  const scope = firstLine.includes(")") ? firstLine : rest.slice(0, rest.indexOf("\n)"));
  const parts = [...scope.matchAll(/r"((?:[^"\\]|\\.)*)"/g)];
  expect(parts.length, `no r"…" literal after ${name}`).toBeGreaterThan(0);
  return parts.map((m) => m[1]).join("");
}

const foreign = new RegExp(pattern("FOREIGN"), "gi");
const subjectRef = new RegExp(pattern("SUBJECT_REF"), "g");
const bodyRef = new RegExp(pattern("BODY_REF"), "gi");

/** What the script does: blank foreign refs, then read what is left. */
function localRefs(subject: string, body = ""): number[] {
  const strip = (t: string) => t.replace(new RegExp(foreign.source, "gi"), " ");
  const found = new Set<number>();
  for (const m of strip(subject).matchAll(new RegExp(subjectRef.source, "g"))) {
    found.add(Number(m[1]));
  }
  for (const m of strip(body).matchAll(new RegExp(bodyRef.source, "gi"))) {
    found.add(Number(m[1]));
  }
  return [...found].sort((a, b) => a - b);
}

describe("reconcile_shipped_issues.py — the port's repository vocabulary", () => {
  it("extracts three non-trivial patterns (anti-vacuity)", () => {
    // Every behavioural assertion below runs on these. An extractor that silently
    // returned "" would build a RegExp matching everything and pass all of them.
    expect(pattern("FOREIGN").length).toBeGreaterThan(20);
    expect(pattern("SUBJECT_REF").length).toBeGreaterThan(5);
    expect(pattern("BODY_REF").length).toBeGreaterThan(30);
  });

  it("treats a bare landing reference as local", () => {
    // A real subject from this repo's own history.
    expect(localRefs("[Growth] Remove the per-seat price entirely (refs #396)")).toEqual([396]);
  });

  it("treats `landing#N` as local — core's line would strip it", () => {
    expect(localRefs("[Infra] Something (refs landing#453)")).toEqual([453]);
  });

  it("treats `core#N` and `cloud#N` as foreign", () => {
    expect(localRefs("[Product] Mount source data into the worker (refs core#793)")).toEqual([]);
    expect(localRefs("[Infra] Billing state (refs cloud#117)")).toEqual([]);
    expect(localRefs("[Infra] X (refs datanika-io/datanika-core#832)")).toEqual([]);
  });

  it("keeps the local reference when a foreign one sits beside it", () => {
    // The mixed case is the one a one-sided regex gets exactly backwards.
    expect(localRefs("[Product] Volume mounts (closes #459, refs core#793)")).toEqual([459]);
  });

  it("reads keyword-qualified references out of the body, and passing mentions out of it", () => {
    expect(localRefs("[Infra] Title", "refs #401\nsame family as #999")).toEqual([401]);
  });
});

describe("reconcile_shipped_issues.py — the values that are silent when mis-ported", () => {
  it("defaults PROD_REF to `main`, not core's `master`", () => {
    expect(source).toMatch(/os\.environ\.get\(\s*["']PROD_REF["'],\s*["']main["']\s*\)/);
    expect(source).not.toMatch(/os\.environ\.get\(\s*["']PROD_REF["'],\s*["']master["']\s*\)/);
  });

  it("keeps both promotion base branches in the PR lookup", () => {
    // This one is genuinely shared: `promotion_pr` accepts master or main so the file
    // stays diffable against core's. Narrowing it to `main` alone would be harmless here
    // and would make the next port back to core wrong.
    expect(source).toMatch(/base in \("master", "main"\)/);
  });
});

describe("reconcile_shipped_issues.py — the guards that must survive the port", () => {
  it("treats an empty scan, an empty parse and an empty issue list as failures", () => {
    // These three are the reason the workflow's `success` means anything at all. A
    // reconciler that reports success while it scanned nothing is the defect core#773
    // was filed about, wearing the fix's clothes.
    expect(source).toContain("FAIL: scanned 0 commits");
    expect(source).toContain("the parser is broken");
    expect(source).toContain("the API returned 0 open issues");
    expect([...source.matchAll(/^        return 1$/gm)].length).toBeGreaterThanOrEqual(3);
  });

  it("fails closed when the label cannot be created", () => {
    // The first live run on core hit HTTP 422 (label description over 100 chars), every
    // `gh issue edit` then failed with "not found", and the script still exited 0 and
    // commented claiming the issues were labelled.
    expect(source).toContain("if not ensure_label(repo):");
    expect(source).toMatch(/LABEL_DESC_MAX = 100/);
  });

  it("keeps the label description inside GitHub's 100-character limit", () => {
    const at = source.indexOf("LABEL_DESC = (");
    expect(at).toBeGreaterThan(-1);
    const literal = source.slice(at, source.indexOf("\n)", at));
    const text = [...literal.matchAll(/"([^"]*)"/g)].map((m) => m[1]).join("");
    expect(text.length).toBeGreaterThan(20);
    expect(text.length).toBeLessThanOrEqual(100);
  });

  it("never closes an issue", () => {
    // The whole design: `refs` exists for partial work, so closure is a judgement its
    // owner makes. WORKFLOW_RULES §4's landing#273 incident is what this protects.
    expect(source).not.toMatch(/gh["'],\s*["']issue["'],\s*["']close["']/);
    expect(source).not.toContain('"--state", "closed"');
  });
});

describe("post-promotion-reconcile.yml — the trigger", () => {
  it("watches this repo's CD workflow by its exact name", () => {
    expect(workflow).toContain('workflows: ["Deploy Landing"]');
    expect(workflow).not.toContain("Deploy to pointer.gr");
  });

  it("gates on main, checks out main, and passes PROD_REF: main", () => {
    expect(workflow).toMatch(/head_branch == 'main'/);
    expect(workflow).toMatch(/ref: main/);
    expect(workflow).toMatch(/PROD_REF: main/);
    // Ban the three SETTINGS, not the word. A blanket `/\bmaster\b/` also forbids the
    // comment explaining why this file says `main` — punishing the documentation of the
    // very hazard being guarded, which is how a guard teaches people to delete comments.
    expect(workflow).not.toMatch(/^\s*ref:\s*master\s*$/m);
    expect(workflow).not.toMatch(/^\s*PROD_REF:\s*master\s*$/m);
    expect(workflow).not.toMatch(/head_branch == 'master'/);
  });

  it("checks out full history — a shallow scan under-reports", () => {
    expect(workflow).toMatch(/fetch-depth: 0/);
  });

  it("queues rather than cancelling, because labelling is a mutation", () => {
    expect(workflow).toMatch(/cancel-in-progress: false/);
  });

  it("only acts on a successful deploy", () => {
    expect(workflow).toMatch(/workflow_run\.conclusion == 'success'/);
  });
});

/**
 * Negative controls — mutating the REAL script and workflow text in memory. A fixture
 * written from the same mental model as the check agrees with the check including where
 * the check is wrong.
 */
describe("reconcile-shipped guard — it can fail", () => {
  function mutate(src: string, find: string, replace: string): string {
    const eol = src.includes("\r\n") ? "\r\n" : "\n";
    const anchor = find.replace(/\n/g, eol);
    expect(src.split(anchor).length - 1, `anchor did not match exactly once: ${find}`).toBe(1);
    return src.replace(anchor, replace.replace(/\n/g, eol));
  }

  /** Re-run the reference extraction against a mutated copy of the script. */
  function refsUnder(mutated: string, subject: string): number[] {
    const grab = (name: string) => {
      const at = mutated.indexOf(`${name} = re.compile(`);
      const rest = mutated.slice(at);
      const firstLine = rest.slice(0, rest.indexOf("\n"));
      const scope = firstLine.includes(")") ? firstLine : rest.slice(0, rest.indexOf("\n)"));
      return [...scope.matchAll(/r"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("");
    };
    const stripped = subject.replace(new RegExp(grab("FOREIGN"), "gi"), " ");
    return [...stripped.matchAll(new RegExp(grab("SUBJECT_REF"), "g"))]
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);
  }

  it("control A: core's FOREIGN line carried across verbatim is caught", () => {
    // The exact copy-paste this port exists to prevent: it strips `landing#N` and keeps
    // `core#N`, so both of the vocabulary tests above invert.
    const broken = mutate(
      source,
      'r"(?:[\\w.-]+/[\\w.-]+#\\d+)|(?:\\b(?:datanika-)?(?:core|cloud)\\s*#\\d+)"',
      'r"(?:[\\w.-]+/[\\w.-]+#\\d+)|(?:\\b(?:datanika-)?(?:landing|cloud)\\s*#\\d+)"',
    );
    expect(refsUnder(broken, "[Infra] Something (refs landing#453)")).toEqual([]);
    expect(refsUnder(broken, "[Product] Mount (refs core#793)")).toEqual([793]);
  });

  it("control B: core's `core#N` local prefix carried across is caught", () => {
    const broken = mutate(source, 'SUBJECT_REF = re.compile(r"(?:landing)?#(\\d+)")', 'SUBJECT_REF = re.compile(r"(?:core)?#(\\d+)")');
    expect(broken).toContain('r"(?:core)?#(\\d+)"');
    expect(broken).not.toContain('r"(?:landing)?#(\\d+)"');
  });

  it("control C: PROD_REF left on core's `master` is caught", () => {
    const broken = mutate(source, 'os.environ.get("PROD_REF", "main")', 'os.environ.get("PROD_REF", "master")');
    expect(broken).toMatch(/os\.environ\.get\(\s*["']PROD_REF["'],\s*["']master["']\s*\)/);
    expect(broken).not.toMatch(/os\.environ\.get\(\s*["']PROD_REF["'],\s*["']main["']\s*\)/);
  });

  it("control D: an anti-vacuity guard removed is caught", () => {
    const broken = mutate(
      source,
      '        print("FAIL: scanned 0 commits — is the checkout shallow? (needs fetch-depth: 0)")',
      '        print("scanned nothing, carrying on")',
    );
    expect(broken).not.toContain("FAIL: scanned 0 commits");
  });

  it("control E: the workflow left pointing at core's CD is caught", () => {
    const broken = mutate(workflow, 'workflows: ["Deploy Landing"]', 'workflows: ["Deploy to pointer.gr (prod)"]');
    expect(broken).not.toContain('workflows: ["Deploy Landing"]');
    expect(broken).toContain("Deploy to pointer.gr");
  });

  it("control F: the workflow left checking out master is caught", () => {
    const broken = mutate(workflow, "          ref: main\n", "          ref: master\n");
    // The specific setting, for the same reason the positive test bans settings and not
    // the word: a `/\bmaster\b/` here would pass against the UNMUTATED file, because the
    // comment above `ref:` mentions master. A control that cannot fail is not a control.
    expect(broken).toMatch(/^\s*ref:\s*master\s*$/m);
    expect(workflow).not.toMatch(/^\s*ref:\s*master\s*$/m);
  });
});
