---
title: "Triggering Data Pipelines from CI/CD via the REST API"
description: "Run a Datanika pipeline from GitHub Actions with one POST. Covers wait mode, idempotent retries, timeouts — and the 200 response that means finished, not succeeded."
date: 2026-08-30
author: "Datanika Team"
category: "tutorial"
tags: ["rest-api", "ci-cd", "github-actions", "automation", "pipelines", "devops"]
---

The most common thing people want from a data platform's API is boring: **run this pipeline, tell me if it worked.** Usually right after a deploy, a dbt seed change, or a nightly job that has to finish before something else starts.

Here's how to do that with Datanika, and — more usefully — the one place it's easy to get wrong in a way your CI won't notice.

## The short version

```bash
curl -sS -X POST \
  "https://app.datanika.io/api/v1/pipelines/1/run?wait=true&timeout=300" \
  -H "Authorization: Bearer $DATANIKA_API_KEY"
```

That's it. One call, blocks until the pipeline finishes, returns the run as JSON.

Now the part that matters.

## The 200 that isn't success

When you pass `?wait=true`, the endpoint polls the run until it reaches a terminal state and then returns it. Terminal means **success, failed, or cancelled** — all three.

All three come back as **HTTP 200.**

```json
{
  "id": 43,
  "target_type": "pipeline",
  "target_id": 1,
  "status": "failed",
  "started_at": "2026-08-30T14:00:02Z",
  "finished_at": "2026-08-30T14:00:44Z",
  "rows_loaded": 0,
  "error_message": "relation \"public.orders\" does not exist",
  "created_at": "2026-08-30T14:00:00Z"
}
```

That is a **200 OK** describing a pipeline that did not run. This is correct HTTP — your *request* succeeded; it's the run that failed, and the response tells you so. But it means the reflex every CI script has:

```bash
# WRONG — goes green on a failed pipeline
curl --fail -X POST ".../pipelines/1/run?wait=true" -H "Authorization: Bearer $KEY"
```

...does nothing useful. `curl --fail` trips on 4xx/5xx. A failed pipeline is a 200. Your job goes green, the dashboard downstream is stale, and nobody finds out until someone notices the numbers are yesterday's.

**Check the field, not the status code:**

```bash
set -euo pipefail

response=$(curl -sS -X POST \
  "https://app.datanika.io/api/v1/pipelines/1/run?wait=true&timeout=300" \
  -H "Authorization: Bearer $DATANIKA_API_KEY")

status=$(jq -r '.status' <<<"$response")
if [ "$status" != "success" ]; then
  echo "Pipeline run ended as: $status"
  jq -r '.error_message // "no error message"' <<<"$response"
  exit 1
fi

echo "Loaded $(jq -r '.rows_loaded' <<<"$response") rows"
```

We could have made a failed run return 500 and saved you this paragraph. We didn't, because a 5xx means *"our API broke, retry the request"* — and retrying the request would start a **second** pipeline run. A failed pipeline isn't a transport failure and shouldn't be retried like one.

## The three endpoints

Runs are triggered on the **resource**, not on a runs collection. There is no `POST /api/v1/runs`.

| What you're running | Endpoint | Key scope needed |
|---|---|---|
| A pipeline | `POST /api/v1/pipelines/{id}/run` | `pipelines:write` |
| A file upload | `POST /api/v1/uploads/{id}/run` | `uploads:write` |
| A dbt transformation | `POST /api/v1/transformations/{id}/run` | `transformations:write` |

All three behave identically with respect to everything below.

## Two modes: fire-and-forget, or wait

**Without `wait`** you get an immediate `202 Accepted`:

```json
{"run_id": 43, "status": "pending"}
```

Use this when CI's job is to *kick off* work — a nightly ingest that takes 40 minutes and nothing downstream is blocking on it.

**With `?wait=true`** the request blocks until the run is terminal, then returns the full run object:

- **200** — the run reached a terminal state. Read `.status`. (See above.)
- **408** — still running when the timeout expired. The response carries `"timed_out": true` and the run **keeps going**; you just stopped waiting.

`timeout` is in seconds, defaults to **120**, and is clamped to a **maximum of 300**. Passing `timeout=3600` doesn't get you an hour — you get 300 seconds, then a 408. Status is polled every 2 seconds, and waiting doesn't occupy a worker, so a waiting request costs you nothing but the open connection.

## Runs longer than five minutes

Because of that 300-second ceiling, anything longer needs the async shape: trigger, then poll.

```bash
run_id=$(curl -sS -X POST \
  "https://app.datanika.io/api/v1/pipelines/1/run" \
  -H "Authorization: Bearer $DATANIKA_API_KEY" | jq -r '.run_id')

deadline=$(( $(date +%s) + 3600 ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  run=$(curl -sS "https://app.datanika.io/api/v1/runs/$run_id" \
    -H "Authorization: Bearer $DATANIKA_API_KEY")
  status=$(jq -r '.status' <<<"$run")
  case "$status" in
    success)             echo "done"; exit 0 ;;
    failed|cancelled)    jq -r '.error_message // .status' <<<"$run"; exit 1 ;;
  esac
  sleep 15
done

echo "Still running after 1h — check run $run_id in the app"
exit 1
```

Note the `case` covers **every** terminal status, not just `success`. A loop that only watches for `success` runs until your CI timeout and then reports the wrong cause.

If you want the run's output while debugging, `GET /api/v1/runs/{id}/logs` returns `{"run_id": …, "logs": "…"}`.

