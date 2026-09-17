/**
 * landing#611: no text on this site uses a grey too dark to read on its grounds.
 *
 * What happened. axe-core 4.13.0 (the version QA's core#720 sweep runs), at Desktop
 * Chrome's 1280x720, over 26 built pages of `dev` at ba968e5, one of every page
 * template, reported 292 color-contrast failures:
 *
 *   282  text-slate-500 (#62748e)  3.68 to 4.18:1
 *     6  text-slate-600 (#45556c)  2.46 to 2.60:1
 *     4  Shiki's code-comment colour, #6a737d on #24292e, 3.04:1 (not a class)
 *
 * against the 4.5:1 that text under 24px (18.66px bold) needs. The grounds were the
 * page, #0a0a0f, and the cards over it, #0c101d to #1c0e33. The three pages QA scans
 * failed only this way: 5 on the home page, 2 on /pricing, 7 on /docs.
 *
 * After text-slate-500 and text-slate-600 became text-slate-400 (#90a1b9), the same
 * 26 pages report 4 failures, all of them the Shiki comment colour.
 *
 * The site has no light surface, so a grey from 500 down fails wherever it is
 * used. The ban therefore covers the whole neutral scale and every variant prefix
 * (hover:, placeholder:), not just the two classes that were found.
 *
 * If a light surface is ever added and needs dark text, measure that element and
 * give it an explicit exemption here with the ratio. Do not loosen the pattern.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { resolve, extname, relative, sep } from "path";

const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "src");

/** A neutral grey from 500 down, as a text colour, with or without a variant prefix. */
const DARK_GREY_TEXT = /\btext-(?:slate|gray|zinc|neutral|stone)-(?:500|600|700|800|900|950)\b/g;

/**
 * Files that carry class names. Markdown content is excluded on purpose: a post
 * about Tailwind may name a class in prose or code without using it.
 */
const CLASS_BEARING = new Set([".astro", ".ts", ".tsx", ".js", ".mjs", ".css"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CLASS_BEARING.has(extname(entry))) out.push(full);
  }
  return out;
}

describe("no dark-grey text colour in the source (landing#611)", () => {
  const files = walk(SRC);
  const source = new Map(files.map((f) => [relative(ROOT, f).split(sep).join("/"), readFileSync(f, "utf-8")]));

  it("the pattern catches every form the defect took, and nothing else", () => {
    const hits = (s: string) => s.match(DARK_GREY_TEXT) ?? [];
    expect(hits('<p class="text-sm text-slate-500">')).toHaveLength(1);
    expect(hits('<span class="text-slate-600">&rarr;</span>')).toHaveLength(1);
    expect(hits('class="hover:text-gray-600 placeholder:text-zinc-500"')).toHaveLength(2);
    expect(hits('class="text-slate-400 text-slate-50 bg-slate-500 border-slate-600 text-violet-500"')).toEqual([]);
  });

  it("reads the source it claims to (guards a walk that finds nothing)", () => {
    // text-slate-400 is the replacement colour, so a scan that sees class names at
    // all must find it many times.
    const replacement = [...source.values()].reduce(
      (n, s) => n + (s.match(/\btext-slate-400\b/g) ?? []).length,
      0,
    );
    expect(files.length).toBeGreaterThan(50);
    expect(replacement).toBeGreaterThan(100);
  });

  it("no file uses a grey from 500 down as a text colour", () => {
    const violations: string[] = [];
    for (const [path, text] of source) {
      const lines = text.split(/\r?\n/);
      lines.forEach((line, i) => {
        for (const m of line.matchAll(DARK_GREY_TEXT)) violations.push(`${path}:${i + 1} ${m[0]}`);
      });
    }
    expect(
      violations,
      "These greys measure under 4.5:1 on this site's dark grounds. Use text-slate-400 or " +
        "lighter:\n" + violations.join("\n"),
    ).toEqual([]);
  });
});
