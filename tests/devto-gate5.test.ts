import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * landing#727. Gate 5 used to compare the post to origin/main and call that
 * "what datanika.io serves". The ref can match while the edge still serves
 * the previous HTML. These cases drive scripts/devto_gate5.py.
 *
 * The matching case is the control. The differing case is not evidence
 * unless that control can pass: a checker that always refuses would go red
 * on the differing article for a reason that is not the text.
 */

const SCRIPT = resolve(__dirname, "..", "scripts", "devto_gate5.py");

const MARKDOWN = `---
title: "Our Tool Said \\"Nothing To Do\\" And Meant It"
---

The upload is named after the sheet's tab, and it does not _only_ copy the folder.

\`0 * * * *\` hourly. *Connected — found files matching \\*.csv* is the other line.
`;

function article(body: string): string {
  return (
    "<article><h1>Our Tool Said \u201cNothing To Do\u201d And Meant It</h1>" +
    body +
    "</article>"
  );
}

const MATCHING = article(
  "<p>The upload is named after the sheet\u2019s tab, and it does not <em>only</em> copy the folder.</p>" +
    "<p><code>0 * * * *</code> hourly. <em>Connected — found files matching *.csv</em> is the other line.</p>",
);

const DIFFERING = article(
  "<p>The upload is derived from the sheet\u2019s tab, and it does not <em>only</em> copy the folder.</p>" +
    "<p><code>0 * * * *</code> hourly. <em>Connected — found files matching *.csv</em> is the other line.</p>",
);

function miss(body: string): { status: number; headers: Record<string, string>; body: string; error: string } {
  return { status: 200, headers: { "cf-cache-status": "MISS" }, body, error: "" };
}

function decide(payload: unknown): { code: number; decision: { ok?: boolean; reason?: string; missing?: string; checked?: number } | null; raw: string } {
  const run = spawnSync("python", [SCRIPT], {
    input: JSON.stringify(payload),
    encoding: "utf-8",
  });
  const raw = run.stdout ?? "";
  let decision = null;
  try {
    decision = JSON.parse(raw);
  } catch {
    decision = null;
  }
  return { code: run.status ?? -1, decision, raw };
}

describe("dev.to gate 5 reads the served article (landing#727)", () => {
  it("passes when the ref matches and the served article has the local text", () => {
    const got = decide({ diff_stat: "", markdown: MARKDOWN, response: miss(MATCHING) });
    expect(got.decision, got.raw).not.toBeNull();
    expect(got.decision?.ok).toBe(true);
    expect(got.decision?.checked).toBeGreaterThan(1);
    expect(got.code).toBe(0);
  });

  it("refuses when the served sentence differs and the ref comparison passed", () => {
    const got = decide({ diff_stat: "", markdown: MARKDOWN, response: miss(DIFFERING) });
    expect(got.decision, got.raw).not.toBeNull();
    expect(got.decision?.ok).toBe(false);
    expect(got.decision?.reason).toBe("served text differs");
    expect(got.decision?.missing).toContain("named after");
    expect(got.code).toBe(1);
  });

  it("refuses a cache hit even when the body matches", () => {
    const got = decide({
      diff_stat: "",
      markdown: MARKDOWN,
      response: { status: 200, headers: { "cf-cache-status": "HIT" }, body: MATCHING, error: "" },
    });
    expect(got.decision?.ok).toBe(false);
    expect(got.decision?.reason).toContain("MISS");
  });

  it("still refuses ref drift when the served article matches", () => {
    const got = decide({
      diff_stat: "1 file changed, 1 insertion(+)",
      markdown: MARKDOWN,
      response: miss(MATCHING),
    });
    expect(got.decision?.ok).toBe(false);
    expect(got.decision?.reason).toBe("ref drift");
  });

  it("refuses when the canonical cannot be read", () => {
    const got = decide({
      diff_stat: "",
      markdown: MARKDOWN,
      response: { status: 0, headers: {}, body: "", error: "timed out" },
    });
    expect(got.decision?.ok).toBe(false);
    expect(got.decision?.reason).toBe("canonical could not be read");
  });

  it("refuses a 200 that has no article element", () => {
    const got = decide({
      diff_stat: "",
      markdown: MARKDOWN,
      response: miss("<html><p>The upload is named after the sheet's tab.</p></html>"),
    });
    expect(got.decision?.ok).toBe(false);
    expect(got.decision?.reason).toBe("served page has no article");
  });

  it("refuses a local post that yields no distinguishing string", () => {
    const got = decide({
      diff_stat: "",
      markdown: "---\ntitle: Hi\n---\n\nToo short.\n",
      response: miss(MATCHING),
    });
    expect(got.decision?.ok).toBe(false);
    expect(got.decision?.reason).toBe("local post has no distinguishing string");
  });

  it("builds a cache-busted canonical and rejects a slug that is not a post", () => {
    const ok = spawnSync("python", [SCRIPT, "--request", "airtable-linked-records", "nonce727"], {
      encoding: "utf-8",
    });
    expect(ok.status).toBe(0);
    expect(ok.stdout.trim()).toBe("https://datanika.io/blog/airtable-linked-records/?cb=nonce727");

    const bad = spawnSync("python", [SCRIPT, "--request", "../privacy", "nonce727"], {
      encoding: "utf-8",
    });
    expect(bad.status).not.toBe(0);
  });
});
