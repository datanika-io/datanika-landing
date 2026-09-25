/**
 * Guardrail: `/privacy` and `/trust` assert FACTS ABOUT PRODUCTION, and the two
 * pages must agree with each other.
 *
 * Why this exists. On 2026-08-30 both pages named **Hetzner, Germany** as the
 * host. Production had moved to **Pointer, Greece** on 2026-07-17 — six weeks
 * earlier. Nothing in the repo connected a hosting change to a landing-page
 * change, so the wrong host, the wrong country and the wrong data centre sat on
 * a legal page for six weeks while every build was green. The two pages had also
 * been disagreeing with each other *before* the move (`/privacy` said Nuremberg,
 * `/trust` said Falkenstein) and about run-log retention (90 days vs "lifetime of
 * the account"), and nothing noticed that either. See landing#343.
 *
 * ## What this test can and cannot do
 *
 * It CANNOT check reality. It has no access to the box, and CI has no
 * credentials. It cannot tell you the host changed.
 *
 * What it CAN do, and what actually failed last time:
 *   1. keep the two pages from contradicting each other,
 *   2. keep a retired claim from creeping back in,
 *   3. keep the load-bearing numbers from being edited casually,
 *   4. keep the "this page asserts facts about production" warning in the files,
 *      so the next person to touch them is told to go and check.
 *
 * Re-derivation procedure for every fact asserted here — how to ask the running
 * system rather than the previous revision of the page:
 *   plans/growth/notes/LEGAL_PAGE_FACTS_2026-08-30.md
 *
 * ## 🚨 This file is HALF the net. Read before adding a legal page.
 *
 * `PAGES` below is a hardcoded map of two, and that omission is itself a
 * shipped defect: `/terms` and `/refund` were never covered here, so `/terms`
 * carried V1 "model run overages" AND a `Starter` plan that never existed for
 * four months with every build green (landing#410, landing#416). This suite was
 * 28/28 green against that page.
 *
 * `legal-pages-commercial-claims.test.ts` covers the other half — the billing
 * model, plan names, restated figures, and the rule that a legal page must not
 * restate rates — across ALL four policy documents, and it *derives* that set
 * from the built site rather than listing it. It also reads THIS file's source
 * to check that every legal page has a page-specific guard somewhere, so the
 * two cannot drift apart.
 *
 * Practical consequence: adding a page to `PAGES` here is fine, but it is not
 * how a new legal page gets covered — that happens automatically, and the
 * coverage test there will tell you what is still owed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");

const PAGES = {
  privacy: resolve(ROOT, "src/pages/privacy.astro"),
  trust: resolve(ROOT, "src/pages/trust.astro"),
} as const;

const read = (p: string) => readFileSync(p, "utf-8");

/** Raw source, including the Astro frontmatter and its comments. */
const privacySrc = read(PAGES.privacy);
const trustSrc = read(PAGES.trust);

/**
 * Everything after the closing `---` of the Astro frontmatter — i.e. what a
 * reader actually sees, minus the build-time comments.
 *
 * This split matters. The header warning block necessarily *names* the retired
 * host in order to explain the incident, so scanning raw source would make the
 * retired-term budget a count of how many times the warning says "Hetzner" —
 * brittle, and measuring the wrong thing. A legal representation is what the
 * page renders, so the retired-claim and shared-fact checks read the body, and
 * only the "the warning is still there" checks read the raw source.
 */
function body(src: string): string {
  const m = src.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  if (!m) throw new Error("expected an Astro frontmatter block at the top of the file");
  return src.slice(m[0].length);
}

/**
 * Collapse whitespace runs to a single space.
 *
 * Every phrase this file matches is prose that a formatter may re-wrap at any
 * time. Matching against the unwrapped source makes the test fail on
 * indentation, which is noise: HTML collapses whitespace, so a sentence broken
 * across two source lines is the same sentence to the reader. Without this the
 * suite fails the first time someone reflows a paragraph — and a guard that
 * cries wolf gets deleted.
 */
const squash = (s: string) => s.replace(/\s+/g, " ");

const privacy = squash(body(privacySrc));
const trust = squash(body(trustSrc));

const both: Array<[string, string]> = [
  ["privacy", privacy],
  ["trust", trust],
];
const bothSrc: Array<[string, string]> = [
  ["privacy", privacySrc],
  ["trust", trustSrc],
];

/**
 * Facts about production that BOTH pages state, and must state identically.
 *
 * Each entry is a fact plus the command that re-derives it. If you are changing
 * one of these, you are changing a legal representation — run the command first,
 * change both pages, and add a dated row to the Change log on /trust.
 */
