/**
 * landing#505 — a banned phrase must be unfindable in what a READER receives,
 * not merely in the raw bytes of `dist/`.
 *
 * ## The class
 *
 * `tests/kafka-auth-claims.test.ts` shipped a ban that could not fire from the
 * day it was written: the payload it forbade lives inside a fenced code block,
 * Shiki wraps every token of a fence in its own `<span>`, and the pattern needed
 * two of those tokens adjacent. The assertion whose own comment called `dist/`
 * *"what a reader receives, and the primary one"* was the incapable one.
 *
 * Sweeping for it found two more (`connector-count-dist`, `run-retention-claims`),
 * each measured by mutating a real page and rebuilding — GREEN on the marked-up
 * violation, RED on the identical violation in plain prose.
 *
 * ## What this file adds that fixing those three does not
 *
 * Those fixes are three edits. This is the part that does not depend on the next
 * person having read the issue: **every multi-token phrase this suite bans is
 * re-run over the inline-stripped text of every built page.** A phrase rendered
 * in a form its own guard cannot see is caught here, in the file whose whole
 * subject is that failure mode.
 *
 * It needs no allowlist, because it asserts nothing about how a guard is written
 * — only that its subject is genuinely absent from the page a reader gets. A ban
 * that is already correct costs one extra scan and stays green.
 *
 * ## ⚠️ Instrument defects, declared
 *
 * 1. **String literals only.** It extracts the argument of `.not.toContain("…")`.
 *    `kafka-auth-claims.test.ts`'s own bans are *regex* literals and are NOT
 *    covered — the regex half needs a per-ban registry and is deliberately not
 *    claimed here. Do not read a green from this file as "every ban is safe".
 * 2. **It sees the phrase, not the rule.** A ban with a legitimate exemption
 *    (an allowed historical quotation) would surface here as a hit. That has not
 *    happened yet; when it does, the fix is an entry with a reason, in the shape
 *    the other guards in this suite already use — never a loosened matcher.
 * 3. It cannot know which pages a given test file reads, so it scans all of them.
 *    That makes it strictly broader than the guard it backs up, and a hit names
 *    the page so the judgement is cheap.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, extname, relative } from "path";
import { inlineText } from "./helpers/rendered-text";

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");
const TESTS = resolve(ROOT, "tests");

function walkHtml(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walkHtml(full, out);
    else if (extname(entry) === ".html") out.push(full);
  }
  return out;
}

/** `.not.toContain("…")` / `.not.toContain('…')`, single-line form. */
const BAN_LITERAL = /\.not\.toContain\(\s*(["'])((?:\\.|(?!\1)[^\\])+)\1\s*\)/g;

/**
 * A phrase is in scope when it requires two word characters separated by
 * whitespace — that adjacency is exactly what a renderer breaks. Single-token
 * bans (`"aggregateRating"`, `href="/docs/api"`, a slug) cannot be split and are
 * out of scope by construction.
 */
function isMultiToken(s: string): boolean {
  return /\w\s+\w/.test(s);
}

type Ban = { file: string; phrase: string };

function collectBans(): Ban[] {
  const bans: Ban[] = [];
  for (const name of readdirSync(TESTS)) {
    if (!name.endsWith(".test.ts")) continue;
    const src = readFileSync(resolve(TESTS, name), "utf-8");
    // Only files that actually read the build; a ban over source markdown is
    // not subject to this class.
    if (!/\bDIST\b|dist\//.test(src)) continue;
    for (const m of src.matchAll(BAN_LITERAL)) {
      const phrase = m[2].replace(/\\(["'\\])/g, "$1");
      if (isMultiToken(phrase)) bans.push({ file: name, phrase });
    }
  }
  return bans;
}

describe("no banned phrase survives in the text a reader receives (#505)", () => {
  const pages = existsSync(DIST) ? walkHtml(DIST) : [];
  const bans = collectBans();

  it("dist/ exists and holds a plausible number of pages", () => {
    // A walk that finds nothing reports zero violations, which reads exactly
    // like a clean sweep.
    expect(pages.length, "run `npm run build` first").toBeGreaterThan(100);
  });

  it("found a non-trivial set of multi-token bans to check (guards a dead extractor)", () => {
    // If the extractor rots — a formatter wraps `.not.toContain(` onto two lines,
    // say — it returns zero bans and this whole file passes by checking nothing.
    // That is the exact shape of defect it exists to catch, so it must fail loudly.
    expect(
      bans.length,
      "no multi-token `.not.toContain(\"…\")` bans were extracted from the dist-reading " +
        "tests. Either they all became regexes (fine — say so here) or BAN_LITERAL no " +
        "longer matches the source, in which case this file is asserting nothing.",
    ).toBeGreaterThan(3);
  });

  it("every banned phrase is absent from the inline-stripped text of every built page", () => {
    const texts = pages.map((p) => [relative(DIST, p).split("\\").join("/"), inlineText(readFileSync(p, "utf-8"))] as const);
    const violations: string[] = [];
    for (const ban of bans) {
      for (const [rel, text] of texts) {
        if (!text.includes(ban.phrase)) continue;
        // Only report what the guard itself would MISS: if the phrase is also in
        // the raw bytes, that guard can already see it and this is its business.
        const raw = readFileSync(resolve(DIST, rel), "utf-8");
        if (raw.includes(ban.phrase)) continue;
        violations.push(`dist/${rel} renders "${ban.phrase}", which ${ban.file} bans — but only ${ban.file} can no longer see it, because the renderer split it`);
      }
    }
    expect(
      violations,
      "A phrase this suite forbids is on a built page in a form its own guard cannot match. " +
        "The guard is green and the page is wrong — the defect landing#505 was opened for.\n" +
        violations.join("\n"),
    ).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Arming. Both directions, in-suite, so the discrimination is re-proved on
  // every run rather than asserted from the session that measured it once.
  // -------------------------------------------------------------------------

  it("the predicate FIRES on a phrase the renderer split (positive control)", () => {
    // Shiki's real output shape for a fence, with a banned phrase inside it.
    const split =
      '<pre class="astro-code" data-language="bash"><code><span class="line">' +
      '<span style="color:#B392F0">docker</span><span style="color:#E1E4E8"> </span>' +
      '<span style="color:#9ECBFF">pull datanika</span></span></code></pre>';
    const phrase = "docker pull datanika";
    expect(split.includes(phrase), "control is malformed: the raw HTML must NOT contain it").toBe(
      false,
    );
    expect(
      inlineText(split).includes(phrase),
      "inlineText failed to reassemble a phrase Shiki split — this whole file is inert",
    ).toBe(true);
  });

  it("the predicate does NOT fire across a block boundary (false-positive control)", () => {
    // Two table cells are not a sentence. Without this, "read the reader's text"
    // would be satisfied by a blanket tag strip that manufactures violations.
    const cells = "<tr><td>docker</td><td>pull datanika</td></tr>";
    expect(
      inlineText(cells).includes("docker pull datanika"),
      "inlineText glued two block elements into one phrase — it must strip inline tags only",
    ).toBe(false);
  });

  it("the multi-token filter excludes what a renderer cannot split", () => {
    expect(isMultiToken('"@type":"Article"')).toBe(false);
    expect(isMultiToken("aggregateRating")).toBe(false);
    expect(isMultiToken("/docs/api-keys")).toBe(false);
    expect(isMultiToken("Templates with MongoDB")).toBe(true);
    expect(isMultiToken("--url http://localhost:3000")).toBe(true);
  });
});
