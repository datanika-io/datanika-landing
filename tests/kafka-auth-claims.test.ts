/**
 * The Kafka guide must describe broker authentication the way the connector
 * actually does it — and must not describe it the way it does not.
 *
 * ## History, because the same fiction has now shipped four times
 *
 *   1. `connectors.ts` listed a `security_protocol` config field that existed
 *      nowhere in core — landing#198 KF-1, removed 2026-04-17.
 *   2. core's own schema carried dead `sasl_username`/`sasl_password` that the
 *      UI and runner both ignored — core#157 CORE-8.
 *   3. 🚨 The setup guide written to close landing#198's KF-3 reintroduced it as
 *      a "Use raw JSON config" escape hatch, and shipped it in five passages for
 *      four and a half months (#486). That advice *crashed the run*.
 *   4. #486 corrected the page to "PLAINTEXT only, and there is no workaround" —
 *      true when written, and **false the moment core#1054 shipped the fields**.
 *
 * The fourth is why this file changed shape. A guard that pins the honest
 * sentence of the day becomes the thing enforcing yesterday's product. So the
 * assertions below are split in two: what must be **true of the connector**
 * (credentials on the connection, refused in `dlt_config`) is pinned
 * affirmatively, and the retired capability claims are pinned at zero.
 *
 * ## Two shapes of failure this file is deliberately built against
 *
 * **A ban anchored to a token fails on the honest sentence.** The corrected copy
 * has to *name* `security_protocol` in order to explain where it goes. So every
 * ban here is anchored to the **JSON payload form** — the literal a user copies
 * and the literal the runner rejects — never to the identifier. The
 * false-positive control below fails if that ever inverts.
 *
 * **An unscoped substring match hits the wrong element.** A sitewide guard of
 * mine matched an HTML *comment* on 101 pages, then passed when the real row was
 * deleted because the same words survived in a Change log. Every structural
 * assertion here therefore extracts the element it cares about — `<table>`,
 * `<blockquote>` — and pins the match count at exactly one.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");
const PAGE = resolve(ROOT, "dist/docs/connectors/kafka/index.html");
const SRC = resolve(ROOT, "src/content/connectors/kafka.md");

/** The four keys core#1054 added to `CONFIG_SCHEMAS["kafka"]`. */
const AUTH_KEYS = [
  "security_protocol",
  "sasl_mechanism",
  "sasl_plain_username",
  "sasl_plain_password",
];

/**
 * The affirmative form: a JSON config payload offering an auth key. This is the
 * literal a user copies. It was a `TypeError` before core#1054 and is a named
 * `DltRunnerError` after it — the advice is wrong in both worlds, so the ban
 * outlives the fix. `&quot;` is matched too, in case the renderer ever escapes
 * inside <code>.
 */
const QUOTE = `(?:"|&quot;|&#34;)`;

const BANNED_INSTRUCTION = [
  {
    name: 'a JSON payload supplying "security_protocol"',
    re: new RegExp(`${QUOTE}security_protocol${QUOTE}\s*:`),
    sample: '{"bootstrap_servers": "...", "security_protocol": "SASL_SSL"}',
  },
  {
    name: 'a JSON payload supplying "sasl_username" / "sasl_password"',
    re: new RegExp(
      `${QUOTE}sasl_(?:username|password|mechanism|plain_username|plain_password)${QUOTE}\s*:`,
    ),
    sample: '{"sasl_mechanism": "PLAIN", "sasl_username": "u", "sasl_password": "p"}',
  },
  {
    name: "the claim that extra keys reach the dlt kafka_consumer resource",
    re: /pass(?:es)?\s+through\s+to\s+the\s+dlt\s+kafka_consumer/i,
    sample: "These extra keys pass through to the dlt kafka_consumer resource.",
  },
];

