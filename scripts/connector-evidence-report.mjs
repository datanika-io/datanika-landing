#!/usr/bin/env node
/**
 * `evidenced / reachable / total` for the connector guides — the instrument
 * `SPEC_CONNECTOR_GUIDE_VERIFICATION.md` §6 row 2 calls "the reporting script" (landing#671).
 *
 * §5 has committed us to this number since 2026-09-10 and **nothing computed it**:
 * `grep -rln evidenced scripts/ tests/` returned 0 files. `docs/QA_RULES.md` §18 — a published
 * target with no instrument is indistinguishable from a target being met. There is no red state
 * to notice, so the spec's own figure (`8 / 37`) was quoted in three places and drifted by eight
 * without anything going amber: on 2026-09-23 the corpus carried **16** first-run artifacts.
 *
 * ── The predicate, and why it is not §5's ─────────────────────────────────────────────────
 *
 * §5 defines evidenced as *a first-run artifact* AND *a README verification section*. Measured
 * separately on the real corpus:
 *
 *     README has a verification section    36 of 36 READMEs
 *     a first-run artifact exists          16 of 37
 *
 * **The first conjunct excludes nobody.** A property true of every item carries no information
 * about any item; it is the half of an `AND` that can never be the one that fails. Implementing
 * §5 verbatim would ship a metric with a decorative clause in it, so that clause is **repointed**
 * rather than kept for symmetry (landing#671 AC2). The report prints both exclusion counts every
 * run, so the day it starts discriminating — or the day the artifact half stops — is visible
 * rather than inferred.
 *
 * What replaces it is the README property that DOES vary: whether the README **stands behind**
 * the artifact. File presence is a proxy for *"someone walked it"*, and the corpus contains the
 * exact case where the proxy and the thing come apart:
 *
 *   - `duckdb` has `04-first-run.png` and its own README says of it: *"🔴 Still the `/runs`
 *     table, and it still FAILS the acceptance criterion … a run status is not evidence that
 *     data arrived"*, blocked on core#793. Counting it is an over-count **the README already
 *     objects to in writing**.
 *   - `clickhouse` was the mirror image — walked end to end on 2026-09-16 with no artifact
 *     possible, because `/models` listed nothing for a ClickHouse destination (landing#604).
 *     🔑 **It resolved itself while this issue was open**: the 2026-09-22 walk (landing#618), on
 *     a stack carrying core#1397, took the capture. The under-count is gone and the MECHANISM
 *     must stay, because the next connector blocked from producing an artifact will need it.
 *
 * ── The markers ───────────────────────────────────────────────────────────────────────────
 *
 * A README states its own exception, in one line, and **must cite an issue** — the rule §2.3
 * already imposes on `verification-blocked`, generalised, because an exception nobody can follow
 * up is indistinguishable from neglect:
 *
 *     <!-- evidence: blocked <issue> -->                not walkable at all; leaves `reachable`
 *     <!-- evidence: artifact-unavailable <issue> -->   walked, but the documented path cannot
 *                                                       produce a first-run artifact; counts
 *     <!-- evidence: artifact-disowned <issue> -->      an artifact exists and this README says
 *                                                       it does not prove data landed; does not
 *                                                       count
 *
 * ⚠️ **The numbers come from the README and the file on disk, never from `verified_by` or
 * `verified_date`** (AC1). `verified_by` is read for **one** purpose: to cross-check that it and
 * the `blocked` marker agree. A disagreement is a refusal to report, not a silent preference for
 * one of them — the two disagreeing is exactly the state where a number would be confident and
 * wrong.
 *
 * ── Exit codes ────────────────────────────────────────────────────────────────────────────
 *
 * `0` a measurement was taken · `2` nothing could be honestly measured. There is deliberately no
 * `1`: §5 has a known ceiling (some sources need a paid vendor account), so a threshold would
 * make the cheapest path to green an assertion nobody verified — the one outcome the spec exists
 * to prevent. This is a **report**, and the only thing it may fail on is being unable to report
 * (`QA_RULES` §18a's convention, where `2` means *nothing could be measured*).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..");

/** `core#123`, `landing#45`, `cloud#7`. An exception must name one. */
const ISSUE = /\b(?:core|cloud|landing)#\d+\b/;

export const MARKER_KINDS = ["blocked", "artifact-unavailable", "artifact-disowned"];

