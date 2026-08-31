/**
 * Connector capability tiers — landing#427, landing#428, core#825, core#862,
 * core#865.
 *
 * ## 🚨 This file once enforced a false claim. Read that before editing it.
 *
 * The first version asserted *"the guide still says MySQL works as a load
 * destination"*. It was written as an **over-correction guard** — to stop the
 * dbt-adapter removal being flattened into "MySQL is unsupported" — and the
 * capability it protected did not exist. `dlt.destinations` has no `mysql`
 * attribute and never has (core#865), so the guard's effect was to hold a false
 * capability claim in place and fail anyone who removed it.
 *
 * The lesson generalises past this file: **an over-correction guard asserts a
 * positive capability, so it is only as true as the capability. A guard that
 * pins "X still works" needs the same evidence as a page that says it.** Both
 * directions need measuring; measuring only the direction you are worried about
 * is how the other one rots.
 *
 * ## Three tiers, not two
 *
 * | tier | can dlt extract? | can dlt load? | can dbt build? | who |
 * |---|---|---|---|---|
 * | extract-only | yes | **no** | **no** | mysql, sqlite |
 * | load, no transform | — | yes | **no** | databricks, synapse |
 * | full destination | — | yes | yes | `transformationDestinationConnectors` |
 *
 * `direction` in the data file states **what works**, not what the catalogue
 * intends — see the note above `sourceConnectors`.
 *
 * ## What this file can and cannot prove
 *
 * It CANNOT prove a connector works. Those facts live in the core image
 * (`hasattr(dlt.destinations, x)`, `importlib.util.find_spec` for the adapter),
 * and this repo has no view of them. Pretending otherwise is the landing#391
 * failure: a claim bound to landing's own belief becomes a coherent,
 * machine-readable assertion of something untrue, green all the way down.
 *
 * What it does: keep retired claims from creeping back and keep the surfaces
 * agreeing — the `legal-pages-facts.test.ts` pattern. The binding to production
 * is the provenance comment in `src/data/connectors.ts`, which carries the
 * measurement and its date. A human re-measures; this file notices drift.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  connectors,
  destinationConnectors,
  transformationDestinationConnectors,
} from "../src/data/connectors";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf-8");

/** Sources that cannot receive data at all. dlt has no destination. core#865. */
const EXTRACT_ONLY_SLUGS = ["mysql", "sqlite"];
/** Destinations dlt can load into, but dbt cannot build in. core#862. */
const LOAD_NOT_TRANSFORM_SLUGS = ["databricks", "synapse"];
/** Everything dbt cannot build in, whatever the reason. */
const NOT_A_DBT_TARGET = [...EXTRACT_ONLY_SLUGS, ...LOAD_NOT_TRANSFORM_SLUGS];

