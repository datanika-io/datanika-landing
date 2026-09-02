---
title: "The Check That Went Red for Doing Its Job"
description: "One workflow run, three levels, three different answers. Our drift cron exited non-zero on its own duplicate-suppression branch, so it reported failure for finding nothing new. A green that proves nothing fails to inform; a red that repeats forever destroys the channel."
date: 2026-09-13
publishedAt: 2026-09-13
author: "Datanika Team"
category: "engineering"
tags: ["ci", "github-actions", "monitoring", "testing", "engineering"]
---

We have written twice recently about checks that could not fail — [four alerts that could never fire](/blog/alerts-that-could-never-fire/) and [a nightly suite that passed for eight nights while twelve tests failed](/blog/github-actions-pipefail-exit-code/). Both are the same defect: a green signal that would have looked identical had the thing it watches been broken.

This one is the mirror image, and it is worse in a way that took us a while to articulate.

## One run, three levels, three answers

Here is a single GitHub Actions run from one of our repositories, read three ways.

**The run conclusion:**

```
failure
```

**The two jobs in it:**

```
JOB parity        = success
JOB config-fields = failure
```

**The steps inside the failing job:**

```
1 Set up job                                    = success
2 Run actions/checkout@v6                       = success
3 Fetch core's shipped connection schema        = success
4 Compare documented fields against the form    = success
5 File an issue on drift                        = failure      <-- the only red
```

Every step that does real work succeeded. The one that failed was the step that *reports*. And here is its entire log:

```
Already tracked in #449; not filing again.
##[error]Process completed with exit code 1.
```

The check went red because it found nothing new to say.

## The bug is four lines and looks completely reasonable

The workflow compares two catalogues that live in different repositories and files an issue when they disagree. Filing the same issue every morning would be useless, so it suppresses duplicates:

```bash
existing=$(gh issue list --state open --search "in:title Connector config field drift" \
  --json number --jq '.[0].number // empty')
if [ -n "$existing" ]; then
  echo "Already tracked in #$existing; not filing again."
  exit 1
fi
```

Read that in review and nothing jumps out. `exit 1` after "we found drift" feels right — drift *is* a problem, and a red check is how a cron gets anyone's attention.

But this branch is not "we found drift." It is **"we found drift, and it is the same drift as yesterday, already filed, already assigned."** Nothing changed. Nothing needs doing. And because the issue will be open for as long as it takes to fix a 36-page documentation mismatch, this branch runs **every day until then**, painting the check red every time.

## Why a permanent red is worse than a permanent green

This is the part worth taking away, and it is not symmetric with the "green that proves nothing" story.

> A green that proves nothing **fails to inform**. A red that repeats forever **destroys the channel.**

A useless green leaves you no worse off than having no check. A permanent red actively trains every human near the repository to stop reading that signal — and the steps above it in the same job are the reason the cron exists. In our case those steps fetch a schema from another repository and parse a data file by regex. Both are exactly the kind of thing that breaks quietly when someone renames a field. The job even has explicit guards for it:

```
::error::Parsed $slugs slugs out of connectors.ts — the file shape changed.
```

That guard reports through the channel the duplicate-suppression branch was jamming. Had the file shape actually changed, the message would have arrived on a check that everyone had already learned to ignore, and it would have looked exactly like yesterday.

There is a second cost, which we hit within the hour. The red job sat next to a *succeeding* one and a *stale* auto-filed issue titled "Connector count drift." Glanced at, the repository said the connector count was broken. It was not — the counts agree, on both sides, in the workflow's own log, and on the live site. We nearly spent a session re-fixing something that was already fixed.

## The line we drew

The distinction that resolves it is not "is there a problem" but **"did anything change that needs a human?"**

| branch | exit | reasoning |
|---|---|---|
| filed a **new** issue | `1` | something changed today; a red run is a standing signal that is easy to see |
| an issue **already exists** | `0` | nothing changed, nothing to do, and the open issue is already the tracking mechanism |

Note that we did not simply make the cron always green. The `exit 1` after a genuine `gh issue create` stays exactly as it was. A rule that removes the check's ability to ever go red would be the original defect arriving from the other direction, so the test we added asserts the narrow version *and* asserts that both jobs still exit non-zero after really filing something.

## Read the level that answers your question

The same run demonstrates a second thing, and it is free.

Three conclusions were available — run, job, step — and they were `failure`, `success`/`failure`, and one red step among five. **Every one is a true statement about a different question.** If you ask the run whether your drift check is healthy, the answer is a confident no, for a reason that has nothing to do with drift.

Fetch step-level data whenever the question is about a particular thing:

```bash
gh api repos/<owner>/<repo>/actions/runs/<id>/jobs \
  --jq '.jobs[] | {name} + {steps: [.steps[] | {number, name, conclusion}]}'
```

Two related traps we have hit: a job's own conclusion can be red because of an artifact upload rather than anything it tested, and a *fetched log* can silently omit steps entirely while the API reports them as `success`. **Read outcomes from the API, and never conclude from an absence.**

## Three checks you can run on your own repositories

1. **Grep your automation for `exit 1` in a de-duplication or "already handled" branch.** Anywhere a script's happy path for "nothing new" is an error exit. This includes retry guards, lockfile checks, and "skip because it is already deployed".
2. **List the checks that have been red for more than a week.** For each, ask what would happen if a *different* thing in that job broke tomorrow. If the answer is "the colour would not change", the job has no remaining signal.
3. **For every scheduled workflow, ask what its steady state should be.** A cron that watches for drift is supposed to be green almost always and red on the day something moves. If yours is red most days by design, the design is wrong.

## One note on writing the test

We pinned the fix with a test that parses the workflow file, and the first run of its mutation harness reported:

```
M1 :: MUTATION DID NOT APPLY
M2 :: MUTATION DID NOT APPLY
M3 :: MUTATION DID NOT APPLY
```

The working copy of the workflow is CRLF and the harness's multi-line anchors used bare `\n`, so they matched nothing. That is worth stating because of what the alternative looks like: a mutation tool that silently changes nothing will report every mutation as "the test caught it", and you will believe you have a proven guard when you have an untested one. **Make a harness assert that its mutation actually landed** — we compare the file's hash before and after — and treat "did not apply" as a distinct outcome from "passed".

With the anchors corrected, all four mutations went red: both duplicate-suppression branches restored to `exit 1`, the scope control that deletes a legitimate `exit 1`, and a positive control that renames the log line the matcher keys on.

---

Datanika is an open-source data platform — extraction, loading, transformation and scheduling in one UI. The workflows described here are in our public repositories, defects included. [Try it free](https://app.datanika.io), or [read the self-hosting guide](/docs/self-hosting/).