/**
 * 🚨 The bans run against the page's **text**, not its markup, and that is not
 * tidiness — it is the whole reason they work.
 *
 * Shiki highlights a JSON fence token by token, so
 * `{"security_protocol": "SASL_SSL"}` reaches `dist/` as
 * `…<span …>"security_protocol"</span><span …>: </span>…`. The quote and the
 * colon end up in different elements, and a pattern requiring them adjacent
 * matches the markdown and **not** the built page. Measured on this very file:
 * reinstating the banned payload left every dist-side assertion green and was
 * caught only by the source-markdown check at the bottom — i.e. the assertion
 * documented above as "what a reader receives, and the primary one" was the one
 * that could not fail.
 *
 * Stripping tags cannot make a ban fire on honest copy: the prose names
 * `security_protocol` inside `<code>` with no quotes and no colon, and every
 * ban requires both.
 */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/**
 * Claims that were true before core#1054 and are false after it. Zero each.
 *
 * These are not banned words — they are the specific retired sentences. A reader
 * who finds one of them concludes the product cannot reach any managed Kafka,
 * which is the most expensive wrong answer this page can give.
 */
const RETIRED_CLAIM = [
  {
    name: '#486\'s "cannot connect to a SASL/SSL/mTLS broker"',
    re: /cannot currently connect to a SASL, SSL or mTLS broker/i,
  },
  {
    name: '"broker authentication: PLAINTEXT only"',
    re: /PLAINTEXT only, and there is no workaround/i,
  },
  {
    name: "the claim that managed Kafka is unusable",
    re: /(?:are|is) not usable with this connector/i,
  },
  {
    name: "the claim that Test Connection verifies a Kafka broker",
    // Kafka is in core's SAAS_PROBE_EXEMPT: the button returns a neutral
    // "not tested" verdict and never opens a broker connection. The old page
    // said it "checks connectivity", and hung three troubleshooting entries off
    // error strings the button cannot produce.
    re: /Test Connection[^.]{0,80}this checks connectivity/i,
  },
];

/** Elements of `html` of the given tag, innerHTML included. */
function elements(html: string, tag: string): string[] {
  return html.match(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, "gi")) || [];
}

