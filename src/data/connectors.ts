export interface Connector {
  slug: string;
  name: string;
  category: string;
  direction: "source" | "destination" | "both";
  description: string;
  useCases: string[];
  configFields: { name: string; description: string }[];
  // Optional. Known limitations of the *shipped* connector, rendered as a
  // callout under the Configuration table. Use this for things the product
  // genuinely cannot do yet — not for setup gotchas, which belong in the
  // /docs/connectors/<slug>/ guide. Cite the tracking issue so the copy is
  // greppable when it closes.
  limitations?: string[];
  // Optional. Set when core has WITHDRAWN the connector from the picker, i.e.
  // it cannot be created in the app at all right now. This is a different fact
  // from `limitations`, which describes a connector you can create that cannot
  // do some particular thing.
  //
  // The page stays published — a withdrawal is temporary and 301ing away a
  // ranking connector page is the landing#294 mistake — but the entry drops out
  // of `availableConnectors`, which is what every published count derives from.
  // Core does exactly this with `WITHDRAWN_SOURCE_TYPES` in
  // `connection_service.py`, and its README count is `len(ConnectionType)` minus
  // that set. Ours has to move the same way or the two numbers diverge, which is
  // landing#294 in the opposite direction.
  //
  // Cite the tracking issue in the text so the copy is greppable when it closes.
  withdrawn?: string;
  related: string[]; // slugs of related connectors
  // Optional SEO overrides. When set, the [slug].astro template uses these
  // instead of the default `${name} Connector — Datanika` / description /
  // name-as-H1 pattern. Populated per plans/SEO_KEYWORDS.md rewrite rules
  // (title ≤60 chars, meta 150–160 chars, primary keyword first).
  seoTitle?: string;
  seoDescription?: string;
  seoH1?: string;
}