const MARKER = /<!--\s*evidence:\s*([a-z-]+)\s+([^\s>]+)\s*-->/g;

/** A heading whose text begins "verification" or "verified" — §5's second conjunct. */
const VERIFICATION_HEADING = /^#+\s*(verification|verified)\b/im;

const FRONTMATTER_VERIFIED_BY = /^verified_by:\s*"?([^"\n\r]+?)"?\s*$/m;

/**
 * Every `evidence:` marker in a README, with its issue.
 *
 * An unknown kind and a missing issue are both returned as `problems` rather than ignored: a
 * marker the reader believes is doing something, silently doing nothing, is the defect this
 * whole file exists to catch one level up.
 */
export function parseMarkers(readme) {
  const found = [];
  const problems = [];
  for (const [, kind, issue] of readme.matchAll(MARKER)) {
    if (!MARKER_KINDS.includes(kind)) {
      problems.push(`unknown marker kind "${kind}" (known: ${MARKER_KINDS.join(", ")})`);
      continue;
    }
    if (!ISSUE.test(issue)) {
      problems.push(`marker "${kind}" cites "${issue}", which is not an issue reference`);
      continue;
    }
    found.push({ kind, issue });
  }
  return { markers: found, problems };
}

/**
 * Classify one guide from its artifacts.
 *
 * `verifiedBy` is passed in for the cross-check ONLY and never decides a count.
 */
export function classifyGuide({ slug, readme, hasArtifact, verifiedBy }) {
  const { markers, problems } = readme === null ? { markers: [], problems: [] } : parseMarkers(readme);
  const kinds = new Set(markers.map((m) => m.kind));
  const disagreements = [];

  const fieldSaysBlocked = verifiedBy === "verification-blocked";
  if (fieldSaysBlocked !== kinds.has("blocked")) {
    disagreements.push(
      fieldSaysBlocked
        ? `${slug}: verified_by is "verification-blocked" but its README carries no ` +
          `<!-- evidence: blocked <issue> --> marker. §2.3 requires a README naming the blocker ` +
          `and what would lift it; without the marker nothing can read it.`
        : `${slug}: its README is marked <!-- evidence: blocked --> but verified_by is ` +
          `"${verifiedBy ?? "unset"}". A guide out of the denominator must say so in both places.`,
    );
  }

  if (kinds.has("artifact-disowned") && !hasArtifact) {
    disagreements.push(
      `${slug}: marked artifact-disowned, but there is no artifact to disown. Use ` +
        `artifact-unavailable for "the path cannot produce one".`,
    );
  }

  let cls;
  let why;
  if (kinds.has("blocked")) {
    cls = "blocked";
    why = `README names a blocker (${markers.find((m) => m.kind === "blocked").issue})`;
  } else if (kinds.has("artifact-unavailable")) {
    cls = "evidenced";
    why = `walked; the documented path cannot produce an artifact (${markers.find((m) => m.kind === "artifact-unavailable").issue})`;
  } else if (hasArtifact && kinds.has("artifact-disowned")) {
    cls = "unevidenced";
    why = `an artifact exists and the README disowns it (${markers.find((m) => m.kind === "artifact-disowned").issue})`;
  } else if (hasArtifact) {
    cls = "evidenced";
    why = "first-run artifact present, and the README does not disown it";
  } else {
    cls = "unevidenced";
    why = readme === null ? "no README and no first-run artifact" : "no first-run artifact";
  }

  return { slug, cls, why, markers, problems, disagreements };
}

export function readCorpus(root = REPO_ROOT) {
  const guideDir = resolve(root, "src/content/connectors");
  const publicDir = resolve(root, "public/docs/connectors");
  return readdirSync(guideDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => {
      const slug = file.replace(/\.md$/, "");
      const readmePath = resolve(publicDir, slug, "README.md");
      const body = readFileSync(resolve(guideDir, file), "utf-8");
      return {
        slug,
        readme: existsSync(readmePath) ? readFileSync(readmePath, "utf-8") : null,
        hasArtifact: existsSync(resolve(publicDir, slug, "04-first-run.png")),
        verifiedBy: (body.match(FRONTMATTER_VERIFIED_BY) ?? [])[1] ?? null,
      };
    });
}

