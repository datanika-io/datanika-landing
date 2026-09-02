---
title: "Four Alerts That Could Never Fire, and How We Found Them"
description: "A Prometheus rule that only fires while healthy, an exporter scraped for nothing, a curl -sf that succeeds on an HTML page, and a pager that rang for an upload timeout. Four monitoring false negatives, with the mechanism behind each."
date: 2026-09-11
publishedAt: 2026-09-11
author: "Datanika Team"
category: "engineering"
tags: ["monitoring", "prometheus", "alerting", "observability", "testing", "engineering"]
---

We spent a week auditing our own alerting, and the useful question turned out not to be *"is anything alerting?"* It was **"would this alert look any different if the thing it watches had failed?"**

For four of them the answer was no. Not "it fires late", not "the threshold is loose" — these could not produce a red signal at all, in the exact circumstance each was written for. Every dashboard was green the entire time, and the green was not evidence of anything.

Here they are with the mechanisms, because each one is a shape you can go and check for in your own stack in about ten minutes.

## 1. The rule that could only fire while the system was healthy

We wanted an alert for *"a scheduled maintenance task has stopped arriving."* The natural expression:

```promql
increase(celery_tasks_total{task="datanika.run_maintenance"}[2h]) < 1
```

Read it in English and it is obviously right: fire when fewer than one run happened in two hours. It evaluates cleanly. It shows up in the rule list. Its health reads `ok`.

It cannot fire.

**In PromQL, a bare comparison between a vector and a scalar is a *filter*, not a boolean.** `X < 1` does not return true or false. It returns *`X`'s own value*, for every series where the condition holds, and drops the rest. So the number that reaches the alerting threshold is not `1` and not `true` — it is whatever `increase()` computed, which by the definition of the filter is **strictly less than 1**.

Our rules pair that with a Grafana threshold of `gt [0]`: fire when the reduced value is greater than zero. Now do the arithmetic for the case the rule exists to catch. A task that has completely stopped arriving has `increase(...) == 0`. Zero passes the `< 1` filter, so a series *is* produced — and then `0 > 0` is **false**, so nothing fires.

The rule is live only in the open interval `(0, 1)`. It detects a task that has partially stopped and is structurally blind to one that has entirely stopped.

Demonstrated against the engine rather than argued:

```
vector(0) < 1        -> series=1 value=0     # gt [0] on 0 is FALSE -> dead rule
vector(0) < bool 1   -> series=1 value=1     # gt [0] on 1 is TRUE  -> fires
```

`bool` is the fix: it converts the filter into the 1/0 comparison everyone assumed they were writing.

**The part worth stealing is how it was found.** The engineer writing that rule used `< bool 1` deliberately, and then *mutated their own correct code* to the naive `< 1` to check whether the linter would have caught the mistake had they made it.

It did not. **196 tests passed.**

Four other mutations run the same way — a dropped scrape job, a dropped deploy step, a drifted subquery step, a bare staleness comparison — all went correctly red, which is what proves the harness was armed and this one check simply does not look. A satisfiability check existed; it recognised the `== N` shape and skipped silently on everything else, and a skip is a pass.

## 2. The exporter that was scraped, and received nothing

Our task metrics were collected by code that had been in the repo since the start:

```python
celery_tasks_total.labels(task=name, status="failure").inc()
```

There was an alert on that counter. It had never fired. There had also never been a task failure it should have caught, so nobody thought about it.

Two things were wrong, and each on its own is fatal.

**The counter incremented in one process and was served from another.** `celery_tasks_total` is incremented inside the **Celery worker**. `/metrics` is a route in the **web** process. Two processes, two `prometheus_client` registries, no shared state. The counter the worker maintains is not in the payload the web process serves, and never was.

**And Prometheus was not scraping Celery at all.** Seven targets configured, none of them the worker. So even a correctly located counter had no path to the time series database.

The alert's query returned **zero series**, forever. And here is the part that makes this a false-negative rather than a visible outage: our alert rules run with `noDataState: OK`, which is deliberate and correct for filtering expressions — a healthy system genuinely produces no rows. So *"the metric does not exist"* and *"nothing is wrong"* arrive at the alert engine as the same signal.

The general form, which we now have written down:

> An exporter that is scraped but has stopped receiving events looks exactly like a quiet system.

The fix was not to move the counter. It was to stop asking the application to report on itself and read the **broker's own event stream** instead, with a dedicated exporter and the worker started with `-E`. Which introduced its own trap, so it goes in the list too: an exporter pointed at a worker *without* `-E` still emits worker-liveness metrics and zero task metrics — indistinguishable from a worker that simply has not run a task yet. You tell them apart by waiting for a scheduled firing and re-querying, never by reading the exporter's own health.

## 3. `curl -sf` succeeds on an HTML error page

This one is the cheapest to reproduce and probably the most widespread.

A verification runbook, gating a pricing change, contained this step:

```bash
curl -sf https://app.example.com/metrics | grep -E "bytes_processed|bytes_quota"
```

Under it, three checkboxes to tick when the metrics appear. Measured:

