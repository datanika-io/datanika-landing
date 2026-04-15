/**
 * Unit tests for the `isPostVisible` filter (#192 / G6).
 *
 * Verifies the 3 canonical cases:
 *   1. Past-dated publishedAt → visible
 *   2. Future-dated publishedAt → hidden
 *   3. Undated post → visible (back-compat)
 *
 * Also verifies explicit draft: true still hides regardless of
 * publishedAt, so existing draft posts aren't affected.
 */
import { describe, it, expect } from "vitest";
import { isPostVisible } from "../src/utils/blog-visibility";

const NOW = new Date("2026-04-16T12:00:00.000Z");

describe("isPostVisible", () => {
  describe("publishedAt semantics", () => {
    it("hides a post with publishedAt in the future", () => {
      expect(
        isPostVisible({ publishedAt: new Date("2026-04-18T00:00:00.000Z") }, NOW),
      ).toBe(false);
    });

    it("shows a post with publishedAt in the past", () => {
      expect(
        isPostVisible({ publishedAt: new Date("2026-04-10T00:00:00.000Z") }, NOW),
      ).toBe(true);
    });

    it("shows a post with publishedAt equal to now", () => {
      expect(isPostVisible({ publishedAt: NOW }, NOW)).toBe(true);
    });

    it("shows a post with no publishedAt (back-compat)", () => {
      expect(isPostVisible({}, NOW)).toBe(true);
    });
  });

  describe("draft semantics", () => {
    it("hides a post with draft: true", () => {
      expect(isPostVisible({ draft: true }, NOW)).toBe(false);
    });

    it("hides draft: true even if publishedAt is in the past", () => {
      expect(
        isPostVisible(
          { draft: true, publishedAt: new Date("2026-04-10T00:00:00.000Z") },
          NOW,
        ),
      ).toBe(false);
    });

    it("shows a post with draft: false", () => {
      expect(isPostVisible({ draft: false }, NOW)).toBe(true);
    });
  });

  describe("default now parameter", () => {
    it("uses new Date() when now is not provided", () => {
      const farFuture = new Date("2099-01-01T00:00:00.000Z");
      const farPast = new Date("2000-01-01T00:00:00.000Z");
      expect(isPostVisible({ publishedAt: farFuture })).toBe(false);
      expect(isPostVisible({ publishedAt: farPast })).toBe(true);
    });
  });
});
