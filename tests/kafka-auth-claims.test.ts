/**
 * landing#486 — the Kafka guide may not instruct users to configure broker auth
 * that the connector cannot perform.
 *
 * The connector is PLAINTEXT-only by construction, and this has now been found
 * three times in three different surfaces:
 *
 *   1. `connectors.ts` listed a `security_protocol` config field that exists
 *      nowhere in core — landing#198 KF-1, removed 2026-04-17.
 *   2. core's own schema carried dead `sasl_username`/`sasl_password` that the
 *      UI and runner both ignore — core#157 CORE-8.
 *   3. 🚨 **The setup guide written to close landing#198's KF-3 reintroduced the
 *      same fiction as a "Use raw JSON config" escape hatch**, and shipped it in
 *      five passages for four and a half months (#486).
 *
 * The third is the worst of them, because it is not inert. `security_protocol`
 * and the `sasl_*` keys are absent from the runner's accepted-key set, so they
 * are forwarded into `Pipeline.run()` and raise
 * `TypeError: got an unexpected keyword argument`. The page printed that advice
 * under the exact troubleshooting symptom — "SSL handshake failed" — that sends a
 * user looking for it.
 *
 * ⚠️ The ban is anchored to the **affirmative instruction**, never to the token.
 * The corrected copy has to be able to *name* `security_protocol` in order to say
 * it does not work, and a bare ban would fail on the honest sentence — the
 * recorded rule about a banned-word rule firing inside its own negation, which
 * has already cost us once on `/dpa`'s ISO 27001 line. Both directions are pinned
 * below.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");
const PAGE = resolve(ROOT, "dist/docs/connectors/kafka/index.html");
const SRC = resolve(ROOT, "src/content/connectors/kafka.md");

/**
 * The affirmative form: a JSON config payload offering an auth key. This is the
 * literal a user copies, and the literal that crashes the run. `&quot;` is
 * matched too, in case the renderer ever escapes inside <code>.
 */
const BANNED_INSTRUCTION = [
  {
    name: 'a JSON payload supplying "security_protocol"',
    re: /(?:"|&quot;)security_protocol(?:"|&quot;)\s*:/,
    sample: '{"bootstrap_servers": "...", "security_protocol": "SASL_SSL"}',
  },
  {
    name: 'a JSON payload supplying "sasl_username" / "sasl_password"',
    re: /(?:"|&quot;)sasl_(?:username|password|mechanism)(?:"|&quot;)\s*:/,
    sample: '{"sasl_mechanism": "PLAIN", "sasl_username": "u", "sasl_password": "p"}',
  },
  {
    name: "the claim that extra keys reach the dlt kafka_consumer resource",
    re: /pass(?:es)?\s+through\s+to\s+the\s+dlt\s*<?[^>]*>?\s*kafka_consumer/i,
    sample: "These extra keys pass through to the dlt kafka_consumer resource.",
  },
];

/** The honest statement that must remain, or the ban above guards nothing. */
const REQUIRED_CLAIM = /cannot currently connect to a SASL, SSL or mTLS broker/;

describe("the Kafka guide does not promise broker auth the connector cannot do (#486)", () => {
  it("the built page exists", () => {
    expect(existsSync(PAGE), "run `npm run build` first").toBe(true);
  });

  const html = existsSync(PAGE) ? readFileSync(PAGE, "utf-8") : "";

  it("every banned pattern still matches its own sample (guards a dead regex)", () => {
    // A pattern that has rotted reports zero hits, which reads exactly like the
    // page being clean. This is the control that caught a dead marker in
    // tests/no-advertising-tag.test.ts on its first run.
    const dead = BANNED_INSTRUCTION.filter((b) => !b.re.test(b.sample)).map((b) => b.name);
    expect(dead, `these patterns no longer match their own sample: ${dead.join(", ")}`).toEqual([]);
  });

  it("states plainly that authenticated brokers are unsupported", () => {
    // Without this the assertion below is satisfied by a page that simply stopped
    // discussing authentication, which is a different and worse outcome: a user
    // on Confluent Cloud would get no warning at all.
    expect(html, "the honest broker-authentication statement is gone from the built page").toMatch(
      REQUIRED_CLAIM,
    );
  });

  it("names security_protocol in prose (false-positive control)", () => {
    // The corrected copy MUST be able to name the key in order to say it does not
    // work. If this ever goes to zero, the ban below has become a token ban and
    // will fail on correct copy the next time someone writes the honest sentence.
    expect(
      (html.match(/security_protocol/g) || []).length,
      "the page no longer names security_protocol at all — check the ban is still anchored to the JSON form",
    ).toBeGreaterThan(0);
  });

  it("instructs no auth configuration anywhere on the page", () => {
    const hits = BANNED_INSTRUCTION.filter((b) => b.re.test(html)).map((b) => b.name);
    expect(
      hits,
      "The Kafka guide is instructing broker authentication the connector cannot perform. " +
        "`security_protocol` and the `sasl_*` keys are not in the runner's accepted-key set, so " +
        "they are forwarded into Pipeline.run() and raise TypeError — the advice crashes the run " +
        "rather than failing to help. See #486, and landing#198 KF-1 for the first time this " +
        `fiction shipped.\nFound: ${hits.join(", ")}`,
    ).toEqual([]);
  });

  it("still documents the raw-JSON keys the runner DOES accept", () => {
    // Removing the false remedy must not remove the true one. These three are in
    // the runner's accepted-key set and are read by the Kafka source builder.
    for (const key of ["idle_timeout_ms", "start_from", "enable_auto_commit"]) {
      expect(html, `the guide stopped mentioning the working option ${key}`).toContain(key);
    }
  });

  it("the source markdown agrees with the built page", () => {
    // dist/ is what a reader receives and is the primary assertion. This names
    // the file to edit rather than the rendered route.
    const md = readFileSync(SRC, "utf-8");
    const hits = BANNED_INSTRUCTION.filter((b) => b.re.test(md)).map((b) => b.name);
    expect(hits, `src/content/connectors/kafka.md: ${hits.join(", ")}`).toEqual([]);
    expect(md).toMatch(REQUIRED_CLAIM);
  });
});
