/**
 * Guardrail: we do not publish a certification timeline we cannot stand behind.
 *
 * ## The decision this enforces
 *
 * On 2026-08-30 the founder dropped the public SOC 2 Type I claim. Their words:
 * *"we're still finding bugs and security issues."* `/trust` was promising Type I
 * with **target completion in Q3 2026** — a quarter ending 2026-09-30, with no
 * auditor engaged — in the same week we published an auth-bypass disclosure and
 * found a second account-takeover vector.
 *
 * **Scope is the public claim, not the programme.** `plans/product/SPEC_SOC2_ROADMAP.md`
 * stays on disk. Nothing here says we stopped doing security work, and this test
 * must never be read that way. What it forbids is a *published date or status*
 * that no engagement backs.
 *
 * ## Why this is a repo-wide sweep and not two more lines in legal-pages-facts
 *
 * The claim was found in **four** places, on **four** pages:
 *
 *   | file | surface |
 *   |---|---|
 *   | `src/pages/trust.astro` (meta description) | `/trust` — and it renders 3x: `<meta name="description">`, `og:description`, `twitter:description` |
 *   | `src/pages/trust.astro` (compliance card)  | `/trust` |
 *   | `src/components/Pricing.astro`             | `/pricing` **and the homepage** — the component is rendered by both |
 *   | `src/content/blog/pricing-v2-math-and-why.md` | a live blog post from 2026-04-20 |
 *
 * A body grep of the two pages the ticket named would have found two of the four.
 * It would have missed the meta layer (which does not appear in rendered body
 * text), the homepage (because nobody greps a component for a page's claims), and
 * the blog post entirely. That is [landing#343]'s lesson repeating: **a claim
 * lives in more places than the ticket that retires it names.** So this sweep
 * reads every source file under `src/`, and the positive control below asserts it
 * actually reached all four of those files by name.
 *
 * ## What this test can and cannot do
 *
 * It cannot tell you whether an auditor has been engaged. If one ever is, this
 * test is the thing to change **after** the engagement exists — not before, and
 * not by quietly loosening a regex.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, join, relative } from "path";

const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "src");

const EXTENSIONS = [".astro", ".md", ".mdx", ".ts", ".json"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (EXTENSIONS.some((e) => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

/** Collapse whitespace so a re-wrapped paragraph is still one sentence. */
const squash = (s: string) => s.replace(/\s+/g, " ");

/**
 * Remove source comments, because a legal representation is what the page
 * *renders*.
 *
 * This is not a convenience. The most effective thing standing between this
 * decision and its quiet reversal is a comment at the point of edit saying "do
 * not restore a certification date here" — and such a comment has to *name* the
 * claim to be worth reading. Sweeping raw source would turn the budget into a
 * count of how many times the warning quotes the thing it is warning about, so
 * the guard would push toward deleting its own best defence.
 *
 * (`legal-pages-facts.test.ts` reached the same conclusion from the same
 * problem: its header block has to say "Hetzner" to explain the Hetzner
 * incident.)
 *
 * `//` is only treated as a comment at the start of a line. An inline `//`
 * belongs to a URL far more often than to a comment, and eating `https://` out
 * of the corpus would silently shrink what the sweep can see.
 */
const stripComments = (s: string) =>
  s
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");

const FILES = walk(SRC).map((path) => {
  const raw = readFileSync(path, "utf-8");
  return {
    path,
    rel: relative(ROOT, path).replace(/\\/g, "/"),
    raw: squash(raw),
    text: squash(stripComments(raw)),
  };
});

/**
 * Phrasings that commit us, in public, to a certification status or date.
 *
 * Each one is a shape the claim actually took, or the nearest neighbour someone
 * would reach for while re-adding it. They are deliberately about *commitment*
 * ("in progress", "working toward", a quarter, a year) rather than about the
 * string "SOC 2" — saying we are **not** certified must stay legal, and is in
 * fact required by REQUIRED_DISCLOSURE below.
 */