describe("the three capability tiers are nested and disjoint where they should be", () => {
  it("every dbt target is also a destination", () => {
    const destSlugs = new Set(destinationConnectors.map((c) => c.slug));
    for (const c of transformationDestinationConnectors) {
      expect(destSlugs.has(c.slug), `${c.slug} is a dbt target but not a destination`).toBe(true);
    }
  });

  it("is a STRICT subset — the two sets are not the same thing", () => {
    // If these became equal, the /docs/architecture sentence this work retired
    // ("the dbt transformation layer runs against the same destination") would
    // be true again. Far likelier: someone re-derived the dbt list from
    // `direction`.
    expect(transformationDestinationConnectors.length).toBeLessThan(
      destinationConnectors.length,
    );
  });

  it("an extract-only connector is NOT in the destination set", () => {
    // The half that would have caught core#865 on the landing side. `direction`
    // must state what works: dlt has no mysql/sqlite destination factory.
    const destSlugs = new Set(destinationConnectors.map((c) => c.slug));
    for (const slug of EXTRACT_ONLY_SLUGS) {
      expect(
        destSlugs.has(slug),
        `${slug} is advertised as a destination; dlt has no ${slug} destination (core#865)`,
      ).toBe(false);
    }
  });

  it("an extract-only connector IS still a source — this is not a withdrawal", () => {
    for (const slug of EXTRACT_ONLY_SLUGS) {
      const c = connectors.find((x) => x.slug === slug)!;
      expect(c.direction, `${slug} must remain a source`).toBe("source");
    }
  });

  it("no connector that cannot transform is listed as a dbt target", () => {
    const dbtSlugs = new Set(transformationDestinationConnectors.map((c) => c.slug));
    for (const slug of NOT_A_DBT_TARGET) {
      expect(dbtSlugs.has(slug), `${slug} is listed as a dbt target`).toBe(false);
    }
  });

  it("every slug named here is a real connector, so a rename cannot disarm this file", () => {
    // A guard keyed on a slug that no longer exists passes vacuously — that is
    // how a check stops being able to fail without anyone noticing.
    const all = new Set(connectors.map((c) => c.slug));
    for (const slug of NOT_A_DBT_TARGET) {
      expect(all.has(slug), `"${slug}" is not in connectors.ts`).toBe(true);
    }
  });

  it("PostgreSQL is a dbt target — it is the one used in every example on the site", () => {
    expect(transformationDestinationConnectors.map((c) => c.slug)).toContain("postgresql");
  });
});

