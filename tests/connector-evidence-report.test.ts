/**
 * landing#671 — the `evidenced / reachable / total` reporter, and the controls that make its
 * number a reading rather than a shape.
 *
 * `SPEC_CONNECTOR_GUIDE_VERIFICATION` §5 has committed us to this figure since 2026-09-10 with
 * **nothing computing it**. `docs/QA_RULES.md` §18: a published target with no instrument is
 * indistinguishable from a target being met — there is no red state, nothing to see, and the
 * spec's `8 / 37` was quoted in three places while the corpus moved to 16 artifacts.
 *
 * 🚨 The failure this file is built against is not "the number is wrong". It is **the number
 * being confidently right about a population the predicate cannot see** — so every assertion
 * below either drives the classifier with a case that must change the answer, or asserts that
 * an unexplained case makes the reporter REFUSE rather than round.
 */
import { existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  REPO_ROOT,
  classifyGuide,
  parseMarkers,
  readCorpus,
  report,
} from "../scripts/connector-evidence-report.mjs";

const corpus = readCorpus();
const result = report(corpus);
const row = (slug: string) => result.rows.find((r) => r.slug === slug)!;

/** A guide the classifier can be driven with, one field at a time. */
const guide = (over: Record<string, unknown> = {}) => ({
  slug: "synthetic",
  readme: "# x\n\n## Verification\n",
  hasArtifact: true,
  verifiedBy: "product-ui",
  ...over,
});

describe("the corpus is readable at all (anti-vacuity, AC4)", () => {
  it("found guides", () => {
    // An empty glob otherwise reports a clean `0 / 0` and every assertion below passes by
    // finding nothing. This is the one number in the file that is allowed to be a tripwire.
    expect(corpus.length, `no guides under src/content/connectors in ${REPO_ROOT}`).toBeGreaterThan(30);
  });

  it("read READMEs, not just filenames", () => {
    expect(corpus.filter((g) => g.readme !== null).length).toBeGreaterThan(30);
  });

  it("every class is populated, so the predicate is known to produce each one", () => {
    // 🔑 Not a target. With a class empty, `0 evidenced` and `the predicate cannot see
    // evidenced guides` are the same output, and the reassuring reading is the default one.
    for (const cls of ["evidenced", "unevidenced", "blocked"]) {
      expect(
        result.rows.filter((r) => r.cls === cls).length,
        `no guide classified "${cls}" — the ratio cannot distinguish "none are" from "it ` +
          `cannot see them"`,
      ).toBeGreaterThan(0);
    }
  });

  it("the live corpus is measurable today", () => {
    expect(
      result.blind,
      "the reporter refuses to print a number for these reasons; fix them or the ratio is " +
        "untrustworthy rather than merely low",
    ).toEqual([]);
  });
});

