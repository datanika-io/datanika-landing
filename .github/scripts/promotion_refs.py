#!/usr/bin/env python3
"""Populate a promotion PR body with the `Closes #N` refs of the commits it promotes.

GitHub fires closing keywords only for PRs merged into the DEFAULT branch. Feature PRs
here merge into `dev`, so their own `Closes #N` never fires; the issue is closed only if
the promotion PR (dev -> main) carries the reference. WORKFLOW_RULES §8 makes that a
manual enumeration step, which is why issues leak.

References are gathered from two places, because neither alone is reliable:
  1. the commit messages being promoted -- our convention puts `(closes #N)` there, but
     not every commit follows it;
  2. the pull requests those commits came from -- the PR title/body almost always has it,
     and survives a rebase-merge that rewrote the commit message.

Idempotent: rewrites a single marked block, so repeated runs (synchronize events) never
duplicate. Never closes anything itself -- merging the promotion PR does that.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys

START = "<!-- promotion-refs:start -->"
END = "<!-- promotion-refs:end -->"

# `closes/fixes/resolves #12`, plus the participle forms GitHub also accepts.
KEYWORD = re.compile(
    r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b",
    re.IGNORECASE,
)

# Prose that *talks about* closing keywords is not a closing reference. The first live
# run of this script harvested `(closes #142)` and `Closes #415.` out of its own PR body,
# where they were regex examples in backticks -- issues that were not being promoted at
# all. This is not cosmetic: GitHub parses the raw body, so a bogus `Closes #N` on a
# promotion PR really does close that issue on merge. Strip the constructs people use to
# quote or illustrate, and keep only declarations.
FENCED = re.compile(r"```.*?```|~~~.*?~~~", re.DOTALL)
INLINE_CODE = re.compile(r"`[^`]*`")
QUOTED_LINE = re.compile(r"^\s*>.*$", re.MULTILINE)


# A *declaration* starts its line (optionally as a list item). Prose embeds the keyword
# mid-sentence: "The first run harvested (closes #142) and closes #19 from its own body."
# Stripping code spans alone was not enough -- the same false positives came back through
# commit-message prose, which has no backticks to strip. Anchoring to line-start closes
# the whole class instead of one door at a time.
DECLARATION = re.compile(
    r"^\s*(?:[-*]\s*)?(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b",
    re.IGNORECASE | re.MULTILINE,
)

# -----------------------------------------------------------------------------------
# landing#455 -- the NON-closing half.
#
# For five promotions this script reported `success` while deriving nothing, because it
# matches only closing keywords and every commit here writes `refs #N`. That is not a
# convention to correct: WORKFLOW_RULES §4 records landing#273, where `closes #272` on a
# 4-of-36 partial fix retired the whole issue and 31 guides stopped existing as tracked
# work. Departments write `refs` *because they were told to*.
#
# So the answer is not to widen the closing regex -- that reintroduces #273 exactly. It is
# to derive the `refs` set as well and print it **without a keyword**, as candidates the
# promoter reviews. Both rules survive: the derivation is mechanical (which is what §8
# automated) and the closure stays a judgement (which is what §4 protects).
#
# ⚠️ A bare `#N` in a PR body does NOT close anything -- only keyword+`#N` does. That is
# what makes the candidate list safe to render, and it is the same reason the
# already-closed branch below renders `- #N —` rather than a struck-through keyword.
#
# `see` is deliberately absent: it marks background reading, not authorship.
TRACKING = re.compile(
    r"\b(?:refs?|part\s+of|towards?|addresses|implements)\s*:?\s+#(\d+)\b",
    re.IGNORECASE,
)

TRACKING_DECLARATION = re.compile(
    r"^\s*(?:[-*]\s*)?(?:refs?|part\s+of|towards?|addresses|implements)\s*:?\s+#(\d+)\b",
    re.IGNORECASE | re.MULTILINE,
)


def strip_non_declarative(text: str) -> str:
    """Remove code blocks, inline code and block quotes before scanning for keywords."""
    text = FENCED.sub(" ", text)
    text = INLINE_CODE.sub(" ", text)
    text = QUOTED_LINE.sub(" ", text)
    return text


def find_refs(subject: str, body: str) -> set[int]:
    """Closing refs from a subject/title (a declaration by convention) and a body.

    The subject is scanned whole -- our convention is `[Dept] Title (closes #N)`. The body
    is scanned only for line-initial declarations, after code and quotes are stripped, so
    a paragraph *about* closing keywords is not mistaken for one.
    """
    found = {int(n) for n in KEYWORD.findall(subject or "")}
    found |= {int(n) for n in DECLARATION.findall(strip_non_declarative(body or ""))}
    return found


def find_tracking_refs(subject: str, body: str) -> set[int]:
    """Non-closing references (`refs`/`part of`/`towards`/…) -- candidates, not closures.

    Same subject/body asymmetry as `find_refs`, and for the same measured reason: the
    subject is short and deliberate so it is scanned whole, while a body is prose and is
    scanned only for line-initial declarations after code and quotes are stripped. Reusing
    that shape rather than inventing a second one means the false-positive class this
    script already closed stays closed on the new path too.
    """
    found = {int(n) for n in TRACKING.findall(subject or "")}
    found |= {int(n) for n in TRACKING_DECLARATION.findall(strip_non_declarative(body or ""))}
    return found


def run(*args: str) -> str:
    # `encoding="utf-8"` is not cosmetic. Without it `text=True` decodes with the platform
    # locale codec, which on a Windows dev box is cp1251: every em dash in an issue title
    # comes back as `вЂ”`. On the ubuntu runner it happens to be right, so the defect is
    # invisible in CI and appears only in the local rehearsal path below -- i.e. exactly
    # where someone is checking the block before a promotion. `reconcile_shipped_issues.py`
    # already passes it; this file did not.
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8")
    if result.returncode != 0:
        print(f"  ! command failed: {' '.join(args)}\n    {result.stderr.strip()[:300]}")
        return ""
    return result.stdout


def introduced_the_commit(pull: dict) -> bool:
    """Did this PR actually bring the commit in, or does its branch merely contain it?

    `GET /repos/{repo}/commits/{sha}/pulls` returns **every** pull whose branch contains
    the commit -- not just the one that introduced it. Any open feature branch cut from
    `dev` therefore comes back for every commit already on `dev`, and without this filter
    it donates its closing keywords to the promotion.

    That is datanika-core#635, caught on core's promotion PR #634 before merge: the block
    claimed `Closes #608 ... via #633` while #633 was still open and one commit ahead of
    `dev`. It was fixed in core#636 and **this repo was never patched** (landing#315), so
    the buggy version ran on all 7 of landing's generated blocks. Audited 2026-08-30
    across both repos -- 29 promotions, 83 issue references, one real false closure
    (core#425, closed by core's promotion #469 crediting #467, which merged 12 minutes
    later). Landing's own 7 were clean, but by luck: the bug only fires when an open
    branch carries a closing keyword at promotion time, and landing's usual pattern is
    Growth-merges-then-Infra-promotes with zero open PRs.

    Direction is why this is worth fixing on a clean record. The automation replaced
    hand-enumeration, which failed **open**; this bug makes it fail **closed**, which is
    worse -- an open issue gets re-triaged by whoever reads the board next, a wrongly
    closed one does not.

    Two independent reasons to skip, and neither subsumes the other:
      * not merged -> the branch merely contains the commit
      * base main  -> a previous promotion PR, which IS merged

    ⚠️ `"main"`, not `"master"`. Core's copy of this function filters on `master` because
    that is core's default branch. Porting it verbatim would make this repo skip nothing
    and re-list every earlier promotion PR's references.
    """
    if pull.get("merged_at") is None:
        return False
    return pull.get("base", {}).get("ref") != "main"


def gh_api(path: str) -> object:
    out = run("gh", "api", path)
    if not out.strip():
        return None
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return None


def main() -> int:
    repo = os.environ["REPO"]
    pr_number = os.environ["PR_NUMBER"]
    base_sha = os.environ["BASE_SHA"]
    head_sha = os.environ["HEAD_SHA"]

    # Commits being promoted. base..head is exactly "on dev, not yet on main".
    log = run("git", "log", "--format=%H%x1f%B%x1e", f"{base_sha}..{head_sha}")
    commits = [c for c in log.split("\x1e") if c.strip()]
    print(f"  commits being promoted: {len(commits)}")

    refs: dict[int, set[str]] = {}
    tracking: dict[int, set[str]] = {}
    shas = []
    for entry in commits:
        sha, _, message = entry.strip().partition("\x1f")
        shas.append(sha)
        subject, _, msg_body = message.strip().partition("\n")
        for num in find_refs(subject, msg_body):
            refs.setdefault(num, set()).add(f"commit {sha[:7]}")
        for num in find_tracking_refs(subject, msg_body):
            tracking.setdefault(num, set()).add(f"commit {sha[:7]}")

    # Also consult the source PRs: a rebase-merge can leave the keyword only on the PR.
    for sha in shas:
        pulls = gh_api(f"repos/{repo}/commits/{sha}/pulls")
        if not isinstance(pulls, list):
            continue
        for pull in pulls:
            if not introduced_the_commit(pull):
                continue
            for num in find_refs(pull.get("title", ""), pull.get("body") or ""):
                refs.setdefault(num, set()).add(f"#{pull['number']}")
            for num in find_tracking_refs(pull.get("title", ""), pull.get("body") or ""):
                tracking.setdefault(num, set()).add(f"#{pull['number']}")

    # An issue that some commit genuinely closes is not also a candidate.
    for num in refs:
        tracking.pop(num, None)

    print(f"  closing references: {len(refs)}; tracking references: {len(tracking)}")

    # -------------------------------------------------------------------------------
    # landing#455 -- this check exists so the workflow can go RED.
    #
    # Reporting `success` on every run *was* the defect: five consecutive promotions
    # derived nothing, wrote an empty block, and exited 0, which is indistinguishable
    # from a promotion that genuinely closes nothing. Nothing was ever red, so nobody
    # looked, and the issues stayed open for weeks.
    #
    # Every commit in this project carries a `[Dept]` tag and, by convention, an issue
    # reference. Three or more commits yielding NO reference of any kind is a convention
    # breakdown or a broken parser, not a normal promotion -- and either way the promoter
    # should be told before merging rather than after.
    #
    # The threshold is deliberately conservative: a one- or two-commit hotfix promotion
    # with no issue is legitimate and must not go red.
    if not refs and not tracking:
        if len(commits) >= 3:
            print(
                f"::error::{len(commits)} commits promoted and NOT ONE issue reference was "
                "derived. Either the commit convention has drifted or this parser is broken. "
                "Refusing to report success on an empty derivation (landing#455)."
            )
            return 1
        print("  no references found in a short promotion; leaving the body unchanged")
        return 0

    # Don't re-list issues that are already closed -- keeps the block honest about what
    # this promotion actually closes.
    lines = []
    for num in sorted(refs):
        issue = gh_api(f"repos/{repo}/issues/{num}")
        if not isinstance(issue, dict) or "number" not in issue:
            continue
        if issue.get("pull_request"):
            continue  # a PR, not an issue
        state = issue.get("state")
        title = (issue.get("title") or "").strip()
        via = ", ".join(sorted(refs[num]))
        if state == "closed":
            # Deliberately NOT the "Closes" keyword. Strikethrough is cosmetic -- GitHub
            # parses the raw text, so `~~Closes #N~~` still fires. An already-closed
            # issue needs no keyword, and omitting it means a stale or false-positive
            # reference cannot act on an issue this promotion does not own.
            lines.append(f"- #{num} — {title} _(already closed)_ · via {via}")
        else:
            lines.append(f"- Closes #{num} — {title} · via {via}")

    # The candidate half. NO closing keyword on any of these lines, by design: a bare
    # `#N` in a PR body closes nothing, which is exactly the property that lets this list
    # be generated mechanically without re-creating landing#273.
    candidate_lines = []
    for num in sorted(tracking):
        issue = gh_api(f"repos/{repo}/issues/{num}")
        if not isinstance(issue, dict) or "number" not in issue:
            continue
        if issue.get("pull_request"):
            continue
        if issue.get("state") == "closed":
            continue  # already reconciled; saying so again is noise
        title = (issue.get("title") or "").strip()
        via = ", ".join(sorted(tracking[num]))
        candidate_lines.append(f"- #{num} — {title} · via {via}")

    if not lines and not candidate_lines:
        print("  references found, but none resolve to open issues; body unchanged")
        return 0

    sections = [START, ""]
    if lines:
        sections += [
            "### Issues closed by this promotion",
            "",
            "_Generated from the commits being promoted. Feature PRs merge into `dev`, "
            "which is not the default branch, so their own closing keywords never fire — "
            "these references are what actually closes the issues on merge._",
            "",
            *lines,
            "",
        ]
    if candidate_lines:
        sections += [
            "### Promoted, close by hand if complete",
            "",
            "_These commits reference the issues below with `refs` / `part of` / "
            "`towards`, which closes nothing **on purpose**: `WORKFLOW_RULES` §4 records "
            "landing#273, where `closes #272` on a 4-of-36 partial fix retired the whole "
            "issue. So the list is derived mechanically and the closure stays a "
            "judgement — review each and close the ones whose acceptance criteria are "
            "fully met._",
            "",
            *candidate_lines,
            "",
            "_After the deploy goes green, `post-promotion-reconcile.yml` labels whatever "
            "is still open here `shipped-to-prod`. Standing queue, any time: "
            "`gh issue list --state open --label shipped-to-prod`._",
            "",
        ]
    sections.append(END)
    block = "\n".join(sections)

    # Rehearsal path. The promoter can see the exact block a promotion would generate
    # BEFORE opening the PR -- which is the only way to notice an empty derivation at a
    # moment when it is still cheap to do something about it. Writes nothing.
    #
    #   REPO=datanika-io/datanika-landing PR_NUMBER=0 \
    #   BASE_SHA=origin/main HEAD_SHA=origin/dev DRY_RUN=1 \
    #     python .github/scripts/promotion_refs.py
    if os.environ.get("DRY_RUN", "").lower() in ("1", "true", "yes"):
        print("  DRY RUN — the block that would be written:\n")
        print(block)
        return 0

    current = run("gh", "pr", "view", pr_number, "--repo", repo, "--json", "body", "-q", ".body") or ""
    if START in current and END in current:
        body = re.sub(
            re.escape(START) + r".*?" + re.escape(END), block, current, flags=re.DOTALL
        )
    else:
        body = (current.rstrip() + "\n\n" + block).lstrip()

    if body.strip() == current.strip():
        print("  body already up to date")
        return 0

    path = "/tmp/promotion-body.md"
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(body)
    run("gh", "pr", "edit", pr_number, "--repo", repo, "--body-file", path)
    print(f"  wrote {len(lines)} closing + {len(candidate_lines)} candidate reference(s):")
    for line in lines + candidate_lines:
        print(f"    {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
