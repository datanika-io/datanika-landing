---
title: "Triggering Data Pipelines from CI/CD via the REST API"
description: "Run a Datanika pipeline from GitHub Actions with one POST. Covers wait mode, idempotent retries, timeouts — and why the status code, not a JSON field, tells you whether the pipeline worked."
date: 2026-09-05
publishedAt: 2026-09-05
author: "Datanika Team"
category: "tutorial"
tags: ["rest-api", "ci-cd", "github-actions", "automation", "pipelines", "devops"]
---

The most common thing people want from a data platform's API is boring: **run this pipeline, tell me if it worked.** Usually right after a deploy, a dbt seed change, or a nightly job that has to finish before something else starts.

Here's how to do that with Datanika — and, more usefully, the one place this is easy to get wrong in a way your CI won't notice. We got it wrong ourselves; the fix is at the end of that section.

## The short version

```bash
curl -sS --fail-with-body -X POST \
  "https://app.datanika.io/api/v1/pipelines/1/run?wait=true&timeout=300" \
  -H "Authorization: Bearer $DATANIKA_API_KEY"
```

One call. Blocks until the pipeline finishes, returns the run as JSON, and **exits non-zero if the pipeline failed**. In a `set -e` CI step, that is the whole integration.

The reason that last clause is worth a sentence is the rest of this section.

## The status code carries the run's outcome

With `?wait=true`, the endpoint polls the run until it reaches a terminal state, then answers with a status code that describes **the run**, not just the request:

| What happened | Status |
|---|---|
| The run finished successfully | **200** |
| Still pending or running when your timeout expired | **408** |
| Terminal, but not successful (`failed`, `cancelled`) | **422** |

The body is the serialized run in all three cases, so `status` and `error_message` are still there when you want detail:

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

That response is a **422**. `curl --fail` trips on it, `raise_for_status()` raises on it, and your CI job goes red — which is what you wanted when you asked the API to wait.

### The trap this replaced, because you will meet it elsewhere

Until August 2026, that same failed run came back as **HTTP 200**.

The reasoning was defensible and wrong. Your *request* succeeded — the server did its job, found the run, waited, serialized it, and handed it to you. The run is what failed, and the body says so plainly in `status`. Textbook HTTP.

The problem is that nothing in CI reads the body:

```bash
# The reflex every CI script has
curl --fail -X POST ".../pipelines/1/run?wait=true" -H "Authorization: Bearer $KEY"
```

`--fail` trips on 4xx and 5xx. A failed pipeline was a 200. **Exit code 0.** The job goes green, the dashboard downstream is stale, and nobody finds out until someone notices the numbers are yesterday's. A step that reports success on a failed load is worse than no step at all, because it converts a loud failure into a silent one.

What settled it was noticing the endpoint had **already** decided the question. It returned **408** when the run was still going at the timeout — and that isn't a transport failure either; the request was served perfectly. So `200 == failed` wasn't a competing philosophy, it was an inconsistency with the endpoint's own behaviour. `?wait=true` is the caller explicitly opting into *"block until you know the outcome."* If the outcome doesn't reach the status line, the option is half-built.

So if you are integrating some *other* pipeline API and it offers a "wait" mode: **check what a failed run returns before you trust `--fail`.** Trigger something you know is broken and look at the exit code. It is a two-minute experiment that this post exists because we ran late.

### Why 422 and not 500

A 5xx means *"our API broke, retry the request."* Retrying this request would start a **second pipeline run** — a second extract, a second load, a second set of rows. A failed pipeline is not a transport failure and must not be retried like one.

422 says the opposite: the request was fine, and the thing you asked about did not succeed. The failure is in your pipeline — your credentials, your SQL, your source — not in our server. Retrying blindly is exactly the wrong move, and the status code should say so.

`cancelled` is a 422 as well. The check is *"not success"* rather than a list of failure names, so a terminal status added later cannot quietly rejoin the success branch.

### Keep the body when you fail

Plain `curl --fail` discards the response body on an HTTP error, which throws away `error_message` — the one thing you want in the log.

Use **`--fail-with-body`** (curl 7.76+, so every current GitHub runner) to get the non-zero exit *and* the body. If you're on something older, capture the status code explicitly, as the full workflow below does.

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

Use this when CI's job is to *kick off* work — a nightly ingest that takes 40 minutes and nothing downstream is blocking on it. A `202` is about dispatch only; it says nothing about the outcome, and there is nothing to check with `--fail`.

**With `?wait=true`** the request blocks until the run is terminal, then answers 200 / 408 / 422 as above.

`timeout` is in seconds, defaults to **120**, and is clamped to **1–300**. Passing `timeout=3600` doesn't get you an hour — you get 300 seconds, then a 408. Status is polled every 2 seconds, and waiting doesn't occupy a worker, so a waiting request costs you nothing but the open connection.

**A 408 is not a failure.** The run is still going; you just stopped waiting. The body carries `"timed_out": true`, and the run's own `status` is still `pending` or `running`. That distinction matters because the remedy is different — a 422 means fix your pipeline, a 408 means wait longer or stop blocking on it. Treating them the same is how a slow Tuesday becomes a red build.

## Runs longer than five minutes

Because of that 300-second ceiling, anything longer needs the async shape: trigger, then poll.

