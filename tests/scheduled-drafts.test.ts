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

describe("future-dated posts are NOT in the built blog index", () => {
  it("blog index does not contain scheduled post titles", () => {
    const indexFile = resolve(__dirname, "../dist/blog/index.html");
    if (!existsSync(indexFile)) return; // skip if dist not built
    const html = readFileSync(indexFile, "utf-8");
    expect(html).not.toContain("Payment Provider, Then Ripped");
    expect(html).not.toContain("Silently Filled My Disk");
  });
});