export const connectors: Connector[] = [
  // --- Databases (source & destination) ---
  {
    slug: "postgresql",
    name: "PostgreSQL",
    category: "Database",
    direction: "both",
    description: "Connect to PostgreSQL 12+ as a source to extract data or as a destination to load transformed data. Supports full-database replication, single-table extraction, and incremental loading.",
    useCases: [
      "Replicate production PostgreSQL to a warehouse for analytics",
      "Sync PostgreSQL tables to BigQuery or Snowflake",
      "Use as a destination for dbt-transformed data",
      "Incremental loading with change tracking",
    ],
    configFields: [
      { name: "host", description: "Database hostname" },
      { name: "port", description: "Port number (default: 5432)" },
      { name: "database", description: "Database name" },
      { name: "user", description: "Username" },
      { name: "password", description: "Password (encrypted at rest)" },
    ],
    related: ["mysql", "bigquery", "snowflake", "redshift"],
    seoTitle: "PostgreSQL Data Pipeline | Datanika",
    seoDescription: "PostgreSQL data pipeline to replicate tables to BigQuery, Snowflake, or any warehouse. Incremental sync, dbt transforms, and scheduling built in. Start free.",
    seoH1: "PostgreSQL Data Pipeline",
  },
  {
    slug: "mysql",
    name: "MySQL",
    category: "Database",
    // Source-only. Corrected 2026-09-01 — see the `direction` note above
    // `sourceConnectors`. It was "both" and dlt has never had a mysql
    // destination (core#865).
    direction: "source",
    description: "Connect to MySQL 5.7+ or MariaDB as a source. Extract full databases or individual tables with incremental loading support.",
    useCases: [
      "Migrate MySQL data to a cloud warehouse",
      "Replicate e-commerce MySQL databases for reporting",
      "Sync MySQL to PostgreSQL or BigQuery",
      "Incremental extraction for large tables",
    ],
    configFields: [
      { name: "host", description: "Database hostname" },
      { name: "port", description: "Port number (default: 3306)" },
      { name: "database", description: "Database name" },
      { name: "user", description: "Username" },
      { name: "password", description: "Password (encrypted at rest)" },
    ],
    limitations: [
      "Extract only — MySQL cannot receive data. It is not a load destination: an upload that targets MySQL fails with an unhandled AttributeError, because dlt has no MySQL destination and never has. This was advertised for as long as the entry existed; it is absent, not degraded, and there is no configuration that works around it. Tracked as core#865.",
      "Not available as a dbt transformation target. Pipelines and transformations run dbt, and no maintained dbt adapter for MySQL exists — the only one ever published was last released in April 2024 and pins dbt-core 1.7, which held back security updates across the rest of the stack. Extract from MySQL into a warehouse and transform there: PostgreSQL, SQL Server, ClickHouse, DuckDB, BigQuery, Snowflake and Redshift are all dbt targets. Tracked as core#825.",
    ],
    related: ["postgresql", "bigquery", "snowflake", "mssql"],
    seoTitle: "MySQL ETL Tool — Database Pipeline | Datanika",
    seoDescription: "MySQL ETL tool to replicate databases to BigQuery, Snowflake, or PostgreSQL. Incremental sync, dbt transforms, and scheduling built in. Start free today.",
    seoH1: "MySQL ETL Tool",
  },
  {
    slug: "mssql",
    name: "Microsoft SQL Server",
    category: "Database",
    direction: "both",
    description: "Connect to SQL Server 2016+ or Azure SQL Database as a source or destination. Supports full-database and single-table extraction.",
    useCases: [
      "Extract data from legacy SQL Server systems",
      "Replicate SQL Server to a modern cloud warehouse",
      "Sync ERP or CRM data stored in SQL Server",
      "Load transformed data back into SQL Server",
    ],
    configFields: [
      { name: "host", description: "SQL Server hostname" },
      { name: "port", description: "Port number (default: 1433)" },
      { name: "database", description: "Database name" },
      { name: "user", description: "Username" },
      { name: "password", description: "Password (encrypted at rest)" },
    ],
    related: ["postgresql", "mysql", "synapse", "bigquery", "oracle"],
    seoTitle: "SQL Server ETL Tool — MSSQL Pipeline | Datanika",
    seoDescription: "SQL Server ETL tool to replicate MSSQL databases to BigQuery, Snowflake, or Redshift. Built-in dbt transforms and scheduling. Self-hostable. Start free.",
    seoH1: "SQL Server ETL Tool",
  },
  {
    slug: "sqlite",
    name: "SQLite",
    category: "Database",
    // Source-only. Same correction and same cause as MySQL (core#865).
    direction: "source",
    description: "Connect to local SQLite database files as a source. Useful for extracting data from embedded applications and desktop or mobile app databases.",
    useCases: [
      "Extract data from mobile or embedded app databases",
      "Migrate SQLite data to a production database",
      "Pull a desktop application's local store into a warehouse",
    ],
    configFields: [
      { name: "path", description: "Path to the SQLite database file" },
    ],
    limitations: [
      "Extract only — SQLite cannot receive data. It is not a load destination: an upload that targets a SQLite file fails with an unhandled AttributeError, because dlt has no SQLite destination. Advertised for as long as the entry existed; absent, not degraded. Tracked as core#865.",
      "Not available as a dbt transformation target either. No SQLite dbt adapter ships in Datanika, so a pipeline or transformation cannot run against a SQLite file. Extract into a warehouse and transform there. Tracked as core#862.",
    ],
    related: ["postgresql", "duckdb", "mysql"],
    seoTitle: "SQLite Data Export & Pipeline | Datanika",
    seoDescription: "Export SQLite data to PostgreSQL, BigQuery, or Snowflake. Lightweight connector for embedded databases and local analytics. Open source. Start free today.",
    seoH1: "SQLite Data Export",
  },
  {
    slug: "clickhouse",
    name: "ClickHouse",
    category: "Database",
    direction: "both",
    description: "Connect to ClickHouse 21+ as a source or destination. Ideal for analytics workloads with support for clustered ReplicatedMergeTree engines.",
    useCases: [
      "Load data into ClickHouse for real-time analytics",
      "Extract ClickHouse data for cross-platform reporting",
      "Use as a high-performance analytics destination",
      "Aggregate event streams from multiple sources",
    ],
    configFields: [
      { name: "host", description: "ClickHouse hostname" },
      { name: "port", description: "HTTP port (default: 8123)" },
      { name: "database", description: "Database name" },
      { name: "user", description: "Username" },
      { name: "password", description: "Password (encrypted at rest)" },
      { name: "secure", description: "Use HTTPS (enable for ClickHouse Cloud and TLS instances) (optional)" },
      { name: "cluster_replication", description: "Enable cluster replication (ReplicatedMergeTree) (optional)" },
    ],
    related: ["postgresql", "bigquery", "kafka", "snowflake"],
    seoTitle: "ClickHouse ETL — Analytics Ingestion | Datanika",
    seoDescription: "ClickHouse ETL tool to load data from PostgreSQL, Kafka, S3, and 30+ sources. Supports clustered ReplicatedMergeTree. dbt transforms built in. Start free.",
    seoH1: "ClickHouse ETL",
  },
  {
    slug: "duckdb",
    name: "DuckDB",
    category: "Database",
    direction: "both",
    description: "Connect to DuckDB for embedded analytical queries. Great as a lightweight local warehouse for development or small-scale analytics.",
    useCases: [
      "Use as a fast local analytics destination",
      "Development and testing environment for pipelines",
      "Process Parquet and CSV files with SQL",
    ],
    configFields: [
      { name: "path", description: "Path to the DuckDB database file" },
    ],
    related: ["sqlite", "postgresql", "parquet", "csv"],
    seoTitle: "DuckDB Data Pipeline | Datanika",
    seoDescription: "DuckDB data pipeline for embedded analytics. Use as a fast local destination or extract DuckDB data to cloud warehouses. Open source. Start free on Datanika.",
    seoH1: "DuckDB Data Pipeline",
  },
  {
    slug: "oracle",
    name: "Oracle",
    category: "Database",
    direction: "source",
    description: "Connect to Oracle Database 12c+ as a source and extract tables into your warehouse. Uses the oracledb thin driver — no Oracle client install required. Ideal for offloading analytics from enterprise ERP and OLTP systems.",
    useCases: [
      "Extract Oracle ERP and finance data into a cloud warehouse",
      "Offload analytics from a production Oracle OLTP database",
      "Replicate Oracle tables to BigQuery, Snowflake, or PostgreSQL",
      "Incremental extraction of large Oracle tables",
    ],
    configFields: [
      { name: "host", description: "Oracle hostname" },
      { name: "port", description: "Port number (default: 1521)" },
      { name: "database", description: "Service name (e.g. a PDB like XEPDB1, RAC, or Autonomous service); or the SID when 'use_sid' is enabled" },
      { name: "user", description: "Username" },
      { name: "password", description: "Password (encrypted at rest)" },
      { name: "use_sid", description: "Connect by SID instead of service name (legacy single-instance Oracle) (optional)" },
    ],
    related: ["postgresql", "mysql", "mssql", "bigquery"],
    seoTitle: "Oracle ETL Tool — Data Pipeline | Datanika",
    seoDescription: "Oracle ETL tool to replicate Oracle tables to BigQuery, Snowflake, or PostgreSQL. Incremental sync, dbt transforms, and scheduling built in. Start free today.",
    seoH1: "Oracle ETL Tool",
  },

  // --- Cloud Warehouses (source & destination) ---
  {
    slug: "bigquery",
    name: "Google BigQuery",
    category: "Cloud Warehouse",
    direction: "destination",
    description: "Connect to Google BigQuery using a service account and load data into it at scale. BigQuery is a destination in Datanika, not a source.",
    useCases: [
      "Centralize data from multiple sources into BigQuery",
      "Load Stripe, HubSpot, or Salesforce data for analytics",
      "Land Postgres, MySQL and SaaS data in one BigQuery dataset",
      "Run dbt transformations on BigQuery data",
    ],
    configFields: [
      { name: "project", description: "GCP project ID" },
      { name: "dataset", description: "BigQuery dataset name" },
      { name: "keyfile_json", description: "Service account JSON (paste the full key file) (encrypted at rest)" },
    ],
    related: ["snowflake", "redshift", "postgresql", "stripe"],
    seoTitle: "BigQuery ETL Tool — Load Data Fast | Datanika",
    seoDescription: "BigQuery ETL tool to load PostgreSQL, MySQL, Stripe, and 30+ sources. Built-in dbt transforms, scheduling, and monitoring. Start free on Datanika today.",
    seoH1: "BigQuery ETL Tool",
  },
  {
    slug: "snowflake",
    name: "Snowflake",
    category: "Cloud Warehouse",
    direction: "destination",
    description: "Connect to Snowflake using account credentials and load data from any source into it. Snowflake is a destination in Datanika, not a source.",
    useCases: [
      "Build a central data warehouse in Snowflake",
      "Load SaaS data (Salesforce, HubSpot) into Snowflake",
      "Run dbt transformations on Snowflake",
      "Consolidate multi-region operational databases into one warehouse",
    ],
    configFields: [
      { name: "account", description: "Snowflake account identifier (e.g. xy12345.us-east-1)" },
      { name: "user", description: "Username" },
      { name: "password", description: "Password (encrypted at rest)" },
      { name: "database", description: "Database name" },
      { name: "warehouse", description: "Warehouse name" },
      { name: "schema", description: "Schema name" },
      { name: "role", description: "Role" },
    ],
    related: ["bigquery", "redshift", "databricks", "postgresql"],
    seoTitle: "Snowflake Data Pipeline | Datanika",
    seoDescription: "Snowflake data pipeline for loading PostgreSQL, Stripe, Salesforce, and 30+ sources. dbt transforms and scheduling built in — no separate tools. Start free.",
    seoH1: "Snowflake Data Pipeline",
  },
  {
    slug: "redshift",
    name: "Amazon Redshift",
    category: "Cloud Warehouse",
    direction: "destination",
    description: "Connect to Amazon Redshift as a destination. Ideal for AWS-centric data stacks, with S3 staging for fast bulk loads.",
    useCases: [
      "Centralize AWS data in Redshift",
      "Load S3 data into Redshift via dlt",
      "Run dbt transformations on Redshift",
      "Consolidate on-premise Postgres and MySQL into Redshift",
    ],
    configFields: [
      { name: "host", description: "Redshift cluster endpoint" },
      { name: "port", description: "Port number (default: 5439)" },
      { name: "database", description: "Database name" },
      { name: "user", description: "Username" },
      { name: "password", description: "Password (encrypted at rest)" },
    ],
    related: ["bigquery", "snowflake", "s3", "postgresql"],
    seoTitle: "Redshift ETL Tool — AWS Data Pipeline | Datanika",
    seoDescription: "Redshift ETL tool to load data from PostgreSQL, S3, Stripe, and 30+ other sources into Amazon Redshift. dbt transforms and scheduling built in. Start free.",
    seoH1: "Redshift ETL Tool",
  },
  {
    slug: "databricks",
    name: "Databricks",
    category: "Cloud Warehouse",
    direction: "destination",
    description: "Connect to Databricks Lakehouse using a personal access token and load data into Delta tables. Databricks is a destination in Datanika, not a source.",
    useCases: [
      "Load data into Databricks Delta Lake",
      "Sync SaaS data into Databricks for ML workflows",
      "Consolidate PostgreSQL, MySQL and SaaS sources into one lakehouse",
    ],
    configFields: [
      { name: "host", description: "Databricks workspace host" },
      { name: "http_path", description: "SQL warehouse HTTP path" },
      { name: "token", description: "Personal access token (encrypted at rest)" },
      { name: "catalog", description: "Unity Catalog name" },
    ],
    limitations: [
      "Not available as a dbt transformation target. Databricks works as a load destination — dlt writes into Delta tables — but no Databricks dbt adapter ships in Datanika: dbt-databricks requires SQLAlchemy 1.x and the rest of the stack is on 2.x. So a pipeline or transformation cannot run against a Databricks workspace. Tracked as core#862.",
    ],
    related: ["snowflake", "bigquery", "s3", "redshift"],
    seoTitle: "Databricks Data Ingestion | Datanika",
    seoDescription: "Load data into Databricks Delta Lake from PostgreSQL, Stripe, S3, and 30+ sources. Incremental sync, monitoring and scheduling built in. Start free today.",
    seoH1: "Databricks Data Ingestion",
  },
  {
    slug: "synapse",
    name: "Azure Synapse Analytics",
    category: "Cloud Warehouse",
    direction: "destination",
    description: "Connect to Azure Synapse Analytics (formerly SQL Data Warehouse) and load data into it from any source. Synapse is a destination in Datanika, not a source.",
    useCases: [
      "Build an Azure-centric analytics platform",
      "Load data from on-premise SQL Server to Synapse",
      "Centralize Microsoft ecosystem data",
    ],
    configFields: [
      { name: "host", description: "Synapse SQL endpoint" },
      { name: "port", description: "Port number (default: 1433)" },
      { name: "database", description: "Database/pool name" },
      { name: "user", description: "Username" },
      { name: "password", description: "Password (encrypted at rest)" },
    ],
    limitations: [
      "Not available as a dbt transformation target. Synapse works as a load destination, but no Synapse dbt adapter ships in Datanika: dbt-synapse requires SQLAlchemy 1.x and the rest of the stack is on 2.x. So a pipeline or transformation cannot run against a Synapse pool. Tracked as core#862.",
    ],
    related: ["mssql", "bigquery", "snowflake", "redshift"],
    seoTitle: "Azure Synapse ETL — Data Pipeline | Datanika",
    seoDescription: "Azure Synapse ETL tool to load data from SQL Server, PostgreSQL, and 30+ other sources. Incremental sync and scheduling built in. Self-hostable. Start free.",
    seoH1: "Azure Synapse ETL",
  },

  // --- NoSQL ---
  {
    slug: "mongodb",
    name: "MongoDB",
    category: "NoSQL",
    direction: "source",
    description: "Connect to MongoDB 4.0+ to extract collections as structured data. Works against self-hosted and self-managed deployments reachable over a plain connection; TLS-required hosts such as MongoDB Atlas are not supported yet.",
    useCases: [
      "Extract MongoDB collections into a SQL warehouse for analytics",
      "Flatten nested document structures into tabular data",
      "Sync MongoDB to BigQuery or Snowflake",
      "Build reports from MongoDB application data",
    ],
    configFields: [
      { name: "host", description: "MongoDB host" },
      { name: "port", description: "Port number (default: 27017)" },
      { name: "user", description: "Username" },
      { name: "password", description: "Password (encrypted at rest)" },
      { name: "database", description: "Database name" },
      { name: "auth_source", description: "Authentication database — the database the user is defined in (default: admin). No input in the connection form; settable only via the Use raw JSON checkbox. See limitations." },
    ],
    limitations: [
      "No TLS yet, so any deployment that requires it is unreachable. Every URI is built as a plain mongodb:// string with no transport options, so the handshake fails before authentication. MongoDB Atlas always requires TLS and therefore never connects. Amazon DocumentDB enables it by default, so a cluster works only if its tls parameter was explicitly set to disabled. Azure Cosmos DB's Mongo API and any self-hosted net.tls.mode: requireTLS are out for the same reason. Tracked as core#626.",
      "No mongodb+srv:// support, so an Atlas-style seedlist hostname cannot be entered. The form takes host and port separately. Tracked as core#626 alongside the TLS gap.",
      "Auth Source has no input in the connection form, which renders only Host, Port, User, Password and Database. Authentication always uses admin unless the config says otherwise, and the only way to say otherwise is the Use raw JSON checkbox. A connection carrying auth_source loses it the next time it is saved from the structured form, silently reverting to admin. Affects deployments whose MongoDB user is defined inside the target database rather than in admin. Tracked as core#638.",
    ],
    related: ["postgresql", "bigquery", "snowflake", "mysql"],
    seoTitle: "MongoDB to Warehouse Pipeline | Datanika",
    seoDescription: "Flatten MongoDB documents into structured warehouse tables. Automatic nested-to-relational mapping with dlt. dbt transforms built in. Start free on Datanika.",
    seoH1: "MongoDB to Warehouse",
  },

  // --- SaaS & APIs ---
  {
    slug: "stripe",
    name: "Stripe",
    category: "SaaS & API",
    direction: "source",
    description: "Extract payment data from Stripe — customers, invoices, subscriptions, products, charges, and more. Ideal for revenue analytics and financial reporting.",
    useCases: [
      "Build a revenue analytics dashboard",
      "Track subscription metrics (MRR, churn, LTV)",
      "Combine Stripe data with CRM data for a full customer view",
      "Automate financial reporting with dbt transformations",
    ],
    configFields: [
      { name: "api_key", description: "Stripe secret API key (encrypted at rest)" },
    ],
    related: ["bigquery", "snowflake", "hubspot", "salesforce"],
    seoTitle: "Stripe Data Pipeline for Analytics | Datanika",
    seoDescription: "Stripe data pipeline to load customers, invoices, subscriptions, and charges into BigQuery or Snowflake. Build MRR, churn, and LTV dashboards. Start free.",
    seoH1: "Stripe Data Pipeline",
  },
  {
    slug: "github",
    name: "GitHub",
    category: "SaaS & API",
    direction: "source",
    description: "Extract repository data from GitHub — issues, pull requests, commits, stargazers, and more. Great for engineering analytics and productivity tracking.",
    useCases: [
      "Track engineering velocity and PR cycle times",
      "Build dashboards for open-source project metrics",
      "Analyze issue patterns and bug trends",
      "Combine with Jira data for cross-platform project tracking",
    ],
    configFields: [
      { name: "access_token", description: "GitHub personal access token (encrypted at rest)" },
      { name: "owner", description: "Repository owner (user or org)" },
      { name: "repo", description: "Repository name" },
    ],
    related: ["jira", "slack", "bigquery", "postgresql"],
    seoTitle: "GitHub Data Export & Analytics | Datanika",
    seoDescription: "Export GitHub issues, PRs, commits, and stargazers to your data warehouse. Build engineering velocity dashboards with dbt. Open source. Start free today.",
    seoH1: "GitHub Data Export",
  },
  {
    slug: "hubspot",
    name: "HubSpot",
    category: "SaaS & API",
    direction: "source",
    description: "Extract CRM data from HubSpot — contacts, companies, deals, tickets, and quotes. Build a unified view of your sales and marketing funnel.",
    useCases: [
      "Sync HubSpot contacts and deals to your warehouse",
      "Build sales funnel analytics with dbt transformations",
      "Combine HubSpot with Stripe for revenue attribution",
      "Track marketing campaign performance",
    ],
    configFields: [
      { name: "api_key", description: "HubSpot private app access token (encrypted at rest)" },
    ],
    related: ["salesforce", "stripe", "bigquery", "snowflake", "pipedrive"],
    seoTitle: "HubSpot ETL — CRM Data Pipeline | Datanika",
    seoDescription: "HubSpot ETL to sync contacts, deals, and companies to BigQuery or Snowflake. Build sales funnel analytics with dbt. Open source, self-hostable. Start free.",
    seoH1: "HubSpot ETL",
  },
  {
    slug: "salesforce",
    name: "Salesforce",
    category: "SaaS & API",
    direction: "source",
    description: "Extract CRM data from Salesforce — accounts, contacts and opportunities. Enterprise-grade CRM analytics pipeline.",
    useCases: [
      "Replicate Salesforce objects to your data warehouse",
      "Build pipeline and forecast analytics",
      "Combine Salesforce with marketing data for attribution",
      "Create executive dashboards from CRM data",
    ],
    configFields: [
      { name: "client_id", description: "Connected app client ID" },
      { name: "client_secret", description: "Connected app client secret (encrypted at rest)" },
      { name: "username", description: "Salesforce username" },
      { name: "password", description: "Salesforce password (encrypted at rest)" },
      { name: "security_token", description: "Security token (encrypted at rest)" },
    ],
    related: ["hubspot", "stripe", "bigquery", "snowflake"],
    seoTitle: "Salesforce ETL — CRM to Warehouse | Datanika",
    seoDescription: "Salesforce ETL to replicate accounts, contacts and opportunities into BigQuery or Snowflake. Build pipeline velocity and forecast analytics. Start free.",
    seoH1: "Salesforce ETL",
  },
  {
    slug: "shopify",
    name: "Shopify",
    category: "SaaS & API",
    direction: "source",
    description: "Extract e-commerce data from Shopify — orders, products, customers, and inventory. Build analytics for your online store.",
    useCases: [
      "Build e-commerce analytics dashboards",
      "Track order trends, AOV, and customer cohorts",
      "Combine Shopify with Stripe for complete revenue view",
      "Analyze product performance and inventory",
    ],
    configFields: [
      { name: "shop_url", description: "Shopify store URL (e.g., mystore.myshopify.com)" },
      { name: "access_token", description: "Admin API access token (encrypted at rest)" },
    ],
    related: ["stripe", "google_analytics", "facebook_ads", "bigquery"],
    seoTitle: "Shopify Data Pipeline | Datanika",
    seoDescription: "Shopify data pipeline to load orders, customers, and products into BigQuery or Snowflake. Build e-commerce analytics with dbt transforms. Start free today.",
    seoH1: "Shopify Data Pipeline",
  },
  {
    slug: "jira",
    name: "Jira",
    category: "SaaS & API",
    direction: "source",
    description: "Extract project management data from Jira — issues, users, workflows, and projects. Track engineering execution and project health.",
    useCases: [
      "Build engineering productivity dashboards",
      "Track sprint velocity and cycle times",
      "Combine Jira with GitHub for full dev analytics",
      "Monitor project health across teams",
    ],
    configFields: [
      { name: "server_url", description: "Jira server URL" },
      { name: "email", description: "Account email" },
      { name: "api_token", description: "API token (encrypted at rest)" },
    ],
    related: ["github", "slack", "bigquery", "postgresql", "asana"],
    seoTitle: "Jira Data Export & Analytics | Datanika",
    seoDescription: "Export Jira issues, sprints, and workflows to your data warehouse. Track engineering velocity and project health with dbt transforms. Start free on Datanika.",
    seoH1: "Jira Data Export",
  },
  {
    slug: "slack",
    name: "Slack",
    category: "SaaS & API",
    direction: "source",
    description: "Extract communication data from Slack — channels, messages, users, and threads. Analyze team communication patterns and engagement.",
    useCases: [
      "Analyze team communication patterns",
      "Build internal search and knowledge base",
      "Track support channel response times",
      "Archive Slack data for compliance",
    ],
    configFields: [
      { name: "token", description: "Slack bot token (encrypted at rest)" },
    ],
    related: ["jira", "github", "bigquery", "postgresql"],
    seoTitle: "Slack Data Export & Archive | Datanika",
    seoDescription: "Export Slack channels, messages, and users to your data warehouse. Analyze communication patterns and archive for compliance. Open source. Start free today.",
    seoH1: "Slack Data Export",
  },
  {
    slug: "google-analytics",
    name: "Google Analytics",
    category: "SaaS & API",
    direction: "source",
    description: "Extract GA4 report data using a service account. Analyze website traffic, user behavior, and conversion funnels in your warehouse.",
    useCases: [
      "Combine web analytics with CRM and revenue data",
      "Build custom attribution models with dbt",
      "Track marketing campaign ROI across channels",
      "Create cross-platform user journey analytics",
    ],
    configFields: [
      { name: "property_id", description: "GA4 property ID" },
      { name: "service_account_json", description: "Service account JSON (encrypted at rest)" },
    ],
    related: ["google-ads", "facebook-ads", "bigquery", "snowflake"],
    seoTitle: "GA4 to BigQuery Pipeline | Datanika",
    seoDescription: "Load GA4 report data into BigQuery or Snowflake via service account. Build custom attribution models with dbt transforms. Open source. Start free on Datanika.",
    seoH1: "GA4 to BigQuery",
  },
  // Restored in core#592 (reopening and closing core#555) after being withdrawn
  // in core#567. `WITHDRAWN_SOURCE_TYPES` is empty again.
  //
  // What changed is *who holds the developer token*, not the Google process.
  // The token is still issued per manager account after Google's review — but
  // the user brings their own, exactly as they bring a service-account JSON, so
  // it is a form field rather than something we would have to hold on their
  // behalf. The friction is real and belongs in the copy, not hidden: a new
  // token starts at Test Account access and reaches production accounts only
  // after Basic access is granted. `/connectors/google-ads` no longer redirects.
  //
  // `configFields` mirrors CONFIG_SCHEMAS["google_ads"] in core's
  // connection_schemas.py. It is a *user* OAuth credential, not a service
  // account: service-account access to the Ads API needs Workspace
  // domain-wide delegation a self-serve user cannot arrange, which is why the
  // pre-withdrawal `service_account_json` field could never have worked.
  {
    slug: "google-ads",
    name: "Google Ads",
    category: "SaaS & API",
    direction: "source",
    description: "Extract Google Ads reporting data with your own developer token and OAuth credentials. Runs any GAQL query — campaign performance by day out of the box.",
    useCases: [
      "Build paid search analytics dashboards",
      "Track ROAS and conversion metrics",
      "Combine Google Ads with GA4 for a full-funnel view",
      "Automate ad performance reporting",
    ],
    configFields: [
      { name: "customer_id", description: "Google Ads customer ID — paste it with or without hyphens" },
      { name: "developer_token", description: "Developer token from your manager account's API Center (encrypted at rest)" },
      { name: "client_id", description: "OAuth client ID for an installed/desktop app" },
      { name: "client_secret", description: "OAuth client secret (encrypted at rest)" },
      { name: "refresh_token", description: "OAuth refresh token for the user authorizing access (encrypted at rest)" },
      { name: "login_customer_id", description: "Manager (MCC) customer ID — only when the OAuth user is a manager" },
    ],
    related: ["google-analytics", "facebook-ads", "bigquery", "snowflake"],
    seoTitle: "Google Ads Data Pipeline | Datanika",
    seoDescription: "Google Ads data pipeline to load campaign and performance metrics into BigQuery or Snowflake. Bring your own developer token, run any GAQL query. Start free.",
    seoH1: "Google Ads Data Pipeline",
  },
  {
    slug: "facebook-ads",
    name: "Facebook Ads",
    category: "SaaS & API",
    direction: "source",
    description: "Extract advertising data from Meta/Facebook Ads — campaigns, ad sets, ads and creatives. Build cross-channel marketing analytics.",
    useCases: [
      "Build cross-channel ad performance dashboards",
      "Track Facebook campaign ROI alongside Google Ads",
      "Analyze lead quality from Facebook Lead Ads",
      "Automate marketing spend reporting",
    ],
    configFields: [
      { name: "access_token", description: "Facebook Marketing API access token (encrypted at rest)" },
      { name: "account_id", description: "Ad account ID" },
    ],
    related: ["google-ads", "google-analytics", "bigquery", "shopify"],
    seoTitle: "Facebook Ads ETL — Meta Ads Pipeline | Datanika",
    seoDescription: "Load Facebook and Meta ad campaigns, ad sets and creatives into your data warehouse. Build cross-channel marketing analytics with dbt. Start free on Datanika.",
    seoH1: "Facebook Ads ETL",
  },
  {
    slug: "zendesk",
    name: "Zendesk",
    category: "SaaS & API",
    direction: "source",
    description: "Extract support data from Zendesk — tickets, users, organizations, and groups. Analyze support performance and customer satisfaction.",
    useCases: [
      "Build support analytics dashboards",
      "Track ticket resolution times and SLA compliance",
      "Combine Zendesk with CRM data for customer health scores",
      "Analyze support trends and common issues",
    ],
    configFields: [
      { name: "subdomain", description: "Zendesk subdomain (e.g., mycompany)" },
      { name: "email", description: "Agent email address" },
      { name: "api_token", description: "Zendesk API token (encrypted at rest)" },
    ],
    related: ["hubspot", "salesforce", "slack", "bigquery", "freshdesk"],
    seoTitle: "Zendesk Data Export & Analytics | Datanika",
    seoDescription: "Export Zendesk tickets, users, and organizations to your data warehouse. Track resolution times and SLA compliance with dbt transforms. Start free today.",
    seoH1: "Zendesk Data Export",
  },
  {
    slug: "airtable",
    name: "Airtable",
    category: "SaaS & API",
    direction: "source",
    description: "Extract table data from Airtable bases. Sync your Airtable workspace to a data warehouse for advanced analytics and reporting.",
    useCases: [
      "Sync Airtable project data to your warehouse",
      "Build reports from Airtable-managed workflows",
      "Combine Airtable data with other business tools",
      "Archive Airtable data for long-term analysis",
    ],
    configFields: [
      { name: "api_key", description: "Airtable personal access token (encrypted at rest)" },
      { name: "base_id", description: "Airtable base ID" },
    ],
    related: ["notion", "google-sheets", "bigquery", "postgresql"],
    seoTitle: "Airtable to Warehouse Pipeline | Datanika",
    seoDescription: "Sync Airtable bases to BigQuery, Snowflake, or PostgreSQL. Combine spreadsheet data with other sources using dbt transforms. Open source. Start free today.",
    seoH1: "Airtable to Warehouse",
  },
  {
    slug: "notion",
    name: "Notion",
    category: "SaaS & API",
    direction: "source",
    description: "Extract databases and pages from Notion. Sync your Notion workspace data to a warehouse for structured analytics.",
    useCases: [
      "Sync Notion databases to your warehouse",
      "Build analytics from Notion project tracking",
      "Archive Notion content for compliance",
      "Combine Notion data with other productivity tools",
    ],
    configFields: [
      { name: "api_key", description: "Notion integration token (encrypted at rest)" },
    ],
    related: ["airtable", "google-sheets", "jira", "bigquery"],
    seoTitle: "Notion Data Export & Pipeline | Datanika",
    seoDescription: "Export Notion databases and pages to your data warehouse. Build structured analytics from Notion workspace data with dbt transforms. Start free on Datanika.",
    seoH1: "Notion Data Export",
  },
  {
    slug: "pipedrive",
    name: "Pipedrive",
    category: "SaaS & API",
    direction: "source",
    description: "Extract CRM data from Pipedrive — deals, persons, organizations, activities, and pipelines. Build sales-velocity and revenue analytics from your sales funnel.",
    useCases: [
      "Build sales-funnel and win-rate analytics",
      "Track deal velocity and stage conversion",
      "Combine Pipedrive with Stripe for closed-won-to-revenue reporting",
      "Report on activity volume per sales rep",
    ],
    configFields: [
      { name: "api_key", description: "Pipedrive API token (encrypted at rest)" },
    ],
    related: ["hubspot", "salesforce", "stripe", "bigquery"],
    seoTitle: "Pipedrive ETL — CRM Data Pipeline | Datanika",
    seoDescription: "Pipedrive ETL to sync deals, contacts, and activities to BigQuery or Snowflake. Build sales pipeline analytics with dbt. Open source, self-hostable. Start free.",
    seoH1: "Pipedrive ETL",
  },
  {
    slug: "freshdesk",
    name: "Freshdesk",
    category: "SaaS & API",
    direction: "source",
    description: "Extract support data from Freshdesk — tickets, contacts, companies, agents, and conversations. Analyze support performance, SLA compliance, and CSAT.",
    useCases: [
      "Build support-analytics dashboards",
      "Track first-response and resolution times against SLAs",
      "Combine Freshdesk with CRM data for customer-health scores",
      "Analyze ticket volume and agent load",
    ],
    configFields: [
      { name: "domain", description: "Freshdesk domain (the <domain> in <domain>.freshdesk.com)" },
      { name: "api_key", description: "Freshdesk API key (encrypted at rest)" },
    ],
    related: ["zendesk", "hubspot", "salesforce", "bigquery"],
    seoTitle: "Freshdesk Data Export & Analytics | Datanika",
    seoDescription: "Export Freshdesk tickets, contacts, and agents to your data warehouse. Track resolution times and SLA compliance with dbt transforms. Start free today.",
    seoH1: "Freshdesk Data Export",
  },
  {
    slug: "asana",
    name: "Asana",
    category: "SaaS & API",
    direction: "source",
    description: "Extract project-management data from Asana — tasks, projects, sections, users, and stories. Build delivery and throughput analytics from your workspace.",
    useCases: [
      "Build delivery and throughput dashboards",
      "Track cycle time and completion rate",
      "Measure task load per assignee or team",
      "Combine Asana with GitHub or Jira for full delivery analytics",
    ],
    configFields: [
      { name: "api_key", description: "Asana personal access token (encrypted at rest)" },
    ],
    related: ["jira", "notion", "github", "bigquery"],
    seoTitle: "Asana Data Export & Reporting | Datanika",
    seoDescription: "Export Asana tasks, projects, and workflows to your data warehouse. Build custom project and velocity reporting with dbt. Open source. Start free today.",
    seoH1: "Asana Data Export",
  },
  {
    slug: "rest-api",
    name: "REST API",
    category: "SaaS & API",
    direction: "source",
    description: "Connect to any REST API with configurable endpoints, authentication, and pagination. The universal connector for custom data sources.",
    useCases: [
      "Extract data from internal APIs",
      "Connect to niche SaaS tools without dedicated connectors",
      "Build custom integrations with any HTTP API",
      "Paginate through large API datasets automatically",
    ],
    configFields: [
      { name: "base_url", description: "API base URL" },
      { name: "auth_token", description: "Auth token (for bearer/api_key) (encrypted at rest, optional)" },
      { name: "auth_user", description: "Username (for basic auth) (optional)" },
      { name: "auth_password", description: "Password (for basic auth) (encrypted at rest, optional)" },
    ],
    related: ["postgresql", "bigquery", "snowflake", "csv"],
    seoTitle: "REST API to Warehouse Connector | Datanika",
    seoDescription: "Connect any REST API to your data warehouse with configurable endpoints, auth, and pagination. The universal connector for custom data sources. Start free.",
    seoH1: "REST API Connector",
  },

  // --- Files & Streaming ---
  {
    slug: "csv",
    name: "CSV",
    category: "File",
    direction: "source",
    description: "Load CSV files into your data warehouse. Supports local files, uploaded files, and auto-detection of delimiters and schemas.",
    useCases: [
      "Import spreadsheet exports into your warehouse",
      "Load historical data from CSV archives",
      "Quick data ingestion without API setup",
    ],
    configFields: [
      { name: "path", description: "Path to CSV file or directory" },
    ],
    related: ["json", "parquet", "google-sheets", "s3"],
    seoTitle: "CSV to Database — Import CSV Files | Datanika",
    seoDescription: "Import CSV files into PostgreSQL, BigQuery, Snowflake, or any supported database. Auto-detect schemas, drag-and-drop upload. Open source. Start free today.",
    seoH1: "CSV to Database",
  },
  {
    slug: "json",
    name: "JSON",
    category: "File",
    direction: "source",
    description: "Load JSON files into your data warehouse. Supports nested structures with automatic flattening into tabular format.",
    useCases: [
      "Import API response dumps into your warehouse",
      "Load JSON log files for analysis",
      "Ingest nested data with automatic schema detection",
    ],
    configFields: [
      { name: "path", description: "Path to JSON file or directory" },
    ],
    related: ["csv", "parquet", "rest-api", "s3"],
    seoTitle: "JSON to Database — Import JSON Files | Datanika",
    seoDescription: "Import and flatten JSON files into your data warehouse. Automatic schema detection and nested-to-tabular mapping. Open source. Start free on Datanika today.",
    seoH1: "JSON to Database",
  },
  {
    slug: "parquet",
    name: "Parquet",
    category: "File",
    direction: "source",
    description: "Load Apache Parquet files into your data warehouse. Columnar format with efficient compression for large datasets.",
    useCases: [
      "Import data lake exports into your warehouse",
      "Load large datasets efficiently with columnar compression",
      "Migrate Spark/Hadoop outputs into a SQL warehouse",
    ],
    configFields: [
      { name: "path", description: "Path to Parquet file or directory" },
    ],
    related: ["csv", "json", "s3", "duckdb"],
    seoTitle: "Parquet to Warehouse — Load Parquet Files | Datanika",
    seoDescription: "Load Apache Parquet files into BigQuery, Snowflake, or PostgreSQL. Columnar format with efficient compression for large datasets. Start free on Datanika.",
    seoH1: "Parquet to Warehouse",
  },
  {
    slug: "s3",
    name: "Amazon S3",
    category: "File",
    direction: "source",
    description: "Extract files from Amazon S3 buckets — CSV, JSON, and Parquet. Supports prefix filtering and incremental file discovery.",
    useCases: [
      "Load data lake files from S3 into your warehouse",
      "Ingest application logs stored in S3",
      "Process file-based data exports from partners",
      "Incremental loading of new files from S3 buckets",
    ],
    configFields: [
      { name: "bucket_url", description: "S3 bucket URL, e.g. s3://my-bucket/path/prefix/" },
      { name: "aws_access_key_id", description: "AWS access key ID (optional with IAM role) (encrypted at rest)" },
      { name: "aws_secret_access_key", description: "AWS secret access key (optional with IAM role) (encrypted at rest)" },
      { name: "region_name", description: "AWS region, e.g. us-east-1 (optional, auto-detected)" },
      { name: "endpoint_url", description: "S3-compatible endpoint URL (MinIO, Backblaze B2, Cloudflare R2) (optional)" },
    ],
    withdrawn:
      "S3 connections cannot currently be created. The S3 transport left the shipped image when an upstream dependency conflict removed s3fs from the lockfile, so fsspec raises ImportError on any s3:// path — the connector is hidden in the app and existing S3 connections will not run. Restoring it is tracked as core#863; this page and the setup guide stay published because the steps are unchanged for when it returns.",
    related: ["csv", "json", "parquet", "redshift"],
    seoTitle: "S3 to Warehouse — Load S3 Data | Datanika",
    seoDescription: "Load CSV, JSON, and Parquet files from Amazon S3 into Snowflake, BigQuery, or PostgreSQL. Incremental file discovery and scheduling. Start free on Datanika.",
    seoH1: "S3 to Warehouse",
  },
  {
    slug: "google-sheets",
    name: "Google Sheets",
    category: "File",
    direction: "source",
    description: "Extract data from Google Sheets spreadsheets using a service account. Sync spreadsheet data to your warehouse automatically.",
    useCases: [
      "Sync marketing spreadsheets to your warehouse",
      "Import manually-maintained data tables",
      "Combine spreadsheet data with other sources",
      "Automate reporting from shared team sheets",
    ],
    configFields: [
      { name: "spreadsheet_id", description: "Google Sheets spreadsheet ID" },
      { name: "service_account_json", description: "Service account JSON (encrypted at rest)" },
    ],
    related: ["csv", "airtable", "notion", "bigquery"],
    seoTitle: "Google Sheets to BigQuery Pipeline | Datanika",
    seoDescription: "Sync Google Sheets to BigQuery, Snowflake, or PostgreSQL automatically. Combine spreadsheet data with SaaS and database sources. Start free on Datanika.",
    seoH1: "Google Sheets to BigQuery",
  },
  {
    slug: "kafka",
    name: "Apache Kafka",
    category: "Streaming",
    direction: "source",
    description: "Consume streaming data from Apache Kafka topics. Ingest real-time event streams into your data warehouse for analytics.",
    useCases: [
      "Ingest real-time event streams for analytics",
      "Load Kafka topics into a warehouse for batch analysis",
      "Process clickstream or IoT data",
      "Build near-real-time dashboards from event data",
    ],
    configFields: [
      { name: "bootstrap_servers", description: "Comma-separated list of Kafka brokers" },
      { name: "topics", description: "Comma-separated list of topics to consume" },
      { name: "group_id", description: "Consumer group ID" },
    ],
    related: ["clickhouse", "bigquery", "postgresql", "s3"],
    seoTitle: "Kafka to Warehouse — Streaming Ingestion | Datanika",
    seoDescription: "Ingest Kafka topics into ClickHouse, BigQuery, or Snowflake for analytics. Process clickstreams and IoT data with dbt transforms. Start free on Datanika.",
    seoH1: "Kafka to Warehouse",
  },
];

