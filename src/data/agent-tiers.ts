/**
 * Single source of truth (SoT) for the agent capability tier structure.
 *
 * At build time, fetches `/api/v1/meta/agent-tiers` from the live core API
 * at app.datanika.io. That endpoint is the canonical shape — frozen by
 * `tests/test_services/test_agent_tiers.py::TestJsonSerialization` in the
 * datanika-core repo. If the fetch fails (network, 403, non-JSON), falls
 * back to the checked-in snapshot at `./agent-tiers.fallback.json` and
 * emits a build warning.
 *
 * This module replaces the hardcoded `tiers` arrays that previously lived
 * in `src/pages/ai-agents.astro` and `src/pages/docs/ai-agents.astro`, which
 * drifted out of sync with core and produced the 5-vs-6 count contradiction
 * caught on PR #97. See datanika-io/datanika-landing#108.
 *
 * Usage (in any .astro or .ts file):
 *   import { tiers, tierCount, capabilityCount, goldenPath,
 *            errorCodes, uiOnlyOperations } from "../data/agent-tiers";
 */

import fallback from "./agent-tiers.fallback.json";

const ENDPOINT = "https://app.datanika.io/api/v1/meta/agent-tiers";
const USER_AGENT = "Mozilla/5.0 (compatible; DatanikaAstroBuild/1.0; +https://datanika.io)";
const FETCH_TIMEOUT_MS = 5000;

export interface AgentCapability {
  name: string;
  description: string;
  endpoints: string[];
}

export interface AgentTier {
  number: number;
  name: string;
  summary: string;
  capabilities: AgentCapability[];
}

export interface AgentErrorCode {
  code: string;
  meaning: string;
  action: string;
}

export interface AgentTiersPayload {
  tier_count: number;
  capability_count: number;
  tiers: AgentTier[];
  golden_path: string[];
  error_codes: AgentErrorCode[];
  ui_only_operations: string[];
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Strict shape validation — walks `tiers[].capabilities[].endpoints` and
 * `error_codes[]` so a malformed nested payload trips the catch block in
 * `loadPayload` and we fall back to the snapshot with a warning. Throws on
 * any depth-1 shape violation. Exported so the consistency test can exercise
 * it without round-tripping a real fetch.
 *
 * Depth-1 is the sweet spot: deep enough to catch the bug class that would
 * crash `.astro` rendering at `.map()` on missing arrays, shallow enough
 * that we're not reimplementing a JSON schema validator.
 *
 * See datanika-io/datanika-landing#123.
 */
export function validatePayload(json: unknown): asserts json is AgentTiersPayload {
  if (json === null || typeof json !== "object") {
    throw new Error("payload is not an object");
  }
  const p = json as Record<string, unknown>;
  if (typeof p.tier_count !== "number") throw new Error("tier_count is not a number");
  if (typeof p.capability_count !== "number")
    throw new Error("capability_count is not a number");
  if (!Array.isArray(p.tiers)) throw new Error("tiers is not an array");
  if (!Array.isArray(p.golden_path)) throw new Error("golden_path is not an array");
  if (!Array.isArray(p.error_codes)) throw new Error("error_codes is not an array");
  if (!Array.isArray(p.ui_only_operations))
    throw new Error("ui_only_operations is not an array");

  if (p.tiers.length === 0) throw new Error("tiers is empty");
  p.tiers.forEach((tier, ti) => {
    if (tier === null || typeof tier !== "object") throw new Error(`tiers[${ti}] not an object`);
    const t = tier as Record<string, unknown>;
    if (typeof t.number !== "number") throw new Error(`tiers[${ti}].number not a number`);
    if (typeof t.name !== "string" || t.name.length === 0)
      throw new Error(`tiers[${ti}].name missing`);
    if (typeof t.summary !== "string") throw new Error(`tiers[${ti}].summary missing`);
    if (!Array.isArray(t.capabilities))
      throw new Error(`tiers[${ti}].capabilities not an array`);
    if (t.capabilities.length === 0) throw new Error(`tiers[${ti}].capabilities empty`);
    t.capabilities.forEach((cap, ci) => {
      if (cap === null || typeof cap !== "object")
        throw new Error(`tiers[${ti}].capabilities[${ci}] not an object`);
      const c = cap as Record<string, unknown>;
      if (typeof c.name !== "string" || c.name.length === 0)
        throw new Error(`tiers[${ti}].capabilities[${ci}].name missing`);
      if (typeof c.description !== "string")
        throw new Error(`tiers[${ti}].capabilities[${ci}].description missing`);
      if (!Array.isArray(c.endpoints))
        throw new Error(`tiers[${ti}].capabilities[${ci}].endpoints not an array`);
      if (c.endpoints.length === 0)
        throw new Error(`tiers[${ti}].capabilities[${ci}].endpoints empty`);
      c.endpoints.forEach((ep, ei) => {
        if (typeof ep !== "string" || ep.length === 0)
          throw new Error(`tiers[${ti}].capabilities[${ci}].endpoints[${ei}] not a string`);
      });
    });
  });

  p.error_codes.forEach((code, i) => {
    if (code === null || typeof code !== "object")
      throw new Error(`error_codes[${i}] not an object`);
    const e = code as Record<string, unknown>;
    if (typeof e.code !== "string" || e.code.length === 0)
      throw new Error(`error_codes[${i}].code missing`);
    if (typeof e.meaning !== "string") throw new Error(`error_codes[${i}].meaning missing`);
    if (typeof e.action !== "string") throw new Error(`error_codes[${i}].action missing`);
  });
}

async function loadPayload(): Promise<{ payload: AgentTiersPayload; source: "live" | "fallback" }> {
  try {
    const res = await fetchWithTimeout(ENDPOINT, FETCH_TIMEOUT_MS);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    validatePayload(json);
    return { payload: json, source: "live" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[agent-tiers] live fetch of ${ENDPOINT} failed (${msg}) — using checked-in fallback snapshot at src/data/agent-tiers.fallback.json. ` +
        "Run 'npm run sync:agent-tiers' after deploying a core change to refresh it.",
    );
    return { payload: fallback as AgentTiersPayload, source: "fallback" };
  }
}

const { payload, source } = await loadPayload();

if (source === "live") {
  console.info(
    `[agent-tiers] loaded live payload: ${payload.tier_count} tiers, ${payload.capability_count} capabilities, ${payload.golden_path.length} golden-path steps, ${payload.error_codes.length} error codes`,
  );
}

export const tiers: AgentTier[] = payload.tiers;
export const tierCount: number = payload.tier_count;
export const capabilityCount: number = payload.capability_count;
export const goldenPath: string[] = payload.golden_path;
export const errorCodes: AgentErrorCode[] = payload.error_codes;
export const uiOnlyOperations: string[] = payload.ui_only_operations;

/** Flattened list of every capability, tagged with its parent tier number. */
export const allCapabilities: Array<AgentCapability & { tierNumber: number; tierName: string }> =
  tiers.flatMap((tier) =>
    tier.capabilities.map((cap) => ({ ...cap, tierNumber: tier.number, tierName: tier.name })),
  );

/**
 * Convert markdown-ish inline syntax (`code` + **bold**) into safe HTML.
 * Used for rendering `goldenPath` and `uiOnlyOperations` strings, which
 * are authored in markdown style in core. Safe because the source is
 * Engineering's SoT, not user input — escape anything external first if
 * you extend this to user content.
 */
export function renderInline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}