const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  {
    label: "SOC 2 described as in progress / underway",
    re: /SOC\s*2[^.<]{0,60}\b(?:in progress|underway|in flight|on track)\b/i,
  },
  {
    label: "an intention to obtain SOC 2",
    re: /\b(?:working toward|working towards|pursuing|targeting|on track for)\b[^.<]{0,80}SOC\s*2/i,
  },
  {
    // Both word orders. The live copy said "target completion in Q3 2026"; the
    // withdrawal record says "completion target of Q3 2026". A guard that only
    // caught one order would be dodgeable by rephrasing, which is worse than no
    // guard — it would look like it was passing.
    label: "a stated completion target for SOC 2",
    re: /SOC\s*2[^.<]{0,140}\b(?:target(?:ed|ing)?\s+completion|completion\s+target)\b/i,
  },
  {
    label: "a calendar quarter or year attached to SOC 2",
    re: /SOC\s*2[^.<]{0,140}\b(?:Q[1-4]\s*20\d{2}|20\d{2})\b/i,
  },
  {
    label: "Type II queued behind Type I",
    re: /Type\s*II\s+right\s+behind/i,
  },
  {
    label: "a percentage of controls claimed as implemented",
    re: /\d{1,3}\s*%\s*of\s*(?:the\s*)?controls/i,
  },
];

/**
 * Deliberate exceptions. Each needs a reason, and the reason has to be
 * "this sentence is about the past" — never "this one is inconvenient".
 *
 * Recording a withdrawn claim in a dated change log is the same argument that
 * lets `/trust` name Hetzner: a customer who read the old page needs to be able
 * to see what replaced it, and quietly deleting a commitment is worse than
 * recording that we withdrew it.
 */
type Allowance = { rel: string; label: string; count: number; reason: string };

const WITHDRAWAL_RECORD_REASON =
  "The compliance section records, with a date, that we withdrew a Q3 2026 Type I " +
  "target. Naming the withdrawn date is the point of that paragraph — a reader who " +
  "saw the old page has to be able to tell it was retired rather than silently " +
  "deleted. The record itself is pinned by 'the withdrawal stays on the record' " +
  "below, so this allowance cannot be spent on a fresh commitment: delete the record " +
  "and that test fails, add a second date and this one does.";

const ALLOWED: Allowance[] = [
  {
    rel: "src/pages/trust.astro",
    label: "a calendar quarter or year attached to SOC 2",
    count: 1,
    reason: WITHDRAWAL_RECORD_REASON,
  },
  {
    rel: "src/pages/trust.astro",
    label: "a stated completion target for SOC 2",
    count: 1,
    reason: WITHDRAWAL_RECORD_REASON,
  },
];

describe("no published certification timeline", () => {
  it.each(FORBIDDEN)("no file claims: $label", ({ label, re }) => {
    const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    for (const { rel, text } of FILES) {
      const found = text.match(global)?.length ?? 0;
      const allowance = ALLOWED.find((a) => a.rel === rel && a.label === label);
      const budget = allowance?.count ?? 0;
      expect(
        found,
        `${rel} matched "${label}" ${found}x (budget ${budget}, which is a ceiling).\n\n` +
          `The public SOC 2 claim was dropped by founder decision on 2026-08-30: ` +
          `"we're still finding bugs and security issues." No auditor is engaged, so a ` +
          `date or an "in progress" status is a commitment we cannot back.\n\n` +
          (allowance
            ? `The allowance for this file exists because: ${allowance.reason}\n`
            : `If an auditor has genuinely been engaged, say so with the engagement in ` +
              `hand and update this test then — do not loosen the pattern to fit copy.\n` +
              `The programme itself is not retired: plans/product/SPEC_SOC2_ROADMAP.md ` +
              `stays on disk.\n`),
      ).toBeLessThanOrEqual(budget);
    }
  });
});

