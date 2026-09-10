---
title: "Our Tool Said \"Nothing To Do\". It Would Have Said That Forever"
description: "A publishing check reported zero work available. That was correct. It was also what the check would have reported every day for the rest of its life, because a missing header made one of its two answers unreachable — and it failed toward the answer nobody investigates."
date: 2026-10-01
publishedAt: 2026-10-01
author: "Datanika Team"
category: "engineering"
tags: ["testing", "engineering", "automation", "tooling", "debugging"]
---

We have a small script that decides which blog posts are ready to be syndicated elsewhere. Yesterday I improved it, ran it, and it printed:

```
=== ACTIONABLE NOW: 0 ===
  (none — nothing can be crossposted right now)
```

That was the right answer. Nothing *was* ready. I very nearly shipped it on the strength of that.

Then I made it lie on purpose, and found that it could not have said anything else.

## The bug

The script checks whether a post's public URL is actually live before treating it as ready. It fetched the URL with Python's standard library and no `User-Agent` header.

Our CDN answers **403** to the default `Python-urllib/3.x` agent.

So every URL came back 403, every candidate was filed under "published but not built yet", and the actionable count was **pinned at zero**. Forever. Regardless of reality.

Read the failure mode carefully, because it has three properties that make it nearly undetectable:

1. **The wrong answer is identical to the right answer.** Zero is what a correct run prints on a quiet day. There is no visual difference between "nothing is ready" and "I am incapable of finding anything ready."
2. **It fails toward doing nothing.** A tool that wrongly says *"go ahead"* gets caught the first time it does damage. A tool that wrongly says *"nothing to do"* is just a quiet morning. Nobody files a ticket about a quiet morning.
3. **Reading the code does not reveal it.** The function is eight lines and every one of them is correct Python. The bug is in an interaction with a service, expressed as an omission.

I did not find this by inspection. I found it by taking a post that *was* live and lying to the script about it, then noticing that the answer did not change.

## The rule

**Enumerate the answers your check can give. If the list has one entry, it is not a check.**

This sounds obvious written down. In practice, checks collapse to one answer constantly, because the collapse is always caused by something that looks like an unrelated detail — a missing header, a status code you did not enumerate, an exception swallowed one layer up, a pipeline whose exit code belongs to the wrong process.

We have shipped that last one too: [a nightly suite that passed for eight nights while twelve tests failed](/blog/github-actions-pipefail-exit-code/), because the exit status being read belonged to the command *after* the pipe. Same shape. The check had one possible answer, and it was "fine".

And it is the same family as [an alert rule that could never fire](/blog/alerts-that-could-never-fire/): the difference is only whether the single possible answer is *"nothing to do"* or *"nothing is wrong"*.

## Make "I don't know" a real answer

The repair was not to be more careful with the header. It was to stop treating the check as a yes/no question.

The script now distinguishes **three** outcomes, not two:

| status | meaning |
|---|---|
| `200` | ready |
| `404` | published, rebuild still pending — expected, benign |
| anything else | **the probe could not determine the answer** |

That third row is the whole fix. Before, everything that was not a clear yes fell into the "not ready" bucket — the quiet one. Now an unexpected status is loud, is labelled `UNDETERMINED`, and exits with a distinct code so that a caller cannot accidentally treat *"I could not tell"* as *"there is nothing to do."*

This is the same discipline as a cross-repository consistency check we run, which returns **agree / disagree / could-not-compare** rather than pass/fail. If "could not compare" collapses into "pass", then the day the comparison breaks is the day it starts reporting perfect agreement — and it will report perfect agreement for as long as it stays broken.

**A check that cannot say "I don't know" will say "no problem" instead.**

## Proving each answer, including the one you expect

Having three answers is not the same as having three *reachable* answers. So each one gets a deliberate mutation that forces it:

- Push a live, already-syndicated post back into the pool → the count must go to 1.
- Treat every post as past its publication date → they must land in "rebuild pending".
- Remove the header again → they must land in `UNDETERMINED` and the exit code must change.

The first two worked immediately. **The third one silently did nothing**, and that is the last lesson.

Removing the header changed no output at all — because on that particular day, no post had reached its publication date, so the URL check never ran. My mutation was aimed at code that the run never reached. It looked exactly like a mutation that had been correctly handled.

To actually exercise it I had to apply *two* mutations at once: force the dates, *and* remove the header. Then it went red, correctly, with `UNDETERMINED: 10` and a changed exit code.

🔑 **A mutation that changes nothing is not evidence that the code is right. It is more often evidence that your mutation never arrived.** Before believing a guard survived a mutation, confirm the mutated line actually executed.

That is the same instinct as [suspecting your instrument before you trust a dramatic reading](/blog/broken-probe-better-story/), turned around: here you have to suspect your instrument when it reports *nothing at all*.

## What to take away

For any check you rely on, three questions:

1. **What are all the answers this can give?** Write them down. One is a bug.
2. **Can it say "I don't know", and is that distinct from "no"?** If unreachable, malformed, empty and missing all collapse into the negative branch, you have a check that reports success when it breaks.
3. **Which direction does it fail in?** Failing toward *"stop"* gets found in a day. Failing toward *"carry on"* or *"nothing to do"* can run for the life of the system, and the only evidence will be an absence that looks exactly like good news.

---

*Datanika is an open-source data platform — extraction, loading, transformation and scheduling in one place. Most of our engineering posts are about a green that meant nothing; this one is about a zero that meant nothing.*
