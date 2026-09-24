import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("API docs page", () => {
  let html: string;
  beforeAll(() => {
    // Issue #105 — API docs moved from /docs/api to /api/reference. The
    // /docs/api URL still works as a 301 redirect; this test now reads the
    // canonical location to verify content.
    html = readHtml("api/reference/index.html");
  });

  it("has schedules section", () => {
    expect(html).toContain("/api/v1/schedules");
  });

  it("has notification channels section", () => {
    expect(html).toContain("/api/v1/notifications/channels");
  });

  it("mentions Swagger UI", () => {
    expect(html).toContain("Swagger");
  });

  it("documents channel types", () => {
    expect(html).toContain("slack");
    expect(html).toContain("telegram");
    expect(html).toContain("webhook");
  });

  it("documents cron_expression", () => {
    expect(html).toContain("cron_expression");
  });

  it("documents the compile endpoint (#52)", () => {
    expect(html).toContain("/api/v1/transformations/5/compile");
    expect(html).toContain("compiled_sql");
    expect(html).toContain("compilation_error");
  });

  it("documents the preview endpoint (#52)", () => {
    expect(html).toContain("/api/v1/transformations/5/preview");
    expect(html).toContain("row_count");
    expect(html).toContain("truncated");
    expect(html).toContain("missing_destination");
    expect(html).toContain("execution_error");
  });

  it("explains the agent loop", () => {
    expect(html).toContain("agent loop");
  });
});

/**
 * landing#696 — the page published a bulk-import response whose five keys the endpoint has
 * never returned (`connections_imported`, `uploads_imported`, `pipelines_imported`,
 * `transformations_imported`, `skipped`). A client parses this block, so a wrong SHAPE fails at
 * runtime in the caller's code rather than at the point of reading.
 *
 * 🔑 Stated POSITIVELY, per the issue's AC4: these assert that the block CONTAINS what the
 * endpoint returns. An "it must not say `skipped`" assertion on its own is satisfied by deleting
 * the whole block (WORKFLOW_RULES §4's standing trap), so the one negative assertion below is
 * paired with the positives and only runs against a section the extractor has already proved it
 * isolated.
 *
 * The source of truth is `datanika/services/api_v1_routes.py`: `bulk_import` returns
 * `JSONResponse({"created": created}, status_code=201)` and, on validation failure,
 * `JSONResponse({"errors": errors}, status_code=400)`; `_execute_validated_import` seeds all four
 * keys so an unsent section comes back `[]`.
 */
describe("Import endpoint response shape (landing#696)", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("api/reference/index.html");
  });

  /** The Import Configuration section only — assertions on the whole page would pass on
   *  text that lives in an unrelated section.
   *
   *  `&quot;` is decoded because `set:html` renders the code block raw today, so the built page
   *  carries real quote characters. Normalising means this guard does not go red on a correct
   *  page if Astro ever starts escaping (WORKFLOW_RULES §5a: assert the invariant, not today's
   *  rendering). Measured, not assumed — a first draft of these assertions used `&quot;` and
   *  matched nothing. */
  function importSection(): string {
    const start = html.indexOf("Import Configuration");
    if (start < 0) throw new Error("the Import Configuration heading is gone from the page");
    const end = html.indexOf("<h2", start + 1);
    return html.slice(start, end < 0 ? html.length : end).replace(/&quot;/g, '"');
  }

  it("the extractor isolates the import section and nothing else", () => {
    // Anti-vacuity. A slice that is empty passes every `not.toContain` below it, and a slice
    // that is the whole page passes every `toContain`. Both failure modes read as a clean run.
    const section = importSection();
    expect(section).toContain("/api/v1/import");
    expect(section.length).toBeGreaterThan(300);
    expect(section.length).toBeLessThan(html.length / 2);
    // The rate-limit section follows this one, so its presence would mean the slice overran.
    expect(section).not.toContain("X-RateLimit-Limit");
  });

  it("documents the created envelope with all four id arrays", () => {
    const section = importSection();
    expect(section).toContain('"created"');
    for (const key of ["connections", "uploads", "pipelines", "transformations"]) {
      expect(section).toContain(`"${key}"`);
    }
  });

  it("states the 201 and the 400 refusal shape a client must branch on", () => {
    const section = importSection();
    expect(section).toContain("201");
    expect(section).toContain("400");
    expect(section).toContain('"errors"');
    expect(section).toContain("MISSING_FIELD");
  });

  it("says that a refused import creates nothing", () => {
    expect(importSection()).toMatch(/atomic|NOTHING was created/i);
  });

  it("does not resurrect the counts or the skipped key", () => {
    // 🚨 Anchored to the JSON-KEY shape (`"name":`), NOT to the bare word, and that is the whole
    // point. A corrected artifact contains the wrong text in order to explain why it was wrong:
    // the prose above this block says there is no `skipped` key and no `_imported` counts, so a
    // bare `not.toContain("skipped")` fails on the very sentence that fixes the defect
    // (WORKFLOW_RULES §4). Only a response example can match the pattern below.
    //
    // Safe as a negative at all only because the positives above require this same section to
    // exist and to carry the real shape; deleting the block reds those first.
    const section = importSection();
    for (const gone of [
      "connections_imported",
      "uploads_imported",
      "pipelines_imported",
      "transformations_imported",
      "skipped",
    ]) {
      expect(section).not.toMatch(new RegExp(`"${gone}"\\s*:`));
    }
  });

  it("the key-shaped pattern can actually fire", () => {
    // Without this, the assertion above passes against a regex that matches nothing — and a
    // pattern that cannot match is indistinguishable from a page that is clean.
    const preFix = '{\n  "connections_imported": 2,\n  "skipped": 0\n}';
    for (const gone of ["connections_imported", "skipped"]) {
      expect(preFix).toMatch(new RegExp(`"${gone}"\\s*:`));
    }
    // ...and it must NOT fire on the corrective prose, which names the same words.
    const prose = "There are no <em>_imported</em> counts and no <code>skipped</code> key";
    for (const gone of ["connections_imported", "skipped"]) {
      expect(prose).not.toMatch(new RegExp(`"${gone}"\\s*:`));
    }
  });
});
