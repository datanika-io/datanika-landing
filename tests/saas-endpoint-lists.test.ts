import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Every place we name a SaaS connector's endpoints must name the same ones.
 *
 * ## Why this exists
 *
 * The upload form's "Select endpoints to load" picker is an `rx.foreach` over
 * `SAAS_DEFAULT_ENDPOINTS` (core, `ui/state/connection_state.py`). **A name absent
 * from that dict is a checkbox that is never rendered.** We had ten such names
 * across three surfaces, and the worst of them survived 39 days:
 *
 *   landing#285 merged 2026-07-22T13:05:08Z and deliberately left the Facebook
 *   list alone. Core removed `leads` at 2026-07-22T13:32:48Z — 28 minutes later,
 *   with a comment calling it "the core#532 mistake in miniature". Nothing
 *   connected the two, so `facebook-ads.md` kept walking readers through a
 *   checkbox that does not exist.
 *
 * Same shape as the MongoDB `auth_source` phantom: two hand-maintained lists with
 * nothing linking them. A schema is not a surface, and neither is a docs table.
 * Documenting a control that does not exist is worse than documenting a caveat —
 * a caveat costs the reader some confidence, a phantom costs them the afternoon
 * they spend looking for it.
 *
 * ## 🚨 What this test CANNOT do
 *
 * It cannot see core. `EXPECTED` below is a **dated snapshot**, so if core adds or
 * removes an endpoint and nobody touches this repo, this test stays green and the
 * docs are wrong again. It closes drift *between our own surfaces*, which is the
 * channel that actually failed, and it makes a core change a one-line edit here
 * that then reports every surface needing to follow.
 *
 * Re-derive rather than trusting this file:
 *
 *   gh api "repos/datanika-io/datanika-core/contents/datanika/ui/state/connection_state.py?ref=master" \
 *     --jq '.content' | base64 -d | sed -n '/SAAS_DEFAULT_ENDPOINTS/,/^}/p'
 *
 * Core's own `tests/test_services/test_saas_endpoint_selection.py` pins the picker
 * to the built dlt sources in both directions. This is the docs half of that.
 */

/** Snapshot of core `SAAS_DEFAULT_ENDPOINTS`, read from master 2026-08-30. */
const EXPECTED: Record<string, string[]> = {
  stripe: ["charges", "customers", "invoices", "prices", "products", "subscriptions"],
  github: ["commits", "issues", "pulls", "stargazers"],
  hubspot: ["companies", "contacts", "deals"],
  salesforce: ["accounts", "contacts", "opportunities"],
  shopify: ["customers", "orders", "products"],
  jira: ["issues", "projects"],
  slack: ["channels", "users"],
  google_analytics: ["report"],
  google_ads: ["report"],
  facebook_ads: ["ad_sets", "ads", "campaigns", "creatives"],
  zendesk: ["organizations", "tickets", "users"],
  airtable: ["tables"],
  notion: ["databases", "pages"],
  pipedrive: [
    "activities",
    "deals",
    "organizations",
    "persons",
    "pipelines",
    "stages",
    "users",
  ],
  freshdesk: ["agents", "companies", "contacts", "groups", "tickets"],
  asana: ["projects", "tags", "tasks", "users", "workspaces"],
};

/** Type key → guide filename, where they differ. */
const SLUG: Record<string, string> = {
  google_analytics: "google-analytics",
  google_ads: "google-ads",
  facebook_ads: "facebook-ads",
};

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf-8");
const guideFor = (key: string) =>
  read(`../src/content/connectors/${SLUG[key] ?? key}.md`);