describe("every restricted connector says so on its own page", () => {
  it.each(NOT_A_DBT_TARGET)("%s carries a limitation citing a tracking issue", (slug) => {
    const c = connectors.find((x) => x.slug === slug)!;
    const lims = (c.limitations ?? []).join(" ");
    expect(lims, `${slug} has no limitations entry`).toMatch(/transformation target/i);
    expect(lims).toMatch(/core#\d+/);
  });

  it.each(EXTRACT_ONLY_SLUGS)("%s says plainly that it cannot receive data", (slug) => {
    const lims = (connectors.find((x) => x.slug === slug)!.limitations ?? []).join(" ");
    expect(lims).toMatch(/cannot receive data/i);
    expect(lims, `${slug} must cite core#865`).toContain("core#865");
    // Engineering's explicit ask: do not soften this. The failure is an
    // unhandled AttributeError, not a degraded path.
    for (const re of [/limited support/i, /partial support/i, /experimental/i]) {
      expect(re.test(lims), `${slug} softens an absent capability with ${re}`).toBe(false);
    }
  });

  it.each(NOT_A_DBT_TARGET)("%s renders its limitation in the built page", (slug) => {
    const html = readHtml(`connectors/${slug}/index.html`);
    expect(html).toContain("Current limitations");
    expect(html).toMatch(/transformation target/i);
  });

  it.each(NOT_A_DBT_TARGET)("%s never advertises running dbt against itself", (slug) => {
    const c = connectors.find((x) => x.slug === slug)!;
    const sell = [...c.useCases, c.seoDescription ?? "", c.description].join(" | ");
    for (const re of [
      /run dbt transformations on/i,
      /built-in dbt transforms/i,
      /dbt transforms built in/i,
      /architecture with dlt \+ dbt/i,
    ]) {
      expect(re.test(sell), `${slug} sells dbt-on-${slug} via ${re}`).toBe(false);
    }
  });

  it.each(EXTRACT_ONLY_SLUGS)("%s never sells itself as a destination", (slug) => {
    const c = connectors.find((x) => x.slug === slug)!;
    const sell = [...c.useCases, c.seoDescription ?? "", c.description].join(" | ");
    for (const re of [
      /as a source or destination/i,
      /lightweight destination/i,
      /load data into/i,
    ]) {
      expect(re.test(sell), `${slug} sells itself as a destination via ${re}`).toBe(false);
    }
  });
});

describe("MySQL is not over-corrected — the capability that DOES ship still says so", () => {
  /**
   * ⚠️ Re-aimed 2026-09-01. This block used to assert that the guide still
   * said MySQL works as a **load destination**, which was never true. What is
   * measured and true is extraction: Engineering proved it against a real
   * MySQL 8.4 container in both dlt modes, reading rows back from the
   * destination rather than trusting `rows_loaded`.
   *
   * The guard is still needed. "Not a dbt target, not a destination" is two
   * removals in one week, and the cheapest wrong next step is to delete MySQL
   * from the site — which would drop a connector that demonstrably works and is
   * one of the most common operational databases our users have.
   */
  const guide = () => read("../src/content/connectors/mysql.md");

  it("is still catalogued as a working source", () => {
    const mysql = connectors.find((c) => c.slug === "mysql")!;
    expect(mysql.direction).toBe("source");
    expect(mysql.description).toMatch(/as a source/i);
  });

  it("the setup guide still walks the extraction path end to end", () => {
    const g = guide();
    expect(g).toMatch(/Source connection/);
    for (const step of ["Create credentials in MySQL", "Add the connection", "First run"]) {
      expect(g, `mysql.md lost the "${step}" step`).toContain(step);
    }
  });

  it("never says MySQL is unsupported", () => {
    for (const re of [
      /MySQL is no longer supported/i,
      /MySQL support has been removed/i,
      /we no longer support MySQL/i,
      /MySQL is not supported\b/i,
    ]) {
      expect(
        re.test(guide()),
        `mysql.md matched ${re} — MySQL is a supported extract source`,
      ).toBe(false);
    }
  });

  it("the built page carries the Source badge, not Source & Destination", () => {
    const html = readHtml("connectors/mysql/index.html");
    expect(html).not.toMatch(/Source &amp; Destination/);
  });

  it("MySQL still appears as a source others can extract from", () => {
    expect(connectors.find((c) => c.slug === "mysql")!.direction).not.toBe("destination");
  });
});

describe("retired claims do not creep back", () => {
  /** Every one of these was live on datanika.io, or on `dev`, in this window. */
  const RETIRED: Array<[string, string, RegExp]> = [
    [
      "architecture asserted the load set and the dbt set were identical",
      "../src/pages/docs/architecture.astro",
      /dbt transformation layer runs against the same destination/i,
    ],
    [
      "transformations claimed dbt ran against everything it listed",
      "../src/pages/docs/transformations.astro",
      /Datanika runs dbt against any of these destinations/i,
    ],
    [
      "the MySQL guide told the reader to pick MySQL as a pipeline destination",
      "../src/content/connectors/mysql.md",
      /select MySQL as the destination when configuring a pipeline/i,
    ],
    [
      "the MySQL guide claimed MySQL could receive loaded data (core#865)",
      "../src/content/connectors/mysql.md",
      /load data \*into\* MySQL|land data \*in\* MySQL|as a load destination/i,
    ],
    [
      "transformations said MySQL and SQLite accept loaded data (core#865)",
      "../src/pages/docs/transformations.astro",
      /MySQL, SQLite, Databricks and Synapse/i,
    ],
    [
      "the SQLite guide claimed dbt-on-SQLite works",
      "../src/content/connectors/sqlite.md",
      /dbt-on-SQLite works/i,
    ],
    [
      "the SQLite guide offered SQLite-as-destination notes",
      "../src/content/connectors/sqlite.md",
      /SQLite-as-destination/i,
    ],
    [
      "the Databricks guide offered Databricks-specific materializations",
      "../src/content/connectors/databricks.md",
      /Databricks-specific materializations/i,
    ],
    [
      "the Synapse guide offered Synapse-specific materializations",
      "../src/content/connectors/synapse.md",
      /Synapse-specific materializations/i,
    ],
    [
      "the connections table listed MySQL and SQLite as destinations",
      "../src/pages/docs/connections.astro",
      /<code>mysql<\/code><\/td><td>MySQL 5\.7\+<\/td>/i,
    ],
  ];

  /**
   * Source comments are stripped before matching, and that is load-bearing.
   *
   * `architecture.astro` and `connectors.ts` deliberately QUOTE retired copy in
   * comments explaining the retirement — which is what a future reader should
   * find, and what a naive whole-file regex flags. This suite originally passed
   * on `architecture.astro` **only because the quote wraps across a line break
   * mid-phrase.** A guard whose verdict depends on where a comment wraps is not
   * measuring what it claims to. Markdown is left alone: no comment syntax here,
   * and `*` is a list marker.
   */
  const stripComments = (rel: string, src: string) =>
    rel.endsWith(".md")
      ? src
      : src
          .split("\n")
          .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
          .join("\n");

  it.each(RETIRED)("%s", (_label, rel, re) => {
    expect(re.test(stripComments(rel, read(rel))), `${rel} still matches ${re}`).toBe(false);
  });

  it("the comment stripper strips — it must not silently become a no-op", () => {
    const rel = "../src/pages/docs/architecture.astro";
    const raw = read(rel);
    const re = /transformation layer runs against the same destination/;
    expect(re.test(raw), "architecture.astro no longer explains what it retired").toBe(true);
    expect(re.test(stripComments(rel, raw)), "stripComments is a no-op").toBe(false);
    expect(stripComments(rel, raw)).toMatch(/covers most of them but not all/);
  });

  it("the matchers fire on the copy they retired", () => {
    // The negative control. Without it every assertion above is satisfied by a
    // regex that matches nothing — a checker with one possible answer, which is
    // this project's signature defect. Each string is the real retired text.
    const samples: Array<[RegExp, string]> = [
      [RETIRED[0][2], "The dbt transformation layer runs against the same destination. All are computed dynamically"],
      [RETIRED[1][2], "Datanika runs dbt against any of these destinations. Each supports materialized models"],
      [RETIRED[2][2], "the same connection works — just select MySQL as the destination when configuring a pipeline."],
      [RETIRED[3][2], "To load data *into* MySQL, the same connection works — pick it as the **Destination connection** on an upload"],
      [RETIRED[4][2], "MySQL, SQLite, Databricks and Synapse all accept loaded data through an upload, but cannot be a transformation target."],
      [RETIRED[5][2], "**Transformations:** dbt-on-SQLite works for small projects via `dbt-sqlite`"],
      [RETIRED[6][2], "type affinity, and SQLite-as-destination notes — see the [SQLite connector page](/connectors/sqlite)."],
      [RETIRED[7][2], "- **dbt tips:** Databricks-specific materializations (Delta, liquid clustering)"],
      [RETIRED[8][2], "- **dbt tips:** Synapse-specific materializations in the [Transformations guide]"],
      [RETIRED[9][2], "<tr><td><code>mysql</code></td><td>MySQL 5.7+</td></tr>"],
    ];
    expect(samples.length).toBe(RETIRED.length);
    for (const [re, sample] of samples) {
      expect(re.test(sample), `matcher ${re} does not catch its own retired copy`).toBe(true);
    }
  });
});

describe("the replacement claims are rendered, not merely absent", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("docs/transformations/index.html");
  });

  it("separates the two reasons a destination cannot be a dbt target", () => {
    expect(html).toMatch(/Databricks and Synapse accept loaded data/i);
    expect(html).toMatch(/MySQL and SQLite are neither/i);
  });

  it("architecture points at this page instead of restating the set", () => {
    const arch = readHtml("docs/architecture/index.html");
    expect(arch).toContain('href="/docs/transformations"');
    expect(arch).toMatch(/covers most of them but not all/i);
  });

  it("the connections page has a source-only database table", () => {
    const conn = readHtml("docs/connections/index.html");
    expect(conn).toMatch(/Databases \(source only\)/i);
    expect(conn).toMatch(/Extract only/i);
  });
});