/**
 * Source-capable and destination-capable connectors, derived.
 *
 * **31 source-capable, 11 destination-capable, 36 in the catalogue.** The two
 * sets overlap by the 6 `both` databases, so they legitimately do not sum to 36:
 *
 *     25 source-only + 6 both + 5 destination-only = 36
 *
 * Derive both halves from these rather than restating an integer. The connector
 * *total* survived two reversals of the Google Ads withdrawal (#291, #294)
 * because it is bound to this file; the hand-written split on four pages rotted
 * through both and sat at the withdrawn 30 (#376).
 *
 * 🚨 **`direction` is a claim about the PRODUCT, and this file is not the
 * product.** The five cloud warehouses were marked `both` here — with prose
 * promising extraction — while core supports none of them as a source (#391).
 * `connector-count-parity.yml` compares the *count* against core's README and is
 * structurally blind to direction, so nothing caught it. Before changing a
 * `direction`, read `datanika-core/datanika/services/connection_service.py`'s
 * `SOURCE_TYPES` / `DESTINATION_TYPES` at `master`. `tests/connectors.test.ts`
 * pins the five destination-only slugs against core's own tested assertion.
 *
 * ⚠️ Do not count these with `grep -c 'direction: "source"'`. The `Connector`
 * interface declares `direction: "source" | "destination" | "both"` and that
 * line matches, so the grep returns 26 for 25 source-only entries.
 */
