---
title: "Our Guard Checked That We Still Talked About the Fix, Not That We Still Did It"
description: "A CI assertion looked for the string UV_NO_SYNC=1 in our pre-push hook. It found it — in the eleven-line comment explaining why the flag was mandatory. Delete the flag from the actual command and the guard stays green. Then the same guard failed in the opposite direction on the same day."
date: 2026-09-17
publishedAt: 2026-09-17
author: "Datanika Team"
category: "engineering"
tags: ["ci", "testing", "bash", "github-actions", "engineering"]
---

A test asserted that a flag was present in a shell script. The flag was deleted. The test stayed green.

It stayed green because the flag's name also appeared in the comment above the command — eleven lines explaining why the flag was mandatory and what breaks without it. The assertion was a substring search. Prose satisfies a substring search exactly as well as code does.

We have written four posts now about [checks that report the wrong thing](/blog/a-red-that-proves-nothing/): [alerts structurally unable to fire](/blog/alerts-that-could-never-fire/), [an exit code swallowed by a pipe](/blog/github-actions-pipefail-exit-code/), [a red that meant "I crashed" and a red that meant "I found a problem"](/blog/watchdog-workflow-with-no-file/). This one is different in a way that took us a while to see. The others were checks pointed at the wrong thing. This one was pointed at exactly the right thing, and read the documentation instead of the implementation.

And on the same day, in the same file, the same guard failed in the opposite direction — going red against code that was correct. That pairing is the actual lesson, so both halves are here.

## The flag, and why deleting it is expensive

Our pre-push hook runs the test suite. One line of it looks like this:

```bash
UV_NO_SYNC=1 "$PY" -m pytest "$PYTEST_SCOPE" -x -q --tb=short
```

`UV_NO_SYNC=1` is not a tuning knob. On Windows, one of our migration tests shells out to `uv run alembic`, which tries to replace native extensions — SQLAlchemy's `cyextension`, `cryptography` — while the pytest process holding those files open is still running. Windows refuses the replacement. The removal half-completes. The virtualenv is left gutted.

The symptom is that your dependencies appear to have randomly vanished. It presents as environment flakiness, it sends you hunting for a cause that is not there, and the fix is a full reinstall. It cost one engineer four reinstalls before anyone understood it, and then it cost a second engineer four more.

So the flag matters, and a guard asserting it is still there is a reasonable thing to want.

## The assertion

```python
assert "UV_NO_SYNC=1" in hook_text
```

Here is the region of the hook it was searching:

```bash
echo "pre-push: pytest ($PYTEST_SCOPE) — $GATE_OUT"
# UV_NO_SYNC=1 is NOT optional on Windows. test_head_downgrade_upgrade_roundtrip shells
# out to `uv run alembic`, which tries to replace native extensions (sqlalchemy's
# cyextension, cryptography, ...) while this pytest process still holds the files open.
# Windows refuses, the removal half-completes, and the venv is left gutted — presenting
# as "my dependencies randomly vanished" and sending people hunting for a cause that
# isn't there.
#
# WORKFLOW_RULES §3 has documented this as mandatory since it cost QA, and then Growth
# four reinstalls — and the stated lesson was that a fix living only in prose gets
# rediscovered the expensive way. It was still only in prose: the hook never set it.
# Setting it here means nobody has to know.
UV_NO_SYNC=1 "$PY" -m pytest "$PYTEST_SCOPE" -x -q --tb=short
```

The string `UV_NO_SYNC=1` occurs twice: once on the first line of the comment, once on the command. Delete it from the command and the guard is still satisfied by the comment. The suite goes green, the push succeeds, and the next person on Windows loses an afternoon.

Read the last four lines of that comment again, because they are the part we cannot stop thinking about. They say that a fix living only in prose gets rediscovered the expensive way, and that this particular fix *was* still only in prose, and that writing it into the hook means nobody has to know.

**That paragraph — the one arguing that prose is not a safeguard — was the prose that satisfied the guard meant to prove the safeguard existed.** We did not plant that. It is just what happens when you assert on text: the most carefully written explanation of a thing is indistinguishable, to a substring search, from the thing.

## It was not a one-off

While we were fixing that one we went looking for the same shape elsewhere, and found it immediately in a different file, written by a different person, months apart.

A scheduled workflow runs a test selection with a `-k` deselection flag. A guard asserted the flag was present:

```python
assert '-k "not oracle"' in step
```

Same outcome. The `pytest` line had been stripped of `-k`, and the assertion stayed green, because the flag was *described* in the comment above it. Two of them, in fact — both green against a workflow that no longer did the thing.

The summary we wrote into our own rulebook is the shortest true statement of the problem: **the guard was checking that we still talk about the fix, not that we do it.**

Neither instance was caught by review. Both were caught by mutation — by deliberately breaking the thing the guard watches and checking that the guard noticed. A guard you have never seen go red is not evidence; it is a hypothesis with a green checkmark next to it.

## The same guard, failing the other way

Here is the half that stops this from being a simple "assert on code, not comments" post.

The first draft of the replacement guard also banned a shell construct. Our hook assigns some variables conditionally:

```bash
[ "$lsha" = "$HEAD_SHA" ] && PUSHING_HEAD=1
```

Under `set -e`, `[ cond ] && VAR=x` returns non-zero when the condition is false. There is a well-known hazard here: the script can abort at that line, silently skipping everything below it. So the guard banned the construct outright, by pattern match.

It went red. Against correct code.

The blanket ban is wrong, and we only learned exactly how wrong by running the cases on the actual shell rather than reasoning about them:

```
set -e; [ 1 = 2 ] && V=1; echo hi                    -> survives (rc 0)
set -e; while read ...; do [ x ] && V=1; done; more  -> survives (rc 0)
set -e; f(){ [ 1 = 2 ] && V=1; }; f                  -> ABORTS  (rc 1)
set -e; if true; then [ 1 = 2 ] && V=1; fi           -> ABORTS  (rc 1)
```

The construct is fatal **only when its non-zero status becomes the exit status of an enclosing scope** — the last command of the script, of a function body, or of a branch with nothing after it. It is harmless whenever any command follows at the same or an outer level.

The line the guard flagged sits inside a `while read` loop with the entire rest of the hook after it. It is correct. It must not be "fixed."

So within one file, on one day, a textual guard managed both failure modes: **blind where it should have been red, and red where it should have been silent.** They look nothing alike when you hit them. They have the same cause. Text is not behaviour, and a pattern match cannot see position, scope, or whether a line is even a line of code.

## What replaced both

For the presence checks, every needle became the **executable line**, never the prose that explains it:

```python
@pytest.mark.parametrize("needle, what", [
    ("skipping rebase and tests",              "refspec guard"),
    ("git rebase origin/dev --quiet",          "auto-rebase onto dev"),
    ("pre-push WARNING: branch/commit mismatch", "Closes/branch consistency"),
    ("-m ruff check datanika tests",           "ruff check"),
    ("-m ruff format --check datanika tests",  "ruff format --check"),
    ("pre-push NOTE: uv.lock has changed",     "stale-venv NOTE"),
    ('UV_NO_SYNC=1 "$PY" -m pytest',           "Windows venv-gutting guard"),
])
```

`UV_NO_SYNC=1 "$PY" -m pytest` is a string that cannot appear in an English sentence. That is the whole trick, and it costs nothing.

For the positional hazard, the pattern match was deleted and replaced by a test that **executes the real block**:

```python
def _run(self, block: str, env_line: str):
    script = f'set -e\n{env_line}\n{block}\necho "SCOPE=$PYTEST_SCOPE"\n'
    return subprocess.run([bash, "-c", script], capture_output=True, text=True)

def test_block_survives_set_e_when_condition_is_false(self, hook_text):
    r = self._run(self._block(hook_text), "export DATANIKA_PREPUSH_FULL=0")
    assert r.returncode == 0, "scope block exits non-zero; under set -e that aborts the hook"
```

It extracts the actual block out of the actual hook, runs it under `set -e`, and reads the exit status. It cannot be fooled by a comment, and it cannot be wrong about position, because it is not modelling the shell — it is asking the shell.

There is one more trap on the way out, and we wrote it down because we nearly walked into it. If you fix the comment problem by stripping comment lines before asserting, **keep a control that asserts the stripper still lets a real command through.** Otherwise the next person hits a false positive, narrows the stripper to make it go away, and ends up with a stripper that removes everything and a guard that matches nothing. Same green, new mechanism.

## Why any of this existed

Context, because it explains the stakes rather than excusing them.

We had just trimmed the pre-push hook. It used to run the whole suite — 5,261 tests, **1,105.95 seconds** on Windows. It now runs the deployment tests only — 432 tests, **79.89 seconds**. Measured on one commit, sequentially, uncontended. That is about seventeen minutes back on every single push.

Trimming a safety net makes what remains load-bearing. Six things in that hook cannot be replaced by CI — the refspec guard, the auto-rebase, the branch/commit consistency warning, two lint gates, the stale-lockfile note, and `UV_NO_SYNC`. The guard exists to make sure a future trim does not quietly take one of them with it. Which is exactly why a guard that could be satisfied by a comment was worse than no guard: it was a load-bearing check that had already stopped bearing load.

Every one of the thirteen mutations against the replacement has now been seen red, including an anti-vacuity case against a truncated hook — because a guard that passes against a file with nothing in it is measuring the parser, not the file.

One footnote, since we would rather print the negative results too. We also measured the same suite under WSL2 on ext4: 953.78s against 1,105.95s native. That is 1.16x, which is inside this machine's own run-to-run variance. We had been telling ourselves a filesystem migration was worth doing. On this evidence it is not, and we are not doing it.

## Four things to check in your own repositories

1. **Grep your assertions for bare identifiers.** Any `assert "SOME_FLAG" in text` where `SOME_FLAG` is also a word people write in comments is already satisfiable by prose. Make the needle a string that can only be a command.
2. **Delete the thing, then run the guard.** Not the test suite for the guard — the guard, against a mutated copy of the real artifact. If it stays green, you have learned something today. If your guard has never been observed red, it is not yet evidence.
3. **Ask whether your check models behaviour or matches text.** Anything positional — shell exit status, scope, ordering, control flow — cannot be checked by a regex, and the regex will be confidently wrong in both directions.
4. **Keep a false-positive control beside every filter.** The moment a guard strips, ignores, or excludes something, add a test that the guard still fires on a real defect. Narrowing a filter until the noise stops is how a working check becomes a decorative one.

The general form, and the reason we keep finding new instances: **a check is only as good as the difference between what it reads and what it claims to know.** A substring search reads text and claims to know about behaviour. Every gap like that gets closed eventually — by a mutation test, or by an afternoon someone spends reinstalling a virtualenv.

---

*Datanika is an open-source data platform that runs dlt extract-and-load and dbt-core transformations behind one UI, with scheduling, run history and a REST API. Every hook, guard and defect quoted here lives in our public repositories. It is AGPL-3.0 and self-hostable — see [the architecture](/docs/architecture), or [browse the connectors](/connectors).*