export function report(corpus) {
  const rows = corpus.map(classifyGuide);
  const by = (c) => rows.filter((r) => r.cls === c);

  const counts = {
    total: rows.length,
    blocked: by("blocked").length,
    reachable: rows.length - by("blocked").length,
    evidenced: by("evidenced").length,
    unevidenced: by("unevidenced").length,
  };

  // §5's two conjuncts, each measured on its own — AC2. A clause that excludes nobody is
  // reported as such every run, so "it started/stopped discriminating" is visible.
  const withReadme = corpus.filter((g) => g.readme !== null);
  const conjuncts = {
    artifactHalfExcludes: corpus.filter((g) => !g.hasArtifact).length,
    verificationSectionHalfExcludes: withReadme.filter((g) => !VERIFICATION_HEADING.test(g.readme))
      .length,
    readmesConsidered: withReadme.length,
    // ⚠️ Counted from the MARKER, not from the `why` sentence. Matching the prose I happen to
    // have written is the "count the phrase, not the instruction" trap (`QA_RULES` §7) inside
    // the very instrument built to avoid it — rewording `why` would silently zero this.
    readmeStandsBehindHalfExcludes: rows.filter(
      (r) => r.cls === "unevidenced" && r.markers.some((m) => m.kind === "artifact-disowned"),
    ).length,
  };

  const problems = rows.flatMap((r) => r.problems.map((p) => `${r.slug}: ${p}`));
  const disagreements = rows.flatMap((r) => r.disagreements);

  // ⚠️ Anti-vacuity (AC4). An empty glob otherwise reports a clean `0 / 0`, and every
  // assertion downstream passes by finding nothing. Each of these is a reason the number
  // cannot be trusted, NOT a target being missed — hence exit 2, never exit 1.
  const blind = [];
  if (counts.total === 0) blind.push("the corpus is empty — the guide glob matched nothing");
  for (const cls of ["evidenced", "unevidenced", "blocked"]) {
    if (by(cls).length === 0) {
      blind.push(
        `no guide classified "${cls}". With a class empty, the predicate has not been shown ` +
          `to produce it at all, and the ratio cannot distinguish "none are" from "it cannot see them".`,
      );
    }
  }
  if (conjuncts.readmesConsidered === 0) blind.push("no README was read — the corpus path is wrong");
  blind.push(...problems, ...disagreements);

  return { rows, counts, conjuncts, blind };
}

export function format({ rows, counts, conjuncts, blind }) {
  const out = [];
  out.push("Connector guide evidence — SPEC_CONNECTOR_GUIDE_VERIFICATION §5 (landing#671)");
  out.push("");
  for (const r of rows) {
    const mark = { evidenced: "  ok  ", unevidenced: "  --  ", blocked: " blkd " }[r.cls];
    out.push(`  [${mark}] ${r.slug.padEnd(20)} ${r.why}`);
  }
  out.push("");
  out.push(`  evidenced / reachable / total = ${counts.evidenced} / ${counts.reachable} / ${counts.total}`);
  out.push(`  (blocked: ${counts.blocked}, unevidenced: ${counts.unevidenced})`);
  out.push("");
  out.push("  How much work each half of §5's predicate does, measured this run:");
  out.push(`    first-run artifact absent .............. excludes ${conjuncts.artifactHalfExcludes} of ${counts.total}`);
  out.push(
    `    README has no verification section ..... excludes ${conjuncts.verificationSectionHalfExcludes} of ${conjuncts.readmesConsidered} READMEs`,
  );
  out.push(`    README disowns its own artifact ....... excludes ${conjuncts.readmeStandsBehindHalfExcludes} of ${counts.total}`);
  if (conjuncts.verificationSectionHalfExcludes === 0) {
    out.push(
      "    ⚠️ The verification-section clause excluded nobody again. It is reported, not used:",
    );
    out.push("       a clause that can never be the one that fails carries no information (AC2).");
  }
  if (blind.length) {
    out.push("");
    out.push("  🚨 NOT MEASURED — these make the ratio above untrustworthy, not merely low:");
    for (const b of blind) out.push(`    - ${b}`);
  }
  return out.join("\n");
}

// ⚠️ `pathToFileURL`, not a hand-built `file://` string. The hand-built form produces
// `file://D:/…` on Windows where `import.meta.url` is `file:///D:/…`, so the guard never
// matches, the CLI body never runs, and the process prints NOTHING and exits 0 — a silent
// success shaped exactly like a clean report. Measured here before it was fixed.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = report(readCorpus());
  console.log(format(result));
  process.exit(result.blind.length ? 2 : 0);
}
