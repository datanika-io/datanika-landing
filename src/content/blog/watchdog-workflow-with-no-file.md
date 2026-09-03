---
title: "Four Identical Red Runs: One Was Our Watchdog Working, Three Were Its Corpse"
description: "GitHub's workflows API lists dynamic/dependabot/update-graph, a workflow that has no file in the repository. Reading its YAML 404s. That killed our cron watchdog — and because filing a finding also exits non-zero, the crash produced the same run conclusion and the same step list as the night it worked."
date: 2026-09-15
publishedAt: 2026-09-15
author: "Datanika Team"
category: "engineering"
tags: ["ci", "github-actions", "monitoring", "observability", "engineering"]
---

A cron in one of our repositories stopped firing on 21 June and nobody noticed for ten weeks. Its only job was to rebuild this site each morning so that blog posts whose publish date had arrived would actually appear. So for ten weeks, scheduled posts did not publish. The failure mode of a cron is silence, and silence is the one thing no dashboard renders.

We built a watchdog for it. The watchdog has four scheduled runs in its history and all four are red.

Here is what makes this worth writing down: **the first red was the watchdog working exactly as designed**, and the other three were it dying before it checked anything. From the outside they are indistinguishable — not merely the same colour, but the same run conclusion and the same step-by-step breakdown, line for line.

## The four runs

```
33330840430  2026-08-30T19:25:44Z  failure
33442245077  2026-08-31T21:36:52Z  failure
33550257729  2026-09-01T19:34:08Z  failure
33673601655  2026-09-02T19:29:21Z  failure
```

Expand any of them and you get the same two lines that matter:

```
step 5  Check every scheduled workflow in both public repos  = success
step 6  File an issue when a schedule has stopped            = failure
```

That is run 1. It is also run 2, run 3 and run 4. We checked all four against the API rather than trusting the screen; they agree to the character.

On 30 August, step 6 was red because the watchdog **had found a stopped cron and was filing an issue about it**. The issue exists, machine-authored, timestamped 19:26:02Z, and it is correct in every particular:

> `datanika-landing :: .github/workflows/daily-rebuild.yml` last ran on a `schedule` event at 2026-06-21T09:54:45+00:00 — 70.4 days ago. Its cron (`0 6 * * *`) should have fired within 38h. It is `active`, so this is NOT the 60-day disable; something else is stopping it.

On 31 August, 1 September and 2 September, step 6 was red because the watchdog had crashed in step 5 and there was nothing to report. It verified nothing on any of those nights.

## What broke it, and it was not a commit

Nothing in our repository changed between 30 and 31 August. What changed was a repository *setting*: Dependabot became active on the repo. And when Dependabot is on, GitHub starts listing an extra workflow.

```
$ gh api repos/OWNER/REPO/actions/workflows --jq '.workflows[].path'
.github/workflows/ci.yml
.github/workflows/deploy-pointer.yml
...
dynamic/dependabot/update-graph
```

That last one has `state: active` and a display name of "Dependency Graph". It is not a file. We did not write it, it is not in the tree, and it is not in any branch:

```
$ gh api "repos/OWNER/REPO/contents/dynamic/dependabot/update-graph?ref=master"
{
  "message": "Not Found",
  "documentation_url": "https://docs.github.com/rest/repos/contents#get-repository-content",
  "status": "404"
}
```

GitHub synthesises it. The workflows API returns it; the contents API has never heard of it. It is not documented as an exception anywhere we could find, and it appears in **both** of our public repositories.

Our watchdog walks every workflow the API returns and reads each one's YAML off the default branch to extract its cron:

```python
def _gh(*args: str) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout

def _parse_crons(repo: str, path: str, ref: str) -> list[str]:
    raw = _gh("api", f"repos/{repo}/contents/{path}?ref={ref}", "--jq", ".content")
```

`check=True` turns the 404 into `CalledProcessError`. Nothing catches it. The script dies mid-collection — and because it collects the repos in order, it died on the first one and never reached the second, which is *the repo the watchdog was built to watch*.

If you have any tooling that enumerates workflows through the API and then reads their files, run this against your repos now:

```bash
gh api repos/OWNER/REPO/actions/workflows \
  --jq '.workflows[] | select(.path | startswith(".github/workflows/") | not) | .path'
```

Anything it prints will 404 on `contents/`. `dynamic/pages/pages-build-deployment` shows up the same way once GitHub Pages is enabled, so this is a family, not a one-off.

The fix is a whitelist, not a `dynamic/` blacklist — GitHub only ever executes workflows out of `.github/workflows/`, so anything outside that path cannot be a workflow you own, and whatever prefix GitHub invents next year is handled without a code change.

It specifically must **not** become "swallow the 404". A 404 on a real `.github/workflows/*.yml` means a file you were asked to check is unreadable — a token scope, a rename, an API change — and that has to stay fatal. Turning it into "no crons found" would make the watchdog report health from an error.

## The part that cost us three nights

The bug above is a fifteen-minute fix. The reason it survived three nights is a design problem, and it is the transferable half.

Look at the reporting step. Every path through it ends the same way:

```bash
if [ ! -f problems.md ]; then
  echo "::error::The watchdog exited non-zero but wrote no problems.md."
  echo "::error::That means it failed to RUN, not that it found a fault."
  exit 1
fi

if [ -n "$existing" ]; then
  gh issue comment "$existing" --body-file /tmp/comment.md
  exit 1
fi

gh issue create --title "Scheduled workflow stopped firing" --body-file /tmp/body.md
exit 1
```

