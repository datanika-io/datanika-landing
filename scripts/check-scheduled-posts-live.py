#!/usr/bin/env python3
"""Is every post that should be published actually reachable — and is every post that
should not be, still hidden?

landing#527. That issue pinned the *frontmatter* of every future-dated post, which stops a
typo'd `publishedAt`. It cannot close the gap underneath it, and said so: **it does not know
whether a build ever happened.**

## The gap, stated exactly

A scheduled post is *supposed* to 404 before its date. So on the morning of its publish date,
these two are indistinguishable to every check we have:

  * the daily rebuild has not run yet  — correct, and it will publish in a few hours
  * the daily rebuild is broken        — the post never publishes, and nothing says so

Measured 2026-09-09: the 09-09 post read 404 at 06:04Z and 200 after the rebuild ran at
12:20Z. Both readings were correct. **The discriminator is the clock against the cron
window, not the 404** — and nobody is watching the clock at 06:04Z except by accident.

This job is that discriminator, automated: it runs *after* the rebuild window, so a 404 on a
due post is unambiguous.

## What it asserts, in both directions

The predicate is taken from `src/utils/blog-visibility.ts` rather than reinvented — a second
model of the rule would agree with the first exactly where the first is wrong:

    draft === true            -> hidden
    publishedAt > now         -> hidden
    otherwise                 -> visible

  * every **visible** post must return 200 — catches a rebuild that did not happen, a deploy
    that failed, and a post silently excluded by a filter change
  * every **hidden** post must return 404 — the reverse direction, which catches an
    early-publish regression. That half is *equally invisible* today: a post that appears a
    week early looks exactly like one that was meant to

## 🚨 What it cannot tell you

A 404 here means *not reachable*. It does **not** say why — a rebuild that did not fire, a
deploy that failed, and a post deleted from `main` all produce the same reading. The filed
issue names the three and the order to check them. Do not let this job's title be read as
"the cron is broken"; that is one of three candidates.

Nor does it prove freshness: a post that has been live for a month also returns 200. This
guards *publication*, not *content*.

Exit 0 = agree · 1 = a post is in the wrong state · 2 = could not compare (deliberately not
the same as agreement).
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

UA = "datanika-scheduled-post-liveness/1.0 (+https://datanika.io)"


def frontmatter(text: str) -> dict[str, str]:
    m = re.match(r"^---\r?\n([\s\S]*?)\r?\n---", text)
    if not m:
        return {}
    out: dict[str, str] = {}
    for line in m.group(1).split("\n"):
        f = re.match(r"^(\w+):\s*(.+?)\s*$", line)
        if f:
            out[f.group(1)] = f.group(2).strip().strip("\"'")
    return out


def is_visible(fm: dict[str, str], now: dt.date) -> bool:
    """Mirror of `isPostVisible` in src/utils/blog-visibility.ts."""
    if fm.get("draft") == "true":
        return False
    pub = fm.get("publishedAt")
    if pub:
        try:
            if dt.date.fromisoformat(pub) > now:
                return False
        except ValueError:
            # An unparseable date is not a licence to guess. #527 pins the format;
            # if it ever changes, this must stop rather than assume visible.
            raise SystemExit(f"FAIL: unparseable publishedAt {pub!r}")
    return True


def status(url: str, timeout: int = 30) -> int:
    req = urllib.request.Request(url, headers={"User-Agent": UA}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0  # network-level failure; treated as "could not compare", not as 404


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--blog-dir", default="src/content/blog")
    ap.add_argument("--base", default="https://datanika.io")
    ap.add_argument("--today", default=None, help="override for testing (YYYY-MM-DD)")
    args = ap.parse_args()

    # `utcnow()` is deprecated and emits a warning into the job log; a warning in a
    # cron's output is noise that trains a reader to skim the part that matters.
    today = (
        dt.date.fromisoformat(args.today)
        if args.today
        else dt.datetime.now(dt.timezone.utc).date()
    )
    files = sorted(Path(args.blog_dir).glob("*.md"))
    if len(files) < 20:
        print(f"FAIL: only {len(files)} posts found in {args.blog_dir} — walking nothing")
        return 2

    should_live: list[str] = []
    should_hide: list[str] = []
    for f in files:
        fm = frontmatter(f.read_text(encoding="utf-8"))
        (should_live if is_visible(fm, today) else should_hide).append(f.stem)

    # Anti-vacuity on the half that matters. An empty visible set would make the
    # loop below assert nothing and exit clean.
    if len(should_live) < 10:
        print(f"FAIL: only {len(should_live)} posts resolve as visible — refusing to compare")
        return 2

    print(f"today={today}  visible={len(should_live)}  hidden={len(should_hide)}")

    problems: list[str] = []
    unreachable = 0
    for slug in should_live:
        code = status(f"{args.base}/blog/{slug}/")
        if code == 0:
            unreachable += 1
        elif code != 200:
            problems.append(f"  MISSING  /blog/{slug}/ -> {code} (publishedAt has passed)")
    for slug in should_hide:
        code = status(f"{args.base}/blog/{slug}/")
        if code == 0:
            unreachable += 1
        elif code == 200:
            problems.append(f"  EARLY    /blog/{slug}/ -> 200 (publishedAt is in the future)")

    # A network failure is not a finding. Reporting one as a missing page would make this
    # job cry wolf, and a job that cries wolf is deleted rather than fixed.
    if unreachable:
        print(f"FAIL: {unreachable} request(s) failed at the network level — cannot compare")
        return 2

    if problems:
        print("\nWRONG STATE:")
        print("\n".join(problems))
        return 1

    print("\nAGREE — every due post is reachable and every future post is not.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