describe("the Kafka guide describes the auth the connector actually performs (#486, core#1054)", () => {
  it("the built page exists", () => {
    expect(existsSync(PAGE), "run `npm run build` first").toBe(true);
  });

  const html = existsSync(PAGE) ? readFileSync(PAGE, "utf-8") : "";
  const md = readFileSync(SRC, "utf-8");

  it("every banned pattern still matches its own sample (guards a dead regex)", () => {
    // A pattern that has rotted reports zero hits, which reads exactly like the
    // page being clean. This control caught a dead marker in
    // tests/no-advertising-tag.test.ts on its first run.
    const dead = BANNED_INSTRUCTION.filter((b) => !b.re.test(b.sample)).map((b) => b.name);
    expect(dead, `these patterns no longer match their own sample: ${dead.join(", ")}`).toEqual([]);
  });

  it("every banned pattern survives the RENDERER, not just the raw sample", () => {
    // 🚨 This control exists because the raw-sample control above passed while
    // the dist-side ban was dead. A guard's self-test has to exercise the shape
    // the assertion actually meets: markdown goes through Shiki before it
    // reaches a reader, and Shiki splits `"key":` across two <span>s. Anything
    // that only ever sees the pre-render string cannot notice.
    const rendered = [
      // Shiki's actual output shape for a JSON fence, copied from a build.
      '<span style="color:#79B8FF">"security_protocol"</span><span style="color:#E1E4E8">: </span><span style="color:#9ECBFF">"SASL_SSL"</span>',
      '<span style="color:#79B8FF">"sasl_plain_password"</span><span style="color:#E1E4E8">: </span><span style="color:#9ECBFF">"p"</span>',
      "<p>These extra keys pass <em>through</em> to the dlt <code>kafka_consumer</code> resource.</p>",
    ];
    const missed = rendered.filter((r) => !BANNED_INSTRUCTION.some((b) => b.re.test(textOf(r))));
    expect(
      missed,
      `a banned instruction is invisible once rendered — the dist assertions below cannot fail:\n${missed.join("\n")}`,
    ).toEqual([]);
  });

  it("carries exactly one table documenting all four connection auth fields", () => {
    // Scoped to the table rather than the page: the four keys also appear in
    // prose and in troubleshooting, so a page-wide substring match would stay
    // green with the reference table deleted.
    const tables = elements(html, "table").filter((t) => t.includes("sasl_plain_password"));
    expect(
      tables.length,
      "expected exactly one <table> listing the Kafka authentication fields",
    ).toBe(1);
    for (const key of AUTH_KEYS) {
      expect(tables[0], `the auth field table does not list ${key}`).toContain(key);
    }
    for (const value of ["SASL_SSL", "SCRAM-SHA-256", "PLAINTEXT"]) {
      expect(tables[0], `the auth field table does not give the accepted value ${value}`).toContain(
        value,
      );
    }
  });

  it("states the security boundary — connection encrypted, pipeline config not — in one place", () => {
    // The reason credentials may not go in `dlt_config` is the whole point: the
    // connection is encrypted and redacted, `Upload.dlt_config` is a plain JSON
    // column. A page that says "put them on the connection" without saying why
    // invites the next person to add the convenient fallback back.
    const quotes = elements(html, "blockquote").filter((q) =>
      /never in the pipeline config/i.test(q),
    );
    expect(quotes.length, "expected exactly one blockquote stating the credential boundary").toBe(1);
    expect(quotes[0], "the boundary note does not say the connection config is encrypted").toMatch(
      /encrypted at rest/i,
    );
    expect(quotes[0], "the boundary note does not say what the unsafe path would leak").toMatch(
      /clear text/i,
    );
  });

  it("tells the reader how to check their own build has the fields", () => {
    // core#1054 is on core's `dev`, not its `master`, and landing promotes on a
    // different cadence than core. Under either promotion order this page is
    // read by someone whose form does not match it, so the page has to be
    // falsifiable from the reader's own screen rather than from a version number
    // we would then have to keep accurate.
    const quotes = elements(html, "blockquote").filter((q) => /count the fields/i.test(q));
    expect(quotes.length, "expected exactly one blockquote telling the reader to count fields").toBe(
      1,
    );
    expect(quotes[0]).toMatch(/three/i);
    expect(quotes[0]).toMatch(/seven/i);
  });

  it("still says what is NOT supported, so 'we do SASL now' does not read as 'we do everything'", () => {
    // core#1054 deliberately left out mTLS client certs, a custom CA bundle,
    // GSSAPI and OAUTHBEARER. Dropping this note is how the page would overclaim
    // in the opposite direction from #486.
    for (const gap of ["mutual TLS", "GSSAPI", "OAUTHBEARER"]) {
      expect(html, `the page no longer states that ${gap} is unsupported`).toContain(gap);
    }
  });

  it("does not repeat any retired capability claim", () => {
    // textOf for the same reason as the bans: these are multi-word sentences,
    // and `**bold**` or `` `code` `` anywhere inside one splits it with markup
    // in dist while leaving it intact in the markdown.
    const hits = RETIRED_CLAIM.filter((c) => c.re.test(textOf(html)) || c.re.test(md)).map(
      (c) => c.name,
    );
    expect(
      hits,
      "The Kafka guide is still asserting something core#1054 made false. A reader who believes " +
        "it concludes Datanika cannot reach Confluent Cloud, Redpanda, Aiven or Upstash — every " +
        `managed tier there is.\nFound: ${hits.join(", ")}`,
    ).toEqual([]);
  });

  it("names security_protocol in prose (false-positive control)", () => {
    // The corrected copy MUST be able to name the key in order to say where it
    // goes. If this ever goes to zero, a ban above has become a token ban and
    // will fail on correct copy the next time someone writes the honest
    // sentence — the defect that already cost us once on /dpa's ISO 27001 line.
    expect(
      (html.match(/security_protocol/g) || []).length,
      "the page no longer names security_protocol at all — check the bans are still anchored to the JSON form",
    ).toBeGreaterThan(0);
  });

  it("instructs no auth configuration through raw JSON anywhere on the page", () => {
    const hits = BANNED_INSTRUCTION.filter((b) => b.re.test(textOf(html))).map((b) => b.name);
    expect(
      hits,
      "The Kafka guide is instructing broker authentication through the pipeline config. The " +
        "runner refuses those four keys there by name, because `Upload.dlt_config` is a plain " +
        "JSON column with no encryption and no redaction — the convenient path is the one that " +
        `writes a broker password into every backup in clear text.\nFound: ${hits.join(", ")}`,
    ).toEqual([]);
  });

  it("still documents the raw-JSON keys the runner DOES accept", () => {
    // Removing the false remedy must not remove the true one. All four are read
    // by `_build_kafka_source` off `dlt_config`.
    for (const key of ["idle_timeout_ms", "start_from", "enable_auto_commit", "topics"]) {
      expect(html, `the guide stopped mentioning the working option ${key}`).toContain(key);
    }
  });

  it("the connector reference page agrees with the guide", () => {
    // The guide links to /connectors/kafka as "the full field-by-field
    // reference". landing#449 is open precisely because that file drifts from
    // the shipped form; a guide that documents four fields beside a reference
    // that lists three is the same drift with a citation attached.
    const ref = resolve(ROOT, "dist/connectors/kafka/index.html");
    expect(existsSync(ref), "run `npm run build` first").toBe(true);
    const refHtml = readFileSync(ref, "utf-8");
    for (const key of AUTH_KEYS) {
      expect(refHtml, `/connectors/kafka does not list ${key}`).toContain(key);
    }
  });

  it("the source markdown agrees with the built page", () => {
    // dist/ is what a reader receives and is the primary assertion. This names
    // the file to edit rather than the rendered route.
    const hits = BANNED_INSTRUCTION.filter((b) => b.re.test(md)).map((b) => b.name);
    expect(hits, `src/content/connectors/kafka.md: ${hits.join(", ")}`).toEqual([]);
    for (const key of AUTH_KEYS) {
      expect(md, `src/content/connectors/kafka.md does not name ${key}`).toContain(key);
    }
  });
});