Three outcomes — *filed a new finding*, *added to an existing finding*, *could not run at all* — collapsed into one signal. The run had to be red for the first two, because that is how a monitor gets your attention. So the third inherited the same colour, and the watchdog's own catastrophic failure was camouflaged by its success case.

We have written before about [a green that proves nothing](/blog/github-actions-pipefail-exit-code/) and about [alerts that could not fire at all](/blog/alerts-that-could-never-fire/), and about the inverse case, [a red that means "I found nothing"](/blog/a-red-that-proves-nothing/). This is a fourth shape and it is the meanest of them, because the signal is *not* useless — it is genuinely informative, one night in four. It just does not carry which thing it means.

**A monitor has three states, not two: ran and clean, ran and found something, did not run.** If two of those share a colour, the pair that shares it is the pair you will conflate — and you will conflate it in the direction of "working", because that is the reading that requires no action.

## The diagnostics were perfect and nobody read them

This is the detail that stings. Open the log of any of the three dead runs and the workflow tells you, in plain English, exactly what happened:

```
##[error]The watchdog exited non-zero but wrote no problems.md.
##[error]That means it failed to RUN, not that it found a fault.
##[error]Check the step above -- most likely the token cannot
##[error]read one of the repos, or the workflows API changed.
```

Whoever wrote that anticipated this precise failure and left a message that names the right layer and distinguishes the two cases the conclusion collapses. It was there all three nights. It went unread, because a red tick on a default branch that carries other standing reds is not a thing anyone clicks into.

**Diagnostics one level below the signal are not diagnostics.** They are an artifact you will find during the postmortem and feel bad about. If the message needs to be read, it has to travel through the same channel as the finding it disambiguates.

So that is what the fix does. The watchdog now files an issue about *itself* when it cannot run, under a deliberately different title, with a line stating what its own silence is now worth:

> While this issue is open, the absence of a "Scheduled workflow stopped firing" issue means nothing: the detector is down, not the crons proven up.

Both paths still exit non-zero — the workflow needs that — but the two conditions are now one glance apart in the issue list instead of one log dive apart.

## Twenty-six green tests, none of which touched the broken part

The watchdog had a test suite. Twenty-six tests, green throughout all three dead nights.

Every one of them exercised the comparator: given these crons and these last-run timestamps, which of them are overdue? That logic was never wrong. Not one test exercised *collection* — the loop that asks the API what workflows exist and fetches each one's file. Collection was the thin shell around `gh api` that the module's own docstring described as not the part worth testing.

There is a second, quieter version of the same mistake in there. The suite did check that collection found the expected number of workflows — but it asserted a **total** across both repos. Our first repo has enough workflows on its own to satisfy that total, so the count passed while the second repo was never reached. The fix asserts per repo, which is the assertion that would have failed.

Whenever you decide some part of a program is too thin to test, you have made a claim about where failure lives. Write it down as a claim, because it is one.

## The last twist, and it is still true as this publishes

`schedule:` triggers only ever run the copy of a workflow on the repository's **default branch**. Our fix is merged to the integration branch and has not been promoted. Tonight's scheduled run will crash again, in exactly the way described above, and there is no branch we could put the fix on that would change that.

Which means the fix cannot be proven by the mechanism it fixes. The only successful run in this watchdog's entire history is a `workflow_dispatch` we triggered by hand against the fix branch. That proves the code runs. It does not prove the schedule fires, and it does not prove the schedule fires *this* code.

Our own workflow header had already warned about this trap, from the last time it bit us:

> Do not read a green run here as proof that it works. The thing under test is whether an *unattended* `event=schedule` run appears at all; a `workflow_dispatch` proves only that the dispatch step is sound.

The query that answers it honestly filters on the event:

```bash
gh api "repos/OWNER/REPO/actions/workflows/NAME.yml/runs?per_page=100" --paginate \
  --jq '.workflow_runs[] | select(.event=="schedule") | .created_at' | head -1
```

Run that against the cron this whole story started with, and the gap is unmissable: daily `schedule` runs from 16 April to 21 June, then nothing until 31 August. Seventy-one days. During that window a hand-triggered dispatch went green — which is precisely why a green dispatch was never evidence.

One honest footnote while we are counting. The remedy we applied for that cron was to move it off the top of the hour, on the theory that GitHub's queue is shortest away from `:00`. Three scheduled runs since: 4h49m, 5h17m and 7h48m late. Three samples is not a refutation, but it is not the improvement we told ourselves we were buying either, and we would rather print that than quietly drop it.

## Four things to check in your own repositories

1. **List every workflow whose path is not under `.github/workflows/`.** If anything prints, every tool you have that reads workflow files by path is one API call from a crash.
2. **For each monitor you run, ask what a red means.** If "found a problem" and "could not run" share a conclusion, you own one signal doing two jobs, and it will fail in the direction that looks fine.
3. **Give the clean path something to emit.** A monitor that is only ever heard from when it has bad news is indistinguishable from one that has died — the useful assertion is on a heartbeat going stale, not on an alarm being absent.
4. **Ask when each scheduled workflow last ran on an `event=schedule`**, not when it last ran. Manual and dispatched runs will happily paper over a cron that has been dead for two months.

Then take the monitor you trust most and break it on purpose — not the system it watches, the monitor itself — and see whether anything looks different.

---

*Datanika is an open-source data platform that runs dlt extract-and-load and dbt-core transformations behind one UI, with scheduling, run history and a REST API. Every workflow quoted here lives in our public repositories, defects included. It is AGPL-3.0 and self-hostable — see [the architecture](/docs/architecture), or [browse the connectors](/connectors).*
