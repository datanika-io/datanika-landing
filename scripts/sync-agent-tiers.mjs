#!/usr/bin/env node
/**
 * Refresh `src/data/agent-tiers.fallback.json` from the live core API.
 *
 * `src/data/agent-tiers.ts` fetches the tier structure at build time and falls
 * back to that checked-in snapshot when the fetch fails. Its warning has always
 * told you to "run 'npm run sync:agent-tiers'" — but until 2026-07-21 no such
 * script existed, so the documented remedy was a dead end. This is it.
 *
 * Run it after a core change that alters the tier/capability structure:
 *   npm run sync:agent-tiers
 *
 * Keep the User-Agent in sync with `src/data/agent-tiers.ts`. It is a plain
 * product token on purpose: the Cloudflare edge in front of app.datanika.io
 * 403s the literal token `DatanikaAstroBuild`, which is what silently pinned
 * every build to the snapshot before it was isolated.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ENDPOINT = "https://app.datanika.io/api/v1/meta/agent-tiers";
const USER_AGENT = "Datanika-Landing-Build/1.0 (+https://datanika.io)";
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/data/agent-tiers.fallback.json",
);

/** Mirrors the depth-1 validation in agent-tiers.ts — don't write a bad snapshot. */
function assertShape(p) {
  const fail = (m) => {
    throw new Error(`unexpected payload shape: ${m}`);
  };
  if (!p || typeof p !== "object") fail("not an object");
  if (typeof p.tier_count !== "number") fail("tier_count is not a number");
  if (typeof p.capability_count !== "number") fail("capability_count is not a number");
  for (const key of ["tiers", "golden_path", "error_codes", "ui_only_operations"]) {
    if (!Array.isArray(p[key])) fail(`${key} is not an array`);
  }
  if (p.tiers.length !== p.tier_count) {
    fail(`tiers.length (${p.tiers.length}) !== tier_count (${p.tier_count})`);
  }
  for (const t of p.tiers) {
    if (typeof t.number !== "number" || typeof t.name !== "string") fail("bad tier");
    if (!Array.isArray(t.capabilities)) fail(`tier ${t.number} capabilities is not an array`);
    for (const c of t.capabilities) {
      if (typeof c.name !== "string") fail(`bad capability in tier ${t.number}`);
      if (!Array.isArray(c.endpoints)) fail(`bad endpoints in tier ${t.number}`);
    }
  }
  for (const e of p.error_codes) {
    if (typeof e.code !== "string" || typeof e.meaning !== "string") fail("bad error_code");
  }
}

const res = await fetch(ENDPOINT, {
  headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
});

if (!res.ok) {
  console.error(`✗ ${ENDPOINT} returned HTTP ${res.status}`);
  if (res.status === 403) {
    console.error(
      "  A 403 here is the Cloudflare edge, not the origin — check the WAF/bot rules\n" +
        "  on the datanika.io zone. (An origin failure shows up as 502.)",
    );
  }
  process.exit(1);
}

const payload = await res.json();
assertShape(payload);

const next = JSON.stringify(payload, null, 2) + "\n";
let prev = "";
try {
  prev = readFileSync(OUT, "utf-8");
} catch {
  /* first run — no existing snapshot */
}

if (prev === next) {
  console.log(
    `✓ snapshot already current (${payload.tier_count} tiers, ` +
      `${payload.capability_count} capabilities) — nothing written`,
  );
  process.exit(0);
}

writeFileSync(OUT, next);
console.log(
  `✓ refreshed ${OUT}\n` +
    `  ${payload.tier_count} tiers, ${payload.capability_count} capabilities, ` +
    `${payload.golden_path.length} golden-path steps, ${payload.error_codes.length} error codes`,
);
