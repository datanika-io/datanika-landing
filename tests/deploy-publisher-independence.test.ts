import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * The landing deploy must not need Aweb to reach GitHub (landing#453).
 *
 * ## What was wrong
 *
 * `landing#388` moved the build to the GitHub runner and shipped the built
 * `dist/` to Aweb. It left one thing behind: the remote block still opened with
 *
 *     cd /opt/datanika/datanika-landing
 *     git pull origin main
 *
 * for exactly one reason — to obtain `publish-web-root.sh` at a current
 * revision. So a deploy whose bytes had already been built, tested and
 * transferred could still die on a network call for a 100-line shell script.
 *
 * It did, on run 33628141542 (2026-09-02T12:06:42Z):
 *
 *     fatal: could not read Username for 'https://github.com': No such device or address
 *     fatal: expected flush after ref listing
 *
 * The remote block is `set -eu`, so `publish-web-root.sh` never ran. **That
 * part worked**: the symlink was never moved and the previous release kept
 * serving. The cost is a dispatched deploy that silently becomes a no-op, plus
 * a page. 1 of the last 4 `Deploy Landing` runs.
 *
 * ## Why a guard and not just the fix
 *
 * The dependency was *vestigial* — nothing in the deploy needed the checkout any
 * more, and nothing said so. It survived a rewrite of this exact file precisely
 * because "the box has a checkout, the checkout gets pulled" reads as normal.
 * The next person to need a file on the box will reach for the same idiom.
 *
 * ## What is asserted
 *
 * 1. The publish step performs no git network call.
 * 2. It invokes the publisher at an absolute shipped path, not out of a checkout.
 * 3. The publisher is genuinely transferred by this workflow, and the transfer
 *    is verified by checksum — a **positive artifact**, because `ssh` exiting 0
 *    says the session closed, not that the right bytes landed. Asserting only
 *    (1) would be satisfied by a workflow that dropped `git pull` and never
 *    shipped the script at all.
 * 4. Every `id:` in the deploy job appears in the failure-alert chain, in
 *    execution order. That file comments *"Kept in EXECUTION ORDER, and every id
 *    that can fail is listed"* and nothing enforced it; a step missing from the
 *    chain reports `unknown (see run URL)`, which is the least useful thing a
 *    failure alert can say.
 *
 * Every check below has a negative control that mutates the **real** workflow
 * source in memory rather than a fixture, and each control asserts its own
 * anchor matched — an inert control fails loudly instead of passing vacuously.
 */

const ROOT = resolve(__dirname, "..");
const WORKFLOW = ".github/workflows/deploy.yml";
const SOURCE = readFileSync(resolve(ROOT, WORKFLOW), "utf-8");

/** Steps in the deploy job sit at this indent; the `smoke` job's do too, so scope first. */
const STEP_MARKER = /^      - name: (.+?)\s*$/;

/** Only the first job. `smoke` has no ids and no alert chain. */
function deployJob(src: string): string {
  const start = src.indexOf("  build-and-deploy:");
  expect(start, "build-and-deploy job not found — parser is broken").toBeGreaterThan(-1);
  const end = src.indexOf("\n  smoke:", start);
  expect(end, "smoke job not found — parser is broken").toBeGreaterThan(start);
  return src.slice(start, end);
}

/** The body of one named step, up to the next step at the same indent. */
function stepBlock(src: string, name: string): string {
  const lines = deployJob(src).split(/\r?\n/);
  const at = lines.findIndex((l) => STEP_MARKER.exec(l)?.[1] === name);
  expect(at, `step "${name}" not found`).toBeGreaterThan(-1);
  const rest = lines.slice(at + 1);
  const next = rest.findIndex((l) => STEP_MARKER.test(l));
  return (next === -1 ? rest : rest.slice(0, next)).join("\n");
}

/** `id:` values in the deploy job, in file order. */
function stepIds(src: string): string[] {
  return [...deployJob(src).matchAll(/^        id: (\S+)\s*$/gm)].map((m) => m[1]);
}

/** ids referenced as `steps.<id>.outcome` in the failure step's env, in file order. */
function alertChainIds(src: string): string[] {
  const block = stepBlock(src, "Telegram alert on failure");
  return [...block.matchAll(/\$\{\{\s*steps\.(\S+?)\.outcome\s*\}\}/g)].map((m) => m[1]);
}

const GIT_NETWORK = /\bgit\s+(?:pull|fetch|clone|ls-remote|push)\b/;
const SHIPPED_PUBLISHER = "/opt/datanika/publish-web-root.sh";

/**
 * The assertion is about commands the deploy RUNS, so comment lines are removed
 * first. Without this the guard would go red on a note explaining why `git pull`
 * was taken out — punishing the documentation of the fix.
 */
function commandsOnly(block: string): string {
  return block
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
}

describe("landing#453 — the deploy does not depend on Aweb reaching GitHub", () => {
  it("parses a non-trivial workflow (anti-vacuity)", () => {
    // Every assertion below is over a parsed slice. A parser that silently
    // returns nothing would make all of them pass.
    expect(stepIds(SOURCE).length).toBeGreaterThanOrEqual(10);
    expect(stepBlock(SOURCE, "Publish on Aweb").length).toBeGreaterThan(200);
    expect(alertChainIds(SOURCE).length).toBeGreaterThanOrEqual(10);
  });

  it("1. the publish step makes no git network call", () => {
    expect(GIT_NETWORK.test(commandsOnly(stepBlock(SOURCE, "Publish on Aweb")))).toBe(false);
  });

  it("2. the publish step invokes the publisher at its shipped absolute path", () => {
    const block = stepBlock(SOURCE, "Publish on Aweb");
    expect(block).toContain(SHIPPED_PUBLISHER);
    // A bare `bash scripts/publish-web-root.sh` would resolve against whatever
    // directory the remote shell happens to start in — which is what the old
    // `cd` into the checkout was providing.
    expect(/bash\s+scripts\/publish-web-root\.sh/.test(block)).toBe(false);
  });

  it("3. the publisher is shipped by this workflow and verified by checksum", () => {
    const block = stepBlock(SOURCE, "Ship the publish script to Aweb");
    expect(block).toContain("scripts/publish-web-root.sh");
    expect(block).toContain(SHIPPED_PUBLISHER);
    // The comparison, not merely the word "sha256sum": a transfer step that
    // computed a checksum and never compared it is the same defect as a green
    // that proves nothing.
    expect(block).toMatch(/if \[ "\$LOCAL" != "\$REMOTE_SUM" \]/);
    expect(block).toContain("::error::");
    expect(block).toMatch(/exit 1/);
  });

  it("4. every step id is in the failure-alert chain, in execution order", () => {
    expect(alertChainIds(SOURCE)).toEqual(stepIds(SOURCE));
  });

  it("4b. the alert chain has a branch printing each step's real name", () => {
    const block = stepBlock(SOURCE, "Telegram alert on failure");
    const branches = [...block.matchAll(/STEP="([^"]+)"/g)].map((m) => m[1]);
    // One branch per id plus the `unknown` fallback.
    expect(branches.length).toBe(stepIds(SOURCE).length + 1);
    expect(branches).toContain("Ship the publish script to Aweb");
    expect(branches).toContain("Publish on Aweb");
  });
});

/**
 * Negative controls. Each mutates the REAL workflow text — a fixture written
 * from the same mental model as the check agrees with the check including where
 * the check is wrong — and asserts its own anchor matched before relying on it.
 */
describe("landing#453 — the guard can fail", () => {
  /**
   * ⚠️ The line-ending conversion is not defensive tidiness — it is the bug this
   * harness shipped with. Tracked files here are CRLF and files written by the
   * editor are LF, so a multi-line anchor written with `\n` matches **nothing**.
   * Controls D and E were inert on their first run for exactly that reason, and
   * the only thing that said so was the anchor-count assertion below. Without
   * it, two controls would have "passed" while testing nothing — a
   * mutation harness whose own breakage reports the guard as fine.
   */
  function mutate(find: string, replace: string): string {
    const eol = SOURCE.includes("\r\n") ? "\r\n" : "\n";
    const anchor = find.replace(/\n/g, eol);
    const body = replace.replace(/\n/g, eol);
    expect(SOURCE.split(anchor).length - 1, `anchor did not match exactly once: ${find}`).toBe(1);
    return SOURCE.replace(anchor, body);
  }

  it("control A: re-introducing `git pull` in the publish step is caught", () => {
    const broken = mutate(
      "          bash /opt/datanika/publish-web-root.sh /opt/datanika/landing-dist.incoming",
      "          cd /opt/datanika/datanika-landing\n          git pull origin main\n          bash scripts/publish-web-root.sh /opt/datanika/landing-dist.incoming",
    );
    expect(GIT_NETWORK.test(commandsOnly(stepBlock(broken, "Publish on Aweb")))).toBe(true);
  });

  it("control B: publishing from a relative checkout path is caught", () => {
    const broken = mutate(
      "bash /opt/datanika/publish-web-root.sh /opt/datanika/landing-dist.incoming",
      "bash scripts/publish-web-root.sh /opt/datanika/landing-dist.incoming",
    );
    const block = stepBlock(broken, "Publish on Aweb");
    expect(block).not.toContain(SHIPPED_PUBLISHER);
    expect(/bash\s+scripts\/publish-web-root\.sh/.test(block)).toBe(true);
  });

  it("control C: dropping the checksum comparison is caught", () => {
    const broken = mutate(
      '          if [ "$LOCAL" != "$REMOTE_SUM" ]; then',
      '          if false; then',
    );
    const block = stepBlock(broken, "Ship the publish script to Aweb");
    expect(/if \[ "\$LOCAL" != "\$REMOTE_SUM" \]/.test(block)).toBe(false);
  });

  it("control D: a step id missing from the alert chain is caught", () => {
    const broken = mutate(
      "          SHIP_SCRIPT_OUTCOME: ${{ steps.ship_script.outcome }}\n",
      "",
    );
    expect(alertChainIds(broken)).not.toEqual(stepIds(broken));
    expect(stepIds(broken)).toContain("ship_script");
    expect(alertChainIds(broken)).not.toContain("ship_script");
  });

  it("control E: an alert chain out of execution order is caught", () => {
    const broken = mutate(
      "          SHIP_OUTCOME: ${{ steps.ship.outcome }}\n          SHIP_SCRIPT_OUTCOME: ${{ steps.ship_script.outcome }}\n",
      "          SHIP_SCRIPT_OUTCOME: ${{ steps.ship_script.outcome }}\n          SHIP_OUTCOME: ${{ steps.ship.outcome }}\n",
    );
    // Same SET of ids — only the order differs, which is exactly the defect a
    // set-comparison would miss.
    expect([...alertChainIds(broken)].sort()).toEqual([...stepIds(broken)].sort());
    expect(alertChainIds(broken)).not.toEqual(stepIds(broken));
  });
});
