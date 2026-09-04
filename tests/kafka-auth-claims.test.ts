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
import { readFileSync, existsSync } from "fs";
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
const BANNED_INSTRUCTION = [
  {
    name: 'a JSON payload supplying "security_protocol"',
    re: /(?:"|&quot;)security_protocol(?:"|&quot;)\s*:/,
    sample: '{"bootstrap_servers": "...", "security_protocol": "SASL_SSL"}',
  },
  {
    name: 'a JSON payload supplying "sasl_username" / "sasl_password"',
    re: /(?:"|&quot;)sasl_(?:username|password|mechanism|plain_username|plain_password)(?:"|&quot;)\s*:/,
    sample: '{"sasl_mechanism": "PLAIN", "sasl_username": "u", "sasl_password": "p"}',
  },
  {
    name: "the claim that extra keys reach the dlt kafka_consumer resource",
    re: /pass(?:es)?\s+through\s+to\s+the\s+dlt\s*<?[^>]*>?\s*kafka_consumer/i,
    sample: "These extra keys pass through to the dlt kafka_consumer resource.",
  },
];

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
    const hits = RETIRED_CLAIM.filter((c) => c.re.test(html) || c.re.test(md)).map((c) => c.name);
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
    const hits = BANNED_INSTRUCTION.filter((b) => b.re.test(html)).map((b) => b.name);
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
