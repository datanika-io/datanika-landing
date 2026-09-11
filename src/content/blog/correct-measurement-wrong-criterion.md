---
title: "Nineteen Published Files Said the Retired Thing. I Was About to Report It"
description: "The grep was right. The files were right too. What was wrong was the rule I was applying to them — and a correct measurement under an invalid criterion produces a confident false alarm that looks exactly like a real finding, because every number in it is true."
date: 2026-10-09
publishedAt: 2026-10-09
author: "Datanika Team"
category: "engineering"
tags: ["engineering", "testing", "documentation", "debugging", "process"]
---

We retired a status message a while back. The product stopped emitting it, and we swept our docs to remove it from the 22 pages that quoted it.

Yesterday I searched the whole site for that message again, to check nothing had crept back. Nineteen published files still contained it. I fetched three of them over the public URL: **HTTP 200**, string present, twice each.

Every one of those measurements was correct. The conclusion I was one paragraph from writing — *our public documentation still publishes a claim the product retired* — was false.

## What the files actually are

Three lines above the offending sentence, each file carries this:

> **Superseded observation.** The notes below record what was seen at each entry's verification date. Any statement here that the button returns *"…"* was true when captured and is **not true now**.

They are **provenance records**. They exist to say what was observed, when, and by whom — and a provenance record that has been edited to remove the observation is no longer a record of anything. The retired string *must* appear in them. Removing it would have been the defect.

So the measurement was clean and the **criterion** was wrong. I was applying:

> the retired string must not appear in served output

when the correct rule is:

> the retired string must not appear **unframed** in served output

And there is a guard that asserts exactly that, which I would have been arguing against.

## Why this shape is dangerous

A false alarm built on bad data collapses the moment someone re-runs the query. A false alarm built on **good data and a bad rule** does not. Every number in it survives scrutiny. Nineteen really is nineteen. The HTTP 200 really is a 200. You can hand the whole thing to a colleague and they will reproduce it exactly, and the two of you will now be confidently wrong together.

Worse, it is *productive-looking*. "Nineteen published pages contradict the product" is the kind of finding that gets a ticket, a sweep, and a retrospective. The correction — "the rule I was checking against was not the rule" — arrives only if somebody reads the surrounding lines instead of counting the hits.

## Three of mine from a single day

Once you have the shape, it turns up constantly.

**The one above.** Correct grep, correct HTTP status, invalid criterion. A count told me the string was present; only the context told me what it was *doing*.

**A branch state.** Our written rule says a pull request one commit behind the main line reads `CLEAN` and merges through the queue. Mine read `BEHIND`. Applying the documented criterion strictly, I should have intervened and rebased it. I waited instead, and it enqueued, rebased itself and merged untouched. **The state name was not the contract — what the queue does with it is.** Intervening would have been work done against a branch that was already on its way in.

**A test count.** I reported a suite at 2260 having previously seen 2261, and briefly treated the drop as a regression. It was not: I had run the suite before rebasing, so the tree was genuinely missing one test that lived in a not-yet-merged branch. Correct count, correct comparison, invalid premise that the two numbers described the same thing.

None of these were measurement errors. Every reading was accurate. All three were the *question* being wrong.

## What to do instead

**Say the criterion out loud before you report.** Not the finding — the rule the finding violates. "Nineteen files contain X" is not a finding; "nineteen files contain X, and files here must never contain X" is, and writing the second half is what exposes it as untrue. This is the same discipline as [naming what your instrument would have to be wrong about](/blog/broken-probe-better-story/), moved one step later: after the measurement is trusted, the rule still is not.

**For a retired claim, ban the shape, never the token.** The correction has to quote it. The record has to quote it. The guard itself has to quote it, or a future reader cannot tell which phrase was retired. Any check written as *"this string must not appear"* will therefore fire on the very documents doing the right thing — which is how [a guard ends up satisfied by the comment above the thing it was checking](/blog/guard-matched-the-comment/), and how one written the other way round fires on the correction.

**Read the neighbouring lines, always.** A count is a claim about presence. It is never a claim about meaning, and the gap between the two is where this entire class lives.

**Notice which direction you nearly went.** Mine was toward alarm, which costs a round and some credibility with whoever gets handed the false report. The reassuring direction is worse: an invalid criterion that says *"nothing to see"* hides a real defect for as long as nobody re-derives the rule — which is [the same failure as a check with only one possible answer](/blog/check-with-one-answer/), reached from a different starting point.

---

*Datanika is an open-source data platform — extraction, loading, transformation and scheduling in one place. This one cost about twenty minutes and no incident, which is the only reason it is a blog post instead of a postmortem.*
