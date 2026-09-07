---
title: "A Commit Saying \"Does Not Close #N\" Closed #N"
description: "GitHub's closing-keyword parser has no notion of negation, so the clearer you are about not closing an issue, the more likely you are to close it. We swept 400 commits and found three — and two of them were not disclaimers at all."
date: 2026-09-19
publishedAt: 2026-09-19
author: "Datanika Team"
category: "engineering"
tags: ["github", "ci", "process", "engineering"]
---

A commit landed on our default branch with this in its body:

```
Does not close #<ref>. The runtime floor — the step reading its own
executed tally — is still open, and so is the question in AC7.
```

It closed `#<ref>`.

The sentence existed for no other purpose than to prevent that outcome. It was written by someone being careful, in a message whose **subject line** already said `refs #<ref>` — the weaker keyword, the one that deliberately closes nothing.

## Why

GitHub scans a commit message for one of

```
close  closes  closed  fix  fixes  fixed  resolve  resolves  resolved
```

followed by an issue reference, and links the two. **The parser has no notion of negation.** It does not read "does not". It sees `close` and `#<ref>` and does its job.

So the clearer and more careful you are about *not* closing an issue, the more likely you are to close it. The failure is not carelessness. It is the specific shape of caution.

## The part we got wrong when we filed it

Our first write-up called this "careful authors writing disclaimers". Then we actually swept for it — 400 commits on the default branch, with a control so a zero would mean something: the same parser found **55 ordinary closing references** in the same window, which is what tells you the regex is alive.

Three real instances. And **two of them are not denials at all.**

| what the commit body said | is it a disclaimer? |
|---|---|
| `Does not close #<ref>` | yes |
| `the .gitattributes rule … is correct and does not close #<ref>` | yes |
| `refuted the fix #<ref> itself proposes` | **no** |

That third one is ordinary English. The noun *"fix"* happens to sit in front of an issue reference in a sentence *analysing* a proposal. There is no negation anywhere in it, and a negation-word heuristic — which is the obvious detector, and the one we wrote first — returns **zero** on it.

Which means the trigger surface is not disclaimers. It is any prose containing *"the fix #N"*, *"we fixed #N last week"*, *"closed #N as stale"*. **Discussing an issue's history in a commit body is enough.** That is a far larger surface than the one we thought we were describing, and it is made of the sentences engineers write when they are being thorough.

## Why it cost more than a re-open

Two of the three sat closed without anyone noticing — one for two days.

A closed issue is not a queue anyone reads. One of ours carried an **unanswered decision**: a question waiting on a human, in the acceptance criteria. It did not get answered and rejected; it left the board silently, and the tell was a state change nobody was watching, in a repository where issues close on deploy all day long.

There is a second-order cost we did not expect. The closure of one of these issues had already been written up — by us — as a *process* failure: someone had closed an issue whose fix never landed, while the test suite said so in four separate places and nobody read them. That narrative was wrong. **Nobody closed it.** The author had written `refs`, and a sentence discussing the proposed fix fired the keyword. We had built a detector for the symptom and told ourselves a story about human error.

## Two mechanisms disagreed and the silent one won

We have a workflow that derives closing references from the commits in a promotion and writes them into the pull-request body. On the promotion that carried this commit, it got it **right** — it listed the issue under *"promoted, close by hand if complete"*, emitting no keyword, exactly as designed.

It was overruled by a keyword nobody wrote as a keyword. And **nothing anywhere recorded the disagreement.** One mechanism made a correct decision, another made an accidental one, and there was no surface on which those two facts ever met.

## You cannot fix this by banning the word

The obvious guard is a wordlist: refuse any commit body containing `close` near a `#`. It is the wrong instrument, for a reason we have hit before and [written down at length](/blog/guard-matched-the-comment/) — that time, a check looked for a flag in our pre-push hook and found it in the comment explaining the flag, so deleting the flag left the guard green.

**A negative assertion is satisfied by its own denial.** A ban on the word would red-light the very sentence a careful author writes to prevent the bug — which is this bug wearing a guard's clothes. It would also fire on every commit that mentions having fixed something last week, which is most of them.

The check that works is about **disagreement inside one message**:

> the subject line references an issue with `refs` / `part of` / `towards`, while the body carries a closing keyword before that same issue reference.

That is a contradiction the author did not intend, it needs no network and no judgement, and it caught all three of our instances with no wordlist at all. It says nothing about vocabulary and everything about intent stated twice.

## The loose pattern fails in the direction that gets the guard deleted

Our first detector used a deliberately permissive separator, so that markdown formatting could not hide a match:

```
(clos(e|es|ed)|fix(e[sd])?|resolv(e|es|ed))[^A-Za-z0-9]{0,5}#[0-9]+
```

On an eight-commit batch it reported two hits. **Both were false.**

That matters more than it looks. A guard that fires on correct work does not get fixed; it gets ignored, and then it gets deleted, and the real instance goes through afterwards. False-positive rate is a correctness property of a check, not a matter of taste — narrow the pattern to the shape you actually mean, and keep a control proving it still catches the real thing. The opposite failure is the one we write about most: [alert rules that could never fire](/blog/alerts-that-could-never-fire/), green for weeks, structurally unable to report the thing they were named after.

## Write the rule, never the payload

Here is the part that generalises past GitHub.

While documenting this bug, one of us explained it in a promotion pull-request body by quoting the example **verbatim**, with the real issue number in it. A promotion body merges to the default branch. Publishing that explanation would have fired the exact bug it was explaining.

It was caught only because they ran their own detector over their own text before opening the pull request. Then it happened **again**, four hours later, in a second promotion body — in the block that was demonstrating that the detector works.

**Documentation of this bug is a carrier of it.** So is a blog post about it.

This one nearly was. The first draft of the headline above used a plausible-looking placeholder — a real-looking number, chosen precisely because it looked like an example rather than a reference. In our repository that number resolves to an actual issue. A commit message quoting that headline would have contained the word *Closed* in front of a live issue reference, on a branch that merges to the default branch, in a post about a commit message containing the word *close* in front of a live issue reference.

It was caught by checking, not by knowing. The headline now says `#N`, which has no digits and which the parser therefore cannot resolve. Every `#<ref>` above is a placeholder for the same reason.

The rule, stated so it survives leaving this page: **when you write about a mechanism that reads text, write the rule and never a live payload.** It applies to closing keywords, to `@`-mentions, to anything that turns a string into an action — and the moment you feel safest is when you are quoting an example to be helpful.

---

*Datanika is an open-source data platform — extraction, loading, transformation and scheduling in one place. The tooling described here is the ordinary machinery of running it; if you want to see what that machinery is attached to, the [architecture overview](/docs/architecture) is the place to start.*
