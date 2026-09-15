/**
 * A blog post must never link to a post that goes live after it does.
 *
 * Why this exists (landing#564). Rebalancing the scheduled queue MOVES dates,
 * and a future-dated post is excluded from the build entirely
 * (`src/utils/blog-visibility.ts`). So a link from a live post to one that is not
 * live yet is invisible to every build-time check we have:
 * `internal-links-resolve.test.ts` walks `dist/`, and PR CI builds with today's
 * date, so neither end of such a link is in front of it until the day the linking
 * post publishes — from the daily rebuild, which does not run this suite. The
 * link then 404s for every reader until the target's own date arrives, with every
 * check green.
 *
 * The 2026-09-15 rebalance nearly shipped exactly that: the obvious way to free a
 * slot pushed one post two days past a post that links to it. The slot moves are
 * safe by construction only if something reads the links, and remembering to
 * grep is not something.
 *
 * Semantics mirror `isPostVisible`: a draft is never visible; a post with no
 * `publishedAt` is always visible; otherwise it is visible from its `publishedAt`
 * (compared as a UTC date, the same way `scheduled-drafts.test.ts` does). A link
 * is a violation when there is still a day ahead on which its source is live and
 * its target is not. Two posts that are both already live are history, and are
 * not re-litigated here.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";

const BLOG_DIR = resolve(__dirname, "../src/content/blog");
const NEVER = "9999-12-31";
const ALWAYS = "0000-01-01";

interface Post {
  slug: string;
  visibleFrom: string;
  body: string;
  /** `publishedAt:` is present in the frontmatter at all, parsed or not. */
  declaresPublishedAt: boolean;
}

