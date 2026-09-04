/**
 * The site may not tell a reader to pull a container image we do not publish.
 *
 * ## The decision this pins, and its expiry condition
 *
 * `ghcr.io/datanika-io/datanika-core` issues **no anonymous pull token at all**.
 * Measured with a positive control on the same endpoint — our repository answers
 * `UNAUTHORIZED`, `homebrew/core/git` answers with a token — so `v0.1.0`–`v0.1.3`
 * exist and nobody outside the org can fetch them.
 *
 * The package's private visibility is **load-bearing, not an oversight**
 * (core#1014): the image grafts the private `datanika-cloud` tree in at
 * `/cloud/`, so flipping it public would publish a private repository. The
 * founder decided on 2026-09-04 **not to publish an image**, on the measured
 * ground that a self-hoster clones and builds — which is what our own docs
 * already instruct — and Infra is amending `SPEC_RELEASE_VERSIONING`, whose
 * "self-hosters pin a tag/image" promise was the only thing describing an
 * artifact nobody can fetch.
 *
 * 🚨 **Retire this file the day a public image ships, do not weaken it.** It
 * encodes a decision, not a law. A core-only public image is a live option in
 * core#1014 item 3; if it lands, delete this file rather than carving holes in
 * it, so the next reader is never asked to work out which half still applies.
 *
 * ## Why a guard when the site is already clean
 *
 * It is clean today — 0 hits across 160 live production pages and 166 built
 * pages, each with positive controls on the same bytes (`docker compose` 21,
 * `Docker` 33, `git clone` 1). The value is not the current reading; it is that
 * nothing else connects a packaging decision made in the core repo to marketing
 * copy written in this one. That gap is exactly how `/privacy` and `/trust` kept
 * naming Hetzner for six weeks after production moved (#343), and how the Kafka
 * guide documented an auth escape hatch for four and a half months (#486).
 *
 * ## Matching against text, not markup
 *
 * `textOf` strips tags before matching, because a shell command in a Shiki fence
 * reaches `dist/` as one `<span>` per token — `docker`, ` pull`, ` ghcr.io/…` in
 * three separate elements. A pattern spanning a space would match the source and
 * never the built page. That is not hypothetical: it was measured on
 * `tests/kafka-auth-claims.test.ts` the same day this file was written, where a
 * reinstated banned payload left every `dist/`-side assertion green.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (entry.endsWith(".html")) out.push(p);
  }
  return out;
}

/** Tags stripped, so a Shiki-split command reads as the command. */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

/**
 * Each ban carries a raw sample **and** a rendered sample. The rendered one is
 * the control that matters: a pattern tested only against a pre-render string
 * passes while the assertion it certifies cannot fire.
 *
 * ⚠️ Every separator below tolerates whitespace, because `textOf` replaces a tag
 * with a **space** rather than with nothing — deliberately, so that
 * `Docker</p><p>Hub` cannot fuse into a match that no reader ever saw. The cost
 * is that `<code>ghcr.io</code>/<code>datanika-io/…</code>` arrives as
 * `ghcr.io / datanika-io/…`, and a pattern requiring the slash adjacent misses
 * it. The rendered control below caught exactly that in this file's first run.
 */
