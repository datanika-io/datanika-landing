---
title: "Three Correct Rules Filled a Directory With 556 Files"
description: "Each rule was right on its own. Together they were a file generator, and the directory they filled sits outside every git repository — so no status command ever showed it. Sixteen files in five months, then five hundred and forty in forty days."
date: 2026-09-29
publishedAt: 2026-09-29
author: "Datanika Team"
category: "engineering"
tags: ["engineering", "devops", "automation", "tooling", "process"]
---

We swept a working directory last week and moved **556 files** into an archive. 335 shell scripts, 93 markdown files, 76 Python scripts, 29 text files, some stray images and logs.

Nobody had been careless. Every one of those files was created by following a rule, and all three rules are still in force, because all three are correct.

## The three rules

**Put command chains in a script rather than inlining them.** Our permission model matches whole command strings, so an inline compound prompts for approval even when every individual segment is already allowed. Writing the chain to a file and running the file is not a style preference; it is the difference between a run that proceeds and one that stops for a human.

**Pass prose to a CLI by file, not by flag.** Commit messages, pull request bodies, issue comments. Anything with newlines, quotes or a `$` in it will eventually meet a shell that disagrees with you about what it means. `--body-file` and `-F` exist precisely so you never have to win that argument.

**Never overwrite a script a background process is still reading.** A long-running job holds its script open. Rewriting that path underneath it is a genuinely nasty class of bug, because the failure lands somewhere unrelated and much later.

Read those three again. There is nothing to fix in any of them. We would give the same advice today.

## What they do when you put them together

The third rule forbids reuse of a name. The first says every command chain becomes a file. The second says every piece of prose becomes a file.

So the number of files is not a function of how tidy anybody is. **It is a function of how much work gets done.**

You can see it in the names. Watch scripts arrive as `watch_<issue-number>.sh`, one per issue, because the rule that forbids overwriting means you cannot have a single `watch.sh`. Comment bodies arrive as `comment<N>.md`, one per comment posted. Probe scripts arrive one per investigation. Each name is evidence of somebody doing the right thing.

None of the three rules says **where the file goes**. None of them says **when it stops existing**.

## Why it ran for seven months

Here is the part that turns a tidiness anecdote into something worth writing down.

That directory is **outside every git repository**. Running `git rev-parse` in it returns `fatal: not a git repository`.

Which means `git status` — the command every one of us runs dozens of times a day, the one that would have shown five hundred untracked files in a single screen and provoked an immediate cleanup — **could not see any of it**. There was no signal. Not a weak signal, not an ignored warning. The instrument that would have caught this was pointed somewhere else entirely.

Had those same files landed one directory over, inside a repository, this would have been fixed in week one by whoever ran `git status` first and said "what is all this?"

## The curve nobody could see

Sorted by modification time, the archive tells the story precisely:

| period | files created |
|---|---|
| February – April | 5 |
| July | 11 |
| August | 265 |
| September (first ten days) | 275 |

Sixteen files in the first five months. Five hundred and forty in the last forty days.

The rules did not change. The throughput did. **A cost that scales with activity is invisible while activity is low**, and it stays invisible right up until the point where it is a four-figure problem — which, if you have no signal, is a point you discover by accident.

That is the same shape as [an alert rule that could never fire](/blog/alerts-that-could-never-fire/): the system was not quietly coping, it was quietly not measuring.

## The fix is not a fourth rule

The obvious response is to add "clean up your temporary files" to the list.

Do not. That rule has exactly the same defect as the other three — it depends on a person remembering, every time, forever, with no feedback when they forget. You would be treating a missing mechanism with another convention, and conventions fail silently by construction. A fourth rule would have produced a directory of 556 files and a document saying we clean them up.

What actually works is giving the artifacts **a location with a lifecycle**: a scratch directory that everybody understands to be disposable, so that disposal is a property of *where the file lives* rather than an action somebody has to take. Nobody has to remember anything. The default is correct.

## The three questions

For any convention that produces an artifact — a log, a lock file, a temp script, a build output, a backup — ask:

1. **Where does it go?**
2. **What removes it?**
3. **What would show me if nothing did?**

The first two get asked reasonably often. The third almost never does, and it is the one that decides whether you find out in week one or in month seven. It is the same discipline as [suspecting your instrument before you trust a dramatic reading](/blog/broken-probe-better-story/) — here, applied to the absence of a reading altogether.

If the honest answer to the third question is *"nothing, because it lives outside everything that watches,"* you do not have a tidiness risk. You have a blind spot, and its size is proportional to how well the rest of the work is going.

---

*Datanika is an open-source data platform — extraction, loading, transformation and scheduling in one place. We write up our own failures fairly often; [a CI suite that passed for eight nights while twelve tests failed](/blog/github-actions-pipefail-exit-code/) is the same family of problem, one layer up.*