const SHARED_FACTS: Array<{ label: string; needle: RegExp; derive: string }> = [
  {
    label: "hosting provider is Pointer",
    needle: /Pointer \(pointer\.gr\)/,
    derive: "curl -s https://rdap.db.ripe.net/ip/185.25.22.188 | grep -E '\"name\"|country'",
  },
  {
    label: "hosting country is Greece",
    needle: /Greece/,
    derive: "RDAP for the prod IP reports country GR",
  },
  {
    // 🚨 Both pages said *"There is no self-service delete button in the product yet"*
    // while account deletion had shipped. This is the rarer direction — the page claimed
    // LESS than the product does — so there was no disclosure exposure and nothing here
    // objected. What it cost is worse than a typo and easy to miss: it routed anyone who
    // wanted their account gone into an email and a manual production write, for two
    // clicks of shipped product.
    //
    // ⚠️ Asserted as PRESENCE of the true statement, never as absence of the old one. A
    // ban on "no self-service delete" is satisfied by a sentence explaining that there
    // now IS one — which is exactly the corrected copy (WORKFLOW_RULES §4).
    label: "account deletion is disclosed as self-service",
    // ⚠️ NOT /self-service/i. Arming caught that: both pages also say what is *not*
    // self-service (organization deletion, email change), so the bare token is satisfied
    // by the denials and the assertion passed with the affirmative claim deleted. §4
    // again, and in my own guard this time. Pin the affirmative sentence.
    needle: /Deleting your account[^.]{0,40}is self-service/i,
    derive:
      "docker exec datanika-app grep -n 'delete_account_section' " +
      "/app/datanika/ui/pages/settings.py   # rendered at settings.py:372",
  },
  {
    /**
     * 🚨 The transport-encryption representation (landing#636, founder-approved 2026-09-20).
     *
     * `/privacy` §5 said "All data in transit is encrypted via TLS" and `/dpa` Annex II said
     * "TLS on every external connection". Both had been false since those pages were written.
     * QA measured every database connector through the product's own code paths, reading each
     * session from the SERVER's side: MySQL and Oracle never encrypt, ClickHouse and MongoDB
     * are plaintext by default, PostgreSQL encrypts only when the server offers it, and NO
     * self-hosted database connection verifies the server's certificate.
     * `plans/security/DB_CONNECTOR_TLS_2026-09-17.md`.
     *
     * ⚠️ Pinned as the PRESENCE of the honest statement, never as the absence of the old one.
     * A ban on the old sentence is satisfied by the /trust change-log entry that retracts it —
     * WORKFLOW_RULES §4, and the reason the two RETIRED entries below need ALLOWED budgets.
     *
     * 🔑 FLIP CONDITION, so this guard does not end up enforcing yesterday's product. The
     * sentence stays true while ANY connector cannot encrypt or cannot verify. It becomes an
     * understatement only when every connector both encrypts and verifies — at which point
     * this assertion SHOULD go red, and the correct response is to repoint it at the new
     * position and rewrite the /trust table, never to widen the regex. The table on
     * /trust#encryption-in-transit is the artifact that records where we are.
     */
    label: "both directions of transport encryption are stated, and not conflated",
    needle:
      /Connections to Datanika always use TLS[\s\S]{0,400}?encrypted only where the connector and your server support it[\s\S]{0,120}?do not yet verify your server's certificate/,
    derive:
      "plans/security/DB_CONNECTOR_TLS_2026-09-17.md — QA drove every connector through " +
      "ConnectionService.test_connection_verdict and DltRunnerService, and read each session " +
      "from the server (pg_stat_ssl, Ssl_version, encrypt_option, mongod's log, the ClickHouse " +
      "listener). Re-run that before weakening this sentence.",
  },
  {
    label: "off-site backup host Aweb is disclosed as a sub-processor",
    needle: /Aweb/,
    derive: "grep -n 'REMOTE=' plans/infra/scripts/backup-offsite.sh  # -> root@185.226.65.96",
  },
  {
    label: "transactional email is Resend",
    needle: /Resend/,
    derive:
      "ssh root@185.25.22.188 docker exec datanika-app-b /app/.venv/bin/python " +
      "-c \"from datanika.config import settings; print(settings.smtp_host)\"",
  },
];

