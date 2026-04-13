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

async function loadPayload(): Promise<{ payload: AgentTiersPayload; source: "live" | "fallback" }> {
  try {
    const res = await fetchWithTimeout(ENDPOINT, FETCH_TIMEOUT_MS);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = (await res.json()) as AgentTiersPayload;
    // Minimal shape validation — catch any future breaking change loudly.
    if (
      typeof json.tier_count !== "number" ||
      typeof json.capability_count !== "number" ||
      !Array.isArray(json.tiers) ||
      !Array.isArray(json.golden_path) ||
      !Array.isArray(json.error_codes) ||
      !Array.isArray(json.ui_only_operations)
    ) {
      throw new Error("unexpected payload shape");
    }
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
