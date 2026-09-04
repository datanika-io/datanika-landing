---
title: "Connect GitHub to Datanika"
description: "Step-by-step guide to sync GitHub repo activity into your warehouse with Datanika — issues, pull requests, commits, stars, releases. Free with a personal access token."
source: "github"
source_name: "GitHub"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-07-19"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

GitHub is the easiest API-based sandbox for Datanika: the personal access token is free, the REST API is well-documented, the rate limit is generous (5,000 requests per hour for authenticated users), and every developer already has an account. This makes it the ideal first SaaS source for anyone learning Datanika without paying for a Segment/Salesforce/Stripe trial. It's also a genuinely useful production source — open-source maintainers, DevRel teams, and engineering-org analytics leads all run pipelines that sync issues, pull requests, reviews, and stargazers into a warehouse for health metrics. This guide walks through syncing a single repo (or an org's worth of repos) end-to-end.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full list of supported resources, rate-limit handling, how incremental syncs use the `updated_at` cursor, and the difference between REST and GraphQL backends, see the [GitHub connector page](/connectors/github).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected. BigQuery is the most popular GitHub destination — GitHub itself publishes its public `githubarchive` dataset there, so a lot of the community tooling assumes it.
- A **GitHub account**. Any free personal account is fine; you don't need GitHub Team or Enterprise for this guide.
- The **repositories you want to sync**. Public repos can be synced without any token at all (at a lower rate limit). Private repos require a token with `repo` scope.
- **GitHub CLI** (`gh`) is useful for testing the token quickly but not required for Datanika.

## Step 1 — Create a GitHub personal access token

GitHub has two kinds of tokens: **classic** PATs (broad, all-or-nothing scopes) and **fine-grained** PATs (per-repo, specific permissions). Fine-grained is the right choice for production — it's the minimum-privilege path. Classic is fine for experimenting.

**Fine-grained PAT (recommended)**

1. Sign in to GitHub and open **Settings → Developer settings → Personal access tokens → Fine-grained tokens**. Direct URL: [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta).
2. Click **Generate new token**.
3. Fill in:
   - **Token name** — `datanika-readonly` or similar.
   - **Expiration** — 90 days is a reasonable default. GitHub will email you a reminder to rotate.
   - **Repository access** — pick **Only select repositories** and choose the repos you want to sync. Or **All repositories** if you're syncing an entire org.
   - **Repository permissions** — grant **Read-only** on: `Contents`, `Issues`, `Pull requests`, `Metadata` (always required), and `Discussions` if you use them.
   - **Organization permissions** — leave empty unless you need org-level resources like members or teams.
4. Click **Generate token** and **copy it immediately** — GitHub only shows it once. Paste it into a password manager or straight into the Datanika form in Step 2.

**Classic PAT (quicker)**

1. Open **Settings → Developer settings → Personal access tokens → Tokens (classic)** → **Generate new token (classic)**.
2. Check the `repo` scope (for private repos) or `public_repo` (for public repos only).
3. Set an expiration and generate.
> **Least privilege.** Don't grant `write` scopes. Datanika only reads. If GitHub asks you to approve a scope you didn't select, something is wrong — cancel, inspect, and file a ticket at [support@datanika.io](mailto:support@datanika.io).

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `github`.
3. Fill in the form:
   - **Connection Name** — a label you'll recognize, e.g. `github-datanika-io`.
   - **Access Token** — paste the PAT from Step 1. Stored encrypted at rest with Fernet.
   - **Owner / Organization** — the GitHub user or organization that owns the repo, e.g. `datanika-io` or `octocat`.
   - **Repository** — the repository name, e.g. `datanika-core` or `hello-world`.
4. Click **Test Connection** — it really calls the GitHub API — then **Create Connection**.

> **Multiple repos?** Create one connection per repository. Each connection targets a single `owner/repo` pair. If you need to sync several repos from the same org, create one connection per repo and wire each into its own pipeline (or combine them into a single pipeline with multiple sources).

![Adding the GitHub connection in Datanika](/docs/connectors/github/02-add-connection.png)

