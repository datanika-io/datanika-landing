import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * landing#695. The product dropdown is the rx.select bound to
 * form_materialization. The Materialization enum still lists snapshot, and
 * the transformation guide still contains the word. Neither is the dropdown.
 *
 * The list below is the reading of core master e1aaf017 (the SHA production
 * runs) and of core dev at the same select. The cron reads master itself.
 * This constant is what lets the two failure directions run without a
 * network call. A checker that cannot pass on this list is not evidence
 * that it fails for the reason the case names.
 */

const ROOT = resolve(__dirname, "..");
const SCRIPT = resolve(ROOT, "scripts", "check-materialization-dropdown.py");
const PAGE = resolve(ROOT, "src/pages/docs/transformations.astro");
const GUIDE = resolve(ROOT, "src/pages/docs/transformations-guide.astro");
const WORKFLOW = resolve(ROOT, ".github/workflows/materialization-dropdown-parity.yml");

const CORE = `rx.select(
    ["append", "delete+insert", "merge"],
    placeholder="strategy",
    value=TransformationState.form_strategy,
)
rx.select(
    ["ignore", "fail", "append_new_columns", "sync_all_columns"],
    value=TransformationState.form_on_schema_change,
)
rx.select(
    ["view", "table", "incremental", "ephemeral"],
    value=TransformationState.form_materialization,
)
`;

const EPHEMERAL_ROW =
  "<tr><td><code>ephemeral</code></td><td>Inlined as CTE, not materialized</td><td>Intermediate logic, no direct querying</td></tr>";
const CHOOSE =
  "<code>view</code>, <code>table</code>, <code>incremental</code>, or <code>ephemeral</code>";

function run(core: string, tables: string[], choices: string[]): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "mat-"));
  const corePath = join(dir, "transformations.py");
  writeFileSync(corePath, core, "utf-8");
  const args = [SCRIPT, "--core", corePath];
  for (const table of tables) args.push("--table", table);
  for (const choice of choices) args.push("--choice", choice);
  try {
    const result = spawnSync("python", args, { encoding: "utf-8" });
    return {
      code: result.status ?? -1,
      out: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? String(result.error) : ""}`,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function copyPage(mutate: (source: string) => string): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "matdoc-"));
  const path = join(dir, "transformations.astro");
  const source = readFileSync(PAGE, "utf-8");
  const next = mutate(source);
  if (next === source) throw new Error("the mutation did not change the page");
  writeFileSync(path, next, "utf-8");
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("materialization dropdown parity (landing#695)", () => {
  it("passes when the docs name the options the dropdown offers", () => {
    const got = run(CORE, [PAGE, GUIDE], [PAGE]);
    const lines = got.out.split(/\r?\n/);
    expect(lines, got.out).toContain("dropdown: ephemeral incremental table view");
    expect(lines, got.out).toContain(`table ${PAGE}: ephemeral incremental table view`);
    expect(lines, got.out).toContain(`table ${GUIDE}: ephemeral incremental table view`);
    expect(lines, got.out).toContain(`choice ${PAGE}: ephemeral incremental table view`);
    expect(got.out).not.toMatch(/^dropdown:.*\bappend\b/m);
    expect(got.out).not.toMatch(/^dropdown:.*\bsnapshot\b/m);
    expect(lines, got.out).toContain("OK");
    expect(got.code, got.out).toBe(0);
  });

  it("fails when the docs name an option the dropdown does not offer", () => {
    const doc = copyPage((source) =>
      source.replace(
        EPHEMERAL_ROW,
        `${EPHEMERAL_ROW}\n      <tr><td><code>snapshot</code></td><td>Tracks history</td><td>Slow change</td></tr>`,
      ),
    );
    try {
      const got = run(CORE, [doc.path, GUIDE], [PAGE]);
      expect(got.out).toContain(`table ${doc.path} names snapshot and the dropdown does not offer it`);
      expect(got.out).not.toContain(`choice ${PAGE} names`);
      expect(got.code, got.out).toBe(1);
    } finally {
      doc.cleanup();
    }
  });

  it("fails when the dropdown offers an option the docs omit", () => {
    const core = CORE.replace(
      '["view", "table", "incremental", "ephemeral"]',
      '["view", "table", "incremental", "ephemeral", "snapshot"]',
    );
    const got = run(core, [PAGE, GUIDE], [PAGE]);
    expect(got.out).toContain(`table ${PAGE} omits snapshot and the dropdown offers it`);
    expect(got.out).toContain(`table ${GUIDE} omits snapshot and the dropdown offers it`);
    expect(got.out).toContain(`choice ${PAGE} omits snapshot and the dropdown offers it`);
    expect(got.code, got.out).toBe(1);
  });

  it("fails when the choose sentence drops an option the table still names", () => {
    const doc = copyPage((source) =>
      source.replace(CHOOSE, "<code>view</code>, <code>table</code>, or <code>incremental</code>"),
    );
    try {
      const got = run(CORE, [PAGE, GUIDE], [doc.path]);
      expect(got.out).toContain(`choice ${doc.path} omits ephemeral and the dropdown offers it`);
      expect(got.out).not.toContain(`table ${PAGE} omits`);
      expect(got.code, got.out).toBe(1);
    } finally {
      doc.cleanup();
    }
  });

  it("refuses a page whose only evidence is the word Snapshot", () => {
    const dir = mkdtempSync(join(tmpdir(), "matword-"));
    const path = join(dir, "word.astro");
    writeFileSync(path, "<p>Snapshot</p>\n", "utf-8");
    try {
      const got = run(CORE, [path], [PAGE]);
      expect(got.out).toContain(`could not find the Materializations table in ${path}`);
      expect(got.code, got.out).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses when no select is bound to the materialization field", () => {
    const core = CORE.replace("form_materialization", "form_something_else");
    const got = run(core, [PAGE], [PAGE]);
    expect(got.out).toContain("could not find the materialization dropdown");
    expect(got.out).toContain("0 rx.select lists bound to form_materialization");
    expect(got.code, got.out).toBe(1);
  });
});

describe("materialization dropdown cron", () => {
  const source = readFileSync(WORKFLOW, "utf-8");
  const lines = source.split(/\r?\n/);

  it("reads the product file on core master and is not a pull-request check", () => {
    expect(source).toContain(
      "datanika/ui/pages/transformations.py?ref=master",
    );
    expect(source).toContain("scripts/check-materialization-dropdown.py");
    expect(source).toContain('--table src/pages/docs/transformations.astro');
    expect(source).toContain('--table src/pages/docs/transformations-guide.astro');
    expect(source).toContain('--choice src/pages/docs/transformations.astro');
    expect(source).toMatch(/cron:\s*"23 7 \* \* \*"/);
    const on = source.split(/^permissions:/m)[0];
    expect(on).not.toMatch(/^\s*pull_request:/m);
  });

  it("exits 0 when the drift is already tracked and 1 after filing", () => {
    const tracked = lines.findIndex((line) => /not filing again/.test(line));
    expect(tracked).toBeGreaterThan(-1);
    const exit = lines.slice(tracked + 1, tracked + 4).find((line) => /^\s*exit\s+\d+\s*$/.test(line));
    expect(exit?.trim()).toBe("exit 0");
    expect(source).toMatch(/gh issue create[\s\S]{0,600}?exit 1/);
  });
});
