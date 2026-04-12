/**
 * Validates the 3 scheduled draft posts exist in the build output.
 * Draft posts with draft: true are excluded from the blog index and
 * not built by Astro in production builds. These tests verify the
 * source files exist and have correct frontmatter via a quick parse.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const BLOG_DIR = resolve(__dirname, "../src/content/blog");

function readFrontmatter(filename: string): Record<string, string> {
  const file = resolve(BLOG_DIR, filename);
  expect(existsSync(file), `Missing: ${filename}`).toBe(true);
  const content = readFileSync(file, "utf-8");
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  expect(fmMatch, `No frontmatter in ${filename}`).not.toBeNull();
  const fm: Record<string, string> = {};
  for (const line of fmMatch![1].split("\n")) {
    const m = line.match(/^(\w+):\s*(.+)/);
    if (m) fm[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return fm;
}

const scheduledPosts = [
  { file: "security-tests-before-launch.md", date: "2026-04-15", category: "engineering", titleContains: "Security Tests" },
  { file: "billing-provider-migration.md", date: "2026-04-18", category: "engineering", titleContains: "Payment Provider" },
  { file: "temp-file-cleanup.md", date: "2026-04-21", category: "engineering", titleContains: "Filled My Disk" },
];

describe("scheduled draft posts", () => {
  for (const post of scheduledPosts) {
    describe(post.file, () => {
      const fm = readFrontmatter(post.file);

      it("has draft: true", () => {
        expect(fm.draft).toBe("true");
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

describe("draft posts are NOT in the built blog index", () => {
  it("blog index does not contain draft post titles", () => {
    const indexFile = resolve(__dirname, "../dist/blog/index.html");
    if (!existsSync(indexFile)) return; // skip if dist not built
    const html = readFileSync(indexFile, "utf-8");
    expect(html).not.toContain("109 Security Tests");
    expect(html).not.toContain("Payment Provider, Then Ripped");
    expect(html).not.toContain("Silently Filled My Disk");
  });
});