> **All three fields are required.** The shipped form requires **Access Token**, **Owner / Organization**, and **Repository** — there's no anonymous/public-repo mode in the structured form. Always use a PAT.

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `github-daily-sync` becomes `githubdailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the GitHub connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because GitHub is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. For GitHub the list is `issues`, `pulls`, `commits`, `stargazers`. Untick anything you do not want: each ticked endpoint becomes its own table in the destination, and unticked ones are not fetched at all — though unticking *every* box loads the full set rather than nothing.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here.

> **The endpoint list is a fixed default, not a live fetch.** It comes from Datanika's built-in map for GitHub rather than from your account, so it does not reflect custom objects. Anything outside the list needs the [REST API connector](/docs/connectors/rest-api).

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. The upload lands them in a schema **named after the upload** — `githubdailysync` creates schema `githubdailysync` in the destination. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `githubdailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `401 Unauthorized: Bad credentials`
**Cause.** The PAT is wrong, expired, or pasted with stray whitespace.
**Fix.** Generate a new PAT and paste it into Datanika's connection form, making sure there's no leading/trailing space. Test with the CLI first if you're unsure: `GH_TOKEN=<paste> gh api user`. If that works, the token is fine and Datanika's form has whitespace — re-paste carefully.

### `403 Forbidden: Resource not accessible by personal access token`
**Cause.** You're using a fine-grained PAT that doesn't have permission for the repo or resource. Commonly: token was scoped to `repo-a`, but you added `repo-b` to the connection.
**Fix.** Go back to **Settings → Developer settings → Personal access tokens**, edit the token, and add the missing repo under **Repository access**. Fine-grained PATs can be edited in place without regenerating.

### `403 rate limit exceeded`
**Cause.** The 5,000 requests/hour limit was hit. Usually on a first run against a very large org, or when the pipeline is scheduled too frequently.
**Fix.** Datanika automatically waits and retries when it sees the rate-limit header, so this only shows up if the pipeline times out during the wait. Split the sync into multiple connections (one per large repo), or flip to the GraphQL backend which has a different (and usually higher effective) limit.

### `commits` table has fewer rows than `git log` shows locally
**Cause.** Datanika fetches commits on the **default branch only** by default. Commits that only exist on other branches aren't included.
**Fix.** Datanika syncs the **default branch only** — there's no per-branch selector on the connection form. To include other branches, reconcile them downstream in dbt, or sync each branch via a separate mechanism.

### Issues and PRs appear merged into one table
**Cause.** This isn't a bug — GitHub's REST API returns PRs inside the `issues` endpoint. Every pull request has a corresponding issue with `pull_request` populated.
**Fix.** If you want strict separation, filter in dbt: `CREATE VIEW issues_only AS SELECT * FROM raw_github.issues WHERE pull_request IS NULL;` and use the `pull_requests` resource for PR-specific fields (reviews, mergeable state).

### Stargazer timestamps are all the same value
**Cause.** By default, GitHub's stargazers endpoint returns stars **without** timestamps. Datanika sets the `Accept: application/vnd.github.star+json` header to request them, but some proxied GitHub Enterprise instances strip the header.
**Fix.** If you're on github.com it should just work. If you're on GitHub Enterprise and see this, check with your admin whether the proxy strips custom `Accept` headers — it's a known misconfiguration.

## Related

- **Pipeline templates:** no GitHub-specific template yet. `GitHub → BigQuery` is shortlisted as a candidate for the next template batch, pending measurement data. See the [templates gallery](/templates) for what ships today.
- **Use cases:** GitHub → BigQuery is the classic pairing for open-source analytics. See the [Transformations guide](/docs/transformations-guide) for patterns around computing PR cycle time, first-response latency, and stars-per-day from the raw tables.
- **Docs:** [Connections](/docs/connections), [Pipelines](/docs/pipelines), [Scheduling Guide](/docs/scheduling-guide)
- **Related connectors:** if you're tracking developer productivity, pair GitHub with [Jira](/connectors/jira) and [Slack](/connectors/slack) for a full engineering-ops warehouse.
- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **Connector reference:** full field-by-field [GitHub connector spec](/connectors/github).