/**
 * ⚠️ **`direction` states what WORKS, not what the catalogue intends.**
 *
 * MySQL and SQLite were `"both"` until 2026-09-01 and are now `"source"`.
 * `dlt.destinations` has **no `mysql` and no `sqlite` attribute**, so
 * `DltRunner.build_destination` — an unconditional
 * `getattr(dlt.destinations, connection_type)` — raises:
 *
 *     AttributeError: module 'dlt.destinations' has no attribute 'mysql'.
 *                     Did you mean: 'mssql'?
 *
 * Measured against dlt 1.21.0 across **all eleven** advertised destinations,
 * with a control name that must not resolve: **9 resolve, `mysql` and `sqlite`
 * do not.** Not a regression — it has been true for as long as the entries
 * existed. Engineering reproduced it on the built image; Product reproduced it
 * on the core worktree venv. Tracked as core#865.
 *
 * 🚨 **`"mysql" in SUPPORTED_DESTINATION_TYPES` is TRUE and is not evidence.**
 * That set is a *claim*; the layer beneath does not provide the capability.
 * This is the second lookup table this month to assert something the layer
 * below it cannot do (core#845, Redshift's SQLAlchemy dialect, same shape).
 * The cheap discriminating check is `hasattr(dlt.destinations, "<type>")`.
 *
 * So do not "restore" these to `"both"` from the core constant — check the
 * destination factory resolves. If core#865 lands, this is a two-word edit and
 * every derived surface follows: the badge, the per-page destination lists, the
 * counts in prose, and `/docs/architecture`'s destination list.
 */
