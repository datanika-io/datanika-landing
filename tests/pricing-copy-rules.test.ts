import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { resolve, extname, relative } from "path";

/**
 * `SPEC_PRICING_V2.md` §4.3 bans a short list of words about our own limits.
 * This makes the third instance fail in CI instead of being found by eye.
 *
 * ## Why this exists
 *
 * §4.3, verbatim: *"Do not say 'free tier is generous.' 10 GB is wider than most
 * competitors' Free tiers, but one wide denormalized feed can burn through it in
 * a day — calling it 'generous' on the copy invites the support ticket we don't
 * want ('you said generous'). Keep the copy measured: '10 GB included.' Avoid
 * 'plenty', 'more than enough', 'all the room you need'."*
 *
 * It was violated twice, on live pages, and both were found by reading rather
 * than by a check — which is the definition of a rule that is not enforced:
 *
 *   - `/blog/datanika-rest-api-v1`: "Every plan gets **generous** API limits",
 *     live since 2026-04-10, describing a rate limit that was about to be
 *     enforced at half the value actually being served (landing#366).
 *   - `/blog/stripe-revenue-dashboard-dbt`: "10 GB/month — **plenty** for a small
 *     Stripe account's daily refresh", live since 2026-07-20 (landing#368).
 *
 * ## 🚨 What this test deliberately does NOT enforce
 *
 * §4.3 also says **"Do not say 'unlimited.' Anywhere. Not on any tier, not for
 * any dimension."** That clause contradicts the same spec's own §2.1 tier table,
 * which lists Schedules as *Unlimited* on Pro and Enterprise — as does the
 * pricing page. Enforcing it would fail the build on copy the spec itself
 * prescribes. **The contradiction is real and belongs to whoever next revises
 * §4.3**; a test is not the place to pick a side. Noted in landing#368.
 *
 * The banned list here is only the words with no competing use: they are
 * overselling adjectives about a limit, and there is no context in which we want
 * one.
 */

const ROOT = resolve(__dirname, "..");
const SCAN_DIRS = ["src/pages", "src/content", "src/components", "src/layouts"];
const SCAN_EXT = new Set([".astro", ".md", ".mdx"]);

/** §4.3's list, minus the self-contradicting "unlimited" clause (see header). */
const BANNED: { re: RegExp; word: string }[] = [
  { re: /\bgenerous(ly)?\b/i, word: "generous" },
  { re: /\bplenty\b/i, word: "plenty" },
  { re: /\bmore than enough\b/i, word: "more than enough" },
  { re: /\ball the room you (need|want)\b/i, word: "all the room you need" },
];

/**
 * §4.3 governs how we describe **our own limits**, not the English words. The
 * first run of this test proved the distinction matters: it flagged *"Plenty of
 * teams should still pick managed"* and *"plenty of teams would rather not run
 * infrastructure"* — both about teams, neither about a quota, and deleting
 * either would make the copy worse.
 *
 * So a hit counts only when a limit is being discussed on the same line. That
 * narrows to the actual rule and keeps the test from training people to work
 * around it.
 *
 * Second narrowing, same run: `runs?` in the context list matched the verb in
 * *"would rather not **run** infrastructure"*. The list below is deliberately
 * only the **quantitative** tokens — a sentence that oversells a quota reaches
 * for one of these, and none of them is a common English verb.
 */
const LIMIT_CONTEXT =
  /\b(GB|MB|TB|limits?|quotas?|caps?|tiers?|free plan|free tier|included|rpm|rate[- ]?limits?|seats?|bytes|allowances?|per month|\/mo)\b/i;

/**
 * Deliberate exceptions, each with a reason — same shape as
 * `connector-count-prose.test.ts` and `legal-pages-facts.test.ts`. §4.3 is about
 * how we describe **Datanika's** limits to a buyer, and "generous" has two uses
 * that are not that. Both surfaced on this test's first full run:
 *
 * A third one is not automatically fine. Add an entry only when the sentence is
 * about someone else's limit or about our own cost, never when it is selling
 * ours.
 */
type Allowed = { file: string; contains: string; reason: string };

const ALLOWED: Allowed[] = [
  {
    file: "src/content/connectors/github.md",
    contains: "the rate limit is generous (5,000 requests per hour",
    reason:
      "GitHub's rate limit, not ours. §4.3 governs how we describe our own quotas; " +
      "describing a third party's is ordinary factual copy.",
  },
  {
    file: "src/content/blog/pricing-v2-math-and-why.md",
    contains: "too generous for our margin",
    reason:
      "Points the other way — it says the included volume may be too large for US, " +
      "which is the honest-economics framing §4.3 exists to protect, not an oversell.",
  },
];

function isAllowed(file: string, line: string): boolean {
  return ALLOWED.some((a) => file === a.file && line.includes(a.contains));
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (SCAN_EXT.has(extname(full))) out.push(full);
  }
  return out;
}

const FILES = SCAN_DIRS.flatMap((d) => walk(resolve(ROOT, d)));

describe("SPEC_PRICING_V2 §4.3 — no overselling adjectives about our own limits", () => {
  it("scans a non-trivial number of files (positive control)", () => {
    // A scan that silently finds nothing to read passes vacuously. If this drops,
    // the walk is broken, not the copy.
    expect(FILES.length).toBeGreaterThan(100);
  });

  it.each(BANNED.map((b) => b.word))("no page says %s", (word) => {
    const rule = BANNED.find((b) => b.word === word)!;
    const hits: string[] = [];

    for (const file of FILES) {
      const text = readFileSync(file, "utf-8");
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      text.split(/\r?\n/).forEach((line, i) => {
        if (rule.re.test(line) && LIMIT_CONTEXT.test(line) && !isAllowed(rel, line)) {
          hits.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(
      hits,
      `SPEC_PRICING_V2 §4.3 bans "${word}" about a limit. If a hit is genuinely ` +
        `about something else, narrow the regex — do not delete the rule:\n` +
        hits.join("\n"),
    ).toEqual([]);
  });

  it("every exemption still matches something (no stale exemptions)", () => {
    // An exemption whose text has been rewritten is a hole nobody closed.
    const stale = ALLOWED.filter((a) => {
      const full = resolve(ROOT, a.file);
      try {
        return !readFileSync(full, "utf-8").includes(a.contains);
      } catch {
        return true;
      }
    });
    expect(
      stale,
      `Stale exemptions — the text is gone, so the entry should be too: ${JSON.stringify(stale)}`,
    ).toEqual([]);
  });
});
