/**
 * Validates scheduled posts exist in the source tree with the correct
 * `publishedAt` frontmatter, and that future-dated posts are filtered
 * out of the built blog index by the `isPostVisible` helper wired into
 * the 4 `getCollection('blog')` call sites (#192 / G6).
 *
 * Pair with the Infra-owned daily rebuild cron so scheduled posts
 * auto-publish on their target date: when the cron fires and `new Date()`
 * crosses `publishedAt`, the post appears in the next build.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const BLOG_DIR = resolve(__dirname, "../src/content/blog");

function readFrontmatter(filename: string): Record<string, string> {
  const file = resolve(BLOG_DIR, filename);
  expect(existsSync(file), `Missing: ${filename}`).toBe(true);
  const content = readFileSync(file, "utf-8");
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  expect(fmMatch, `No frontmatter in ${filename}`).not.toBeNull();
  const fm: Record<string, string> = {};
  for (const line of fmMatch![1].split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.+)/);
    if (m) fm[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return fm;
}

const scheduledPosts = [
  { file: "billing-provider-migration.md", date: "2026-04-18", publishedAt: "2026-04-18", category: "engineering", titleContains: "Payment Provider" },
  { file: "temp-file-cleanup.md", date: "2026-04-21", publishedAt: "2026-04-21", category: "engineering", titleContains: "Filled My Disk" },
  // Issue #257 / #258 — queued as a staggered pair so they don't land on the
  // same day. The 5-day gap is the point: two posts published together read as
  // a content dump, and the second one buries the first in the index and RSS.
  { file: "sso-saml-oidc-enterprise.md", date: "2026-07-25", publishedAt: "2026-07-25", category: "product", titleContains: "SSO for Enterprise" },
  { file: "why-we-built-datanika.md", date: "2026-07-30", publishedAt: "2026-07-30", category: "company", titleContains: "One Tool Instead of Five" },
  // Issue #261 — third in the queue, same 5-day spacing. Held until 2026-08-04
  // deliberately: the post points at the official MCP registry listing, which
  // only went live 2026-07-21.
  { file: "datanika-mcp-server-launch.md", date: "2026-08-04", publishedAt: "2026-08-04", category: "product", titleContains: "Now an MCP Server" },
  // core#445 write tools. Held while the consent screen still described every
  // grant as read-only (core#450) — announcing "you decide knowingly" would have
  // marketed a property we didn't yet deliver. core#463 fixed the screen and it
  // was verified end-to-end against prod, so this ships 5 days after the MCP
  // launch post rather than colliding with it.
  { file: "mcp-write-tools-consent-scope.md", date: "2026-08-09", publishedAt: "2026-08-09", category: "product", titleContains: "If You Say So Once" },
  // Founder decision 2026-08-30: at most one post every two days. Four posts
  // landed on 2026-08-30 because agents produce in bursts and readers do not.
  // Three were rescheduled to 09-01 / 09-03 / 09-05; the fourth
  // (mongodb-authentication-failed-authsource) stayed on 08-30 because
  // src/content/connectors/mongodb.md links to it twice from a live page —
  // hiding it would have 404'd a shipped internal link, which is the exact
  // defect tests/internal-links-resolve.test.ts exists to prevent.
  //
  // Safe to reschedule only because all four were `URL is unknown to Google,
  // lastCrawl=never` when the decision was made. The publishedAt filter removes
  // a post from static paths as well as listings, so a future date on a CRAWLED
  // post is a 404, not a delay. Re-verify crawl state before moving any post.
  { file: "password-reset-and-change.md", date: "2026-09-01", publishedAt: "2026-09-01", category: "changelog", titleContains: "password reset and password change are live" },
  { file: "dbt-incremental-duplicates-null-unique-key.md", date: "2026-09-03", publishedAt: "2026-09-03", category: "engineering", titleContains: "Duplicate Rows When" },
  { file: "trigger-pipelines-from-ci-cd.md", date: "2026-09-05", publishedAt: "2026-09-05", category: "tutorial", titleContains: "Triggering Data Pipelines from CI/CD" },
];

const publishedScheduledPosts = [
  { file: "security-tests-before-launch.md", date: "2026-04-15", category: "engineering", titleContains: "Security Tests" },
];

describe("scheduled posts with publishedAt in the future", () => {
  for (const post of scheduledPosts) {
    describe(post.file, () => {
      const fm = readFrontmatter(post.file);

      it(`has publishedAt ${post.publishedAt}`, () => {
        expect(fm.publishedAt).toBe(post.publishedAt);
      });

      it("does NOT have draft: true (migrated to publishedAt pattern)", () => {
        expect(fm.draft).toBeUndefined();
      });

      it(`has date ${post.date}`, () => {
        expect(fm.date).toBe(post.date);
      });

      it(`has category ${post.category}`, () => {
        expect(fm.category).toBe(post.category);
      });

      it("has title", () => {
        expect(fm.title).toContain(post.titleContains);
      });
    });
  }
});

describe("published scheduled posts have draft: false", () => {
  for (const post of publishedScheduledPosts) {
    describe(post.file, () => {
      const fm = readFrontmatter(post.file);

      it("has draft: false", () => {
        expect(fm.draft).toBe("false");
      });

      it(`has date ${post.date}`, () => {
        expect(fm.date).toBe(post.date);
      });

      it("has title", () => {
        expect(fm.title).toContain(post.titleContains);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// The four surfaces the schema docstring promises publishedAt filters:
// listings, RSS, OG, and the post's own static path. Verified in all four on
// 2026-08-30 against a real build, plus the sitemap (which @astrojs/sitemap
// derives from static paths, so it follows for free — asserted anyway, because
// "follows for free" is how the /scripts/benchmark 404 survived four months).
// ---------------------------------------------------------------------------
const DIST = resolve(__dirname, "../dist");
const slugOf = (file: string) => file.replace(/\.md$/, "");

describe("future-dated posts are absent from every published surface", () => {
  // Date-aware: only assert absence for posts whose publishedAt is still
  // in the future. On the publish day itself (publishedAt == today), the
  // post correctly appears and must be excluded from the absence check.
  // Mirrors the isPostVisible helper logic.
  const today = new Date().toISOString().slice(0, 10);
  const futureDrafts = scheduledPosts.filter((p) => p.publishedAt > today);
  const built = existsSync(resolve(DIST, "blog/index.html"));

  // POSITIVE CONTROL. Every assertion below is an absence, and absence is
  // exactly what an empty or missing artifact produces — so without this, a
  // build that emitted nothing would pass the whole suite. This anchor post
  // has no publishedAt, so it is unconditionally visible; if it is missing,
  // the artifacts are not trustworthy and the absence checks prove nothing.
  const ANCHOR = { slug: "introducing-datanika", titleFragment: "Introducing Datanika" };

  it("dist/ was built and contains the anchor post (control for the absence checks)", () => {
    expect(built, "dist/blog/index.html missing — run `npm run build` first").toBe(true);
    expect(existsSync(resolve(DIST, `blog/${ANCHOR.slug}/index.html`))).toBe(true);
    expect(readFileSync(resolve(DIST, "blog/index.html"), "utf-8")).toContain(
      ANCHOR.titleFragment,
    );
    expect(readFileSync(resolve(DIST, "rss.xml"), "utf-8")).toContain(ANCHOR.slug);
    expect(existsSync(resolve(DIST, `og/blog/${ANCHOR.slug}.png`))).toBe(true);
    expect(readFileSync(resolve(DIST, "sitemap-0.xml"), "utf-8")).toContain(ANCHOR.slug);
  });

  for (const post of futureDrafts) {
    const slug = slugOf(post.file);
    describe(`${post.file} (publishedAt ${post.publishedAt}, still future)`, () => {
      it("has no static path of its own", () => {
        expect(existsSync(resolve(DIST, `blog/${slug}/index.html`))).toBe(false);
      });
      it("is not in the blog index", () => {
        expect(readFileSync(resolve(DIST, "blog/index.html"), "utf-8")).not.toContain(
          post.titleContains,
        );
      });
      it("is not in the RSS feed", () => {
        expect(readFileSync(resolve(DIST, "rss.xml"), "utf-8")).not.toContain(slug);
      });
      it("has no OG image generated", () => {
        expect(existsSync(resolve(DIST, `og/blog/${slug}.png`))).toBe(false);
      });
      it("is not in the sitemap", () => {
        expect(readFileSync(resolve(DIST, "sitemap-0.xml"), "utf-8")).not.toContain(slug);
      });
    });
  }
});
