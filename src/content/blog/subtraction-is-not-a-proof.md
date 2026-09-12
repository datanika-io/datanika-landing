---
title: "A Subtraction Is Not a Proof: the Check That Counted Instead of Looking"
description: "A test computed one set minus two others, got 16, and reported that the property held. It had never established that any of those 16 items had the property - only that they were what remained after the subtracting. Here is how to tell the two apart."
date: 2026-10-15
publishedAt: 2026-10-15
author: "Datanika Team"
category: "engineering"
tags: ["engineering", "testing", "verification", "supply-chain", "ci"]
---

I wrote a test to answer a question about our own site: does a given class of dependency actually reach the file a visitor downloads, or does it live entirely in build tooling that runs on a CI machine and exits?

The first version answered it like this:

```
alerts − direct dependencies − direct devDependencies = 16
```

Sixteen items left over. The test asserted the count and reported that the property held.

It was green. It was also worthless, and the reason is worth more than the bug.

## What the subtraction actually established

Read the arithmetic literally. It establishes exactly one thing: **sixteen items were in the first set and in neither of the others.** That is a fact about membership in three lists.

The property I claimed to be testing was different: *these do not reach shipped output.* Nothing in the subtraction went anywhere near shipped output. No file in `dist/` was opened. The residual was computed and then quietly relabelled as the answer to a question it had never been asked.

This is a specific and very comfortable error. A residual always *feels* like a conclusion — you did work, a number came out, the number is stable, it changes when the inputs change. All of that is true of a subtraction that means nothing at all.

The tell is that the name of the check and the content of the check refer to different things. Mine was called reachability. It computed set difference. Those are not the same word, and once you see the gap you cannot unsee it.

## Why it would never have gone red for the right reason

Here is the part that makes this worse than an ordinary weak test.

Suppose one of those sixteen packages *did* start shipping its code to the browser tomorrow. What would the subtraction do? Exactly what it did before: find it in the first list, not find it in the other two, count it in the sixteen, and pass.

The check could not distinguish the state it was written to detect from the state it was written to rule out. **Its output is identical in both worlds.** That is the property to test for in your own checks, and it is a much sharper question than "is this test correct" — ask instead: *what would have to become true for this to go red, and is that the thing I care about?*

If the honest answer is "the inputs would have to be shaped differently", you have a check on your bookkeeping, not on your system.

## What replaced it

The rewrite stopped counting and started looking. For each package, one distinctive identifier from its actual source — not its name — and then a search of every text file the site actually publishes.

Two details did the real work, and neither is optional.

**Names are not markers.** The first instinct is to grep shipped output for `"esbuild"` or `"devalue"`. Do not: those strings match any page that happens to *mention* the package. On a site with an engineering blog, writing about the finding would have destroyed the finding. The markers are code-shaped identifiers — a thrown error class, an internal constant, an environment-variable name — things that appear in the library's source and essentially nowhere else.

**Every marker is controlled in both directions.** This is the half that the original version had no equivalent of at all:

- *Positive control.* Each marker must be found inside its own package under `node_modules/`. If it is not — because the package renamed the identifier, or minified it away — then searching published output for it returns zero hits and **reads exactly like proof of safety**. A marker that matches nothing anywhere is the most dangerous possible input to this test, because its failure mode is a clean pass.
- *The assertion.* The same marker must be absent from published output.

Only the pair means anything. The positive control says the instrument works; the assertion says what it measured. Run the assertion alone and you have rebuilt the original bug in a more convincing costume.

The failure message matters too. When a positive control fails, the cheapest way to green is to delete that row from the table — so the message says, in the file, that the fix is to repair the marker and never to remove the entry.

## The general shape

Once named, this turns up everywhere, and it is not really about dependencies.

> **A check that computes a residual and asserts something about its size has tested the arithmetic, not the property.** Membership in "what is left over" is not evidence of any quality beyond having been left over.

Some places it hides:

- *"Every table is covered, because `all_tables − migrated − excluded` is empty."* That is a statement about three lists. Whether the migrations run is a different question.
- *"No unowned alerts: total minus each team's queue is zero."* Ownership was assumed by construction; nobody checked that any owner can act.
- *"All routes are authenticated — `routes − public − admin` came out empty."* The subtraction never sent a request.

The repair is the same each time and it is not subtle. **Go and look at the thing itself, once per item, and prove your instrument can see.** It costs more than a subtraction. It is also the only version that can be wrong in a way you would notice, which is the entire point of writing it down.

## Where this sits

This is the third failure of the same family we have written up, and they are worth reading together because each one is a different way for a check to be confidently empty.

A test suite that was green while the connectors underneath it were broken is [the one about what green records](/blog/green-tests-broken-connectors/) — passing meant the suite ran, not that anything worked. A pipeline step whose exit code was swallowed before anyone read it is [the `pipefail` one](/blog/github-actions-pipefail-exit-code/) — the signal existed and never reached the place that judged it.

This post is the version where the instrument was never pointed at the subject in the first place. A related failure — measuring something real and then grading it against the wrong criterion — is [in a separate post](/blog/correct-measurement-wrong-criterion/). The two are cousins: one asks the wrong question precisely, the other asks the right question of the wrong evidence.