describe("no guide is silently in or out of the count (AC3)", () => {
  // 🔑 The invariant, not today's instance. `duckdb` and `clickhouse` were the two cases where
  // "a file exists" and "someone walked it" came apart — in OPPOSITE directions — and both were
  // found by READING a README rather than by counting one. `clickhouse` resolved itself while
  // landing#671 was open (its capture landed 2026-09-22, landing#618), which is exactly why
  // this is written as a property: pinning the pair would have gone red on the good news.
  it("a guide with an artifact that does not count says why, citing an issue", () => {
    const silent = result.rows.filter(
      (r) =>
        r.cls === "unevidenced" &&
        corpus.find((g) => g.slug === r.slug)!.hasArtifact &&
        !r.markers.some((m) => m.kind === "artifact-disowned"),
    );
    expect(
      silent.map((r) => r.slug),
      "these guides have a first-run artifact and are not counted, with nothing in their " +
        "README saying why. Either they should count, or the README should disown the " +
        "artifact and cite the issue (as duckdb does for core#793).",
    ).toEqual([]);
  });

  it("a guide counted without an artifact says why, citing an issue", () => {
    const silent = result.rows.filter(
      (r) =>
        r.cls === "evidenced" &&
        !corpus.find((g) => g.slug === r.slug)!.hasArtifact &&
        !r.markers.some((m) => m.kind === "artifact-unavailable"),
    );
    expect(
      silent.map((r) => r.slug),
      "these guides are counted as evidenced with no first-run artifact and no README marker " +
        "explaining it. Inflating the count is the one outcome §5 is written to prevent.",
    ).toEqual([]);
  });

  it("duckdb's exclusion is machine-readable and cites the issue its README names", () => {
    // Named, because AC3 asks for these to be resolved by name rather than be invisible. It is
    // an assertion about the MARKER, so recapturing the Data preview once core#793 ships is a
    // marker deletion and this test goes to the arm below instead of having to be edited.
    const duckdb = row("duckdb");
    if (duckdb.markers.some((m) => m.kind === "artifact-disowned")) {
      expect(duckdb.cls).toBe("unevidenced");
      expect(duckdb.why).toMatch(/core#793/);
    } else {
      // The post-fix world: the marker is gone, so the artifact must be the recaptured one.
      expect(duckdb.cls, "duckdb lost its artifact-disowned marker without becoming evidenced").toBe(
        "evidenced",
      );
    }
  });
});

describe("the classifier changes its answer when the evidence changes (AC5)", () => {
  it("removing the artifact moves a guide out of evidenced", () => {
    expect(classifyGuide(guide()).cls).toBe("evidenced");
    expect(classifyGuide(guide({ hasArtifact: false })).cls).toBe("unevidenced");
  });

  it("a disowned artifact does not count, and an unavailable one does", () => {
    const disowned = "<!-- evidence: artifact-disowned core#793 -->";
    const unavailable = "<!-- evidence: artifact-unavailable landing#604 -->";
    expect(classifyGuide(guide({ readme: disowned })).cls).toBe("unevidenced");
    expect(classifyGuide(guide({ readme: unavailable, hasArtifact: false })).cls).toBe("evidenced");
  });

  it("a blocked guide leaves the denominator, and only with the field agreeing", () => {
    const blocked = "<!-- evidence: blocked core#863 -->";
    const ok = classifyGuide(guide({ readme: blocked, verifiedBy: "verification-blocked" }));
    expect(ok.cls).toBe("blocked");
    expect(ok.disagreements).toEqual([]);
  });

  it("the real corpus's count moves when a real artifact moves", () => {
    // AC5 literally: move one guide's first-run artifact and watch the count drop by one.
    // Done on the REAL file, restored in the same test — a count that has never been seen to
    // move is not a count (the a11y ratchet in core was exactly this shape).
    const png = resolve(REPO_ROOT, "public/docs/connectors/postgresql/04-first-run.png");
    const aside = `${png}.landing671-control`;
    expect(existsSync(png), "the control needs postgresql's capture to be there to move").toBe(true);
    const before = report(readCorpus()).counts.evidenced;
    renameSync(png, aside);
    try {
      const after = report(readCorpus()).counts.evidenced;
      expect(after, "the count did not fall when a capture was removed").toBe(before - 1);
    } finally {
      renameSync(aside, png);
    }
    expect(existsSync(png), "the control did not restore the capture it moved").toBe(true);
    expect(report(readCorpus()).counts.evidenced).toBe(before);
  });
});

describe("the field and the README must agree, or nothing is reported", () => {
  // 🚨 Both directions. A guard that fires on one of them is satisfied by the other, and the
  // two say opposite things about the denominator.
  it("verified_by says blocked, README does not", () => {
    const r = classifyGuide(guide({ verifiedBy: "verification-blocked" }));
    expect(r.disagreements.join(" ")).toMatch(/carries no <!-- evidence: blocked/);
  });

  it("README says blocked, verified_by does not", () => {
    const r = classifyGuide(guide({ readme: "<!-- evidence: blocked core#863 -->" }));
    expect(r.disagreements.join(" ")).toMatch(/verified_by is "product-ui"/);
  });

  it("a disagreement makes the reporter refuse rather than pick a side", () => {
    const broken = report([
      { slug: "a", readme: "## Verification", hasArtifact: true, verifiedBy: "verification-blocked" },
    ]);
    expect(broken.blind.length).toBeGreaterThan(0);
  });
});

describe("a marker must be readable and must cite an issue", () => {
  it("parses a well-formed marker", () => {
    expect(parseMarkers("<!-- evidence: blocked core#863 -->").markers).toEqual([
      { kind: "blocked", issue: "core#863" },
    ]);
  });

  it("an unknown kind is a problem, never a silent skip", () => {
    const { markers, problems } = parseMarkers("<!-- evidence: probably-fine core#1 -->");
    expect(markers).toEqual([]);
    expect(problems.join(" ")).toMatch(/unknown marker kind/);
  });

  it("a marker with no issue is a problem", () => {
    // §2.3's rule generalised: an exception nobody can follow up is indistinguishable from
    // neglect, which is precisely how `verified_date` stopped meaning anything.
    const { markers, problems } = parseMarkers("<!-- evidence: blocked soon -->");
    expect(markers).toEqual([]);
    expect(problems.join(" ")).toMatch(/not an issue reference/);
  });

  it("ordinary prose is not a marker", () => {
    // The false-positive control. Without it, a parser loosened until it matched everything
    // would score identically on every assertion above.
    expect(parseMarkers("We are blocked on core#863, see above.").markers).toEqual([]);
    expect(parseMarkers("<!-- a normal comment about core#863 -->").markers).toEqual([]);
  });
});

describe("§5's predicate is measured half by half, not assumed (AC2)", () => {
  it("reports how many guides each conjunct excludes", () => {
    const { conjuncts } = result;
    expect(conjuncts.readmesConsidered).toBeGreaterThan(30);
    expect(conjuncts.artifactHalfExcludes).toBeGreaterThan(0);
  });

  it("the verification-section clause is reported even while it excludes nobody", () => {
    // 🔑 This is NOT an assertion that it stays vacuous — that would red on the good news.
    // It asserts the exclusion count is computed and printed, so the day it starts (or stops)
    // discriminating is visible rather than inferred. It was 0 of 36 on 2026-09-23.
    expect(typeof result.conjuncts.verificationSectionHalfExcludes).toBe("number");
    expect(result.conjuncts.verificationSectionHalfExcludes).toBeGreaterThanOrEqual(0);
  });
});
