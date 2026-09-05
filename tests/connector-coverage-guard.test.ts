/**
 * The connector-coverage guard must be able to FAIL.
 *
 * `scripts/check-connector-coverage.py` exists because every connector number
 * this repo keeps is taken over a set that already excludes the thing being
 * looked for -- so `openapi` shipped as a full connector, was absent from
 * `connectors.ts` and from `src/content/connectors/`, and **both** the landing
 * and core counts read 35 and agreed (landing#508).
 *
 * A guard against that class is worthless unless it has been seen red. This
 * file is landing#508 AC3, which is specific about how:
 *
 *   > Prove AC2 red by removing one *existing* guide's entry, not by adding a
 *   > synthetic type. A guard proven only on a fabricated case is the recorded
 *   > failure mode here.
 *
 * So the red case below deletes `stripe` -- a real, shipping, marketed
 * connector -- from a *copy* of this repo's real inputs, and asserts the script
 * names it. Nothing synthetic is introduced on the connector side.
 *
 * The picker file IS written by this test rather than fetched. That is the
 * harness, not the case: CI fetches the real `PICKER_TYPES` from core `master`
 * (see `connector-count-parity.yml`), and a committed copy of it would be a
 * fixture that goes stale silently -- the exact failure mode this repo has paid
 * for twice. What the test owns is the script's logic; what CI owns is the
 * freshness of the input.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync, rmSync } from "fs";
import { resolve, join } from "path";
import { tmpdir } from "os";

const ROOT = resolve(__dirname, "..");
const SCRIPT = resolve(ROOT, "scripts/check-connector-coverage.py");
const REAL_TS = resolve(ROOT, "src/data/connectors.ts");
const REAL_GUIDES = resolve(ROOT, "src/content/connectors");

/**
 * Core's `PICKER_TYPES`, as of `origin/dev` 2026-09-05. Shape-faithful: the
 * withdrawn `s3` is a comment, exactly as in core, because a withdrawn
 * connector is not pickable and must not be reported as a coverage gap.
 */
const PICKER_FILE = `"""Connections page — list + create form with dynamic config fields."""

PICKER_TYPES: list[str] = [
    # Databases
    "postgres",
    "mysql",
    "mssql",
    "oracle",
    "sqlite",
    "redshift",
    "synapse",
    "clickhouse",
    "duckdb",
    "mongodb",
    # Cloud warehouses
    "bigquery",
    "snowflake",
    "databricks",
    # File / blob
    # \`s3\` withdrawn — core#863; see WITHDRAWN_SOURCE_TYPES.
    "csv",
    "json",
    "parquet",
    # Generic APIs
    "rest_api",
    "openapi",
    "google_sheets",
    # SaaS / CRM
    "stripe",
    "salesforce",
    "hubspot",
    "shopify",
    "zendesk",
    "airtable",
    "notion",
    "pipedrive",
    "freshdesk",
    "asana",
    # Dev tools
    "github",
    "jira",
    "slack",
    # Analytics / ads
    "google_analytics",
    "google_ads",
    "facebook_ads",
    # Messaging
    "kafka",
]
`;

type Run = { code: number; out: string };

function runScript(pickerPath: string, tsPath: string, guidesDir: string): Run {
  try {
    const out = execFileSync(
      "python",
      [SCRIPT, "--picker", pickerPath, "--connectors", tsPath, "--guides", guidesDir],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { code: 0, out };
  } catch (e: any) {
    return { code: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** A temp copy of this repo's REAL connectors.ts + guide directory. */
function stageRealInputs(): { dir: string; picker: string; ts: string; guides: string } {
  const dir = mkdtempSync(join(tmpdir(), "conn-coverage-"));
  const picker = join(dir, "connections.py");
  const ts = join(dir, "connectors.ts");
  const guides = join(dir, "guides");
  writeFileSync(picker, PICKER_FILE, "utf-8");
  copyFileSync(REAL_TS, ts);
  mkdirSync(guides);
  for (const f of readdirSync(REAL_GUIDES)) {
    if (f.endsWith(".md")) copyFileSync(join(REAL_GUIDES, f), join(guides, f));
  }
  return { dir, picker, ts, guides };
}

/** Remove a connector's `connectors.ts` entry by slug, returning the new source. */
function dropEntry(tsSource: string, slug: string): string {
  const start = tsSource.indexOf(`    slug: "${slug}",`);
  if (start < 0) throw new Error(`slug ${slug} not found in connectors.ts`);
  const objStart = tsSource.lastIndexOf("  {", start);
  const objEnd = tsSource.indexOf("\n  },", start);
  if (objStart < 0 || objEnd < 0) throw new Error(`could not bound the ${slug} entry`);
  return tsSource.slice(0, objStart) + tsSource.slice(objEnd + "\n  },".length + 1);
}

describe("check-connector-coverage.py", () => {
  it("passes against the repo as it stands", () => {
    const s = stageRealInputs();
    try {
      const r = runScript(s.picker, s.ts, s.guides);
      expect(r.out).toContain("picker types:");
      expect(r.code, r.out).toBe(0);
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });

  // AC3. The connector removed is real and shipping; only the copy is synthetic.
  it("goes RED when an existing connector loses both its guide and its entry", () => {
    const s = stageRealInputs();
    try {
      rmSync(join(s.guides, "stripe.md"));
      writeFileSync(s.ts, dropEntry(readFileSync(s.ts, "utf-8"), "stripe"), "utf-8");

      const r = runScript(s.picker, s.ts, s.guides);
      expect(r.code, `script should have failed. Output:\n${r.out}`).toBe(1);
      expect(r.out).toContain("FAIL");
      expect(r.out).toContain("stripe");
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });

  // Discriminating control: losing only the ENTRY is a NOTE, not a failure.
  // Without this, the test above would also pass if the script failed on any
  // change at all -- which would make it a smoke alarm wired to the light switch.
  it("does NOT fail when a connector keeps its guide but loses its entry", () => {
    const s = stageRealInputs();
    try {
      writeFileSync(s.ts, dropEntry(readFileSync(s.ts, "utf-8"), "stripe"), "utf-8");
      const r = runScript(s.picker, s.ts, s.guides);
      expect(r.code, r.out).toBe(0);
      expect(r.out).toContain("no connectors.ts entry");
      expect(r.out).toContain("stripe");
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });

  // The vacuity guard. A parser that returns nothing reports perfect coverage.
  it("refuses to pass when the picker file shape changes", () => {
    const s = stageRealInputs();
    try {
      writeFileSync(s.picker, "# the declaration was renamed\nTYPES = []\n", "utf-8");
      const r = runScript(s.picker, s.ts, s.guides);
      expect(r.code, r.out).not.toBe(0);
      expect(r.out).toContain("PICKER_TYPES");
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });

  it("refuses to pass when connectors.ts collapses to nothing", () => {
    const s = stageRealInputs();
    try {
      writeFileSync(s.ts, "export const connectors = [];\n", "utf-8");
      const r = runScript(s.picker, s.ts, s.guides);
      expect(r.code, r.out).not.toBe(0);
      expect(r.out).toContain("connectors.ts");
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });

  it("does not report the withdrawn s3 as a coverage gap", () => {
    // s3 is commented out of PICKER_TYPES, so it is not pickable. Reporting it
    // would push someone to write a guide for a connector that cannot be created.
    const s = stageRealInputs();
    try {
      const r = runScript(s.picker, s.ts, s.guides);
      expect(r.out).not.toContain("s3 (expected slug");
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });
});
