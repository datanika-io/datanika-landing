/**
 * core#1404 AC3: the site must not advertise an extract-load that resumes between runs, because
 * an upload does not.
 *
 * ## What was measured
 *
 * QA, on core#1404, 2026-09-17, core `origin/dev` 3a2d414. An upload builds its dlt pipeline under
 * a name that carries the run id, so no run inherits the previous run's state. A Single table
 * upload with **Enable incremental loading** ticked ran twice: run 2 sent a `SELECT` with no
 * `WHERE`, loaded 8 of 8 rows, and under `append`, the form's default, left 13 rows for 8 ids.
 * The control ran the same sequence under one fixed pipeline name. Its run 2 sent
 * `WHERE updated_at >= 50` and loaded 3 rows. Production runs the same naming: `dlt_runner.py`
 * and `upload_tasks.py` read the same on core `master` as on `dev`.
 *
 * The site said the opposite. Its connector reference pages, use cases, a template, two docs
 * pages, six connector guides and five blog posts advertised incremental loading, only new or
 * changed rows, faster later runs, or `append` as safe for a table that only grows. One of the
 * blog posts published incremental timings from `scripts/benchmark/benchmark.py`, which calls dlt
 * directly under the fixed pipeline name `bench_incr`: the control arm above, not the product.
 *
 * ## The invariant
 *
 * While an upload's cursor does not carry from one run to the next, no page a reader can reach,
 * and no post waiting for its publish date, advertises a resuming extract. The pages that document
 * the control say what it does.
 *
 * ## Flip condition: repoint, never delete (WORKFLOW_RULES §5a)
 *
 * core#1404 AC2 is Product's decision: fix the cursor, or stop calling the mode incremental. If the
 * cursor is fixed, the bans below become wrong about the product, and this file goes red on
 * correct copy. That red is the prompt to rewrite the presence checks to the new behaviour and to
 * narrow the bans to what is still false then. Do not delete the file.
 *
 * ## How it reads the site
 *
 * - `dist/`, every page, through `inlineText` (landing#505), so `**emphasis**`, inline code and
 *   Shiki's per-token spans cannot hide a phrase. Meta descriptions and JSON-LD are inside the
 *   HTML, so they are read too.
 * - Every source file under `src/`, because a post dated in the future is absent from `dist/` by
 *   design (landing#527), and a claim in it would first be read on its publish day.
 * - A dated correction note is exempt, and only when it cites core#1404: a correction has to be
 *   able to name the claim it withdraws. The exemption is scoped to that one blockquote.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, extname, relative, sep } from "path";
import { inlineText, RENDERINGS } from "./helpers/rendered-text";

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");
const SRC = resolve(ROOT, "src");
const ISSUE_URL = "https://github.com/datanika-io/datanika-core/issues/1404";

type Ban = { name: string; re: RegExp; samples: string[] };

/**
 * Affirmative shapes only. Each sample was lifted from the pre-fix site, so a pattern that stops
 * matching its own sample fails the control below rather than reporting a clean site.
 */
