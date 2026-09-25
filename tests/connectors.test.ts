import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { connectors, sourceConnectors, destinationConnectors } from "../src/data/connectors";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

// Derived from the data file rather than duplicated here.
//
// This list was hardcoded in three separate test files, so withdrawing one
// connector (google-ads, core#567) meant editing the same list four times —
// counting the copy in connectors.ts itself — and any one of them could be
// missed. Deriving it means the data file is the single place a connector is
// added or removed, and these tests follow automatically.
const connectorSlugs = connectors.map((c) => c.slug);

describe("connector landing pages", () => {
  it("generates a page for every connector in the data file", () => {
    expect(connectorSlugs.length).toBeGreaterThan(30);
    for (const slug of connectorSlugs) {
      const file = resolve(DIST, `connectors/${slug}/index.html`);
      expect(existsSync(file), `Missing: /connectors/${slug}`).toBe(true);
    }
  });

  it("never both markets and redirects the same connector", () => {
    // This replaces a guard that named `google-ads` as withdrawn (core#567).
    // Naming the connector was the bug: the withdrawal was reversed in
    // core#592 and a literal cannot notice that.
    //
    // The durable invariant is the one that has teeth in both directions — a
    // slug must not appear in `connectors.ts` *and* in the redirect map at the
    // same time. Astro resolves the redirect first, so leaving a stale 301
    // behind silently shadows the page it points away from: the build passes,
    // the page exists in `dist/`, and every visitor still bounces to the
    // index. That is exactly the half-finished restore this test now catches.
    const config = readFileSync(resolve(__dirname, "../astro.config.mjs"), "utf-8");
    const redirectBlock = config.slice(
      config.indexOf("redirects: {"),
      config.indexOf("integrations:"),
    );
    const redirected = [...redirectBlock.matchAll(/^\s*"(\/connectors\/[^"]+)":/gm)].map(
      (m) => m[1],
    );
    const shadowed = connectorSlugs.filter((slug) =>
      redirected.includes(`/connectors/${slug}`),
    );
    expect(
      shadowed,
      `These connectors are in connectors.ts but still redirect away: ${shadowed.join(", ")}`,
    ).toEqual([]);
  });
});

describe("connector index page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("connectors/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("Connectors");
  });

  it("links to PostgreSQL", () => {
    expect(html).toContain('href="/connectors/postgresql"');
  });

  it("links to Stripe", () => {
    expect(html).toContain('href="/connectors/stripe"');
  });

  it("has CTA", () => {
    expect(html).toContain("app.datanika.io");
  });
});

describe("PostgreSQL connector page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("connectors/postgresql/index.html");
  });

  it("has connector name in title", () => {
    expect(html).toContain("PostgreSQL");
  });

  it("has use cases section", () => {
    expect(html.toLowerCase()).toContain("use case");
  });

  it("has configuration section", () => {
    expect(html).toContain("host");
    expect(html).toContain("port");
  });

  it("has CTA to sign up", () => {
    expect(html).toContain("app.datanika.io");
  });

  it("has related connectors", () => {
    expect(html).toContain('href="/connectors/');
  });
});

describe("Stripe connector page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("connectors/stripe/index.html");
  });

  it("has connector name", () => {
    expect(html).toContain("Stripe");
  });

  it("is marked as source", () => {
    expect(html.toLowerCase()).toContain("source");
  });

  it("has api_key config field", () => {
    expect(html).toContain("api_key");
  });

  it("auto-links to the Stripe → Postgres template (issue #126)", () => {
    // Session 3 auto-cross-link: every connector page that matches a template's
    // source or destination slug must render a "Templates with <connector>" section.
    expect(html).toContain('href="/templates/stripe-to-postgres"');
    expect(html).toContain("Templates with Stripe");
  });
});

describe("PostgreSQL connector page — template cross-links", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("connectors/postgresql/index.html");
  });

  it("auto-links to both templates that use postgresql", () => {
    expect(html).toContain('href="/templates/stripe-to-postgres"');
    expect(html).toContain('href="/templates/postgres-to-bigquery"');
  });
});