/**
 * The catalogue as a **marketing claim**: everything a reader can actually go
 * and create today. `connectors` is the full set of pages we publish, which is
 * deliberately wider — a withdrawn connector keeps its page.
 *
 * 🚨 **Every published count comes from here, never from `connectors.length`.**
 * That distinction is the whole point of `withdrawn`. Core's README derives its
 * number as `len(ConnectionType) - len(UNMARKETED_TYPES | WITHDRAWN_SOURCE_TYPES)`
 * and guards it in `tests/test_docs/test_readme_claims.py`, so core self-corrects
 * the moment Engineering withdraws or restores something. Landing's number has to
 * follow the same fact or the two drift — which is landing#294 exactly, where
 * core moved 36 → 35 → 36 on its own and landing sat at 35 for five weeks,
 * publicly understating the product with every build green.
 *
 * `connector-count-parity.yml` compares *this* number against core's README.
 */
export const availableConnectors = connectors.filter((c) => !c.withdrawn);

export const sourceConnectors = availableConnectors.filter((c) => c.direction !== "destination");
export const destinationConnectors = availableConnectors.filter((c) => c.direction !== "source");

/** Databases that work in both directions. Derived — never write the number in prose. */
export const bidirectionalConnectors = availableConnectors.filter((c) => c.direction === "both");