/**
 * Claims that were true once and are now false. They must not reappear.
 *
 * ALLOWED carries the deliberate exceptions, each with a reason. The reason has
 * to be "this sentence is about the past" — never "this one is annoying". The
 * Change log on /trust is the one legitimate place a retired host is named,
 * because recording the change is the point of a change log.
 */
type Allowed = { page: "privacy" | "trust"; term: string; count: number; reason: string };

const RETIRED: Array<{ term: string; why: string }> = [
  { term: "Hetzner", why: "prod left Hetzner on 2026-07-17 (account terminated)" },
  { term: "Falkenstein", why: "never a Datanika data centre after the move; /trust's old claim" },
  { term: "Nuremberg", why: "/privacy's old claim; contradicted /trust even before the move" },
  { term: "Google Workspace", why: "listed as the email processor; Resend has always sent the mail" },
  { term: "Dedicated server", why: "the prod box is a KVM VPS (systemd-detect-virt -> kvm)" },
  { term: "Ubuntu 24.04", why: "the app box is 22.04; only the Aweb box is 24.04" },
  {
    term: "no self-service delete button",
    why:
      "account deletion shipped and is rendered from settings.py; `erase_user` hard-deletes "
      + "the person and soft-deletes the record. The page understated the product.",
  },
  {
    term: "All data in transit is encrypted via TLS",
    why:
      "/privacy §5's claim, false since the page was written. Connections TO Datanika are "
      + "TLS; connections FROM Datanika to a customer-hosted database are encrypted only "
      + "where that connector and that server support it, and none of them verifies the "
      + "server's certificate (landing#636, plans/security/DB_CONNECTOR_TLS_2026-09-17.md).",
  },
  {
    term: "Encrypted connections",
    why:
      "the Infrastructure table's row for OUR OWN PostgreSQL (landing#636, landing#647). Infra "
      + "measured `SHOW ssl` = `off` on production and staging, with pg_stat_ssl false on 11 of "
      + "11 backends. The row was removed rather than corrected and the honest position is now "
      + "published under #encryption-in-transit. No allowance: the change log describes the "
      + "removal without quoting the phrase, deliberately, so this ban stays satisfiable.",
  },
  {
    term: "TLS on every external connection",
    why:
      "/dpa Annex II's claim, and the worse of the two because that Annex's own preamble "
      + "says nothing in it is aspirational. Same measurement as above. Banned on /privacy "
      + "and /trust so it cannot migrate here from the document it was removed from.",
  },
];

const ALLOWED: Allowed[] = [
  {
    page: "trust",
    term: "Hetzner",
    count: 2,
    reason:
      "The Change log records that hosting moved away from Hetzner on 2026-07-17. " +
      "Recording a retired sub-processor is the entire point of a change log, and a " +
      "customer who read the old table needs to be able to see what replaced it.",
  },
  {
    page: "trust",
    term: "no self-service delete button",
    count: 1,
    reason:
      "The Change log records the correction itself, and a change log that cannot quote " +
      "the sentence it retracts tells a reader nothing about what changed. This is the " +
      "shape WORKFLOW_RULES §4 warns about from the other side: the ban fired on the " +
      "correction, which is the guard working rather than a false positive.",
  },
  {
    page: "trust",
    term: "Google Workspace",
    count: 1,
    reason:
      "The Change log records that the Google Workspace email row was replaced by Resend. " +
      "Same reason as above: this is a statement about a correction, not a live claim.",
  },
  {
    page: "trust",
    term: "All data in transit is encrypted via TLS",
    count: 1,
    reason:
      "The 2026-09-20 Change log entry quotes the sentence it retracts. A change log that " +
      "cannot name what it withdrew tells a reader nothing, and quietly deleting a security " +
      "claim is exactly what the /trust change log exists to prevent.",
  },
  {
    page: "trust",
    term: "TLS on every external connection",
    count: 1,
    reason:
      "Same entry, quoting /dpa Annex II's wording alongside /privacy's. Both are named " +
      "because a reader who saw either document needs to find their sentence here.",
  },
];

const countOf = (haystack: string, term: string) =>
  haystack.split(term).length - 1;