describe("MongoDB connector page — no template cross-links", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("connectors/mongodb/index.html");
  });

  it("does not render a Templates section when no template matches", () => {
    // MongoDB is not a source or destination in any of the 3 launch templates,
    // so the auto-computed section must be absent (not empty-rendered).
    expect(html).not.toContain("Templates with MongoDB");
  });
});

// ---------------------------------------------------------------------------
// MongoDB transport (TLS / mongodb+srv) honesty guards (landing#308, landing#705,
// core#626).
//
// HISTORY, because this block twice asserted the instance instead of the
// invariant and the second time it pinned a falsehood onto the public site.
//
// v1 (landing#308) was right: the page claimed "Supports both MongoDB Atlas and
// self-hosted instances" and documented a `connection_string` field illustrated
// with `mongodb+srv://...`, and neither existed. So the guards banned those.
//
// v2 is where it went wrong. The bans hardened into a requirement that every
// MongoDB page *assert the absence of TLS* and cite an OPEN issue — this block's
// own instruction was "DELETE THIS BLOCK when core#626 closes". core#626's code
// shipped and the issue did not close, so the guards kept three public surfaces
// telling Atlas users the product cannot connect to them at all, for a control
// that is on the form. **A guard whose release condition is an issue's state is
// a guard that pins whatever nobody got round to closing** (landing#705).
//
// v3, below, asserts the PRESENCE of what is true and is re-derivable from the
// form rather than from an issue tracker. Measured on core `origin/master`:
// `mongodb_fields()` renders `rx.checkbox` controls for `connections.mongodb_srv`
// and `connections.mongodb_tls`, neither inside an `rx.cond`; TLS is checked and
// `disabled` while SRV is on; `connection_state.py` writes `config["tls"]` and
// `config["srv"]`; `mongodb_source.py` emits `mongodb+srv` and `tls=true`, and
// both the Test Connection path and the run path use that builder.
//
// Re-derive before changing any of this — read the form, not an issue:
//   gh api "repos/datanika-io/datanika-core/contents/datanika/ui/components/\
//   connection_config_fields.py?ref=master" and read mongodb_fields().
// ---------------------------------------------------------------------------
describe("MongoDB connector page — transport is documented as it ships", () => {
  const mongo = connectors.find((c) => c.slug === "mongodb")!;
  let html: string;
  beforeAll(() => {
    html = readHtml("connectors/mongodb/index.html");
  });

  it("does not claim Atlas support in the description", () => {
    // Still an overclaim: the controls exist, a completed Atlas handshake has
    // never been observed from Datanika. Configurable is not verified.
    expect(mongo.description).not.toMatch(/supports both mongodb atlas/i);
    expect(html).not.toMatch(/Supports both MongoDB Atlas/i);
  });

  it("does not document a connection_string field, which does not exist", () => {
    const names = mongo.configFields.map((f) => f.name);
    expect(names).not.toContain("connection_string");
  });

  it("documents the eight config keys the shipped form actually reaches", () => {
    const names = mongo.configFields.map((f) => f.name).sort();
    expect(names).toEqual(
      ["auth_source", "database", "host", "password", "port", "srv", "tls", "user"].sort(),
    );
  });

  it("names both transport controls as things the reader can switch on", () => {
    // The inverse of v2's ban. `mongodb+srv` is now a control you tick, so the
    // page must say so — and it must say which form control does it, because a
    // key name with no control is the core#499 mistake this file keeps hitting.
    const srv = mongo.configFields.find((f) => f.name === "srv")!;
    const tls = mongo.configFields.find((f) => f.name === "tls")!;
    expect(srv.description).toContain("mongodb+srv");
    expect(srv.description).toContain("Use DNS seed list");
    expect(tls.description).toContain("Use TLS");
    // Anti-vacuity: the matcher must be able to say no.
    expect("a description that names no control").not.toContain("Use TLS");
  });

  it("states the honest limit — configurable, not verified end to end", () => {
    const limits = (mongo.limitations ?? []).join("\n");
    expect(limits).toMatch(/not been verified end to end/i);
    expect(limits).toContain("core#626");
    expect(html).toContain("Current limitations");
    expect(html).toMatch(/Atlas/);
    expect(html).toContain(
      "https://github.com/datanika-io/datanika-core/issues/626",
    );
    // Anti-vacuity for the phrase that carries the whole claim.
    expect("a limitation that overstates support").not.toMatch(
      /not been verified end to end/i,
    );
  });
});

