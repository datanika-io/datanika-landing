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
    term: "Google Workspace",
    count: 1,
    reason:
      "The Change log records that the Google Workspace email row was replaced by Resend. " +
      "Same reason as above: this is a statement about a correction, not a live claim.",
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
});