/**
 * Destinations dbt can actually build models in — a **strict subset** of
 * `destinationConnectors`, and the two must never be conflated.
 *
 * `direction` describes the **dlt load** layer: whether data can be written
 * into that system. dbt is a separate layer with a separate requirement — an
 * installed adapter — and eleven destinations do not mean eleven dbt targets.
 * `/docs/architecture` asserted they were the same set for months ("the dbt
 * transformation layer runs against the same destination"), which was already
 * false for SQLite, Databricks and Synapse before core#825 removed MySQL.
 *
 * ⚠️ **The slug list below is HARDCODED on purpose. Do not derive it from
 * `direction` or `category`.** This repo has no view of which dbt adapters the
 * core image installs, so a filter written here would compute a claim about
 * core's dependency tree that landing cannot check — the #391 failure mode,
 * where binding a published claim to landing's own belief turns a visible
 * mismatch into a coherent, machine-readable assertion of something untrue and
 * every self-consistency guard stays green.
 *
 * Source of truth: `SUPPORTED_ADAPTERS` in datanika-core
 * `datanika/services/dbt_project.py`, **intersected with the adapters the image
 * actually installs** — those two disagree, which is core#862. Measured
 * 2026-08-31 with `importlib.util.find_spec` against the core venv on
 * `origin/dev`, then re-measured 2026-09-01 after core#825 landed and removed
 * `dbt-mysql` from the lock:
 *
 *   installed  postgres · sqlserver · clickhouse · duckdb · bigquery ·
 *              snowflake · redshift          (7)
 *   missing    mysql · sqlite · databricks · synapse
 *
 * 🚨 **This paragraph used to end "MySQL remains a fully supported source and
 * load destination". That was RETRACTED by core#865 and it contradicted line 74
 * of this same file, which already says MySQL cannot receive data at all.** dlt
 * has no `mysql` destination factory and never has, so the load half was never
 * true; only the source half survived measurement. Two answers in one file is
 * the state this comment existed to prevent, and a comment is an instruction to
 * whoever edits the list next — it does not get a pass for not rendering.
 *
 * `mysql` is therefore omitted below for **two** independent reasons, and
 * removing either one would not put it back: no dbt adapter (core#825) and no
 * dlt destination (core#865). Re-measure before editing this list — do not
 * assume it is still current.
 */
