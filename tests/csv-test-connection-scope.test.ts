/**
 * csv.md step 1.4 scopes Test Connection to the file-path branch (landing#691).
 *
 * Upload File and Or enter file path are mutually exclusive. An uploaded file
 * is already attached, so that branch has nothing to test. The numbered step
 * must not tell every reader to click the button, and it must not say the
 * button succeeds for an uploaded file.
 *
 * The expected sentences are literals. They are not derived from the guide.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const guide = readFileSync(join(process.cwd(), "src/content/connectors/csv.md"), "utf8");

function stepOne(): string {
  const start = guide.indexOf("## Step 1 — Create the CSV Connection");
  const end = guide.indexOf("## Step 2 — Create the upload", start);
  if (start < 0 || end < 0) {
    throw new Error("step 1 bounds missing");
  }
  return guide.slice(start, end);
}

function substep(body: string, n: number): string {
  const start = body.indexOf(`\n${n}. `);
  const next = body.indexOf(`\n${n + 1}. `, start + 1);
  if (start < 0 || next < 0) {
    throw new Error(`substep ${n} missing`);
  }
  return body.slice(start + 1, next);
}

it("scopes step 1.4 to the file-path branch", () => {
  const step = substep(stepOne(), 4);
  expect(step.startsWith("4. If you used **Or enter file path**, click **Test Connection**.")).toBe(
    true,
  );
  const upload = step
    .split(/(?<=\.)\s+/)
    .find((sentence) => sentence.includes("uploaded file"));
  expect(upload).toBe(
    "An uploaded file has nothing to test because the file is already attached.",
  );
  expect(step).toContain(
    "It really lists the directory now and reports the files it matched, so a path that does not exist or matches nothing comes back **red** instead of passing silently.",
  );
  expect(step).not.toContain("Test Connection succeeds for an uploaded file");
});