describe("MongoDB setup guide + blog post describe the transport controls", () => {
  it("the setup guide names both transport controls before the first step", () => {
    const md = readFileSync(
      resolve(__dirname, "../src/content/connectors/mongodb.md"),
      "utf-8",
    );
    // PRESENCE, not absence: a corrected page legitimately contains the words
    // "TLS" and "Atlas" while retracting the old claim, so banning them would
    // red-light the fix (WORKFLOW_RULES §4).
    expect(md).toContain("Use DNS seed list (mongodb+srv)");
    expect(md).toContain("Use TLS");
    expect(md).toMatch(/not verified a completed handshake/i);
    // The troubleshooting section must send the reader to the transport boxes
    // before the firewall — a TLS-requiring server dropping a plaintext
    // connection looks exactly like a blocked port.
    expect(md).toMatch(/check the transport boxes before you touch the firewall/i);
    expect(md).not.toContain("MongoDB Atlas requires allowlisting IPs");
  });

  it("the authSource post carries a dated correction, not a rewrite", () => {
    const md = readFileSync(
      resolve(__dirname, "../src/content/blog/mongodb-authentication-failed-authsource.md"),
      "utf-8",
    );
    // The post is a historical record; the convention here is an update note.
    expect(md).toContain("core#638");
    expect(md).toMatch(/\*\*Update, 25 September 2026\.\*\*/);
    expect(md).toContain("Use DNS seed list (mongodb+srv)");
  });

  it("does not claim Atlas is blocked by a missing dependency", () => {
    // dnspython is installed and resolves; only URI assembly is missing.
    // "Atlas is unsupported" is accurate; "Atlas needs a new dependency" is not.
    const files = [
      "../src/content/connectors/mongodb.md",
      "../src/content/blog/mongodb-authentication-failed-authsource.md",
      "../src/data/connectors.ts",
    ];
    for (const f of files) {
      const src = readFileSync(resolve(__dirname, f), "utf-8");
      expect(src).not.toMatch(/dnspython/i);
      expect(src).not.toMatch(/missing dependency/i);
    }
  });
});

/**
 * `auth_source` is in the connection SCHEMA and not in the connection FORM.
 *
 * How this went wrong, because the shape recurs. core#550 added `auth_source`
 * to `CONFIG_SCHEMAS["mongodb"]`, and these pages were written from the schema —
 * so they told the reader to "fill in ... Auth Source" and to "set **Auth
 * Source** to the database the user was created in". Neither instruction is
 * followable: `mongodb_fields()` renders host, port, user, password, database
 * and nothing else, verified on core `master`. The schema and the Reflex form
 * are two hand-maintained lists with no code linking them (core#638), so
 * "the schema has it" is not evidence that a user can reach it.
 *
 * **Documenting a field that does not exist is worse than documenting a
 * caveat.** A caveat costs the reader some confidence; a phantom field costs
 * them the afternoon they spend looking for it.
 *
 * The retired core#625 caveat is the other half of this. Test Connection now
 * builds the URI through the same function the run path uses, so "trust the
 * run, not the button" is stale advice — but deleting it alone would have left
 * these pages implying auth_source is configurable in the form, which is the
 * *larger* error and the one a reader actually acts on.
 */
