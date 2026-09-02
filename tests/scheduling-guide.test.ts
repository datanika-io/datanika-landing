import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("scheduling guide", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("docs/scheduling-guide/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("Scheduling Guide");
  });

  it("covers cron expressions", () => {
    expect(html).toContain("Cron");
  });

  it("covers dependencies", () => {
    expect(html).toContain("Dependencies");
  });

  it("covers DAG", () => {
    expect(html).toContain("DAG");
  });

  it("has cron examples", () => {
    expect(html).toContain("0 6 * * *");
  });

  it("mentions plan limits", () => {
    expect(html).toContain("Unlimited");
  });

  /**
   * core#780 made `plans.max_parallel_runs` live, and the page now states the
   * one value in that column that is real.
   *
   * 🚨 **Do not add Pro or Enterprise concurrency numbers here from the
   * migration.** Measured on the serving box 2026-09-02: the column is
   * `integer NOT NULL DEFAULT 5`, and four of five rows hold exactly 5 —
   * `pro-monthly`, `enterprise-monthly`, `pro-annual`, `enterprise-annual`.
   * The migration's `UPDATE` matched zero rows on the from-scratch rebuild, so
   * Enterprise is sold 20 and served 5. `free = 2` is the only value
   * distinguishable from the default, which is why it is the only one
   * published. `docs/GROWTH_RULES.md`: a number in a migration is not a number
   * in a table.
   *
   * When Engineering backfills the rows (landing#443), re-measure and then
   * publish — not the other way round.
   */
  it("publishes the Free concurrency ceiling and no per-tier figure we cannot serve", () => {
    expect(html).toContain("2 concurrent runs");
    // A run over the ceiling queues; it is not lost. That is the half a reader
    // needs, and the half that stops "my pipeline did not start" tickets.
    expect(html).toMatch(/waits and starts automatically/);
    const forbidden = [
      /20 concurrent/i,
      /Enterprise[^<]{0,60}concurrent/i,
      /5 concurrent runs/i,
    ];
    for (const re of forbidden) {
      expect(
        re.test(html),
        `The guide publishes a per-tier concurrency figure (${re}). Only Free's ceiling is ` +
          "distinguishable from the server default in the plans table — see the note above.",
      ).toBe(false);
    }
  });
});