describe("connector guides enumerate the endpoints the picker actually offers", () => {
  /**
   * Guides that spell the picker's checkboxes out as a list. Only `google_ads`
   * is excluded: it describes its single `report` resource in prose ("you'll see
   * a single checkbox") rather than with the shared "the list is …" sentence, so
   * the test below covers it. `google_analytics` *does* use the shared sentence
   * and belongs here — excluding it was this test's own first bug.
   */
  const ENUMERATED = Object.keys(EXPECTED).filter((k) => k !== "google_ads");

  it.each(ENUMERATED)("%s names exactly the offered endpoints", (key) => {
    const sentence = /the list is ([^.]+)\./.exec(guideFor(key));
    expect(
      sentence,
      `${key}: no "the list is …" sentence found. If the guide was reworded, ` +
        `update this matcher — do not drop the assertion, it is the only thing ` +
        `tying the guide to the picker.`,
    ).not.toBeNull();

    const documented = [
      ...new Set([...sentence![1].matchAll(/`([a-z_]+)`/g)].map((m) => m[1])),
    ].sort();

    expect(
      documented,
      `${key} documents endpoints that differ from the picker. A name we list ` +
        `but core does not offer is a checkbox the reader will hunt for and ` +
        `never find (this is exactly how facebook_ads "leads" survived 39 days). ` +
        `Re-derive from connection_state.py SAAS_DEFAULT_ENDPOINTS before ` +
        `changing EXPECTED.`,
    ).toEqual([...EXPECTED[key]].sort());
  });

  it("google_ads describes its single report resource", () => {
    const src = guideFor("google_ads");
    expect(
      /single checkbox/i.test(src) && /`report`/.test(src),
      `google_ads no longer describes the picker as offering one \`report\` ` +
        `checkbox. Both Google connectors are query APIs, not collections; ` +
        `inventing several endpoint names is the core#532 mistake.`,
    ).toBe(true);
  });
});

describe("the connections docs table matches the picker", () => {
  const PAGE = "../src/pages/docs/connections.astro";

  /** Endpoint names we used to advertise and cannot fetch. */
  const PHANTOMS: Array<[string, RegExp]> = [
    ["salesforce leads/campaigns", /<code>salesforce<\/code><\/td><td>[^<]*(leads|campaigns)/i],
    ["hubspot tickets/quotes", /<code>hubspot<\/code><\/td><td>[^<]*(tickets|quotes)/i],
    ["jira users/workflows", /<code>jira<\/code><\/td><td>[^<]*(users|workflows)/i],
    ["slack messages/threads", /<code>slack<\/code><\/td><td>[^<]*(messages|threads)/i],
    ["zendesk groups", /<code>zendesk<\/code><\/td><td>[^<]*groups/i],
    ["facebook_ads leads", /<code>facebook_ads<\/code><\/td><td>[^<]*leads/i],
  ];

  it.each(PHANTOMS)("does not re-advertise %s", (_label, re) => {
    expect(
      re.test(read(PAGE)),
      `connections.astro matched ${re}. That row lists a resource the endpoint ` +
        `picker does not offer, so a reader cannot select it. Re-derive from ` +
        `SAAS_DEFAULT_ENDPOINTS on core master.`,
    ).toBe(false);
  });

  it("lists every SaaS type core supports", () => {
    const src = read(PAGE);
    for (const key of Object.keys(EXPECTED)) {
      expect(
        new RegExp(`<code>${key}</code>`).test(src),
        `connections.astro has no row for \`${key}\`, which core supports. ` +
          `google_ads, pipedrive, freshdesk and asana were all missing when ` +
          `this test was written — an omission is a quieter error than a ` +
          `phantom, but it still sends people to a competitor.`,
      ).toBe(true);
    }
  });
});

describe("marketing copy does not sell endpoints we cannot fetch", () => {
  it("connectors.ts does not advertise Facebook Ads leads or Salesforce leads/campaigns", () => {
    const src = read("../src/data/connectors.ts");

    // Scoped to the two entries that carried the overclaim; `leads` is a
    // legitimate word elsewhere on the site, so a bare search would be noise.
    const facebook = /Facebook Ads[^"]*?leads|Facebook and Meta[^"]*?leads/i;
    const salesforce = /Salesforce[^"]*?\bleads\b/i;

    expect(
      facebook.test(src),
      `connectors.ts sells Facebook Ads "leads". Lead records hang off a ` +
        `lead-gen form rather than the ad account, so the loader cannot reach ` +
        `them and core removed the endpoint deliberately. This text ships in a ` +
        `meta description, which is the surface a search result shows.`,
    ).toBe(false);

    expect(
      salesforce.test(src),
      `connectors.ts sells Salesforce "leads". The picker offers accounts, ` +
        `contacts and opportunities only.`,
    ).toBe(false);
  });
});