describe("MongoDB auth_source is documented as it actually ships", () => {
  const FILES: Array<[string, string]> = [
    ["guide", "../src/content/connectors/mongodb.md"],
    ["post", "../src/content/blog/mongodb-authentication-failed-authsource.md"],
    ["data", "../src/data/connectors.ts"],
  ];

  const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf-8");

  /** Instructions that only make sense if the form has an Auth Source input. */
  const PHANTOM_FIELD = [
    /Fill in:[^\n]*Auth Source/i,
    /\bSet \*\*Auth Source\*\*/i,
    /form has an \*\*Auth Source\*\* field/i,
    /Leave \*\*Auth Source\*\* at its default/i,
  ];

  it.each(FILES)("%s does not instruct the reader to use a form field that does not exist", (_label, rel) => {
    const src = read(rel);
    for (const re of PHANTOM_FIELD) {
      expect(
        re.test(src),
        `${rel} matched ${re}. The mongodb form renders Host, Port, User, ` +
          `Password, Database — there is no Auth Source input (core#638). ` +
          `Re-derive before restoring this: gh api ` +
          `"repos/datanika-io/datanika-core/contents/datanika/ui/components/` +
          `connection_config_fields.py?ref=master" and read mongodb_fields().`,
      ).toBe(false);
    }
  });

  it.each(FILES)("%s names a way auth_source can actually be set, and cites core#638", (_label, rel) => {
    // The positive half. Removing the phantom-field instructions without saying
    // how auth_source IS set leaves a reader with a broken deployment and no
    // route — and an absence-only check cannot tell that apart from a fix.
    const src = read(rel);
    expect(src, `${rel} no longer cites core#638`).toContain("core#638");
    expect(
      /raw JSON/i.test(src),
      `${rel} no longer tells the reader how auth_source can be set at all. ` +
        `Two routes exist now: the Authentication database field on the form, and the ` +
        `Use raw JSON checkbox. Name at least the raw-JSON one here.`,
    ).toBe(true);
  });

  /**
   * 🆕 2026-09-15 (landing#395, the mssql/mongodb walks). **The form has the input now**, so
   * the half of this suite that assumed it never would is no longer the whole story.
   *
   * Measured on core `master` `8ffd416`: the mongodb form renders a seventh control,
   * `cfg-auth-source`, labelled **Authentication database**, placeholder `admin`. It is read,
   * not decorative — one session, one field changed, against a user defined inside the target
   * database: empty -> red `Authentication failed` (code 18), set -> green
   * `Connected successfully`.
   *
   * Asserted on the GUIDE only, deliberately. The blog post is a dated historical record and
   * carries an update note rather than a rewrite, and the data file describes the field in its
   * own words.
   */
  it("the setup guide names the Authentication database field", () => {
    const src = read("../src/content/connectors/mongodb.md");
    expect(
      /\*\*Authentication database\*\*/.test(src),
      "the mongodb guide no longer names the Authentication database field. That is the " +
        "form control which sets auth_source on core master 8ffd416; without naming it the " +
        "page sends readers to the raw-JSON escape hatch for something the form now does.",
    ).toBe(true);
    // The matcher must be able to say no, or this passes on any page at all.
    expect(/\*\*Authentication database\*\*/.test("a page that never names the field")).toBe(false);
  });

  it.each(FILES)("%s does not still say Test Connection ignores Auth Source", (_label, rel) => {
    // core#625 closed 2026-08-30 and is live on master: _test_mongodb() calls
    // build_connection_uri(), the same function the run path uses.
    const src = read(rel);
    for (const re of [
      /does not read Auth Source/i,
      /does not yet read Auth Source/i,
      /trust the run, not the button/i,
    ]) {
      expect(re.test(src), `${rel} carries the retired core#625 caveat (${re}).`).toBe(false);
    }
  });

  it("the matchers fire on the copy they retired", () => {
    // Each of these was live on datanika.io on 2026-08-30.
    const retired = [
      "2. Fill in: **Connection Name**, **Host**, **Port** (default `27017`), **User**, **Password**, **Database**, **Auth Source**.",
      "**Fix.** Set **Auth Source** to the database the user was created in (`admin` for the setups above — it is the default).",
      "The MongoDB connection form has an **Auth Source** field. It defaults to `admin`.",
      "3. Leave **Auth Source** at its default of `admin` unless you know otherwise.",
    ];
    for (const sample of retired) {
      expect(
        PHANTOM_FIELD.some((re) => re.test(sample)),
        `no matcher catches retired copy: ${sample.slice(0, 70)}`,
      ).toBe(true);
    }
    expect(/trust the run, not the button/i.test("until it closes, trust the run, not the button.")).toBe(
      true,
    );
  });
});


