---
title: "Our Nightly CI Passed for Eight Nights While Twelve Tests Failed"
description: "A pipe to tee discarded pytest's exit code, and GitHub Actions' default shell does not set pipefail. Every night reported success, and the failure alert never fired. Here is the mechanism, the fix, and the part that is easy to get wrong afterwards."
date: 2026-09-09
publishedAt: 2026-09-09
author: "Datanika Team"
category: "engineering"
tags: ["ci", "github-actions", "testing", "bash", "engineering"]
---

Our nightly connector smoke suite reported `success` eight nights running. Here is what it actually printed on each of those nights:

```
12 failed, 9 passed, 4 warnings in 44.01s
```

Twelve of twenty-one probes failing, every night, for at least eight consecutive nights — the log retention window is the only reason the count stops at eight. The step reported `completed/success`. The job reported `success`. The workflow reported `success`. The `Telegram alert on failure` step, guarded by `if: failure()`, was `skipped` every single night, because `failure()` never became true.

Nobody had broken anything that week. The suite had been lying since long before.

## The mechanism is four words of shell

Here is the step, near enough verbatim:

```yaml
- name: Run connector smoke tests
  run: |
    pytest tests/test_connector_smoke/ -v --tb=short -rs | tee /tmp/smoke.log
    if grep -qE '[0-9]+ skipped' /tmp/smoke.log; then
      echo "::error::Smoke probes were SKIPPED"
      exit 1
    fi
```

A shell pipeline's exit status is the exit status of its **last** command. The last command here is `tee`, and `tee` succeeded — it wrote the file it was asked to write. `pytest` exited non-zero into a void.

That much is ordinary POSIX shell, and most people who have written a CI pipeline know it. The part that catches you is the second half.

## GitHub Actions gives you `pipefail` only if you ask for it, and asking looks like a no-op

Bash has a flag for exactly this. `set -o pipefail` makes a pipeline return the rightmost non-zero exit status, so `pytest ... | tee` fails when `pytest` fails.

GitHub Actions runs `run:` steps on Linux and macOS with a default shell of:

```
bash -e {0}
```

`-e` but no `-o pipefail`. Now write the step as:

```yaml
- name: Run connector smoke tests
  shell: bash
  run: |
    ...
```

and the runner invokes:

```
bash --noprofile --norc -eo pipefail {0}
```

Naming the shell you were already using turns on `pipefail`. That is a real asymmetry in the product, it is documented, and it reads as a no-op in a diff. A reviewer looking at `shell: bash` on a step that was already running bash sees tidying, not a behavioural change — which cuts both ways: it is easy to add without argument, and easy for someone to delete later as noise.

We had **no `shell:`, no `defaults:` and no `pipefail`** anywhere in that workflow file. So the only thing left that could fail the step was the `grep`.

## The part actually worth writing down

The `grep` is not a mistake. It exists for a good reason and it was working.

Our connector probes need live credentials. A probe with no credentials, or one whose client library will not import, used to *skip* — and a suite that skips everything passes loudly while testing nothing. So we changed `conftest.py` to convert both cases from **skip** into **fail**, on the reasoning that a healthy run should have zero skips, which makes "any skip at all" a usable alarm. Then we added the `grep` to enforce it.

Read those two decisions in isolation and both are right. Read them together and this falls out:

- the outcome the guard watches for — **skip** — is now the rare one, by construction;
- the outcome that actually happens — **fail** — is the one the pipe throws away.

The guard was aimed at the hole that existed *before* the `conftest` change. The `conftest` change moved every real failure into the blind spot. No commit introduced the bug; the second correct change walked the failure mode into the first correct change's shadow.

That is the shape to look for, and it is not rare. When you tighten one behaviour, the checks written against the old behaviour do not fail — they go quiet, and quiet and healthy look identical from outside.

## What was underneath

The twelve failures were all real, and none was caused by this bug. A couple of trial accounts had lapsed and were returning `401` and `403`. A message-broker probe was pointed at a cluster that no longer matched the one our credentials were minted against. Several probes were missing environment variables entirely, because the credential bundle handed to CI had drifted from the copy on disk — two copies of the same list, edited independently, which is its own recurring lesson.

Every one of those is a five-minute fix once you can *see* it. They had been invisible for over a week, and the instrument that was supposed to show them was reporting green the whole time.