```
http_code=200   size=5106   content_type=text/html;charset=utf-8
<!DOCTYPE html><html lang="en">…
```

`/metrics` had no entry in the reverse-proxy config. Our proxy routes a specific list of paths to the backend and sends **everything else** to the single-page app, so an unrouted backend path does not 404 — it silently resolves to the frontend and returns the app shell with a cheerful **200**.

`curl -f` fails on HTTP status codes at or above 400. A 200 carrying an HTML page is not a status error, so **`-f` does not trigger and `curl` exits 0**. The pipe then hands `grep` five kilobytes of HTML, `grep` matches nothing, and the operator sees no output and no error.

The checkboxes under that command could never be ticked, no matter what the application did. And the runbook's own troubleshooting table sent the reader to the wrong layer — *"no metrics after 2h → check the worker logs"* — for a problem that was one line of proxy config.

Two rules came out of it:

- **`-f` is a status check, not a content check.** If you are grepping a response, assert on the `Content-Type` or on a string you know must be present, and fail the step when it is absent. `curl -sf … | grep -q 'expected'` at least fails on the pipe's own exit status.
- **Any backend route outside your proxied prefixes needs its own entry, or it becomes your SPA.** The failure is silent, returns 200, and is invisible to anything that only checks status codes.

## 4. The pager that rang for something that had not happened

The other direction belongs in the same audit, because an instrument that manufactures incidents costs you the same credibility as one that hides them — and it burns it faster.

Our end-to-end suite has an auto-filer: on failure it opens a tracker issue and pages. It fires on a **job-level** `failure()`.

One night it filed and paged for a failed end-to-end run. Reading the step outcomes from the API rather than the log:

| step | conclusion |
|---|---|
| Run gating E2E specs | ✅ success |
| Detect flaky gating specs | ✅ success |
| Run informational E2E specs | ✅ success |
| Assert the specs were actually collected | ✅ success |
| **Upload test report** | 🔴 **failure** |
| Telegram alert on failure | fired |
| File issue on failure | fired |

The only error anywhere in the job:

```
Attempt 1..4 of 5 failed with error: Request timeout:
  /twirp/github.actions.results.api.v1.ArtifactService/CreateArtifact
```

**Every spec passed.** The job was red because an artifact upload timed out.

What makes this worse than a cosmetic false alarm is what the filer writes into the issue it creates: a sentence stating that only the gating tier can open this report. That sentence became affirmatively false at the moment it was filed — and it is exactly the line a reader uses to decide how much to trust what they are reading. The tracker asserted a test failure that had not occurred, in a thread whose entire purpose is to be believed.

`if: failure()` at job level means *"any step failed"*. If you want *"the tests failed"*, key the alert on the test step's own outcome:

```yaml
- name: Run specs
  id: specs
  run: pytest ...

- name: Page on real failure
  if: steps.specs.outcome == 'failure'
```

## The pattern under all four

Every one of these measured the **instrument** rather than the system:

| what was green | what it actually recorded |
|---|---|
| the alert rule's health | that the expression parses and evaluates |
| the scrape target being `up` | that an HTTP endpoint answered, not that it carried our data |
| `curl -sf` exiting 0 | that some server returned a status below 400 |
| the E2E job's red | that some step in the job failed |

None of them is broken in the sense of throwing an error. Each answers a real question accurately. The question is just not the one anybody thought was being asked.

So the check we now run on every new alarm is a single sentence:

> **Would this signal look different if the thing it watches had failed?**

And the only honest way to answer it is to make the thing fail. Not in a synthetic fixture built to satisfy the assertion — against the real artifact, in the real failure mode. Break the rule and watch it go red. Stop the worker and watch the metric vanish, then check what your `noDataState` does with a vanished series. Point the `curl` at a path you know is unrouted and confirm the step fails.

**A passing check is not evidence until you have seen it fail.** We keep relearning that in a new costume roughly once a fortnight — most recently as [a nightly CI job that reported success over twelve failing tests for eight nights](/blog/github-actions-pipefail-exit-code), because a pipe to `tee` discarded the exit code and GitHub Actions' default shell does not set `pipefail`. Same family, different layer.

## Four things to go and check in your own stack

1. **Grep your alert expressions for a bare `<` or `>` against a scalar**, and check what value actually reaches your threshold evaluator. In PromQL, add `bool` unless you specifically want the filter.
2. **For every counter you alert on, confirm the process that increments it is the process that serves it.** With any pre-fork or multi-process server, that is not automatic.
3. **Find every `curl -sf` in your runbooks and CI**, and make each one assert on content, not just status. Then point one at a deliberately wrong path and confirm it fails.
4. **Read your alert conditions for scope.** `if: failure()` and `on: failure` are usually broader than the thing you meant.

Then take one working alert and break the underlying system on purpose. If nothing turns red, you have found the fifth one.

---

*Datanika is an open-source data platform that runs dlt extract-and-load and dbt-core transformations behind one UI, with scheduling, run history and a REST API. It is AGPL-3.0 and self-hostable with a single `docker compose up` — see [the architecture](/docs/architecture), or [browse the connectors](/connectors).*