function parsePost(slug: string, text: string): Post {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = m ? m[1] : "";
  const body = m ? text.slice(m[0].length) : text;
  const draft = /^draft:\s*["']?true["']?\s*$/m.test(fm);
  const pub = fm.match(/^publishedAt:\s*["']?(\d{4}-\d{2}-\d{2})["']?\s*$/m);
  return {
    slug,
    body,
    declaresPublishedAt: /^publishedAt:/m.test(fm),
    visibleFrom: draft ? NEVER : pub ? pub[1] : ALWAYS,
  };
}

/**
 * Every `/blog/<slug>` a post points at: inline markdown links, reference-style
 * definitions and raw HTML hrefs, relative or absolute on our own host. `/blog/`
 * on its own is the index, not a post, and is deliberately not matched.
 */
const LINK_PATTERNS: RegExp[] = [
  /\]\(\s*(?:https?:\/\/datanika\.io)?\/blog\/([a-z0-9-]+)\/?(?:#[^)\s]*)?\s*\)/g,
  /^\s*\[[^\]]+\]:\s*(?:https?:\/\/datanika\.io)?\/blog\/([a-z0-9-]+)\/?(?:#\S*)?\s*$/gm,
  /href=["'](?:https?:\/\/datanika\.io)?\/blog\/([a-z0-9-]+)\/?(?:#[^"']*)?["']/g,
];

function linkedSlugs(body: string): string[] {
  const out: string[] = [];
  for (const re of LINK_PATTERNS) {
    for (const m of body.matchAll(re)) out.push(m[1]);
  }
  return out;
}

function linkOrderViolations(posts: Post[], today: string): string[] {
  const bySlug = new Map(posts.map((p) => [p.slug, p]));
  const out: string[] = [];
  for (const src of posts) {
    if (src.visibleFrom === NEVER) continue; // a draft never links to anything a reader sees
    const liveFrom = src.visibleFrom > today ? src.visibleFrom : today;
    for (const target of linkedSlugs(src.body)) {
      const t = bySlug.get(target);
      if (!t) {
        out.push(`${src.slug} -> ${target}: no such post`);
      } else if (t.visibleFrom > liveFrom) {
        const when = t.visibleFrom === NEVER ? "never (draft)" : t.visibleFrom;
        out.push(`${src.slug} (live ${liveFrom}) -> ${target} (live ${when})`);
      }
    }
  }
  return out;
}

const POSTS: Post[] = readdirSync(BLOG_DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => parsePost(f.replace(/\.md$/, ""), readFileSync(resolve(BLOG_DIR, f), "utf-8")));

const TODAY = new Date().toISOString().slice(0, 10);

describe("blog link order — the instrument", () => {
  it("reads a non-trivial corpus, and every declared publishedAt parses", () => {
    expect(POSTS.length).toBeGreaterThan(30);
    // A publishedAt that fails to parse would silently read as "always visible",
    // which is the one reading that can never produce a violation.
    const unparsed = POSTS.filter((p) => p.declaresPublishedAt && p.visibleFrom === ALWAYS);
    expect(unparsed.map((p) => p.slug)).toEqual([]);
  });

  it("finds the links that are really there (guards a dead pattern)", () => {
    // 102 links counted by these patterns on 2026-09-15, and a looser scan for
    // any `/blog/<slug>` in a post body found none they missed. The floor sits
    // well under that so an ordinary edit cannot trip it, and far above what a
    // broken pattern returns, which is zero.
    const total = POSTS.reduce((n, p) => n + linkedSlugs(p.body).length, 0);
    expect(total).toBeGreaterThanOrEqual(40);
  });

  it("every link pattern matches its own sample, and not its neighbours", () => {
    expect(linkedSlugs("see [x](/blog/a-post/) here")).toEqual(["a-post"]);
    expect(linkedSlugs("see [x](https://datanika.io/blog/a-post#part) here")).toEqual(["a-post"]);
    expect(linkedSlugs("[ref]: /blog/a-post/")).toEqual(["a-post"]);
    expect(linkedSlugs('<a href="/blog/a-post/">x</a>')).toEqual(["a-post"]);
    expect(linkedSlugs("[all posts](/blog/)")).toEqual([]);
    expect(linkedSlugs("[x](/docs/blog/a-post/)")).toEqual([]);
    expect(linkedSlugs("[x](https://example.com/blog/a-post/)")).toEqual([]);
  });

  it("can say yes, and does not re-litigate history", () => {
    const p = (slug: string, visibleFrom: string, body = ""): Post => ({
      slug,
      visibleFrom,
      body,
      declaresPublishedAt: true,
    });
    const link = "[b](/blog/b/)";
    const today = "2026-01-01";
    // both scheduled, target later: the defect this file exists for
    expect(linkOrderViolations([p("a", "2999-01-01", link), p("b", "2999-01-03")], today)).toHaveLength(1);
    // both scheduled, target earlier: fine
    expect(linkOrderViolations([p("a", "2999-01-03", link), p("b", "2999-01-01")], today)).toEqual([]);
    // same day: fine, the build shows both
    expect(linkOrderViolations([p("a", "2999-01-01", link), p("b", "2999-01-01")], today)).toEqual([]);
    // both already live: history
    expect(linkOrderViolations([p("a", "2000-01-01", link), p("b", "2000-01-03")], today)).toEqual([]);
    // live now -> scheduled: a broken link today
    expect(linkOrderViolations([p("a", ALWAYS, link), p("b", "2999-01-01")], today)).toHaveLength(1);
    // target is a draft: broken forever
    expect(linkOrderViolations([p("a", "2000-01-01", link), p("b", NEVER)], today)).toHaveLength(1);
    // source is a draft: nobody sees the link
    expect(linkOrderViolations([p("a", NEVER, link), p("b", "2999-01-01")], today)).toEqual([]);
    // target does not exist
    expect(linkOrderViolations([p("a", "2000-01-01", "[z](/blog/zzz/)")], today)).toHaveLength(1);
  });
});

describe("blog link order — the corpus", () => {
  it("no post links to a post that goes live after it", () => {
    const bad = linkOrderViolations(POSTS, TODAY);
    expect(
      bad,
      "These links would 404 from the day the linking post publishes until the target " +
        "goes live. Move the target earlier, move the linking post later, or drop the link:\n" +
        bad.map((b) => `  ${b}`).join("\n"),
    ).toEqual([]);
  });
});
