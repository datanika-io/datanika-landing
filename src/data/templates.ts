/**
 * Public Pipeline Templates — marketing surface for the in-app template
 * registry at `datanika/data/pipeline_templates.py`.
 *
 * Slugs MUST match the Python dataclass `PipelineTemplate.slug` exactly.
 * `whatItLoads` MUST be a subset of the Python
 * `dlt_config_defaults["resources"]` list for the same template (when that
 * list is present). Drift is enforced by `tests/templates-consistency.test.ts`
 * — the same SoT pattern used for `src/data/agent-tiers.ts`.
 *
 * See plans/product/SPEC_PUBLIC_TEMPLATE_LANDING.md for the full architectural
 * rationale (Option C).
 */

export interface Template {
  /** Must match Python `PipelineTemplate.slug` exactly. */
  slug: string;
  /** Connector slug from `src/data/connectors.ts` — source side. */
  sourceConnectorSlug: string;
  /** Connector slug from `src/data/connectors.ts` — destination side. */
  destinationConnectorSlug: string;
  /** Short source label shown in breadcrumbs / chips. */
  source: string;
  /** Short destination label shown in breadcrumbs / chips. */
  destination: string;
  /** Page H1 (shorter than seoTitle). */
  h1: string;
  /** Above-the-fold hook, one line. */
  tagline: string;
  /** Honest estimate shown in the hero ("5 minutes", etc.). */
  timeToFirstRun: string;
  /** Body paragraph under the hero — 1-3 sentences. */
  description: string;
  /** Short prose on the commercial use case. */
  useCase: string;
  /** Permissions / access / version requirements, listed literally. */
  prerequisites: string[];
  /**
   * Resources/tables the template pre-configures. Must be a subset of the
   * Python `dlt_config_defaults["resources"]` for this slug, OR empty if the
   * Python side does not enumerate resources (e.g., Postgres / CSV cases).
   */
  whatItLoads: string[];
  /** Illustrative post-load transformation (dbt / SQL). */
  exampleSql: string;
  /** Slugs of other templates sharing source or destination. */
  relatedTemplates: string[];
  /** SEO title, ≤60 chars. Primary keyword first. */
  seoTitle: string;
  /** Meta description, 150–160 chars. Primary keyword first. */
  seoDescription: string;
}

export const templates: Template[] = [
  {
    slug: "stripe-to-postgres",
    sourceConnectorSlug: "stripe",
    destinationConnectorSlug: "postgresql",
    source: "Stripe",
    destination: "PostgreSQL",
    h1: "Stripe to PostgreSQL Pipeline Template",
    tagline: "Revenue analytics in 5 minutes, not a week.",
    timeToFirstRun: "5 minutes",
    description:
      "Sync Stripe customers, charges, invoices, and subscriptions into a PostgreSQL warehouse for revenue analytics. Pre-configured schema, merge-mode writes, and dbt-ready staging tables.",
    useCase:
      "Revenue analytics, MRR/churn reporting, cohort analysis, and finance reconciliation workflows backed by your own Postgres instance instead of a SaaS BI tool.",
    prerequisites: [
      "Stripe account with a restricted API key that grants read access to Customers, Charges, Invoices, Subscriptions, Products, and Prices",
      "PostgreSQL 12+ database reachable from the Datanika egress allowlist",
      "Database user with CREATE SCHEMA privileges on the target database",
    ],
    whatItLoads: ["Customer", "Charge", "Invoice", "Subscription", "Product", "Price"],
    exampleSql: `-- Monthly revenue from merged Stripe invoices
select
  date_trunc('month', created) as month,
  sum(amount_paid) / 100.0       as revenue_usd,
  count(distinct customer)       as paying_customers
from raw_stripe.invoice
where status = 'paid'
group by 1
order by 1 desc;`,
    relatedTemplates: ["postgres-to-bigquery"],
    seoTitle: "Stripe to PostgreSQL Pipeline Template | Datanika",
    seoDescription:
      "Pre-configured Stripe → PostgreSQL data pipeline. Customers, charges, invoices, subscriptions. Schema, merge-mode writes, and dbt-ready staging. Start free.",
  },
  {
    slug: "postgres-to-bigquery",
    sourceConnectorSlug: "postgresql",
    destinationConnectorSlug: "bigquery",
    source: "PostgreSQL",
    destination: "BigQuery",
    h1: "PostgreSQL to BigQuery Pipeline Template",
    tagline: "Replicate OLTP to a warehouse without touching production.",
    timeToFirstRun: "10 minutes",
    description:
      "Extract any PostgreSQL schema into Google BigQuery with incremental merge-mode writes. Built for teams who need warehouse-grade analytics without blocking the transactional database.",
    useCase:
      "Move production Postgres data into BigQuery for dashboards, ML features, and ad-hoc analytics — without running heavy queries against the OLTP instance that serves live traffic.",
    prerequisites: [
      "PostgreSQL 12+ with a read-only user on the source schema",
      "Google Cloud project with a BigQuery dataset and a service-account JSON key",
      "BigQuery service account granted `roles/bigquery.dataEditor` on the target dataset",
    ],
    whatItLoads: [],
    exampleSql: `-- Daily active customers from the replicated Postgres schema
select
  date(created_at) as day,
  count(distinct user_id) as dau
from raw_postgres.events
where created_at >= current_date - 30
group by 1
order by 1 desc;`,
    relatedTemplates: ["stripe-to-postgres"],
    seoTitle: "PostgreSQL to BigQuery Pipeline Template | Datanika",
    seoDescription:
      "Pre-configured PostgreSQL → BigQuery data pipeline. Incremental merge sync, automatic schema mapping, dbt-ready staging. Offload OLTP analytics. Start free.",
  },
  {
    slug: "csv-to-duckdb",
    sourceConnectorSlug: "csv",
    destinationConnectorSlug: "duckdb",
    source: "CSV",
    destination: "DuckDB",
    h1: "CSV to DuckDB Pipeline Template",
    tagline: "Zero-credentials analytics on a local DuckDB warehouse.",
    timeToFirstRun: "2 minutes",
    description:
      "Upload CSV files and land them in a local DuckDB database with automatic schema inference. No cloud accounts, no API keys — the fastest way to try a real pipeline end-to-end.",
    useCase:
      "Prototype a pipeline before wiring up a real source or destination; run local analytics over exported CSVs; evaluate Datanika's dlt + dbt workflow without provisioning any cloud services.",
    prerequisites: [
      "A CSV file with a header row (no credentials or network access required)",
    ],
    whatItLoads: [],
    exampleSql: `-- Top categories from an uploaded CSV landed in DuckDB
select
  category,
  count(*)          as rows,
  sum(amount)       as total_amount
from raw_csv.uploaded_file
group by category
order by total_amount desc
limit 20;`,
    relatedTemplates: [],
    seoTitle: "CSV to DuckDB Pipeline Template | Datanika",
    seoDescription:
      "Pre-configured CSV → DuckDB pipeline. Schema inference, local warehouse, zero credentials. The fastest way to run a real dlt + dbt pipeline end-to-end. Start free.",
  },
];

/** Convenience slug set (used by tests and cross-link helpers). */
export const templateSlugs = templates.map((t) => t.slug);

/** Lookup by slug. Returns `undefined` if not found. */
export function getTemplate(slug: string): Template | undefined {
  return templates.find((t) => t.slug === slug);
}