const DBT_TARGET_SLUGS = [
  "postgresql",
  "mssql",
  "clickhouse",
  "duckdb",
  "bigquery",
  "snowflake",
  "redshift",
];
export const transformationDestinationConnectors = connectors.filter((c) =>
  DBT_TARGET_SLUGS.includes(c.slug),
);

/**
 * The badge label for a connector's direction. **Three states, not two.**
 *
 * Both call sites — `/connectors/` and `/connectors/[slug]` — used to read
 * `direction === "both" ? "Source & Destination" : "Source"`, which labels a
 * destination-only connector **"Source"**: the exact inverse of the truth, and
 * invisible for as long as the data file had no destination-only entry (#391).
 * A two-branch ternary over a three-valued field is a bug waiting for the third
 * value; keeping the mapping here means the next one has one place to be wrong.
 */
export function directionLabel(direction: Connector["direction"]): string {
  if (direction === "both") return "Source & Destination";
  if (direction === "destination") return "Destination";
  return "Source";
}

/**
 * Sources whose upload form renders the SQL controls — write disposition, load
 * mode, source schema, table name. Everything else (SaaS, files, streaming,
 * NoSQL) gets endpoint checkboxes instead and has **none** of those fields.
 *
 * Bound to `category` because that is what matches the product: core's
 * `dlt_runner.SUPPORTED_SOURCE_TYPES` is exactly the seven `Database` entries,
 * and the landing#272/#285 guide sweep independently put the "there is no write
 * disposition…" callout on exactly the other 24 guides. Two derivations, same
 * partition.
 */
export const sqlSourceConnectors = connectors.filter((c) => c.category === "Database");