## Fixing it

Any one of these is sufficient. They are not equivalent.

**1. Name the shell.** The smallest diff, and it fixes every pipeline in the step at once:

```yaml
- name: Run connector smoke tests
  shell: bash
  run: |
    pytest tests/test_connector_smoke/ -v --tb=short -rs | tee /tmp/smoke.log
```

**2. Set the flag explicitly.** More obvious to a reader, and it survives someone deleting `shell: bash` as redundant:

```yaml
run: |
  set -o pipefail
  pytest ... | tee /tmp/smoke.log
```

**3. Capture the status you care about.** Verbose, but it is the only form that lets you act on `pytest`'s code specifically — useful when a tool distinguishes "tests failed" (`1`) from "the run was misconfigured" (`2`, `4`):

```bash
pytest ... | tee /tmp/smoke.log
rc=${PIPESTATUS[0]}
```

**4. Stop piping.** Write the log to a file and `cat` it afterwards, or emit machine-readable output and read that:

```bash
pytest ... --junitxml=/tmp/smoke.xml | tee /tmp/smoke.log
```

Keep the `grep`, in every case. It still catches the case it was written for. It just must not be the *only* thing that can fail the step.

## Do not trust the green afterwards

This is the step that gets skipped, and it is the one that matters.

Once you have applied the fix, re-run the job **unchanged, against the still-broken system**, and confirm it goes **red**. If it goes green, your fix did not land — a check that has never been observed failing has never been shown able to fail. Our own rule, from a file of rules that each cost us an incident, is blunt about it: *a passing check is not evidence until you have seen it fail.*

We have paid for that rule more than once. A monthly database restore drill asserted that a table of seed rows survived the restore — while `pg_dump` writes tables alphabetically and puts `users` at the very end of the file, which makes it the first thing a truncation destroys and the last thing that check would notice. It printed `PASS` beside an empty user table. Alert rules that were structurally unable to fire. A test suite that mocked the very unit under test. In [an earlier post](/blog/green-tests-broken-connectors) we wrote up 2,300 passing tests sitting beside a CSV import that loaded exactly one row.

The through-line is one question, and it is worth asking of any signal before you rely on it:

> **Would this look different if the thing it watches had failed?**

If you cannot answer that from the code, the green tells you nothing.

## Audit your own workflows in one command

If you pipe test output anywhere in CI — to `tee`, `grep`, `head`, `jq`, a log shipper — check whether your exit code survives:

```bash
for f in .github/workflows/*.yml; do
  grep -q 'pipefail' "$f" && continue
  grep -q 'shell: bash' "$f" && continue
  grep -Hn -E '\|\s*(tee|grep|head|tail|jq|awk|sed|sort|uniq)' "$f"
done
```

Every line it prints is a pipeline whose left-hand exit code is being discarded. Some of those are deliberate. The ones that are not are the ones running your tests.

Two things worth knowing while you read the output:

- **`set -e` does not save you.** `-e` aborts on a failing *command*; a pipeline whose last command succeeded has not failed, so there is nothing for `-e` to abort on. Having `-e` is what makes this feel safe when it is not.
- **Windows runners differ.** The default shell there is PowerShell, which has its own rules for `$LASTEXITCODE` and native-command failure. A fix applied to a Linux matrix leg does not necessarily apply to a Windows one.

## Alerting on the pipelines you actually run

The uncomfortable part of this story is not that a workflow was misconfigured. It is that we had an alert wired up, pointed at the right workflow, with the right condition — and it was silent for eight nights because the condition it tested was never reached. The alert was fine. The thing it was reading was wrong.

That generalises past CI. If you run scheduled data pipelines, the same question applies to every notification you have configured: does your failure alert read the pipeline's real outcome, or something downstream of a step that always succeeds?

Datanika records the outcome of every run in its own ledger rather than inferring it from a log line, and failure notifications fire off that record. If you want them in Slack, [that setup takes about two minutes](/blog/slack-alerts-pipeline-failures). If you drive pipelines from CI, the [REST API](/docs/api) hands back a run id and a status you can poll and assert on — which is a better thing to gate a deploy on than an exit code you have to hope survived a pipe.

The platform is open source and self-hostable. [Start here](https://app.datanika.io), or [read the docs](/docs).
