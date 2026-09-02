/**
 * Guardrail: a connector guide that shows the reader how to make source data
 * reachable must mount it into BOTH containers.
 *
 * ## The defect this exists for
 *
 * Datanika runs the web app (`app`) and the worker (`celery`) as separate
 * containers with separate filesystems. **The load runs in the worker**; Test
 * Connection, the Data preview and the SQL Editor run in the web app. A guide
 * that mounts a source directory into `app` alone produces a run that cannot
 * read the file.
 *
 * Four instances of one mental model, found in two sweeps:
 *
 * - `duckdb.md` — core#793. The documented destination path was on no volume at
 *   all, so the "zero credentials" onboarding path landed data the web process
 *   could not read. Fixed.
 * - `sqlite.md`, `json.md`, `parquet.md` — landing#459. All three mounted into
 *   `app` only. `sqlite.md` was the worst of them: its own verification step
 *   (`docker exec datanika-app ls`, then "click Test Connection") **passes**,
 *   because Test Connection runs in the web process. Green check, failing load.
 *
 * `csv.md` has always been right, and says so in prose. So the correct
 * instruction existed in an adjacent file the whole time, and nothing linked
 * them. That is what a guard is for.
 *
 * ## Why it is not a grep for "celery"
 *
 * `csv.md` is **correct and contains no compose snippet at all** — it tells the
 * reader in prose to give the worker a reachable path. A presence check for the
 * word would score it as broken, and would score a snippet that merely mentions
 * `celery` in a comment as fine. This parses the block and asserts on the keys
 * under `services:`.
 *
 * ## Why it is not vacuous
 *
 * A parser that silently matches nothing reports every file as compliant — the
 * `plans >= 5` shape. `test_the_parse_found_something` pins the block count and
 * the file count against zero, so a regex that stops matching fails loudly
 * rather than passing quietly.
 *
 * ## Shown able to fail
 *
 * Negative control run against the REAL files, not a fixture (WORKFLOW_RULES
 * §13): deleting the `celery:` stanza from `parquet.md`'s snippet turned this
 * red naming `parquet.md`, and deleting it from `sqlite.md`'s bind-mount block
 * turned it red naming `sqlite.md`. Restored byte-identically, suite green.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CONNECTORS_DIR = join(process.cwd(), "src/content/connectors");

/** Container paths under these prefixes are where guides put SOURCE DATA and
 *  destination files. A snippet mounting something else (a cert, a config) may
 *  legitimately be one-sided, so the invariant is scoped rather than blanket. */
const DATA_MOUNT_PREFIXES = ["/var/datanika", "/mnt"];

/** Both of these have to appear under `services:`. `app` serves the UI and runs
 *  Test Connection / preview; `celery` runs the load. */
const REQUIRED_SERVICES = ["app", "celery"];

interface ComposeBlock {
  file: string;
  /** 1-based line of the fence that opened this block. */
  line: number;
  services: string[];
  mountTargets: string[];
}

/**
 * Pull every fenced yaml block containing a `services:` map out of a markdown
 * file and read its top-level service keys and its mount targets.
 *
 * Snippets in these guides sit inside numbered list items, so every line
 * carries a base indent taken from the `services:` line itself. Indentation is
 * measured relative to that, never absolutely.
 */
function composeBlocks(file: string, md: string): ComposeBlock[] {
  const lines = md.split(/\r?\n/);
  const blocks: ComposeBlock[] = [];

  let fenceIndent: number | null = null;
  let buffer: string[] = [];
  let fenceLine = 0;

  const flush = () => {
    if (fenceIndent === null) return;
    const body = buffer;
    fenceIndent = null;
    buffer = [];

    const servicesIdx = body.findIndex((l) => /^\s*services:\s*$/.test(l));
    if (servicesIdx === -1) return;

    const baseIndent = body[servicesIdx].match(/^\s*/)![0].length;
    const services: string[] = [];
    const mountTargets: string[] = [];

    for (const raw of body.slice(servicesIdx + 1)) {
      if (raw.trim() === "") continue;
      const indent = raw.match(/^\s*/)![0].length;
      // A key at or left of `services:` ends the map (e.g. a top-level
      // `volumes:` block, which duckdb.md and sqlite.md both have).
      if (indent <= baseIndent) break;
      // Exactly one level in is a service name.
      const service = raw.match(/^\s{0,}([A-Za-z0-9_.-]+):\s*$/);
      if (service && indent === baseIndent + 2) services.push(service[1]);
      // `- <source>:<target>[:ro]` — the target is the second colon-field.
      const mount = raw.trim().match(/^-\s+[^\s:]+:(\/[^\s:]+)(?::[a-z]+)?\s*$/);
      if (mount) mountTargets.push(mount[1]);
    }

    if (services.length > 0) blocks.push({ file, line: fenceLine, services, mountTargets });
  };

  lines.forEach((raw, i) => {
    const fence = raw.match(/^(\s*)```\s*(\w+)?\s*$/);
    if (!fence) {
      if (fenceIndent !== null) buffer.push(raw);
      return;
    }
    if (fenceIndent === null) {
      if ((fence[2] ?? "").toLowerCase() === "yaml") {
        fenceIndent = fence[1].length;
        fenceLine = i + 1;
        buffer = [];
      }
      return;
    }
    flush();
  });
  flush();

  return blocks;
}

const allBlocks: ComposeBlock[] = readdirSync(CONNECTORS_DIR)
  .filter((f) => f.endsWith(".md"))
  .flatMap((f) => composeBlocks(f, readFileSync(join(CONNECTORS_DIR, f), "utf-8")));

const dataBlocks = allBlocks.filter((b) =>
  b.mountTargets.some((t) => DATA_MOUNT_PREFIXES.some((p) => t === p || t.startsWith(`${p}/`))),
);

describe("connector guide compose snippets", () => {
  it("the parse found something — a matcher that matches nothing passes everything", () => {
    expect(allBlocks.length).toBeGreaterThanOrEqual(5);
    expect(dataBlocks.length).toBeGreaterThanOrEqual(5);
    expect(new Set(dataBlocks.map((b) => b.file)).size).toBeGreaterThanOrEqual(4);
  });

  it("every data mount is mounted into BOTH the web app and the worker", () => {
    const offenders = dataBlocks
      .filter((b) => !REQUIRED_SERVICES.every((s) => b.services.includes(s)))
      .map(
        (b) =>
          `${b.file}:${b.line} mounts ${b.mountTargets.join(", ")} but names only ` +
          `services [${b.services.join(", ")}] — the load runs in \`celery\`, so a mount ` +
          `into \`app\` alone gives a run that cannot read the file (landing#459, core#793)`,
      );
    expect(offenders).toEqual([]);
  });

  it("reads real service names, not a substring of the surrounding prose", () => {
    // If this ever picks up something that is not a compose service, every
    // assertion above becomes an accident.
    const known = new Set(["app", "app_b", "celery", "beat", "postgres", "redis"]);
    const unknown = allBlocks.flatMap((b) => b.services.filter((s) => !known.has(s)));
    expect(unknown).toEqual([]);
  });
});
