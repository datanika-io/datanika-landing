---
title: "A File You Deleted in Git Is Still Running in Production"
description: "tar x overwrites what the archive contains and removes nothing it omits. So a file retired in your default branch keeps running on the box forever — with a green commit, a green pipeline, and a green deploy. The obvious fix takes production down."
date: 2026-09-25
publishedAt: 2026-09-25
author: "Datanika Team"
category: "engineering"
tags: ["deployment", "ci", "devops", "infrastructure", "engineering"]
---

We retired three files. The commit merged, the pipeline went green, the deploy went green, and the files kept running in production.

Not "kept running for a while". Kept running **permanently**, with no mechanism anywhere that would ever remove them.

## The mechanism is one sentence

Our deploy ships source as a tarball and the box extracts it:

```bash
cat src.tgz | ssh root@box 'cd /opt/app && tar xzf -'
```

**`tar x` overwrites what the archive contains and removes nothing it omits.**

That is not a bug in tar. It is what extraction means. But it turns your deploy into an operation that can only ever *add and update*, never *remove* — and nothing in the pipeline is shaped to tell you that.

Proof, in four commands, because a claim about a tool should be run rather than remembered:

```console
$ ls src/            # what the archive will contain
keep.txt
$ ls dst/            # what production currently has
keep.txt  retired.txt
$ tar czf a.tgz -C src . && tar xzf a.tgz -C dst
$ ls dst/
keep.txt  retired.txt        # <- still there
```

## Why every signal is green

This is the part that makes it survive. Walk the chain and ask each link what it knows:

- **Git** knows the file is deleted. It is; that is a fact about the repository.
- **CI** builds and tests the tree as it now exists. The file is gone from that tree, so nothing references it, so everything passes.
- **The deploy** transfers an archive and extracts it. Both succeed. Exit zero.

Every one of those is correct, and not one of them is a statement about **the set of files on the box**. The deletion is real in three places and false in the only place that serves traffic.

## What we actually found

Comparing the box's directory against the default branch, right after a deploy:

```
ORPHANS (on the box, absent from the branch):  3
MISSING (in the branch, absent from the box):  0
```

**The zero is the good half** and it is worth stating first: the transfer itself is healthy. Everything the archive carries arrives. This is purely a deletion gap, which is a much narrower problem than "the deploy is broken" — and if you find yourself here, measure both directions before concluding anything.

⚠️ **A first pass reported 21 orphans.** It compared `ls -1` output against the box, and `ls` had emitted its classifier suffixes — the trailing `*` and `/` that mark executables and directories. Every one of those 18 extra "orphans" was a real file whose name simply had a character appended. Use `git ls-tree --name-only`, and keep a sanity control: pick two files you know are in both places and confirm the comparison puts them in neither column.

## The obvious fix takes production down

The one-line fix is to make the sync delete. Do not reach for it.

A deploy of this shape almost always has state on the box that is **deliberately preserved rather than shipped**, and is absent from the archive *by design*. A blanket delete-sync removes it, and the next start fails on something that was there an hour ago.

So the safe-looking change is the destructive one, and it is destructive in a way your staging environment will not show you if staging's config is shipped rather than preserved.

Two narrower options, both of which are decisions rather than fixes:

1. **Delete-sync one directory** — the one you have measured to be entirely repository-owned. That is defensible, and note the tense: *one measurement is not a policy.* A directory that is repo-owned today acquires a generated file next quarter, and the delete-sync is still running.
2. **An explicit list of retired paths** the deploy removes. Safe and dumb. Its failure mode is that somebody has to remember to add to it, which is the same class of failure as the one you are fixing.

## The guard is the hard part

The assertion you want is *"the box has no file that the default branch does not."* **That cannot run in CI, because CI has no box.**

This is worth sitting with, because the instinct is to write the test anyway and let it check something adjacent — the archive contents, the file list in the repo, the deploy script's text. All of those pass today and would have passed on the day we retired the files. A check that cannot observe the thing it is named after is worse than no check, because it occupies the slot where a real one would go. We have [written about that failure mode](/blog/alerts-that-could-never-fire/) more than once.

The honest place is a **deploy-time** assertion, running where the box is, that reports orphans every time — and fails only under whichever of the two policies above you actually chose. Report first, enforce second.

## This is not really about tar

Ask the question of whatever you use:

> When I remove something, does my deploy remove it — or does it only ever ensure the things that remain?

`rsync` without `--delete` behaves exactly like `tar x`. So does `docker cp`. So does `kubectl apply` without pruning, for a resource you stopped generating. So does most configuration management in its ordinary "ensure present" mode: it converges everything you declare and is silent about everything you stopped declaring.

The general shape: **a deploy that applies state is not a deploy that reconciles state**, and almost every tool defaults to the first. The gap only becomes visible on deletion, which is the rarest operation and therefore the one nobody tested.

If you run a single box behind a tarball or an rsync — which is a perfectly good way to run a small service, and [how we suggest self-hosting](/docs/self-hosting/) — this applies to you today. Run the two-way comparison once. The `MISSING` column tells you whether your transfer is healthy; the `ORPHANS` column tells you what you thought you had retired.

## What we are not telling you

We have deliberately not named the three files, what they did, or what they sat next to. They are inert — nothing invokes them, and we checked that rather than assuming it — but the specific inventory of a production machine is a payload rather than a lesson, and [the rule we published two days ago](/blog/does-not-close-closed-it/) applies to infrastructure exactly as it applies to issue trackers: **write the rule, never the payload.**

The mechanism is the whole finding. It reproduces in four commands on your own laptop.
