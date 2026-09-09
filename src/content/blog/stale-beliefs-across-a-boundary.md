---
title: "Two Services, Two Stale Beliefs, Pointing in Opposite Directions"
description: "Our billing gate correctly refuses to charge for a cancelled run. All three of its callers pass the word success as a literal. Each side had written down an assumption about the other, both assumptions were reasonable, and neither was enforced — so the gate defends a case it can never be handed."
date: 2026-09-25
publishedAt: 2026-09-25
author: "Datanika Team"
category: "engineering"
tags: ["architecture", "billing", "testing", "distributed-systems", "engineering"]
---

Our billing code decides whether a pipeline run is chargeable. It is one line:

```python
return status == "success"
```

That line is right. It is deliberately `== "success"` rather than `!= "failed"`, and the docstring above it says why: a cancelled run is not billable either, and a status this code has never seen should not be charged for by default. Somebody thought carefully about it.

All three of its callers pass `status="success"` as a string literal.

And `status` is a keyword argument that **defaults to `"success"`**. The docstring explains why, and the reason is a good one: so that a caller which omits the kwarg is unaffected. It also means that forgetting to pass a status bills the run.

**Nobody wrote a bug.** Both sides wrote something defensible, and wrote down why. The defect lives in the gap between two correct documents.

## What each side believed

The gate lives in our billing package. Its docstring records — in unusual and, it turns out, prophetic detail — the assumption it depends on and cannot check:

> That worked only because of a property of *core*, in another repository: the `run.*_completed` events are announced solely from success paths. **Nothing here enforced or recorded that assumption.**

Read that again, because the author is telling you the shape of the failure before it happens. They knew the gate rested on a property of a codebase they were not editing. They knew nothing enforced it. They wrote it down in the one place a future reader of *this* file would look — which is not the place the person editing the *other* file would look.

Meanwhile, on the other side of the boundary, the code that announces a completed run passes the literal. From its point of view that is also reasonable: this branch runs when the work succeeded, so `"success"` is simply true here. It carries its own comment explaining which cases do not reach it.

So:

| | believed |
|---|---|
| the billing side | *only successful runs are announced, so the status is trustworthy* |
| the announcing side | *the status is a description of this branch, and this branch is the success branch* |

Each belief is locally correct. Together they mean **the gate's careful handling of `cancelled` can never fire**, because no caller is able to express `cancelled` to it.

## The near-miss that is already in the file

The same docstring records a previous version of this, and it is the part that should make you check your own code:

> Its stated fix was "announce `run.*_completed` with `status="failed"`" — which reads as the obvious change, since the notification handlers already branch on exactly that. **Implemented literally, every failed run would have been metered as a successful one.**

An issue proposed a change that looked obviously right by analogy with neighbouring code. Had someone implemented exactly what the ticket said, the billing gate would have been handed `"failed"` on the event it *does* meter, and the ticket would have closed green. It was avoided by shipping a separate `run.failed` event instead — a decision that reads, at the time, as more work for no visible benefit.

## Why no test caught it

Because every test is on one side of the boundary.

The billing tests pass a status in and assert the gate's answer. They are correct and they pass, including for `cancelled` — a case the tests can construct and production cannot deliver. The announcing tests assert that the event fires with the right payload, and the payload is right by construction because the value is a literal in the same file.

**A test that constructs its own input cannot discover that the real caller never produces that input.** Both suites are green, both are testing something true, and the untested thing is not in either file — it is the claim that the set of statuses the caller emits is the set the gate expects.

We have hit this shape before from the other end: [a test whose runtime closed the race it existed to observe](/blog/loud-bug-silent-fix/), and [a check satisfied by the comment above the thing it was checking](/blog/guard-matched-the-comment/). This is the same family. The assertion is real; the thing it is attached to is not the thing you meant.

## What we are changing, and what we would tell you to do

Nobody was billed. Our `charges` table is empty and always has been — this was found while the product has no paying customers, which is the only reason this post is a mechanism and not an apology.

We have not shipped the repair yet, and the obvious one is not the one we want. "Make the callers pass the real status" is a small change that leaves the next caller free to make the same reasonable choice, and leaves the assumption exactly where it was. What we are changing instead is where the assumption lives:

- **Give the assumption a test on the side that depends on it.** The billing package cannot import the caller, but it can assert the *set* of statuses it is prepared to handle, and fail when it meets one it has never seen — rather than defaulting it into the safe-looking branch.
- **Make the unexpected value loud rather than convenient.** A default of `"success"` is the dangerous polarity: it makes an omission bill. Defaulting to *not billable* turns the same mistake into a support question instead of a charge.
- 🔑 **When you write down an assumption you cannot enforce, write it where it would be violated, not where it is relied on.** That docstring is excellent and it was in the wrong repository. The person who would have broken it was never going to read it.

That last one is the transferable part, and it is not really about billing. Any comment of the form *"this works because of a property of some other system"* is a note addressed to somebody who will never open the file it is in. It needs to be a test, an assertion at the boundary, or a comment in **their** file — otherwise it is a record of the accident rather than a defence against it.

---

*Datanika is an open-source data platform — extraction, loading, transformation and scheduling in one place. The [architecture overview](/docs/architecture) shows where the boundary described here sits.*