describe("legal pages: production facts", () => {
  it.each(SHARED_FACTS)(
    "both pages state: $label",
    ({ needle, derive }) => {
      for (const [name, src] of both) {
        expect(
          needle.test(src),
          `${name}.astro no longer states this fact. If production changed, ` +
            `re-derive it and update BOTH pages plus the /trust change log.\n` +
            `Re-derive with: ${derive}`,
        ).toBe(true);
      }
    },
  );

  it.each(RETIRED)("retired claim does not come back: $term", ({ term, why }) => {
    for (const [name, src] of both) {
      const allowance = ALLOWED.find((a) => a.page === name && a.term === term);
      const budget = allowance ? allowance.count : 0;
      const found = countOf(src, term);
      expect(
        found,
        `"${term}" appears ${found}x in ${name}.astro (budget ${budget}).\n` +
          `This claim is retired: ${why}.\n` +
          (allowance
            ? `The allowance exists because: ${allowance.reason}\n`
            : `There is no allowance for this page. If you have a genuine reason ` +
              `(a dated historical statement), add it to ALLOWED with that reason.\n`),
      ).toBe(budget);
    }
  });
});

describe("legal pages: the two pages must not contradict each other", () => {
  /**
   * The original defect. /privacy said run logs were purged after 90 days;
   * /trust said they were kept for the lifetime of the account. Both cannot be
   * true, and neither was what the code did — the purge is scheduled on Celery
   * Beat, and Beat is not running in production (core#653), so nothing has ever
   * been purged. The surviving statement is the one that matches reality.
   */
  it("states run-log retention once, and the same way, on both pages", () => {
    for (const [name, src] of both) {
      expect(
        /retained for as long as the organization exists/.test(src),
        `${name}.astro lost the agreed run-log retention sentence. Both pages ` +
          `must carry it verbatim, and it must match a job that actually runs.`,
      ).toBe(true);
    }
  });

  it("does not resurrect the 90-day auto-purge claim", () => {
    for (const [name, src] of both) {
      expect(
        /90 days, then automatically purged/.test(src),
        `${name}.astro claims run logs are auto-purged after 90 days. Nothing ` +
          `purges them: the task is scheduled on Celery Beat and Beat is not ` +
          `running in production. Verify with:\n` +
          `  ssh root@185.25.22.188 docker inspect datanika-celery ` +
          `--format '{{join .Config.Cmd " "}}'   # -> "worker", no "beat"\n` +
          `If Beat is now running, this claim may return — but re-derive the ` +
          `window from the code, do not restore this number from memory.`,
      ).toBe(false);
    }
  });

  /**
   * The per-connector transport table is what makes the corrected sentence checkable.
   * `/privacy` and `/dpa` both point a reader at `#encryption-in-transit`, so a promise
   * routed to an anchor that does not exist is still a promise (GROWTH_RULES: *check the
   * escape hatch has an action*).
   *
   * ⚠️ Scoped to the TABLE, not to the page and not to `<main>`. Three earlier guards on
   * these files were satisfied by prose *about* the artifact — most recently the /trust
   * change-log entry announcing the very row a guard was checking. The change log for this
   * correction names several of these connectors, so a page-level needle would go green
   * with the whole table deleted.
   */
  const transportTable = () => {
    const start = trust.indexOf('<section id="encryption-in-transit">');
    expect(start, "the #encryption-in-transit anchor is gone from /trust, and /privacy " +
      "plus /dpa both link to it").toBeGreaterThan(-1);
    const end = trust.indexOf("</section>", start);
    expect(end, "unterminated #encryption-in-transit section").toBeGreaterThan(start);
    const section = trust.slice(start, end);
    const tables = [...section.matchAll(/<table[\s\S]*?<\/table>/g)];
    // Control: the table is located by being the only one in the section. Two means a
    // later edit added one and this assertion silently started reading the wrong one.
    expect(tables.length, "expected exactly one table in #encryption-in-transit").toBe(1);
    return tables[0][0];
  };

  it("publishes a per-connector transport position for every database connector family", () => {
    const table = transportTable();
    for (const name of [
      "PostgreSQL", "Amazon Redshift", "MySQL", "Oracle", "SQL Server",
      "Azure Synapse", "ClickHouse", "MongoDB", "DuckDB",
    ]) {
      expect(
        table.includes(name),
        `${name} has no row in the /trust transport table. /privacy and /dpa both tell a ` +
          `reader that "the position for every connector is published" there.`,
      ).toBe(true);
    }
  });

  /**
   * 🚨 The one cell that must not be overstated in EITHER direction.
   *
   * BigQuery, Snowflake and Databricks were **reasoned** from the client libraries in the
   * image, offline, with no network — not measured. Writing "verified HTTPS" flat implies a
   * measurement nobody took; writing nothing implies they are unencrypted. Both are wrong,
   * and the honest cell says HTTPS *and* says it is reasoned.
   */
  it("labels the hosted-warehouse row as reasoned, and does not imply it is unencrypted", () => {
    const table = transportTable();
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0]);
    const hosted = rows.filter((r) => r.includes("BigQuery, Snowflake, Databricks"));
    expect(hosted.length, "expected exactly one hosted-warehouse row").toBe(1);
    expect(
      /Reasoned/.test(hosted[0]),
      "the BigQuery/Snowflake/Databricks row no longer says its basis is reasoned. It was " +
        "derived from the installed client libraries offline; no session to those services " +
        "was ever measured. Do not upgrade this to a measurement without taking one.",
    ).toBe(true);
    expect(
      /HTTPS/.test(hosted[0]),
      "the BigQuery/Snowflake/Databricks row no longer says the transport is HTTPS. " +
        "Removing it leaves them grouped with the plaintext connectors, which is the " +
        "opposite overstatement and equally false.",
    ).toBe(true);
  });

  /**
   * 🚨 landing#705. The row that told the largest segment of MongoDB users the product does
   * not work for them, for a capability we had shipped 18 days earlier.
   *
   * The row read *"Not encrypted. The connection form carries no TLS control, so a deployment
   * that requires TLS — Atlas, Cosmos DB's Mongo API, a self-hosted `requireTLS` — cannot be
   * connected to at all."* Every clause of that was false. `mongodb_fields()` renders a
   * **Use TLS** checkbox and a **Use DNS seed list (mongodb+srv)** checkbox, neither inside an
   * `rx.cond`; `connection_state.py` persists `tls` and `srv`; and `build_connection_uri`
   * emits `tls=true`. It reached core `master` in `36cb78ec` on **2026-09-02**.
   *
   * 🔑 Why an assertion rather than the note the guide used. The guide tied its retraction to
   * **an issue's state** — *"this note comes out when core#626 closes"*. The code landed, the
   * issue did not close, and the note stayed. A flip condition that depends on somebody
   * closing an issue is not a flip condition; this file is the one that runs on every push.
   *
   * ⚠️ Deliberately NOT a ban on the old sentence. The change-log entry for this correction
   * quotes it in order to retract it, so an absence check would be satisfied by the retraction
   * and would red on the fix — WORKFLOW_RULES §4, and #705's own AC5 says so explicitly.
   *
   * 🔑 FLIP CONDITION, and it is a real one: this pins the *rendered label* of a control that
   * lives in another repository. If Engineering renames or removes the checkbox, this goes red
   * — and that red is correct, because the page would then be naming a control a user cannot
   * find. **Repoint it at whatever the form offers instead; never widen the regex**, and never
   * satisfy it by deleting the row (the previous assertion in this block requires MongoDB to
   * have one, so the two hold each other).
   *
   * Re-derive rather than trusting this comment:
   *   gh api "repos/datanika-io/datanika-core/contents/datanika/i18n/en.json?ref=master" \
   *     -H "Accept: application/vnd.github.raw" | grep mongodb_tls
   *   # -> "connections.mongodb_tls": "Use TLS"
   */
  it("the MongoDB row names the TLS control the form actually offers", () => {
    const table = transportTable();
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0]);
    const mongo = rows.filter((r) => /MongoDB/.test(r));
    // Control: located by being the only MongoDB row. Two means a later edit split it and
    // this assertion silently started describing one half of the position.
    expect(mongo.length, "expected exactly one MongoDB row in the transport table").toBe(1);

    expect(
      /Use TLS/.test(mongo[0]),
      "the MongoDB row no longer names the form's `Use TLS` checkbox. That control shipped to " +
        "production on 2026-09-02 (core 36cb78ec) and this page spent five days telling Atlas " +
        "users it did not exist (landing#705). If the control has genuinely gone, rewrite the " +
        "row and repoint this assertion — do not delete it.",
    ).toBe(true);
    expect(
      /mongodb\+srv/.test(mongo[0]),
      "the MongoDB row no longer names the DNS seed list (`mongodb+srv`) option. That is the " +
        "connection string Atlas hands a user, and it forces TLS on — so it is the single most " +
        "load-bearing fact in this row for the majority of MongoDB deployments.",
    ).toBe(true);
    expect(
      /Measured/.test(mongo[0]),
      "the MongoDB row lost its basis. Every row in this table says whether we measured it or " +
        "reasoned it; a row with no basis is the shape the hosted-warehouse guard above exists " +
        "to prevent, arriving on a different row.",
    ).toBe(true);
  });

  it("/privacy sends the reader to the table rather than restating it", () => {
    expect(
      /\/trust#encryption-in-transit/.test(privacy),
      "/privacy no longer links to the per-connector table. It must not restate the rows " +
        "either — a second hand-maintained copy of these facts is a drift generator.",
    ).toBe(true);
  });

  /**
   * landing#647, founder-approved 2026-09-21 ("yes, publish").
   *
   * `/trust` used to claim "Encrypted connections" about OUR OWN PostgreSQL. That was removed in
   * landing#636 because Growth could not derive it; Infra then measured it and the answer is that
   * the server has TLS **disabled** — `SHOW ssl` reads `off` on production and staging, and
   * `pg_stat_ssl` is false on 11 of 11 client backends with 11 rows as the control
   * (`plans/security/OWN_POSTGRES_TLS_2026-09-20.md`). So the page now says so.
   *
   * 🚨 The standing bar, and it is the reason this assertion is shaped as a PRESENCE check:
   * **do not write "encrypted" about this connection in any form until `SHOW ssl` reads `on`.**
   * Pinning the words "not TLS-encrypted" means that flipping the claim deletes the `not` and
   * turns this red; an absence check for the word "encrypted" would be satisfied both by a correct
   * page and by one that simply stopped discussing it.
   *
   * ⚠️ The second clause is a RULING, not a paraphrase. An earlier draft said the database
   * "listens on 127.0.0.1 only". `docker-compose.yml` publishes it as `127.0.0.1:5432:5432`, which
   * restricts **Docker's host publication** to loopback — the container still listens on all
   * interfaces inside its network. On a shared box those are different claims, and the imprecise
   * one hides that a local process can reach the port. Publish only what the measurement supports.
   */
  const ownDatabaseParagraph = () => {
    const marker = "Datanika's own database.";
    const at = trust.indexOf(marker);
    expect(at, "/trust no longer carries the own-database transport paragraph (landing#647)")
      .toBeGreaterThan(-1);
    expect(
      trust.indexOf(marker, at + 1),
      "the own-database marker appears more than once, so this assertion no longer names one " +
        "paragraph and a green says nothing about which",
    ).toBe(-1);
    const end = trust.indexOf("</p>", at);
    expect(end, "unterminated own-database paragraph").toBeGreaterThan(at);
    return trust.slice(at, end);
  };

  it("/trust states that our own database connection is not encrypted", () => {
    const p = ownDatabaseParagraph();
    expect(
      /not TLS-encrypted/.test(p),
      "The own-database paragraph no longer says the connection is NOT TLS-encrypted. Do not " +
        "write 'encrypted' here in any form until `SHOW ssl` reads `on` — re-derive with:\n" +
        "  docker exec datanika-postgres psql -U datanika -d datanika -t -A -c 'SHOW ssl;'",
    ).toBe(true);
  });

  it("/trust claims only the reachability the measurement supports", () => {
    const p = ownDatabaseParagraph();
    expect(
      /not reachable from outside the server/.test(p),
      "The own-database paragraph lost the reachability clause. It must claim 'not reachable " +
        "from outside the server' — NOT 'listens on 127.0.0.1 only', which the compose file does " +
        "not support: `127.0.0.1:5432:5432` restricts Docker's host publication, not the " +
        "container's listen address, and on a shared box that difference is the whole point.",
    ).toBe(true);
    expect(
      /never leaves the host/.test(p),
      "The own-database paragraph lost the clause naming what actually protects this traffic. " +
        "Without it the page states a negative and offers the reader nothing in its place.",
    ).toBe(true);
  });

  it("keeps /privacy and /trust agreeing that TLS terminates on Apache, not nginx", () => {
    // The app box has no nginx binary at all; nginx serves this marketing site.
    expect(/Cloudflare \+ Apache/.test(trust)).toBe(true);
    expect(/Cloudflare \+ Nginx/.test(trust)).toBe(false);
  });
});