describe("the honest replacement must stay", () => {
  /**
   * The positive half, and it is not optional.
   *
   * Deleting the "we are not certified" sentence and re-adding "certification in
   * progress" are the *same* defect, and an absence-only check cannot tell them
   * apart — a compliance section with nothing in it is exactly the vacuum that
   * invites the old sentence back. Same argument as the Resend/Cloudflare
   * positive half in legal-pages-facts.test.ts.
   */
  const REQUIRED_DISCLOSURE = [
    {
      label: "states plainly that we hold no SOC 2 attestation",
      re: /we (?:hold|have) no SOC 2 (?:attestation|report)/i,
    },
    {
      label: "says we are not publishing a target date",
      re: /not publishing a (?:target )?date/i,
    },
  ];

  const trust = FILES.find((f) => f.rel === "src/pages/trust.astro");

  it.each(REQUIRED_DISCLOSURE)("/trust $label", ({ re }) => {
    expect(trust, "src/pages/trust.astro was not read").toBeDefined();
    expect(
      re.test(trust!.text),
      `src/pages/trust.astro no longer carries this disclosure (looked for ${re}).\n` +
        `An empty compliance section is how "SOC 2 Type I in progress" comes back. ` +
        `State what is true — no attestation, no published date — rather than saying nothing.`,
    ).toBe(true);
  });

  it("/trust still describes what we actually do instead", () => {
    expect(trust).toBeDefined();
    // Each of these is a practice that exists today and is verifiable by a
    // reader. If the compliance section stops pointing at them, it has become an
    // apology rather than a disclosure.
    const PRACTICES: Array<[string, RegExp]> = [
      ["the security test suite", /security test suite/i],
      ["the open-source core", /open[- ]source/i],
      ["the sub-processor list", /sub-?processors?/i],
      ["disclosure in release notes", /release notes/i],
    ];
    for (const [label, re] of PRACTICES) {
      expect(
        re.test(trust!.text),
        `src/pages/trust.astro no longer points at ${label} (looked for ${re}). The ` +
          `replacement for a promised certification is the set of things we do today; ` +
          `if those go, the section says nothing at all.`,
      ).toBe(true);
    }
  });

  it("the withdrawal stays on the record", () => {
    // This is what makes the two ALLOWED entries safe. They permit exactly one
    // dated mention of the retired target; this pins that the mention is the
    // *withdrawal record* and not a fresh commitment wearing its budget.
    expect(trust).toBeDefined();
    expect(
      /Until 2026-08-30 this page carried a SOC 2 Type I commitment/.test(trust!.text),
      `src/pages/trust.astro lost the dated record of the withdrawal. Deleting a ` +
        `commitment quietly is not the same as withdrawing it: the sub-processor ` +
        `corrections one section down are recorded for exactly this reason, and a ` +
        `reader of the earlier page is owed the same treatment here.`,
    ).toBe(true);
  });
});

/**
 * The comment that protects this decision must not itself be published.
 *
 * Found the hard way, in this very change. The warning above the compliance card
 * was first written as an `<!-- … -->` in the Astro *template*, quoting the
 * founder's reasoning verbatim. **Astro does not strip template comments** — it
 * strips frontmatter ones. So `dist/trust/index.html` shipped
 * *"the SOC 2 Type I claim was withdrawn … 'we're still finding bugs and
 * security issues'"* as viewable page source, on the security page, to every
 * visitor. The source-level sweep above was green at the time; only reading the
 * built output caught it.
 *
 * The bind is structural, which is why this needs a test rather than care: a
 * warning is only useful to the next editor if it is candid about why, and
 * candour is exactly what must not ship. Frontmatter gets both.
 */
describe("internal notes do not ship to visitors", () => {
  const INTERNAL = /\b(?:founder|plans\/|TODO|FIXME|XXX|HACK|tests\/|internal only)\b/i;

  const templateComments = walk(SRC)
    .filter((p) => p.endsWith(".astro"))
    .flatMap((path) => {
      const raw = readFileSync(path, "utf-8");
      // Everything after the frontmatter fence is emitted as-is.
      const fence = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
      const template = fence ? raw.slice(fence[0].length) : raw;
      return (template.match(/<!--[\s\S]*?-->/g) ?? []).map((comment) => ({
        rel: relative(ROOT, path).replace(/\\/g, "/"),
        comment: squash(comment),
      }));
    });

  it("no template comment carries an internal marker", () => {
    const leaks = templateComments.filter((c) => INTERNAL.test(c.comment));
    expect(
      leaks.map((l) => `${l.rel}: ${l.comment.slice(0, 160)}`),
      `An <!-- HTML comment --> in an Astro template is SERVED to visitors; only ` +
        `frontmatter comments are stripped. These name a founder decision, an ` +
        `internal path or a TODO, which means they are notes to the next editor — ` +
        `move them above the --- fence, where Astro drops them.`,
    ).toEqual([]);
  });

  it("the sweep looked at real template comments", () => {
    // Absence-only again. If the frontmatter split ever over-matched, every
    // template comment would vanish and this test would pass by seeing nothing.
    expect(
      templateComments.length,
      "no template comments found at all — the frontmatter split is eating the template",
    ).toBeGreaterThan(10);
  });

  it("the marker matcher fires on the comment that actually leaked", () => {
    const leaked =
      "<!-- ⚠️ Do not restore a certification date here. The SOC 2 Type I claim " +
      "was withdrawn on 2026-08-30 by founder decision: \"we're still finding bugs " +
      "and security issues.\" plans/product/SPEC_SOC2_ROADMAP.md is parked. " +
      "tests/compliance-claims.test.ts sweeps every file under src/. -->";
    expect(INTERNAL.test(squash(leaked)), "matcher is inert against the real leak").toBe(true);
  });
});

