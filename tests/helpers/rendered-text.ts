/**
 * Reading a built page the way a reader reads it — landing#505.
 *
 * ## The defect this exists to remove
 *
 * A ban expressed as a multi-token pattern against **raw** `dist/` HTML cannot
 * fire, because the renderer puts markup between the tokens. Shiki wraps every
 * token of a fenced code block in its own `<span>`; ordinary `**emphasis**` and
 * `` `code` `` do the same to a sentence. So a guard that reads raw HTML is
 * asserting something about the *markup*, not about the claim a reader receives.
 *
 * Measured on the real build, one mutation per build so each result names its
 * cause (landing#505):
 *
 * | the violation, written the way copy is actually written | its guard |
 * |---|---|
 * | `We now ship **47** connectors in total.` | GREEN — blind |
 * | `We now ship 48 connectors in total.`     | RED (positive control) |
 * | `Run history is **purged** after 90 days.`| GREEN — blind |
 * | `Run history is purged after 45 days.`    | RED (positive control) |
 *
 * The first instance was `tests/kafka-auth-claims.test.ts`, where the assertion
 * whose own comment called `dist/` *"what a reader receives, and the primary
 * one"* was the one that could not fail.
 *
 * ## Why INLINE tags only, and not a blanket strip
 *
 * A blanket `replace(/<[^>]*>/g, "")` turns `<td>36</td><td>connectors</td>` into
 * `36connectors`, and the `" "` variant turns it into `36 connectors` — a false
 * positive manufactured out of two unrelated table cells. Inline elements are
 * exactly the ones that split a phrase a reader sees as continuous; block
 * elements are real separations and must stay. `<br>`/`<wbr>` are deliberately
 * NOT stripped for the same reason: they separate.
 */

/**
 * HTML inline elements, minus `br`/`wbr`. `span` covers Shiki's per-token
 * wrappers and `code`/`pre` pairs cover fenced blocks — `pre` is left standing
 * because it is a genuine boundary between a fence and the prose around it.
 */
const INLINE_TAGS =
  "a|abbr|b|bdi|bdo|cite|code|data|del|dfn|em|i|ins|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var";

const INLINE_TAG_RE = new RegExp(`</?(?:${INLINE_TAGS})(?:\\s[^>]*)?>`, "gi");

/**
 * The built page as a reader receives it: inline markup removed, the entities a
 * renderer inserts decoded.
 *
 * `&lt;`/`&gt;` are deliberately left encoded. Decoding them would put literal
 * `<` back into the text, and several bans in this suite use `[^.<]` as a
 * "do not cross a tag boundary" bridge — a decoded `&lt;` would stop them for
 * the wrong reason.
 */
export function inlineText(html: string): string {
  return html
    .replace(INLINE_TAG_RE, "")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Renderings copied out of a real build, not invented.
 *
 * A control written from the same mental model as the check agrees with the
 * check including where the check is wrong, so every shape below was lifted from
 * `dist/` verbatim and then had its payload swapped:
 *
 *   - `<strong>`  from `dist/blog/pricing-v2-math-and-why/index.html`
 *   - `<code>`    from `dist/docs/connectors/kafka/index.html`
 *   - Shiki spans from `dist/docs/connectors/snowflake/index.html`
 */
export type Rendering = { how: string; wrap: (payload: string) => string };

export const RENDERINGS: Rendering[] = [
  { how: "plain prose", wrap: (s) => `<p>${s}</p>` },
  {
    how: "one word emphasised",
    wrap: (s) => `<p>${s.replace(/(\w+)/, "<strong>$1</strong>")}</p>`,
  },
  {
    how: "one word in inline code",
    wrap: (s) => `<p>${s.replace(/(\w+)/, "<code>$1</code>")}</p>`,
  },
  {
    how: "a non-breaking space",
    wrap: (s) => `<p>${s.replace(/(\S)\s+(\S)/, "$1&nbsp;$2")}</p>`,
  },
  {
    how: "a Shiki-highlighted fence",
    wrap: (s) =>
      `<pre class="astro-code github-dark" style="background-color:#24292e;color:#e1e4e8; overflow-x: auto;" tabindex="0" data-language="json"><code><span class="line">` +
      s
        .split(/(\s+)/)
        .map(
          (t) =>
            `<span style="color:#${/^\s+$/.test(t) ? "E1E4E8" : "79B8FF"}">${t.replace(/"/g, "&quot;")}</span>`,
        )
        .join("") +
      `</span></code></pre>`,
  },
];

/**
 * How to arm a ban with these, in-suite:
 *
 * ```ts
 * const missed = RENDERINGS.filter((r) => !myPredicate(r.wrap(violatingSample)))
 *                          .map((r) => r.how);
 * expect(missed).toEqual([]);
 * ```
 *
 * 🔑 Call the **predicate the sweep itself calls**, not the regex beside it. A
 * control that re-applies the pattern independently proves the pattern works and
 * says nothing about whether the sweep still reads through `inlineText` — so the
 * fix can be reverted under a green control. That is core#1055's lesson: a token
 * check is not a branch check.
 *
 * A convenience wrapper taking a bare `RegExp` was written for this and then
 * removed: it invited exactly the wrong call site, and an exported helper nothing
 * calls has never been shown to work.
 */

/**
 * Shapes a ban must NOT match: two separate block-level cells that only look
 * adjacent once tags are gone. Without this control, "fix the blindness" would
 * be satisfied by a blanket strip that invents violations out of tables.
 */
export const BLOCK_SEPARATED: ((payload: string) => string)[] = [
  (s) => `<tr><td>${s.split(/\s+/)[0]}</td><td>${s.split(/\s+/).slice(1).join(" ")}</td></tr>`,
  (s) => `<li>${s.split(/\s+/)[0]}</li><li>${s.split(/\s+/).slice(1).join(" ")}</li>`,
];