describe("legal pages: the EU-transfer claim must not come back", () => {
  /**
   * 🚨 The single most reinstatable false claim on these pages.
   *
   * Both pages used to say "No data is transferred outside the EU unless
   * explicitly configured by the customer." It was wrong on **two independent
   * counts**, and both survive the move to Greece:
   *
   *   1. **Resend** (US) receives the recipient's address on every
   *      password-reset and invitation email. Its DPA says processing takes
   *      place in the United States; all 22 of its own sub-processors are US.
   *   2. **Cloudflare** proxies ALL traffic to datanika.io and app.datanika.io,
   *      terminating TLS at the nearest point of presence. `datanika.io` is on
   *      Cloudflare's **Free** plan (verified against the Cloudflare API), and
   *      the Data Localization Suite is an Enterprise-only paid add-on — so the
   *      DPA's global-processing default applies and there is no EU-confinement
   *      to appeal to.
   *
   * The danger is specific: **hosting location is what someone reaches for when
   * they want to make this claim.** "We host in Greece, so no data leaves the
   * EU" is a tempting and wrong inference, and it is *more* tempting now that
   * the hosting line is accurate. Correcting the host without this guard would
   * have made the false sentence easier to re-derive, not harder.
   *
   * Raising the Cloudflare plan is NOT the fix — it is a paid Enterprise add-on
   * and we are pre-revenue. Describe reality instead.
   */
  const FORBIDDEN = [
    /[Nn]o data is transferred outside the EU/,
    /[Nn]o data leaves the EU/,
    /all (?:customer )?data (?:is )?(?:stays?|remains?|resides?) (?:in|within) the EU/i,
  ];

  it.each(both)("%s.astro does not claim data never leaves the EU", (name, src) => {
    for (const re of FORBIDDEN) {
      expect(
        re.test(src),
        `${name}.astro claims data does not leave the EU (matched ${re}).\n` +
          `It does, on two independent paths that hosting location does not fix:\n` +
          `  - Resend (US) gets the recipient address on every transactional email\n` +
          `  - Cloudflare terminates TLS globally; datanika.io is on the Free plan,\n` +
          `    so the Enterprise-only Data Localization Suite does not apply\n` +
          `State the transfers and the safeguards instead. Do not buy a plan tier.`,
      ).toBe(false);
    }
  });

  it.each(both)("%s.astro still names the non-EU sub-processors", (name, src) => {
    // The positive half. Deleting the disclosure is as bad as re-adding the
    // false claim, and an absence-only check cannot tell the two apart.
    for (const who of ["Resend", "Cloudflare"]) {
      expect(
        src.includes(who),
        `${name}.astro no longer names ${who}. Both pages must disclose the ` +
          `non-EU processing paths, not merely avoid denying them.`,
      ).toBe(true);
    }
    expect(
      /United States/.test(src),
      `${name}.astro no longer says "United States" anywhere. The transfer is ` +
        `the disclosure; naming the provider without naming the destination is ` +
        `not one.`,
    ).toBe(true);
  });

  it("the forbidden-phrase matchers are not inert", () => {
    // Run them against the actual pre-fix sentence. A negative assertion that
    // has never matched anything has not been shown to work.
    const preFix =
      "all customer data resides in Hetzner's Falkenstein data center " +
      "(Germany, EU). No data is transferred outside the EU unless explicitly " +
      "configured by the customer.";
    expect(FORBIDDEN.some((re) => re.test(preFix))).toBe(true);
  });
});

