---
title: "Our 07:29 Nightly Job Runs at 12:26"
description: "Not occasionally. Every day, by about the same amount. Across four scheduled workflows we measured lags of four and a half to five hours on the early-morning ones — systematic, not jitter. Any monitor that grades a nightly job against its cron expression is measuring something that never happens."
date: 2026-10-07
publishedAt: 2026-10-07
author: "Datanika Team"
category: "engineering"
tags: ["devops", "ci", "github-actions", "monitoring", "engineering"]
---

One of our scheduled checks declares this:

```yaml
schedule:
  - cron: "29 7 * * *"
```

07:29 UTC. Here is when it has actually run:

```
2026-09-09T12:26:28Z   success
2026-09-10T12:19:42Z   success
```

**+4h57m and +4h50m.** It is not late, and nothing is broken. That is simply when this job runs.

## Four workflows, and the pattern is not noise

We went looking across everything we schedule:

| declared | honoured | lag |
|---|---|---|
| 04:10Z | 08:49 / 08:55 / 08:56Z | **+4h39m … +4h46m** |
| 07:29Z | 12:19 / 12:26Z | **+4h50m … +4h57m** |
| 08:27Z | 13:00Z | **+4h33m** |
| 16:41Z | 18:33 … 19:34Z | +1h52m … +2h53m, drifting ~1h per day |

The three early-morning jobs cluster tightly around **+4.5 hours**, across multiple days and multiple workflows. The late-afternoon one behaves differently — a smaller lag, but wandering by about an hour a day.

That is not jitter you absorb with a slightly wider tolerance. It is a **systematic offset**, and a different one depending on when you ask.

None of this is a bug. The platform documents that scheduled workflows may be delayed, particularly during periods of high load, and that the schedule is not a guarantee. We had all read that. We had filed it as an edge case. **It is the normal case**, and the gap between "documented caveat" and "what actually happens every single day" is where the real defect lived.

## Where it actually hurts

Nobody minds a job running at lunchtime instead of breakfast. The damage is downstream, in whatever watches the job.

We had a watchdog whose job was to notice when a scheduled workflow stopped running. It graded each workflow by asking whether a run had appeared **near its declared time**, with a grace window.

That question has no good answer:

- A **one-hour** window marks every early-morning job as missed, every single day. The monitor becomes noise, then it becomes muted, then it is gone.
- A **five-hour** window swallows the offset — and swallows a genuinely dead cron with it. The monitor becomes scenery: it can no longer distinguish "ran late, as always" from "has not run since Tuesday."

Both settings are wrong because the question is wrong. The declared time is an input to a scheduler that treats it as a request, not a commitment, so **anything computed from the cron expression is measuring an event that never occurs.**

## Ask about cadence instead

The question that survives is not *when* did it run, but *how recently*:

> Has this workflow produced a run in the last 24–30 hours?

The declared time never enters that. A job that consistently runs five hours late passes. A job that stopped on Tuesday fails on Wednesday. It does not care whether the platform is having a slow morning, and it does not need a window tuned per workflow.

This is the same move as [replacing a numeral in prose with the list it counted](/blog/alerts-that-could-never-fire/) — stop deriving your check from a value that can drift out from under it, and derive it from the thing you actually care about.

## The case that has no run at all

One more, because it is the failure mode a cadence check does not automatically handle.

A cadence check reads the most recent run and grades its age. A workflow that has **never run** produces no run to read. There is nothing to grade, so nothing is graded, and the workflow is invisible to exactly the monitor built to notice silence.

We have one in that state right now: promoted, `state: active`, scheduled — and **zero runs**. A manual dispatch of it succeeds, so the workflow itself is fine. Nothing in our monitoring noticed, because "no runs" is not a late run, it is an absent one.

🔑 **`state: active` is not evidence that a workflow fires. Only the runs endpoint is.**

If your monitor iterates over runs, a workflow with zero runs contributes zero rows and disappears. The fix is to enumerate the workflows you *expect* to be scheduled and check each one against that list — a check driven by the expected set rather than by the observed set. Otherwise absence looks identical to health, which is [the same trap as a check with only one possible answer](/blog/check-with-one-answer/).

## What we would tell you to check today

1. **Compare declared to honoured** for every scheduled workflow you have. One API call per workflow. If you have never done this, the number will probably surprise you.
2. **Find anything that grades a job by proximity to its cron.** That includes dashboards, alert rules and any "did the nightly run?" script. Re-point them at cadence.
3. **Ask what your monitor does with a workflow that has zero runs.** If the answer is "nothing", it has a blind spot precisely where a newly added job lives.

The general form is one we keep re-learning in different costumes: [a value you did not measure is not a fact you have](/blog/broken-probe-better-story/), and a schedule you wrote down is a value you did not measure.

---

*Datanika is an open-source data platform — extraction, loading, transformation and scheduling in one place. We think about job scheduling rather a lot, which is why measuring our own was overdue.*