const BANNED = [
  {
    name: "an instruction to pull our GHCR image",
    re: /docker\s+pull\s+[^\s]*\s*ghcr\.io/i,
    raw: "docker pull ghcr.io/datanika-io/datanika-core:v0.1.3",
    rendered:
      '<span style="color:#B392F0">docker</span><span style="color:#9ECBFF"> pull</span>' +
      '<span style="color:#9ECBFF"> ghcr.io/datanika-io/datanika-core:latest</span>',
  },
  {
    name: "a `docker run` of a registry-qualified Datanika image",
    re: /docker\s+run[\s\S]{0,160}?(?:ghcr\.io|docker\.io)\s*\/\s*\S*datanika/i,
    raw: "docker run -p 3000:3000 ghcr.io/datanika-io/datanika-core:latest",
    rendered:
      '<span>docker</span><span> run</span><span> -p 3000:3000</span>' +
      '<span> ghcr.io/datanika-io/datanika-core:latest</span>',
  },
  {
    name: "a registry path for one of our images",
    re: /(?:ghcr\.io|docker\.io|registry\.hub\.docker\.com)\s*\/\s*datanika/i,
    raw: "Pin ghcr.io/datanika-io/datanika-core:v0.1.0 in production.",
    rendered: '<code>ghcr.io</code><wbr>/<code>datanika-io/datanika-core</code>',
  },
  {
    name: "an `image:` line in compose naming a published Datanika image",
    re: /image:\s*\S*\s*(?:ghcr\.io|docker\.io)\s*\/\s*\S*datanika/i,
    raw: "  image: ghcr.io/datanika-io/datanika-core:latest",
    rendered:
      '<span style="color:#85E89D">image:</span><span style="color:#9ECBFF"> ghcr.io/datanika-io/datanika-core:latest</span>',
  },
  {
    name: "a claim that we publish images to Docker Hub",
    re: /(?:on|to|from)\s+Docker\s*Hub/i,
    raw: "Our images are published to Docker Hub every release.",
    rendered: "<p>Our images are published to <strong>Docker Hub</strong> every release.</p>",
  },
];

describe("no page tells a reader to pull an image we do not publish (core#1014)", () => {
  it("the build exists", () => {
    expect(existsSync(DIST), "run `npm run build` first").toBe(true);
  });

  const files = existsSync(DIST) ? htmlFiles(DIST) : [];
  const pages = files.map((f) => ({ path: f.slice(ROOT.length + 1), text: textOf(readFileSync(f, "utf-8")) }));

  it("the corpus is real (an empty or truncated build must not read as clean)", () => {
    // A zero-hit sweep over zero pages is the same output as a zero-hit sweep
    // over the whole site. `find dist -name '*.html'` returns 165-166 for ~162
    // routes; anything far below that means the walk, not the site, is what
    // came back empty.
    expect(pages.length, "far fewer built pages than this site has routes").toBeGreaterThan(150);
  });

  it("every ban matches its raw sample AND its rendered sample", () => {
    const deadRaw = BANNED.filter((b) => !b.re.test(b.raw)).map((b) => b.name);
    expect(deadRaw, `patterns that stopped matching their raw sample: ${deadRaw.join(", ")}`).toEqual(
      [],
    );
    // 🚨 The half that catches the real failure. Shiki emits one <span> per
    // token, so `docker pull ghcr.io/...` is three elements in `dist/`; a
    // pattern that only ever meets the pre-render string certifies nothing.
    const deadRendered = BANNED.filter((b) => !b.re.test(textOf(b.rendered))).map((b) => b.name);
    expect(
      deadRendered,
      `patterns invisible once rendered — the sweep below cannot fail for them: ${deadRendered.join(", ")}`,
    ).toEqual([]);
  });

  it("the legitimate install path is still documented (anti-vacuity)", () => {
    // If this ever goes to zero the sweep above is passing because the site
    // stopped discussing installation at all — which is a different and worse
    // outcome than an over-claim, and would otherwise read as a clean bill.
    const clone = pages.filter((p) => /git clone[^]{0,80}datanika-core/i.test(p.text));
    expect(clone.length, "no page shows the git-clone install path any more").toBeGreaterThan(0);
    const compose = pages.filter((p) => /docker[- ]compose/i.test(p.text));
    expect(compose.length, "no page mentions docker compose any more").toBeGreaterThan(5);
  });

  it("no built page implies a pullable image", () => {
    const hits: string[] = [];
    for (const page of pages) {
      for (const ban of BANNED) {
        const m = page.text.match(ban.re);
        if (m) hits.push(`${page.path}: ${ban.name} — "${m[0].trim().slice(0, 90)}"`);
      }
    }
    expect(
      hits,
      "A page is telling readers to pull a Datanika container image. There is no anonymously " +
        "pullable image: the GHCR package is private on purpose, because it grafts the private " +
        "datanika-cloud tree in at /cloud/, and the founder decided on 2026-09-04 not to publish " +
        "one — a self-hoster clones and builds. See core#1014. If that decision has since " +
        `reversed, delete this file rather than narrowing it.\n${hits.join("\n")}`,
    ).toEqual([]);
  });
});