/**
 * 🚨 EVERYTHING ABOVE IS SCOPED TO ONE PAGE. The fiction's whole history is that
 * it moves between surfaces.
 *
 * Re-read the history at the top of this file: the same advice shipped in
 * `connectors.ts`, in core's schema, and then in the setup guide — three
 * surfaces, and closing the issue about one of them is what created the next.
 * Every assertion above reads `dist/docs/connectors/kafka/index.html` and
 * `src/content/connectors/kafka.md`. **A blog post is invisible to all of them.**
 *
 * That is `GROWTH_RULES`' recorded rule — *a guard's scope is a path set as much
 * as a phrasing* — which was earned when `legal-pages-facts.test.ts` held two
 * pages consistent while two blog posts described production as running on a
 * host it had left six weeks earlier, and both were then syndicated to dev.to.
 *
 * Added 2026-09-24 with the first Kafka blog post (landing#675). Writing that
 * post is exactly the event this guard has to survive: a fifth surface, authored
 * by someone who has read the guide and is summarising it from memory.
 *
 * ## Why the source markdown and not `dist/`
 *
 * A future-dated post is excluded from the build **entirely** — no page, no
 * sitemap entry, no RSS row (`src/utils/blog-visibility.ts`). So a `dist/` sweep
 * over the blog corpus reads clean on every scheduled post by *measuring
 * nothing*, and it would go red only on the day the post publishes, from the
 * daily rebuild, which does not run this suite. The one population that most
 * needs checking is the one `dist/` cannot see.
 *
 * The markdown is therefore the right artifact here, and the Shiki concern that
 * shaped the assertions above does not apply to it: a fence in markdown is still
 * `{"security_protocol": "SASL_SSL"}`, quote and colon adjacent.
 *
 * ## Scope, stated rather than implied
 *
 * The two markdown content collections a reader can reach: `src/content/blog`
 * and `src/content/connectors`. Membership is **derived by walking the
 * directories**, so a post added tomorrow is covered without anyone editing this
 * file — the property `scheduled-drafts.test.ts` had to learn the hard way when
 * three future-dated posts sat in the tree covered by no test at all.
 */