describe("legal pages: load-bearing numbers", () => {
  /**
   * 🚨 The 30-day erasure window is a promise another team's spec is built to
   * satisfy — plans/product/SPEC_PII_SEPARATION.md (D7). It is satisfiable ONLY
   * because off-site backup retention is exactly 30 days
   * (REMOTE_KEEP_DAYS=30 in plans/infra/scripts/backup-offsite.sh).
   *
   * Changing this number silently invalidates that spec. If you have a reason to
   * change it, change the backup retention first, then the spec, then this.
   */
  it("keeps the 30-day erasure promise on /privacy", () => {
    expect(
      /personal data is removed within 30 days/.test(privacy),
      "The 30-day erasure window changed or was removed from /privacy. It is " +
        "load-bearing: plans/product/SPEC_PII_SEPARATION.md is built to satisfy " +
        "it, and it holds only because REMOTE_KEEP_DAYS=30 in backup-offsite.sh. " +
        "Do not edit this without changing the backup retention and the spec.",
    ).toBe(true);
  });

  it("states the same backup retention on both pages", () => {
    expect(/30 days off-site/.test(privacy)).toBe(true);
    expect(/30-day retention/.test(trust)).toBe(true);
    // 7 days local is stated on both, because "30-day retention" alone reads as
    // if the only copy lived 30 days.
    expect(/7 days/.test(privacy)).toBe(true);
    expect(/7 days/.test(trust)).toBe(true);
  });
});

