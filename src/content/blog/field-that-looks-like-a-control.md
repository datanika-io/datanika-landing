---
title: "The Better We Maintained These Docs, the More Wrong One Field Became"
description: "Thirty-four of thirty-seven guides carry a verified_date older than their own last change. That is not neglect — every careful fix we shipped made it worse, and the obvious repair would have turned a stale record into a false one."
date: 2026-10-11
publishedAt: 2026-10-11
author: "Datanika Team"
category: "engineering"
tags: ["documentation", "engineering", "process", "testing", "maintenance"]
---

Our connector guides carry two fields in their front matter:

```yaml
verified_by: "product-ui"
verified_date: "2026-07-19"
```

Thirty-seven guides. In **thirty-four** of them, that date is older than the most recent commit that changed the file.

The interesting part is not the number. It is what produced it.

## Diligence did this

Every one of those thirty-four went stale because somebody fixed something.

A sweep corrected a status message the product had stopped emitting. Another pass fixed an authentication section that documented an option that did not exist. A third removed navigation steps for a screen that had been redesigned. Every one of those changes was right, was reviewed, and left `verified_date` exactly where it was — because nothing connects editing a file to re-verifying it.

So the relationship runs the wrong way round. **The more carefully this corpus is maintained, the more of these dates become wrong.** A neglected corpus would score better on this particular metric, which is a good sign the metric is not measuring what its name suggests.

## What the field looks like, and what it is

It is worth being precise about the exposure, because the honest version is narrower than the alarming one.

The field is **not rendered**. No reader of our documentation ever sees a verification date. Nobody has been told a guide was checked more recently than it was.

What it is instead is **internal metadata that looks like a control**. Someone opening the repository — a contributor, a colleague, one of our own agents — reads `verified_by: product-ui` beside a July date and reasonably concludes there is a verification process, and that this file passed it recently. There *was* a process. It ran once, on that date. The field cannot distinguish "verified and unchanged since" from "verified, then rewritten seventeen times."

That is a smaller problem than a false public claim and a nastier one than an empty field, because an empty field prompts a question and a confident one closes it.

## The obvious fix would have made it lie

The rule that suggests itself is a guard: *`verified_date` must not be older than the last change to the file.*

Do not write that rule.

It fails on every typo fix, and the cheapest way for a hurried person to make it pass is to bump the date. At that point the field asserts a verification **that never happened** — and unlike a stale date, a fabricated one cannot be spotted by comparing it to anything. **A stale record traded for a false one is not an improvement; it is the same defect with the evidence removed.**

There is a general shape here. When a record has drifted, "refresh it" and "label it" are not variations on the same repair. Refreshing asserts new knowledge you may not have. Labelling asserts only what you actually know, which is that the record is old.

## The real defect was that no rule existed

Here is what took the longest to see: **thirty-four out of thirty-seven is not a violation of anything.**

There was no statement anywhere of what `verified_date` means. Not in the schema that declares it, not in a test, not in a comment. Without a criterion, the number cannot be right or wrong — it is just a number, and my instinct to treat it as damning was doing what [a correct measurement under an invalid criterion](/blog/correct-measurement-wrong-criterion/) always does, only with the criterion invented on the spot rather than misremembered.

A field name is not a specification. It is a suggestion, made confidently, to every human who reads it and to no machine at all.

So the change we shipped is not a date guard. It is the missing criterion, written where a reader meets the field — at its declaration — saying what it records, what it does not mean, and explicitly forbidding the bump-on-edit repair above.

## And then guarding the explanation

One more step, because we had just been caught by its absence.

A week earlier we found that a block of instructions in a page template could be deleted entirely with the whole test suite green. The only affirmative check was pinned to an unrelated word that survived the deletion. **An explanation that nothing guards is an explanation with a deletion date** — the same family as [a check satisfied by the comment above the thing it was checking](/blog/guard-matched-the-comment/), arrived at from the opposite side.

So the note has a test. Not on the dates — on the note. Delete it and the suite names each missing statement; remove only the sentence forbidding the bump and it names that one.

## Three questions for any metadata field

1. **Who reads it?** Not "who could" — who does. If the answer is nobody and no code, it is not a record, it is a decoration.
2. **What breaks if it is wrong?** If nothing breaks, nothing will ever tell you it is wrong, and it will drift to whatever value neglect produces — or, as here, to whatever value *diligence* produces.
3. **What would make it wrong?** If you cannot state that, you have no criterion, and every number you compute from the field is uninterpretable. That is the state we were in, and it is [the same emptiness as a check with only one possible answer](/blog/check-with-one-answer/) wearing different clothes.

---

*Datanika is an open-source data platform — extraction, loading, transformation and scheduling in one place. Our connector guides are all in the repository, dates and all.*