/**
 * Controls. Every assertion above is a count-is-zero or a string-is-present, and
 * both shapes pass happily against an empty file list or a bad path.
 */
describe("controls", () => {
  it("the sweep actually read the tree", () => {
    expect(FILES.length, "walk(src) found almost nothing — check EXTENSIONS and SRC").toBeGreaterThan(
      100,
    );
  });

  it("stripping comments did not swallow the pages", () => {
    // Every forbidden assertion is a count-is-zero, so an over-greedy stripper
    // would make the whole suite pass by deleting the corpus. Pin both the ratio
    // and a distinctive rendered sentence from each file the claim lived in —
    // the ratio catches gradual erosion, the sentences catch a total wipe.
    const RENDERED: Array<[string, string]> = [
      ["src/pages/trust.astro", "We hold no SOC 2 attestation"],
      ["src/components/Pricing.astro", "Priority support with SLA"],
      ["src/content/blog/pricing-v2-math-and-why.md", "The tiers haven't moved; the meter has."],
    ];
    for (const [rel, sentence] of RENDERED) {
      const f = FILES.find((x) => x.rel === rel)!;
      expect(f.text, `${rel} lost rendered content to stripComments()`).toContain(sentence);
      expect(
        f.text.length / f.raw.length,
        `stripComments() removed most of ${rel}. A count-is-zero sweep over an ` +
          `emptied corpus passes for the wrong reason.`,
      ).toBeGreaterThan(0.5);
    }
  });

  it("the sweep reached every file the claim was found in", () => {
    // Not a formality. Three of the four sites were missed by the grep that
    // opened this work, each for a different structural reason: a meta
    // description is not body text, a component is not a page, and a four-month
    // -old blog post is not where anyone looks for a compliance claim. If a
    // future refactor moves one of these, this test must fail rather than
    // quietly stop covering it.
    const mustCover = [
      "src/pages/trust.astro",
      "src/components/Pricing.astro",
      "src/content/blog/pricing-v2-math-and-why.md",
    ];
    for (const rel of mustCover) {
      expect(
        FILES.some((f) => f.rel === rel),
        `${rel} was not in the swept set. It carried the SOC 2 claim on 2026-08-30; ` +
          `if it moved, point this list at the new path.`,
      ).toBe(true);
    }
  });

  it("every forbidden matcher fires on the copy it was written against", () => {
    // A negative assertion that has never matched anything has not been shown to
    // work. These are the verbatim strings that were live on datanika.io on
    // 2026-08-30, before this change.
    const preFix: Record<string, string> = {
      "SOC 2 described as in progress / underway":
        "Hosted in the EU, open-source and auditable, SOC 2 Type I in progress.",
      "an intention to obtain SOC 2":
        "We are actively working toward SOC 2 Type I certification with a target completion in Q3 2026.",
      "a stated completion target for SOC 2":
        "We are actively working toward SOC 2 Type I certification with a target completion in Q3 2026.",
      "a calendar quarter or year attached to SOC 2":
        "We are actively working toward SOC 2 Type I certification with a target completion in Q3 2026.",
      "Type II queued behind Type I":
        "SOC 2 Type I is still in progress, Type II right behind it.",
      "a percentage of controls claimed as implemented":
        "with approximately 65% of controls already implemented in code",
    };

    for (const { label, re } of FORBIDDEN) {
      const sample = preFix[label];
      expect(sample, `no pre-fix sample recorded for "${label}"`).toBeDefined();
      expect(re.test(sample), `matcher for "${label}" is inert — it does not match the copy it retired`).toBe(
        true,
      );
    }
  });

  it("the Enterprise pricing bullet no longer carries a compliance promise", () => {
    // The bullet lived in a shared component, so it rendered on the homepage as
    // well as /pricing. Pinned separately from the sweep because the sweep would
    // also pass if Pricing.astro were deleted.
    const pricing = FILES.find((f) => f.rel === "src/components/Pricing.astro");
    expect(pricing, "src/components/Pricing.astro was not read").toBeDefined();
    expect(pricing!.text).toContain("Enterprise");
    expect(
      /SOC\s*2/i.test(pricing!.text),
      `src/components/Pricing.astro mentions SOC 2 again. This component renders on ` +
        `BOTH the homepage and /pricing, so a bullet added here is a claim on two pages.`,
    ).toBe(false);
  });
});
