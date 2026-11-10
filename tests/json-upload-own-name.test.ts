/**
 * An uploaded JSON file is loaded by its own name (core#1615).
 *
 * The connection default is `*.json`. Before the loader change, a `.jsonl`
 * upload was accepted and then matched nothing, and this guide told the reader
 * the run fails. The loader on core dev sets the pattern to the uploaded
 * basename and escapes `*`, `?` and `[`. A directory drop still uses `*.json`.
 *
 * The expected sentences are literals. They are not derived from the guide.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const guide = readFileSync(join(process.cwd(), "src/content/connectors/json.md"), "utf8");

function between(start: string, end: string): string {
  const from = guide.indexOf(start);
  const to = guide.indexOf(end, from + start.length);
  if (from < 0 || to < 0) {
    throw new Error(`missing heading ${start} or ${end}`);
  }
  return guide.slice(from, to);
}

it("says an uploaded file is loaded by its own name", () => {
  const step = between("## Step 1a", "## Step 1b");
  expect(step).toContain("by that file's own name");
  expect(step).toContain("you do not set a file pattern for it");
  expect(step).toContain("A name that contains `*`, `?` or `[` is read as that name");
  expect(step).toContain("The browse dialog includes `.jsonl` and `.ndjson`");
});

it("keeps the directory default on the directory step", () => {
  const step = between("## Step 1b", "## Step 2");
  expect(step).toContain("This path's default is `*.json`");
  expect(step).toContain("A file uploaded in Step 1a is loaded by its own name");
  expect(step).toContain("No files matched '*.json'");
});