describe("no content surface instructs Kafka broker auth through the pipeline config", () => {
  const COLLECTIONS = ["src/content/blog", "src/content/connectors"] as const;

  interface Source {
    file: string;
    text: string;
  }

  function collect(rel: string): Source[] {
    const dir = resolve(ROOT, rel);
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({ file: `${rel}/${f}`, text: readFileSync(resolve(dir, f), "utf-8") }));
  }

  /** The function under test. The controls below drive THIS, not a copy of it. */
  function offendersIn(sources: Source[]): string[] {
    const hits: string[] = [];
    for (const s of sources) {
      for (const b of BANNED_INSTRUCTION) {
        if (b.re.test(s.text)) hits.push(`${s.file} — ${b.name}`);
      }
    }
    return hits;
  }

  const blog = collect(COLLECTIONS[0]);
  const guides = collect(COLLECTIONS[1]);
  const all = [...blog, ...guides];

  // ANTI-VACUITY. A walk that returns nothing produces an empty offender list,
  // which is byte-identical to a clean corpus.
  it("both collections are non-trivial (guards a dead walk)", () => {
    expect(blog.length, "src/content/blog looks empty").toBeGreaterThan(40);
    expect(guides.length, "src/content/connectors looks empty").toBeGreaterThan(30);
  });

  // 🔑 SENSITIVITY, driven through `offendersIn` itself. Rule 26: an instrument
  // that cannot see part of its population reports that part as clean. Each ban
  // is fed its own sample AS A FILE, so this exercises the walk, the loop and the
  // regex together — not just the pattern, which the control at the top of this
  // file already covers and which stayed green through a real dead ban once.
  it("offendersIn SEES a violation in every banned shape", () => {
    for (const b of BANNED_INSTRUCTION) {
      const hits = offendersIn([{ file: "synthetic.md", text: `Some prose. ${b.sample}` }]);
      expect(hits, `offendersIn is blind to: ${b.name}`).not.toEqual([]);
    }
  });

  // 🔑 AND ITS OTHER HALF — a guard that refuses everything is not discriminating.
  // The honest copy MUST be able to name these keys in order to say where they
  // go; my own post's reference table does. If this ever fails, a ban above has
  // become a token ban and will red-light the next correct page.
  it("offendersIn does NOT fire on the honest prose form", () => {
    const honest = [
      "Set the `security_protocol` field on the connection, not in the pipeline config.",
      "| SASL Password | `sasl_plain_password` | the matching secret — stored encrypted |",
      "The four keys `security_protocol`, `sasl_mechanism`, `sasl_plain_username` and " +
        "`sasl_plain_password` live on the connection.",
    ];
    for (const text of honest) {
      expect(offendersIn([{ file: "synthetic.md", text }]), `fired on honest copy: ${text}`).toEqual(
        [],
      );
    }
  });

  it("no blog post or connector guide carries a Kafka auth payload", () => {
    const hits = offendersIn(all);
    expect(
      hits,
      "A content surface is instructing Kafka broker authentication through `dlt_config`. The " +
        "runner refuses those keys there by name, because `Upload.dlt_config` is a plain JSON " +
        "column with no encryption and no redaction — so the convenient path is the one that " +
        "writes a broker password into every backup in clear text. This has now been written " +
        `four times in five months; do not make it five.\nFound:\n  ${hits.join("\n  ")}`,
    ).toEqual([]);
  });

  // FALSE-POSITIVE CONTROL over the real corpus, not a synthetic string: the
  // keys must still be NAMED somewhere a reader can reach. A corpus that stopped
  // discussing Kafka authentication altogether would pass the assertion above
  // while being strictly worse for a Confluent user than the original defect.
  it("the corpus still names the auth keys in prose", () => {
    const naming = all.filter((s) => /security_protocol/.test(s.text)).map((s) => s.file);
    expect(
      naming.length,
      "nothing under src/content names security_protocol — either the guide lost its " +
        "reference table, or the bans have drifted off the JSON payload form",
    ).toBeGreaterThan(0);
  });
});