const BANS: Ban[] = [
  {
    name: "incremental loading, sync or extraction offered as a capability",
    // `Enable incremental loading` is the control's own label in the app, so a guide has to be
    // able to name it. dbt's `incremental model`, `materialization` and `merge strategy` are a
    // different mechanism and are not matched.
    re: /(?<!\benable\s)\bincremental\s+(?:load(?:s|ing)?|sync(?:s|ing|ed)?|extraction|replication|file\s+discovery|merge(?:[\s-]mode)?\s+(?:sync|writes?))\b/i,
    samples: [
      "Supports full-database replication, single-table extraction, and incremental loading.",
      "Incremental sync, dbt transforms, and scheduling built in. Start free.",
      "Incremental extraction for large tables",
      "Supports prefix filtering and incremental file discovery.",
      "Extract any PostgreSQL schema into Google BigQuery with incremental merge-mode writes.",
      "Pre-configured PostgreSQL to BigQuery data pipeline. Incremental merge sync, automatic schema mapping.",
      "Not a toy. Real credentials, real incremental loads, real dbt models with tests.",
    ],
  },
  {
    name: "a load that moves only new or changed rows",
    re: /\bonly\s+(?:(?:sync|move|load|extract|fetch|pull|copy|read|process|transfer)(?:es|s|ing)?\s+)?(?:the\s+)?(?:new|changed|updated|modified)(?:\s*(?:\/|,|or|and)\s*(?:new|changed|updated|modified))?\s+(?:rows|records|data)\b/i,
    samples: [
      "Incremental loading — only sync new/changed rows (configurable)",
      "Subsequent incremental runs are much faster because only new/changed rows move.",
      "Datanika uses it to fetch only new or changed rows since the last run.",
    ],
  },
  {
    name: "a load that avoids a full reload",
    re: /\b(?:without|no|avoid(?:s|ing)?)\s+(?:a\s+|the\s+)?full(?:[\s-]+table)?\s+(?:reloads?|rewrites?|re-?syncs?|re-?extracts?|re-?reads?)\b/i,
    samples: [
      "Schedule incremental syncs to keep Redshift current without full reloads",
      "Switch to merge (incremental) to avoid full table rewrites.",
    ],
  },
  {
    name: "later runs that are faster than the first",
    re: /\b(?:subsequent|later|following|next)\s+(?:incremental\s+)?(?:runs?|syncs?|loads?)\s+(?:are|is|will\s+be|run|take|finish|complete)\s+(?:much\s+|far\s+|significantly\s+)?(?:faster|quicker|shorter)\b/i,
    samples: ["Subsequent incremental runs are much faster because only new/changed rows move."],
  },
  {
    name: "a run that resumes where the previous one stopped",
    re: /\b(?:(?:resum(?:e|es|ing)|picks?\s+up|continu(?:e|es|ing))\s+(?:from\s+)?where\s+(?:the\s+)?(?:last|previous|prior)\s+(?:run|sync|load)|(?:rows|records)\s+(?:added\s+|changed\s+|modified\s+|updated\s+)?since\s+the\s+(?:last|previous|prior)\s+(?:run|sync|load))\b/i,
    samples: [
      "Each scheduled run picks up where the last run left off.",
      "Datanika uses it to fetch only new or changed rows since the last run.",
    ],
  },
  {
    name: "change tracking",
    re: /\b(?:with|supports?|using|via)\s+change\s+tracking\b/i,
    samples: ["Incremental loading with change tracking"],
  },
  {
    name: "extracting incrementally",
    re: /\b(?:extract|load|sync|replicat|ingest|copy|pull)\w*\b[^.<]{0,60}?\bincrementally\b/i,
    samples: ["1. Extract from MySQL — full tables, or incrementally on a monotonic column."],
  },
  {
    name: "merge presented as incremental",
    re: /\bmerge\s*\(\s*incremental\s*\)|\bmerge\b[^.<]{0,20}\bwith\s+an?\s+incremental\s+cursor\b/i,
    samples: [
      "Switch to merge (incremental) to avoid full table rewrites.",
      "Switch to merge with an incremental cursor. For partitioned tables, dlt writes less.",
    ],
  },
  {
    name: "append recommended for a table that only grows",
    re: /\bappend\b[^.<]{0,80}?\b(?:only\s+ever\s+adds?|only\s+adds?|never\s+(?:change|update)s?)\b/i,
    samples: ["If you want a copy you can refresh, choose replace. Keep append for sources that only ever add rows."],
  },
];

/**
 * Honest sentences that name the same words. Each is real copy, and each must stay unmatched,
 * or a ban has become a word ban that fails the next honest correction.
 */
const HONEST: { text: string; where: string }[] = [
  // Markdown pages render apostrophes typographically (U+2019), so the samples do too: the first
  // run of this control used ASCII quotes and reported three real sentences as missing.
  {
    text: "Datanika does not use Zendesk’s incremental export API and keeps no cursor between runs",
    where: "docs/connectors/zendesk/index.html",
  },
  { text: "Build an incremental fact table for orders", where: "use-cases/postgresql-to-snowflake/index.html" },
  {
    text: "dbt’s incremental merge strategy compiles to a MERGE statement",
    where: "blog/dbt-incremental-duplicates-null-unique-key/index.html",
  },
  {
    text: "Its incremental-load primitives, schema evolution, and native typing are good enough",
    where: "blog/real-cost-modern-data-stack/index.html",
  },
  {
    text: "JSON Lines streams incrementally, so even a 5 GB log file won’t blow up memory",
    where: "docs/connectors/json/index.html",
  },
  {
    text: "The cursor does not carry from one run to the next.",
    where: "docs/uploads/index.html",
  },
];

