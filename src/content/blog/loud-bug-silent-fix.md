---
title: "5× Is Loud, 0× Is Silent: When the Obvious Fix Is Worse Than the Bug"
description: "Running a scheduler in every web process dispatched each job N times. The obvious fix — run exactly one — made it dispatch nothing, because the library wakes only its own instance and otherwise sleeps for 49.7 days. And the in-process test that said the bug did not exist was anti-evidence."
date: 2026-09-23
publishedAt: 2026-09-23
author: "Datanika Team"
category: "engineering"
tags: ["python", "scheduling", "concurrency", "testing", "engineering"]
---

We found a scheduler running in every web process. Four workers, four schedulers, one shared job table, no locking — so every due job got dispatched four times.

The fix is obvious. Run exactly one scheduler, in its own process.

That fix, written the obvious way, makes the scheduler dispatch **nothing at all**.

## Why the obvious fix breaks it

APScheduler's `BackgroundScheduler` sleeps between jobs. How long it sleeps is decided by the jobs it already knows about, and it is woken by exactly one thing:

| call | who it wakes |
|---|---|
| `BaseScheduler.add_job` | `wakeup()` on **its own instance only** |
| `_main_loop` | waits on `_process_jobs()`, which returns `TIMEOUT_MAX` — **49.7 days** — when nothing is due |

While the scheduler lived *inside* the web process, saving a schedule called `add_job` on the very object that would run it. Move the scheduler into its own process and that call still happens — on a scheduler instance in the **web** process, which no longer runs anything. The instance that matters never hears about it, and goes back to sleep for seven weeks.

Measured on APScheduler 3.11.2 against a real Postgres jobstore: a job written by a second process, due in two seconds, produced **0 dispatches at t+3s, t+6s and t+10s**. A single explicit `wakeup()` then ran it **immediately** — which is the control that matters, because it proves the scheduler was *asleep* rather than *broken*. Those two look identical from the outside and have completely different fixes.

The remedy is a heartbeat: the single scheduler re-reads the job table on a short interval, so a write from another process is picked up on the next beat. Measured across real processes, with the discriminating control:

| reconcile interval | a schedule row written by another process |
|---|---|
| **5 s** (the fix) | picked up in **5.0 s**, no restart |
| **3600 s** (control) | **never**, across the whole 25-second observation |

## The asymmetry is the whole point

Both states are wrong. They are not equally wrong.

- **5× is loud.** Duplicate rows, duplicate work, duplicate downstream writes. Somebody notices, and the evidence of what went wrong is sitting in a table.
- **0× is silent.** A user creates a schedule. The row is written. The interface shows it active. It never runs, and there is no error anywhere, because *nothing failed* — a process that is asleep is behaving exactly as designed.

So the naive version of this fix converts "create a schedule" into a **silent no-op until the next restart**, and the only party positioned to discover it is the customer, some time later, asking why a thing did not happen.

🔑 **A change that moves a failure from loud to silent deserves more scrutiny than the bug it replaces**, even when it is unambiguously the right architecture. "Correct but quieter" is a trade, and the quiet half needs its own detection before you ship it. We added a monitoring rule for the new single process in the same change, for exactly this reason: a singleton that nothing watches is a component whose death is undetectable — a shape we have [written about before](/blog/alerts-that-could-never-fire/), from the monitoring side.

## The test that proved the opposite of the truth

Before fixing it, we tried to reproduce the original bug in a test. Five scheduler instances, one process, one shared Postgres jobstore, one due job.

**Result: one dispatch.** Four of the five schedulers did nothing. By the test's own logic, the bug did not exist.

That green is not weak evidence. It is **anti-evidence**: it points confidently in the wrong direction.

It is a sharper version of something we have hit before — [a nightly job that reported success for eight nights while twelve tests failed](/blog/github-actions-pipefail-exit-code/). That one failed to *look*. This one looks, and reports the opposite of what is there. Here is why.

The defect lives in a read-modify-write window: read the due jobs, dispatch, advance `next_run_time`. Two schedulers duplicate work only if the second one *reads* before the first one *writes*. In a single Python process, the GIL serialises exactly that window — five threads wake, whoever holds the interpreter first advances the timestamp, and everyone else reads a job that is no longer due. **The runtime closes the race the test exists to observe.**

Five separate processes on four cores genuinely overlap, and the duplication is real.

So: **no in-process harness can be the regression test for this bug.** Not a better-written one; not a slower one; not one with more instances. The property under test is destroyed by the environment the test runs in.

That is worth generalising, because the shape is common and the failure is confident:

> Before trusting a concurrency test, ask whether the runtime you are testing in can even express the interleaving you are testing for.

A green from a harness that cannot produce the failure is not weak evidence of correctness — it is evidence about the harness, wearing the costume of evidence about the code. The tell is available before you run anything: name the window the bug lives in, then ask what serialises it.

## What we actually shipped

- The scheduler moved to a dedicated single-process container, so the process count is a property of the deployment rather than an accident of how many web workers are configured.
- A reconcile heartbeat, because moving it severed the in-process notification path — and the heartbeat is the wakeup and the poll at the same time.
- A monitoring rule that watches the new container, added in the same change rather than afterwards.
- The regression tests assert that **nothing arms a scheduler at import time**. That property is independent of process count *and* of architecture: it stays true under a dedicated container, a leader lock, or a feature flag. A test that encodes the design decision you made last week is a test you will have to rewrite the week after.

The last one is the piece we would keep if we could only keep one. The bug was never really "four schedulers" — it was that starting a scheduler was a side effect of importing the application. Everything else followed from that.

---

*Datanika is an open-source data platform — extraction, loading, transformation and scheduling in one place. If you want to see what the scheduler described here is attached to, the [architecture overview](/docs/architecture) is the place to start.*