```bash
run_id=$(curl -sS --fail-with-body -X POST \
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

`GET /api/v1/runs/{id}` is a plain read: it returns 200 with the run whatever its status, because here you *are* asking about the row rather than asking "did it work?". The `.status` field is the answer in this shape.

Note the `case` covers **every** terminal status, not just `success`. A loop that only watches for `success` runs until your CI timeout and then reports the wrong cause.

If you want the run's output while debugging, `GET /api/v1/runs/{id}/logs` returns `{"run_id": …, "logs": "…"}`.

## Idempotent retries: the header that stops double-runs

CI reruns. Someone clicks "Re-run failed jobs", a runner gets evicted mid-step, a network blip makes `curl` retry. Any of those can fire the same trigger twice — and by default, twice means two runs, two loads, and two sets of rows.

Every `POST` endpoint accepts an optional **`Idempotency-Key`** header. Replay the same key and you get the original response back instead of a second run. Keys are cached for **24 hours**, and it's opt-in — no header, no deduplication.

The natural key in GitHub Actions is the run identity itself:

```bash
curl -sS --fail-with-body -X POST \
  "https://app.datanika.io/api/v1/pipelines/1/run?wait=true&timeout=300" \
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

          case "$code" in
            200) echo "Loaded $(jq -r '.rows_loaded' <<<"$body") rows" ;;
            408) echo "::warning::Still running after 300s — run $(jq -r '.id' <<<"$body")"
                 exit 1 ;;
            422) echo "::error::Pipeline run $(jq -r '.status' <<<"$body") — $(jq -r '.error_message // "no message"' <<<"$body")"
                 exit 1 ;;
            *)   echo "::error::API returned $code"; echo "$body"; exit 1 ;;
          esac
```

Four branches, because there are four genuinely different situations: it worked, it's still going, your pipeline broke, or our API did. `--fail-with-body` collapses the middle two into one non-zero exit, which is fine when you only need pass/fail — but the messages above are what you'll want at 2am, and the 408 branch is the one people most often want to handle differently.

## Cancelling a run

If your workflow is cancelled, the pipeline it started is not. A `202` handed the work to a background worker, and CI walking away doesn't reach it.

**And the API cannot currently clean it up for you — plan around that rather than around the endpoint.** `POST /api/v1/runs/{id}/cancel` exists and will return `200` with `"status": "cancelled"` — but that call only writes the status onto the run row. It does not stop the worker. The extract keeps reading, the load keeps writing, and when the task finishes it overwrites the status back to `success`. Tracked as [core#657](https://github.com/datanika-io/datanika-core/issues/657), along with the reason there is no cancel button in the app either: shipping a control onto that behaviour would spread the wrong impression to every user instead of only to API callers.

So don't wire a cleanup step and believe it. Until cancellation actually stops work:

- **Bound the blast radius instead of the run.** Smaller, more frequent pipelines beat one long job you might want to kill.
- **Assume anything you triggered will finish.** Check the app rather than your CI log for what a cancelled workflow left behind.
- **On usage-based plans, a run you "cancelled" keeps metering** until it completes on its own. That's the practical reason this is a limitation worth stating rather than a detail.

The one accurate part of the old advice: the endpoint returns **409** with `"not_cancellable"` when the run has already finished, which is a perfectly normal outcome and not something to treat as an error.

## Give CI its own key, scoped down

API keys are created in **Settings → API Keys** in the app, carry the `etf_` prefix, and are shown **once**. They're hashed with SHA-256 before storage, so a lost key can't be recovered — you create a new one and revoke the old. Full details on [the API keys page](/api/keys).

For a CI key, set the scopes explicitly rather than leaving them empty (empty means full access):

- `pipelines:write` — to trigger
- `runs:read` — to poll status and read logs

That's a key that can start and observe one kind of work and cannot delete a connection, read your credentials, or create a schedule. If it leaks into a build log, the blast radius is a pipeline someone can already trigger from the UI.

Set an expiry on it too, and rotate it on a calendar rather than after an incident.

## Rate limits

Each key is rate-limited independently, per plan, and exceeding it returns **429** with a `Retry-After` header. Current per-plan limits are on [the API keys page](/api/keys) — a fan-out matrix build that triggers one pipeline per shard is the realistic way to hit them, so back off on 429 rather than retrying immediately.

Note that 429 is a genuine transport-level "try again", unlike the 422 above. It's the one 4xx here you *should* retry.

## Why this is easier here than in a three-tool stack

The reason this post is short is architectural. In a Fivetran + dbt Cloud + Airflow stack, "run the pipeline and tell me if it worked" is three APIs, three auth schemes, three status vocabularies, and a decision about which failure counts. Here, extract, load, and transform are the same run object with one `status` field, so CI asks one question once.

That argument, with numbers attached, is in [Datanika vs the Modern Data Stack](/blog/datanika-vs-modern-data-stack/).

## What this post does not cover

- **Scheduling.** If you want a pipeline to run nightly, use a [schedule](/docs/scheduling/) instead of a cron-triggered CI job. Cron in CI gives you the worst of both — an extra dependency and no visibility in the app.
- **Webhooks back into CI.** There is no outbound "run finished" callback into a workflow today; poll, or use a [notification channel](/blog/slack-alerts-pipeline-failures/) to tell a human.
- **Every endpoint.** The [API reference](/api/reference) has the full surface, including connections, schedules, and bulk import.

---

*Every status code, header, scope name and default here was read out of the live OpenAPI document and the shipped route handlers, not out of our own docs. That matters more than usual for this post: the 200-on-failure behaviour in "the trap this replaced" was **found while writing the first draft of it**, filed as [core#663](https://github.com/datanika-io/datanika-core/issues/663), and fixed before this went out. Writing the tutorial is what surfaced the bug — so if you find a discrepancy, [open an issue](https://github.com/datanika-io/datanika-landing/issues) and we'll fix the post, or the API.*