/**
 * dbt incremental models do process only new rows. core#1404 is about uploads, and QA recorded
 * the transformation pages as not affected. Each entry must still match something, so an
 * exemption cannot outlive its reason.
 */
const ALLOWED: { page: string; src: string; ban: string; reason: string }[] = [
  {
    page: "docs/transformations/index.html",
    src: "src/pages/docs/transformations.astro",
    ban: "a load that moves only new or changed rows",
    reason: "the dbt `incremental` materialization row, a transformation mechanism, not an upload",
  },
  {
    page: "docs/transformations-guide/index.html",
    src: "src/pages/docs/transformations-guide.astro",
    ban: "a load that moves only new or changed rows",
    reason: "dbt incremental models, a transformation mechanism, not an upload",
  },
];

/** Exact sentences the fix removed. Zero each, outside a correction note. */
const RETIRED: string[] = [
  "Incremental loading with change tracking",
  "Incremental extraction for large tables",
  "Incremental extraction of large Oracle tables",
  "Incremental loading of new files from S3 buckets",
  "Subsequent incremental runs are much faster",
  "uses cursor-based incremental",
  "The incremental cursor column isn't actually monotonic",
  "useful as incremental cursors",
  "incremental cursor with a start_date",
  "Keep append for sources that only ever add rows",
  "dlt handles schema mapping, type conversion, and incremental loading automatically",
  // Found by reading the guides, not by the bans: a `start_date` field the upload form never had,
  // offered as the reason a run loaded nothing, and a pointer promising a cursor reference.
  "If using incremental with start_date",
  "If using incremental with a start_date",
  "incremental cursor filtered everything out",
  "connection identifiers, incremental cursors, supported versions",
];

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.includes(extname(entry))) out.push(full);
  }
  return out;
}

const relTo = (base: string, file: string) => relative(base, file).split(sep).join("/");
const squash = (s: string) => s.replace(/\s+/g, " ");

/** A dated correction blockquote that cites core#1404. */
function isCorrection(blockText: string, raw: string): boolean {
  const lead = squash(blockText.replace(/<[^>]+>/g, " ")).replace(/^[\s>]+/, "");
  return /^\**Corrected 20\d\d-\d\d-\d\d/.test(lead) && (raw.includes(ISSUE_URL) || raw.includes("core#1404"));
}

/** Built HTML as a reader receives it, with correction blockquotes removed. */
function readerTextOfHtml(html: string): { text: string; exempted: number } {
  let exempted = 0;
  const kept = html.replace(/<blockquote[\s>][\s\S]*?<\/blockquote>/gi, (block) => {
    if (isCorrection(inlineText(block), block)) {
      exempted++;
      return " ";
    }
    return block;
  });
  return { text: squash(inlineText(kept)), exempted };
}