// ---------------------------------------------------------------------------
// #378 / #379 — the pages rank for destination-directed queries and never named
// a destination
// ---------------------------------------------------------------------------

/**
 * GSC, 2026-03-01 -> 2026-08-28: `export slack to postgresql` at position 13.5
 * on `/connectors/slack/`, `pipedrive to bigquery` at 16.6, `asana to bigquery`
 * at 18.1. Five page-2 positions on queries whose second half the page did not
 * answer. A reader had to infer that PostgreSQL was even supported.
 *
 * The set is asserted **from the data file** rather than against a written list,
 * so a `direction` change carries the page with it. That is the half the prose
 * split failed at (#376), and the half that let five warehouses advertise a
 * source capability core does not have (#391).
 */
describe("connector pages answer the destination question (#378, #379)", () => {
  const SAAS_SAMPLE = ["slack", "asana", "pipedrive", "freshdesk", "stripe"];

  it("every SaaS page lists the full derived destination set, and nothing else", () => {
    for (const slug of SAAS_SAMPLE) {
      const html = readHtml(`connectors/${slug}/index.html`);
      const expected = destinationConnectors.filter((c) => c.slug !== slug);
      for (const d of expected) {
        expect(
          html,
          `/connectors/${slug}/ does not name ${d.name}, which is a supported destination`,
        ).toContain(`/connectors/${d.slug}`);
      }
      // The inverse, which is the assertion that actually protects us: a name we
      // do not support must never appear. 10% of our measured impressions are for
      // Power BI, Qlik and Tableau, and some of our best positions are among
      // them - that is product signal, not copy (landing#325).
      for (const absent of ["Power BI", "Qlik", "Tableau", "Looker Studio", "Acumatica"]) {
        expect(
          html.includes(absent),
          `/connectors/${slug}/ names ${absent}, which is not in connectors.ts`,
        ).toBe(false);
      }
    }
  });

  it("a destination-only page offers sources, not destinations", () => {
    const html = readHtml("connectors/bigquery/index.html");
    expect(html).toContain("Sources you can load into");
    expect(html).toContain(String(sourceConnectors.length));
    expect(
      /Where Google BigQuery data can go/.test(html),
      "BigQuery is a destination; it must not be offered a destination list",
    ).toBe(false);
  });

  it("the badge has three states, so a destination is never labelled a source", () => {
    const bq = readHtml("connectors/bigquery/index.html");
    const slack = readHtml("connectors/slack/index.html");
    const pg = readHtml("connectors/postgresql/index.html");
    // Astro emits the label with surrounding whitespace inside the span.
    const badge = (html: string) =>
      (html.match(/rounded-full[^>]*">\s*(Source &amp; Destination|Destination|Source)\s*</) ?? [])[1]?.replace("&amp;", "&");
    expect(badge(bq)).toBe("Destination");
    expect(badge(slack)).toBe("Source");
    expect(badge(pg)).toBe("Source & Destination");
  });

  it("only SQL database sources are told to choose a load mode", () => {
    // There is no write-disposition / load-mode / source-schema / table-name
    // field for a SaaS, file, streaming or NoSQL source. The connector guides
    // have said so since landing#272/#285; this template said the opposite on
    // all 36 pages.
    for (const c of connectors) {
      const html = readHtml(`connectors/${c.slug}/index.html`);
      const tellsLoadMode = /choose a load mode/i.test(html);
      expect(
        tellsLoadMode,
        `/connectors/${c.slug}/ (category ${c.category}) ${tellsLoadMode ? "tells" : "does not tell"} ` +
          "the reader to choose a load mode; only Database sources render that control",
      ).toBe(c.category === "Database");
    }
  });
});