## Idempotent retries: the header that stops double-runs

CI reruns. Someone clicks "Re-run failed jobs", a runner gets evicted mid-step, a network blip makes `curl` retry. Any of those can fire the same trigger twice — and by default, twice means two runs, two loads, and two sets of rows.

Every `POST` endpoint accepts an optional **`Idempotency-Key`** header. Replay the same key and you get the original response back instead of a second run. Keys are cached for **24 hours**, and it's opt-in — no header, no deduplication.

The natural key in GitHub Actions is the run identity itself:

```bash
curl -sS -X POST "https://app.datanika.io/api/v1/pipelines/1/run?wait=true&timeout=300" \
  -H "Authorization: Bearer $DATANIKA_API_KEY" \
  -H "Idempotency-Key: gha-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
```

Include `GITHUB_RUN_ATTEMPT` if a manual re-run *should* start a fresh pipeline, and leave it out if it shouldn't. That's a real decision, not a formality — decide it deliberately.

## A complete GitHub Actions job

```yaml
name: Refresh analytics

on:
  push:
    branches: [main]
    paths: ["dbt/**"]
  workflow_dispatch:

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger the Datanika pipeline
        env:
          DATANIKA_API_KEY: ${{ secrets.DATANIKA_API_KEY }}
        run: |
          set -euo pipefail

          response=$(curl -sS -X POST \
            "https://app.datanika.io/api/v1/pipelines/1/run?wait=true&timeout=300" \
            -H "Authorization: Bearer $DATANIKA_API_KEY" \
            -H "Idempotency-Key: gha-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}" \
            -w "\n%{http_code}")

          code=$(tail -n1 <<<"$response")
          body=$(sed '$d' <<<"$response")

          if [ "$code" = "408" ]; then
            echo "::warning::Still running after 300s — run $(jq -r '.id' <<<"$body")"
            exit 1
          fi
          if [ "$code" != "200" ]; then
            echo "::error::API returned $code"; echo "$body"; exit 1
          fi

          status=$(jq -r '.status' <<<"$body")
          if [ "$status" != "success" ]; then
            echo "::error::Pipeline run $status — $(jq -r '.error_message // "no message"' <<<"$body")"
            exit 1
          fi

          echo "Loaded $(jq -r '.rows_loaded' <<<"$body") rows"
```

Three separate failure paths, because there are three separate ways this fails: the API call, the wait, and the pipeline. Collapsing them into one check is how you end up trusting a green run.

## Cancelling a run

If your workflow is cancelled, the pipeline it started is not — a `202` handed the work to a background worker and CI walking away doesn't reach it. Clean up explicitly:

```yaml
      - name: Cancel the run if the job is cancelled
        if: cancelled()
        env:
          DATANIKA_API_KEY: ${{ secrets.DATANIKA_API_KEY }}
        run: |
          curl -sS -X POST "https://app.datanika.io/api/v1/runs/${RUN_ID}/cancel" \
            -H "Authorization: Bearer $DATANIKA_API_KEY" || true
```

`POST /api/v1/runs/{id}/cancel` needs `runs:write`, and returns **409** with `"not_cancellable"` if the run already finished — which is a perfectly normal outcome in a cleanup step, and why that `|| true` is there.

## Give CI its own key, scoped down

API keys are created in **Settings → API Keys** in the app, carry the `etf_` prefix, and are shown **once**. They're hashed with SHA-256 before storage, so a lost key can't be recovered — you create a new one and revoke the old. Full details on [the API keys page](/api/keys).

For a CI key, set the scopes explicitly rather than leaving them empty (empty means full access):

- `pipelines:write` — to trigger
- `runs:read` — to poll status and read logs
- `runs:write` — only if the workflow cancels

That's a key that can start and observe one kind of work and cannot delete a connection, read your credentials, or create a schedule. If it leaks into a build log, the blast radius is a pipeline someone can already trigger from the UI.

Set an expiry on it too, and rotate it on a calendar rather than after an incident.

## Rate limits

Each key is rate-limited independently, per plan, and exceeding it returns **429** with a `Retry-After` header. Current per-plan limits are on [the API keys page](/api/keys) — a fan-out matrix build that triggers one pipeline per shard is the realistic way to hit them, so back off on 429 rather than retrying immediately.

## Why this is easier here than in a three-tool stack

The reason this post is short is architectural. In a Fivetran + dbt Cloud + Airflow stack, "run the pipeline and tell me if it worked" is three APIs, three auth schemes, three status vocabularies, and a decision about which failure counts. Here, extract, load, and transform are the same run object with one `status` field, so CI asks one question once.

That argument, with numbers attached, is in [Datanika vs the Modern Data Stack](/blog/datanika-vs-modern-data-stack/).

## What this post does not cover

- **Scheduling.** If you want a pipeline to run nightly, use a [schedule](/docs/scheduling/) instead of a cron-triggered CI job. Cron in CI gives you the worst of both — an extra dependency and no visibility in the app.
- **Webhooks back into CI.** There is no outbound "run finished" callback into a workflow today; poll, or use a [notification channel](/blog/slack-alerts-pipeline-failures/) to tell a human.
- **Every endpoint.** The [API reference](/api/reference) has the full surface, including connections, schedules, and bulk import.

---

*Every status code, header, scope name, and default in this post was read out of the API's route handlers rather than from documentation — including the 200-on-failure behaviour, which the docs did not previously spell out. If you find a discrepancy, [open an issue](https://github.com/datanika-io/datanika-landing/issues) and we'll fix the post.*
