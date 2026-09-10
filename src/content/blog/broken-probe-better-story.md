---
title: "A Broken Probe Tells a Better Story Than a Working One"
description: "Three times in one week a command of mine failed silently, and every time the false reading was more interesting than the truth. That is not coincidence — it is selection. The size of a finding should raise your suspicion of the instrument, not your confidence in the finding."
date: 2026-09-27
publishedAt: 2026-09-27
author: "Datanika Team"
category: "engineering"
tags: ["testing", "debugging", "engineering", "observability", "devops"]
---

Last week three of my own commands failed without saying so. Each one produced a reading I believed for a few minutes. And each false reading was a **better story** than the truth turned out to be.

That is not bad luck. It is a selection effect, and once you see it you cannot unsee it.

## The three

**A wrong path said our legal page named a company we do not use.** I was checking whether an alerting vendor listed in our sub-processor register was actually wired up in production. I grepped the deploy directory on the box. Zero matches. Zero is a *finding*: it means the register — a document with legal weight, rendered into our published DPA — names a recipient that does not exist, and someone published it without checking.

The truth was that the config lives in `monitoring/`, not `deploy/`. I had typed the wrong path. The vendor is wired up exactly as documented.

Notice the asymmetry. "Our published legal document names a phantom sub-processor" is a finding with a blast radius. "I typed the wrong directory" is not a finding at all.

**A stale ref said the merge queue had silently dropped a pull request.** I checked whether a merged post was on the integration branch. It was not there. The pull request said `MERGED`, with a merge commit and a timestamp — and the file was absent from the branch it had merged into.

That is a genuinely alarming shape: a merge queue that reports success and loses the change. It would have been worth a week of somebody's attention.

The truth was that `git fetch origin <a> <b>`, with two branch names, updates `FETCH_HEAD` and leaves the remote-tracking refs alone. Mine was seventeen commits behind. The queue was fine. `git ls-remote` — which asks the server every time — said so immediately.

**And once, the instrument was me.** I published a post asserting that we had fixed a defect. We had not; another team was mid-flight on the file at the time. "We found this and fixed it" is the shape a write-up wants. "We found this and it is still there" is the shape the repository was actually in.

## Why the false reading is the interesting one

Because you do not stop for unsurprising results.

A working probe mostly returns what you expected, and you move on without a second thought. A broken probe returns something *unexpected* — a zero where you expected matches, an absence where you expected a file. Unexpected is exactly the trigger that makes you stop, look closer, and consider writing it down.

So the pool of readings you investigate is not a fair sample of your readings. It is heavily enriched for surprise, and **a broken instrument is a surprise generator**. Among the things that make you sit up, malfunctions are massively over-represented.

Then the second filter runs. Of the surprising readings, the ones you *publish* are the ones with consequences. "Our legal document is wrong." "The merge queue loses commits." A broken probe manufactures precisely those, because a false negative in a safety check always looks like the safety failing.

**"My probe was wrong" is never the better story. That is exactly why it gets skipped.**

## The rule I now use

🔑 **The size of a finding should increase your suspicion of the instrument, not your confidence in the finding.**

That inverts the instinct. A dramatic result feels like it deserves to be believed harder — you found something big. Treat it the other way round: the bigger the claim your command just made, the more likely the command is what broke, because big claims are what broken commands produce.

Concretely, before writing anything down:

- **Run a control aimed at the instrument, not at the claim.** This is the part that catches people, and it caught me. In the merge-queue case I *had* a control: I checked that my command correctly reported a file that genuinely did not exist. It passed. It proved the command can report absence — which was never in doubt. It could not prove the *ref I handed it was current*, and that was the only thing in doubt. **A control on the wrong axis reads exactly like a control.** We have hit the same family before, when [a check was satisfied by the comment above the code it was checking](/blog/guard-matched-the-comment/).
- **Name the boring explanation out loud first.** Wrong path, stale ref, unset locale, a pattern that matches nothing because of an encoding. Check those before the interesting one, precisely because they are boring and you will otherwise skip them.
- **Prove a zero can be non-zero.** Any check whose finding is an absence needs a paired check that finds a presence, on the same command, in the same run. An absence is never evidence on its own — and the paired check has to run against the same broken thing, not a clean fixture, which is how [a test's own runtime closed the race it existed to observe](/blog/loud-bug-silent-fix/).

## The part that keeps this honest

The rule is not "distrust alarming readings." It is "distrust the instrument," and instruments fail in both directions.

The same week, a push warning told me we had 53 open dependency alerts while our own internal note said 46. The reassuring number was the one in the carefully written document; the alarming number came from a machine. I re-derived it. The machine was right, the document was stale — and checking also turned up that the note's stated test had quietly become wrong, in a way that would have made an honest re-run look like a failure.

(The alerts themselves are build tooling. This site is statically generated and ships no client-side JavaScript at all, which a test asserts against the built output rather than against anybody's memory — so the day that stops being true, the test goes red on the same day. That is the whole reason the answer lives in a test and not in a note.)

If I had applied "big claims are usually broken probes" as a heuristic for *what to believe* rather than *what to check*, I would have dismissed the correct reading and kept the comfortable one.

So: not scepticism toward surprising results. **Symmetry.** Whichever direction the reading points, the question is the same one — *what would my instrument have to be wrong about for this to be false?* — and then you go and check that specific thing, rather than the thing you already believe.

---

*Datanika is an open-source data platform — extraction, loading, transformation and scheduling in one place. The same instinct shows up in [a CI suite that passed for eight nights while twelve tests failed](/blog/github-actions-pipefail-exit-code/): a green that could not go red.*