/** Source text with markdown markers and inline tags removed, and correction blockquotes dropped. */
function readerTextOfSource(src: string): { text: string; exempted: number } {
  let exempted = 0;
  const lines = src.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; ) {
    if (/^\s*>/.test(lines[i])) {
      const group: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) group.push(lines[i++]);
      const raw = group.join("\n");
      if (isCorrection(raw, raw)) {
        exempted++;
        continue;
      }
      out.push(...group);
    } else {
      out.push(lines[i++]);
    }
  }
  return { text: squash(inlineText(out.join("\n")).replace(/[*`]/g, "")), exempted };
}

/** The predicate every sweep and every control calls. */
function claimsIn(text: string): { ban: string; match: string }[] {
  const found: { ban: string; match: string }[] = [];
  for (const b of BANS) {
    const m = text.match(new RegExp(b.re.source, b.re.flags.includes("g") ? b.re.flags : b.re.flags + "g"));
    for (const hit of m ?? []) found.push({ ban: b.name, match: hit });
  }
  return found;
}

function allowed(file: string, ban: string): boolean {
  return ALLOWED.some((a) => (a.page === file || a.src === file) && a.ban === ban);
}

const distFiles = existsSync(DIST) ? walk(DIST, [".html", ".xml"]) : [];
const dist = distFiles.map((f) => {
  const { text, exempted } = readerTextOfHtml(readFileSync(f, "utf-8"));
  return { file: relTo(DIST, f), text, exempted };
});
const sourceFiles = walk(SRC, [".md", ".mdx", ".astro", ".ts"]);
const source = sourceFiles.map((f) => {
  const { text, exempted } = readerTextOfSource(readFileSync(f, "utf-8"));
  return { file: relTo(ROOT, f), text, exempted };
});

describe("the site does not advertise an upload that resumes between runs (core#1404)", () => {
  it("reads a real build and a real source tree (anti-vacuity)", () => {
    expect(existsSync(DIST), "run `npm run build` first").toBe(true);
    expect(dist.filter((d) => d.file.endsWith(".html")).length).toBeGreaterThan(100);
    expect(source.filter((s) => s.file.startsWith("src/content/blog/")).length).toBeGreaterThan(40);
  });

  it("every ban matches its own samples, raw and as rendered", () => {
    const dead: string[] = [];
    for (const b of BANS) {
      for (const s of b.samples) {
        if (!claimsIn(squash(s)).some((c) => c.ban === b.name)) dead.push(`${b.name} <- raw: ${s}`);
        for (const r of RENDERINGS) {
          const { text } = readerTextOfHtml(r.wrap(s));
          if (!claimsIn(text).some((c) => c.ban === b.name)) dead.push(`${b.name} <- ${r.how}: ${s}`);
        }
      }
    }
    expect(dead, `a ban cannot see its own sample:\n${dead.join("\n")}`).toEqual([]);
  });

  it("no ban fires on an honest sentence that shares its words", () => {
    const fired = HONEST.flatMap((h) => claimsIn(squash(h.text)).map((c) => `${c.ban} <- ${h.text}`));
    expect(fired, `a ban has become a word ban:\n${fired.join("\n")}`).toEqual([]);
  });

  it("the honest sentences are real copy on the pages named, not invented samples", () => {
    const missing = HONEST.filter((h) => !(dist.find((d) => d.file === h.where)?.text ?? "").includes(h.text)).map(
      (h) => `${h.where}: ${h.text}`,
    );
    expect(missing, `these controls no longer exist where named:\n${missing.join("\n")}`).toEqual([]);
  });

  it("a correction note that cites core#1404 is exempt, and nothing else is", () => {
    const note = `<blockquote><p><strong>Corrected 2026-09-17.</strong> This said incremental loading. See <a href="${ISSUE_URL}">core#1404</a>.</p></blockquote>`;
    const uncited = `<blockquote><p><strong>Corrected 2026-09-17.</strong> This said incremental loading.</p></blockquote>`;
    const plain = `<blockquote><p>Tip: incremental loading keeps it fast.</p></blockquote>`;
    expect(claimsIn(readerTextOfHtml(note).text)).toEqual([]);
    expect(claimsIn(readerTextOfHtml(uncited).text).length).toBe(1);
    expect(claimsIn(readerTextOfHtml(plain).text).length).toBe(1);
    const md = `> **Corrected 2026-09-17.** This said incremental loading ([core#1404](${ISSUE_URL})).\n\nincremental loading`;
    expect(claimsIn(readerTextOfSource(md).text).length, "only the paragraph outside the note may count").toBe(1);
  });

  it("no built page advertises a resuming extract", () => {
    const hits = dist.flatMap((d) =>
      claimsIn(d.text)
        .filter((c) => !allowed(d.file, c.ban))
        .map((c) => `${d.file}: ${c.ban}: "${c.match}"`),
    );
    expect(hits, `core#1404: an upload's cursor does not carry between runs.\n${hits.join("\n")}`).toEqual([]);
  });

  it("no source file advertises one either, scheduled posts included", () => {
    const hits = source.flatMap((s) =>
      claimsIn(s.text)
        .filter((c) => !allowed(s.file, c.ban))
        .map((c) => `${s.file}: ${c.ban}: "${c.match}"`),
    );
    expect(hits, `core#1404: an upload's cursor does not carry between runs.\n${hits.join("\n")}`).toEqual([]);
  });

  it("every exemption is still in use", () => {
    const stale = ALLOWED.filter((a) => {
      const page = dist.find((d) => d.file === a.page);
      const src = source.find((s) => s.file === a.src);
      const used = (t?: string) => !!t && claimsIn(t).some((c) => c.ban === a.ban);
      return !used(page?.text) || !used(src?.text);
    }).map((a) => `${a.page} (${a.reason})`);
    expect(stale, `remove exemptions that no longer match:\n${stale.join("\n")}`).toEqual([]);
  });

  it("no retired sentence is back", () => {
    const hits: string[] = [];
    for (const s of RETIRED) {
      const needle = squash(s).toLowerCase();
      for (const d of dist) if (d.text.toLowerCase().includes(needle)) hits.push(`${d.file}: ${s}`);
      for (const f of source) if (f.text.toLowerCase().includes(needle)) hits.push(`${f.file}: ${s}`);
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("/docs/uploads says the cursor does not carry between runs, once, with the issue", () => {
    const page = dist.find((d) => d.file === "docs/uploads/index.html");
    expect(page, "dist/docs/uploads/index.html is missing").toBeTruthy();
    const html = readFileSync(resolve(DIST, "docs/uploads/index.html"), "utf-8");
    expect((html.match(/id="incremental-cursor"/g) ?? []).length, "expected exactly one #incremental-cursor").toBe(1);
    const rest = html.slice(html.indexOf('id="incremental-cursor"'));
    const end = rest.search(/<h2[\s>]/);
    const sectionHtml = end === -1 ? rest : rest.slice(0, end);
    // The link is an attribute, which inlineText removes with its tag, so read it off the markup.
    expect(sectionHtml).toContain(ISSUE_URL);
    const body = squash(inlineText(sectionHtml));
    expect(body).toMatch(/cursor[^.<]{0,40}\bdoes not carry\b/i);
    expect(body).toMatch(/\bappend\b/);
    expect(body).toMatch(/\bmerge\b/);
  });

  it("every SQL-source guide says what a scheduled run does under append, and links the explanation", () => {
    // Derived, not listed: a guide that documents the Write Disposition control with `append` as
    // its default is a guide whose reader will schedule `append` unless told what it does.
    const guides = source
      .filter((s) => s.file.startsWith("src/content/connectors/"))
      .filter((s) => /Write Disposition — append \(the default\)/.test(s.text))
      .map((s) => s.file.replace(/^src\/content\/connectors\//, "").replace(/\.md$/, ""));
    expect(guides.length, "the derivation found too few SQL-source guides to mean anything").toBeGreaterThanOrEqual(5);
    expect(guides).toContain("postgresql");
    const missing: string[] = [];
    for (const slug of guides) {
      const html = existsSync(resolve(DIST, `docs/connectors/${slug}/index.html`))
        ? readFileSync(resolve(DIST, `docs/connectors/${slug}/index.html`), "utf-8")
        : "";
      const paras = (html.match(/<p>[\s\S]*?<\/p>/g) ?? []).filter((p) =>
        /What a scheduled run does to your tables/.test(inlineText(p)),
      );
      if (paras.length !== 1) missing.push(`${slug}: ${paras.length} scheduled-run paragraphs, expected 1`);
      else if (!/\bappend\b/.test(inlineText(paras[0])) || !paras[0].includes("/docs/uploads#incremental-cursor"))
        missing.push(`${slug}: the paragraph does not name append and link /docs/uploads#incremental-cursor`);
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("the OpenAPI guide says its inferred cursor does not narrow later runs", () => {
    // The inference is real (core's openapi_import writes an `incremental` hint per endpoint), so the
    // bullet stays. What it may not do is let a reader conclude that later runs fetch less.
    const html = existsSync(resolve(DIST, "docs/connectors/openapi/index.html"))
      ? readFileSync(resolve(DIST, "docs/connectors/openapi/index.html"), "utf-8")
      : "";
    const items = (html.match(/<li>[\s\S]*?<\/li>/g) ?? []).filter((li) =>
      /An incremental cursor/.test(inlineText(li)),
    );
    expect(items.length, "expected exactly one bullet naming the inferred incremental cursor").toBe(1);
    expect(squash(inlineText(items[0]))).toMatch(/does not carry from one run to the next/);
  });

  it("the benchmark says its incremental arm measured dlt, not an upload", () => {
    const post = dist.find((d) => d.file === "blog/datanika-vs-modern-data-stack/index.html");
    expect(post, "the benchmark post is not in dist").toBeTruthy();
    const html = readFileSync(resolve(DIST, "blog/datanika-vs-modern-data-stack/index.html"), "utf-8");
    expect(html).toContain("bench_incr");
    expect(html).toContain(ISSUE_URL);
    const readme = readFileSync(resolve(ROOT, "scripts/benchmark/README.md"), "utf-8");
    expect(readme).toContain("bench_incr");
    expect(readme).toContain(ISSUE_URL);
  });
});
