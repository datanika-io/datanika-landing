---
title: "Connect GitHub to Datanika"
description: "Step-by-step guide to sync GitHub repo activity into your warehouse with Datanika — issues, pull requests, commits, stars, releases. Free with a personal access token."
source: "github"
source_name: "GitHub"
category: "saas"
verified_by: "draft-pending-verification"
verified_date: null
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

![Creating the PAT in GitHub](/docs/connectors/github/01-credentials.png)

> **Least privilege.** Don't grant `write` scopes. Datanika only reads. If GitHub asks you to approve a scope you didn't select, something is wrong — cancel, inspect, and file a ticket at [support@datanika.io](mailto:support@datanika.io).

## Step 2 — Add the connection in Datanika

1. In Datanika, open **Connections → New connection**.
2. Select **GitHub** from the connector list (filter by **SaaS** if the list is long).
3. Fill in the form:
   - **Name** — a label you'll recognize, e.g. `github-datanika-io`.
   - **Access Token** — paste the PAT from Step 1. Stored encrypted at rest with Fernet.
   - **Owner / Organization** — the GitHub user or organization that owns the repo, e.g. `datanika-io` or `octocat`.
   - **Repository** — the repository name, e.g. `datanika-core` or `hello-world`.
4. Click **Test Connection**. Datanika calls the GitHub API to verify the token and checks access to the specified repo. You should see a green success message within a few seconds.
5. Click **Create Connection**.

> **Multiple repos?** Create one connection per repository. Each connection targets a single `owner/repo` pair. If you need to sync several repos from the same org, create one connection per repo and wire each into its own pipeline (or combine them into a single pipeline with multiple sources).

![Adding the GitHub connection in Datanika](/docs/connectors/github/02-add-connection.png)

> **No token at all?** You can connect to public repos without a token — leave the **Access token** field blank. GitHub's unauthenticated rate limit is 60 requests per hour, which is enough to sync a single small repo but will block almost immediately on anything active. Always use a PAT for real loads.

## Step 3 — Configure resources and schemas

GitHub exposes many resource types. For each repo you connect, you can pick which ones to sync.

1. Open the connection and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema**. Recommended: `raw_github`.
3. Select the resources to sync:
   - **`repositories`** — basic repo metadata (stars, forks, topics, default branch). Small, always sync. Incremental via `updated_at`.
   - **`issues`** — all issues including pull requests (GitHub internally models PRs as a kind of issue). Incremental via `updated_at`.
   - **`pull_requests`** — full PR details beyond the issue-level summary (commits, reviews, mergeable state). Heavier than `issues`; incremental via `updated_at`.
   - **`commits`** — commits on the default branch. Full fetch on first run; incremental by `sha` thereafter. Can be large on active repos.
   - **`releases`** — tagged releases with assets.
   - **`stargazers`** — users who starred the repo, with star timestamp. Useful for growth charting. Append-only.
   - **`workflow_runs`** — GitHub Actions runs. Incremental via `updated_at`. Grows fast — sync only if you care about CI analytics.
4. For each resource, pick **write disposition**:
   - `merge` — recommended for everything with `updated_at`. Upserts on the GitHub ID.
   - `replace` — safe for small resources like `repositories`.
   - `append` — use for immutable streams like `stargazers`.
5. Save the pipeline configuration.

> **Rate limit math.** The authenticated REST limit is 5,000 requests per hour. Syncing all issues + PRs + commits on a moderately active repo typically uses a few hundred requests on a first run and a handful on each incremental run. You're very unlikely to hit the limit unless you're syncing hundreds of large repos.

## Step 4 — First run

1. From the pipeline page, click **Run now**.
2. Watch the **Runs** tab. First runs on a medium-activity repo (say, 1k issues, 500 PRs, 10k commits) typically take 5–15 minutes, dominated by commit fetching. Subsequent incremental runs take seconds.
3. When the run finishes, open **Catalog → `<your warehouse>` → `raw_github`** and browse the landed tables. There's one table per resource plus child tables for nested structures like PR reviews and issue comments.
4. Spot-check: `SELECT count(*) FROM raw_github.issues WHERE repository = 'owner/repo'` should match the issue count shown in the GitHub UI (minus any issues deleted since the last sync, which GitHub does not surface via the API).

![Inspecting the first run](/docs/connectors/github/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence based on how fresh the data needs to be:
   - **Every 15 minutes** — live dashboards for triage queues, PR SLAs, or incident response.
   - **Hourly** — the default for DevRel and open-source health dashboards.
   - **Daily at 03:00** — for weekly or monthly reports where hourly freshness isn't needed.
3. Choose a timezone and save.
4. Wire up failure alerts in **Settings → Notifications**. GitHub rarely fails, but expired PATs do — you want the first bounced run to surface immediately, not three days later when your dashboard has gone stale.

> **PAT expiration is the #1 production failure.** GitHub emails you before a fine-grained PAT expires, but the email is easy to miss. Set an alert on failed syncs and you'll catch it on the first missed run.

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
**Fix.** Override the branch in the connection form's **Branches to sync** field, or leave it as default-branch-only and rely on dbt downstream to unify across branches if needed.

### Issues and PRs appear merged into one table
**Cause.** This isn't a bug — GitHub's REST API returns PRs inside the `issues` endpoint. Every pull request has a corresponding issue with `pull_request` populated.
**Fix.** If you want strict separation, filter in dbt: `CREATE VIEW issues_only AS SELECT * FROM raw_github.issues WHERE pull_request IS NULL;` and use the `pull_requests` resource for PR-specific fields (reviews, mergeable state).

### Stargazer timestamps are all the same value
**Cause.** By default, GitHub's stargazers endpoint returns stars **without** timestamps. Datanika sets the `Accept: application/vnd.github.star+json` header to request them, but some proxied GitHub Enterprise instances strip the header.
**Fix.** If you're on github.com it should just work. If you're on GitHub Enterprise and see this, check with your admin whether the proxy strips custom `Accept` headers — it's a known misconfiguration.

## Related

- **Pipeline templates:** no GitHub-specific template yet. `GitHub → BigQuery` is on the [Pipeline Templates depth spec](../../plans/product/SPEC_PIPELINE_TEMPLATES_DEPTH.md) shortlist as a candidate for the next template batch, pending measurement data.
- **Use cases:** GitHub → BigQuery is the classic pairing for open-source analytics. See the [Transformations guide](/docs/transformations-guide) for patterns around computing PR cycle time, first-response latency, and stars-per-day from the raw tables.
- **Docs:** [Connections](/docs/connections), [Pipelines](/docs/pipelines), [Scheduling Guide](/docs/scheduling-guide)
- **Related connectors:** if you're tracking developer productivity, pair GitHub with [Jira](/connectors/jira), [Linear](/connectors/linear), and [Slack](/connectors/slack) for a full engineering-ops warehouse.
- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **Connector reference:** full field-by-field [GitHub connector spec](/connectors/github).