describe("legal pages: the warning that stops this recurring", () => {
  /**
   * Acceptance criterion 6 of landing#343: something in the repo has to say
   * these pages assert facts about production, so that a hosting change is also
   * a landing-page change. That warning is only useful if it stays in the file.
   */
  it.each(bothSrc)("%s.astro carries the production-facts warning", (name, src) => {
    expect(
      /THIS PAGE ASSERTS FACTS ABOUT PRODUCTION INFRASTRUCTURE/.test(src),
      `${name}.astro lost its header warning. It is the only thing telling the ` +
        `next editor that these sentences are legal representations about a ` +
        `running system rather than marketing copy.`,
    ).toBe(true);
  });

  it.each(bothSrc)("%s.astro points at the re-derivation procedure", (name, src) => {
    expect(
      /LEGAL_PAGE_FACTS_2026-08-30\.md/.test(src),
      `${name}.astro no longer names the notes file that says how to re-derive ` +
        `each claim from the running system. A warning with no procedure just ` +
        `tells someone to be careful.`,
    ).toBe(true);
  });
});

/**
 * A positive control. Every assertion above is either "this string is present"
 * or "this string is absent"; a suite of absences can pass by reading an empty
 * file. This pins something unconditionally true of both pages so that a bad
 * path, an empty file or a rename fails loudly instead of passing silently.
 *
 * (Growth learned this the hard way in tests/scheduled-drafts.test.ts, which
 * asserted only absences and returned early when its input was missing.)
 */
describe("positive control", () => {
  it.each(both)("%s.astro body was actually read", (name, src) => {
    expect(src.length, `${name}.astro body is empty or unreadable`).toBeGreaterThan(2000);
    expect(src).toContain("<Layout");
    expect(src).toContain("datanika.io");
  });

  it("the frontmatter split did not swallow the page", () => {
    // If `body()` ever over-matched, every "retired claim is absent" assertion
    // above would pass vacuously. Pin the ratio instead of trusting the regex.
    expect(privacy.length / squash(privacySrc).length).toBeGreaterThan(0.5);
    expect(trust.length / squash(trustSrc).length).toBeGreaterThan(0.5);
  });

  it("the retired-claim check can actually fail", () => {
    // A negative assertion that has never been shown to fail has not been shown
    // to work. Run the matcher against the pre-fix text and require a hit.
    const preFix = squash(
      "<li>Your data is stored on servers in Nuremberg, Germany (Hetzner Cloud).</li>",
    );
    for (const { term } of RETIRED.filter((r) => ["Hetzner", "Nuremberg"].includes(r.term))) {
      expect(countOf(preFix, term), `matcher for "${term}" is inert`).toBeGreaterThan(0);
    }
  });

  /**
   * The transport correction's controls. Both halves, in the same test file:
   * the retired matchers must FIRE on the real pre-fix sentences, and the affirmative
   * needle must NOT be satisfied by them. One without the other is how a control comes
   * to pass by gutting its own guard.
   *
   * These are not synthetic — they are the exact lines `/privacy` and `/dpa` carried
   * until 2026-09-20, copied from the revision this correction replaced.
   */
  const PRE_FIX_PRIVACY = squash(
    "<li>All data in transit is encrypted via TLS. The credentials you enter for your own " +
      "data sources (database passwords, API keys, service-account JSON) are encrypted at " +
      "rest using Fernet symmetric encryption.</li>",
  );
  const PRE_FIX_DPA = squash(
    "<li><strong>In transit.</strong> TLS on every external connection. Internal services " +
      "bind to loopback only.</li>",
  );

  it("the transport matchers fire on the real pre-fix sentences", () => {
    expect(
      countOf(PRE_FIX_PRIVACY, "All data in transit is encrypted via TLS"),
      "the /privacy transport matcher is inert",
    ).toBeGreaterThan(0);
    expect(
      countOf(PRE_FIX_DPA, "TLS on every external connection"),
      "the /dpa Annex II transport matcher is inert",
    ).toBeGreaterThan(0);
  });

  it("the corrected-statement needle is NOT satisfied by the pre-fix copy", () => {
    // The half that can fail in the direction of the conclusion. A presence assertion
    // proves nothing unless the needle can tell the corrected page from the broken one.
    const fact = SHARED_FACTS.find((f) =>
      f.label.startsWith("both directions of transport encryption"),
    );
    expect(fact, "the transport SHARED_FACT was renamed or removed").toBeDefined();
    for (const [what, text] of [
      ["/privacy", PRE_FIX_PRIVACY],
      ["/dpa Annex II", PRE_FIX_DPA],
    ] as const) {
      expect(
        fact!.needle.test(text),
        `the corrected-statement needle matches ${what}'s PRE-FIX text, so it cannot ` +
          `distinguish the correction from the claim it replaced.`,
      ).toBe(false);
    }
  });
});
