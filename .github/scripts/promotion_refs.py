#!/usr/bin/env python3
"""Populate a promotion PR body with the `Closes #N` refs of the commits it promotes.

GitHub fires closing keywords only for PRs merged into the DEFAULT branch. Feature PRs
here merge into `dev`, so their own `Closes #N` never fires; the issue is closed only if
the promotion PR (dev -> main) carries the reference. WORKFLOW_RULES §8 makes that a
manual enumeration step, which is why issues leak.

References come in kinds, and conflating them is what this script kept getting wrong:

  * **closing** (`closes`/`fixes`/`resolves` #N) -- the department that owns the issue is
    declaring that this change fully delivers it. Rendered with the keyword.
  * **tracking** (`refs`/`part of`/`towards` #N) -- touches it, does not finish it.
    Rendered WITHOUT a keyword, as a candidate the promoter reviews (landing#455).
  * **cross-repo** (`refs core#1040`) -- real, and not closable from here.
  * **unresolvable** (`refs #676` in a repo whose highest issue is #49x) -- a reference
    that points at nothing. New here, and see below.

🚨 **The promoter must never guess which is which.** The keyword is the owning
department's declaration and this script only reports it. What it must NOT do is stay
silent about a commit it could not classify -- an absent line and a correct derivation
look identical. So every promoted commit is now accounted for in the body, and the ones
nobody declared anything about are named.

⚠️ **This file was 142 lines behind core's for a week and the divergence was invisible**
(landing#493). Both repos run `promotion-pr-refs.yml`, both are 50 lines, both delegate to
`.github/scripts/promotion_refs.py` -- so *"landing has the same workflow"* was true and
misleading. core#1040's fix shipped to `datanika-core` only, and landing PR #492 then
promoted 9 commits while its generated block spoke for 3, dropping

    36048435 [Product] Spec: the sub-processor register a 30-day notice has to come from
             (refs #676)

with no signal at all. **`landing#676` does not exist** -- the highest issue in this repo
is in the 490s -- so that is the *unresolvable* case, and it is the one core does NOT
handle either: core harvests the number, fails to resolve it, drops it from the candidate
list, and still counts the commit as accounted. Strictly better than vanishing, and still
a commit that appears nowhere while the coverage line says otherwise. Filed back at core.

Both plausible behaviours for an unresolvable reference are wrong in opposite directions:
rendering `#676` invites someone to close an issue in the wrong repo, and dropping it
silently is what already happened. So it gets its own bucket, naming the commit and the
number and closing nothing -- a typo becomes a visible line instead of an absence, and
absence is the thing this whole mechanism exists to remove.

⚠️ A 404 and a failed API call must not be conflated here. Only a genuine *Not Found*
makes a reference unresolvable; a transient error leaves the commit unaccounted, which is
the honest state and is itself reported. Failing toward visibility, never toward a
confident wrong line.

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

# A reference to another repository's tracker: `refs core#1040`, `closes cloud#163`.
# Real work, and **not closable from this promotion**.
#
# The point of matching these is NOT to act on them. It is that `refs core#1040` used to
# match nothing at all: the closing and tracking patterns both require whitespace before
# `#`, so a repo-qualified reference fell through both and the commit vanished from the
# body. A commit whose only reference points elsewhere is a commit we understood; a
# commit we dropped silently is not. (core#1040, ported here as landing#493.)
#
# 🚨 A KEYWORD is required here, exactly as it is for same-repo references. Core found
# this by rehearsing against a real promotion: an unqualified `([A-Za-z][\w.-]*)#(\d+)`
# harvested issue numbers out of a commit body that merely CITED them as already-shipped
# background, and reported the batch fully accounted. A bare mention is not a
# declaration -- that asymmetry is the entire basis of this script, and dropping it for
# the cross-repo case buys a flattering coverage number and nothing else.
CROSS_REPO = re.compile(
    r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?|part\s+of|towards?|addresses"
    r"|implements)\s*:?\s+([A-Za-z][\w.-]*)#(\d+)\b",
    re.IGNORECASE,
)


def repo_aliases(repo: str) -> set[str]:
    """The spellings that mean *this* repository, lower-cased.

    `datanika-io/datanika-landing` -> {"datanika-landing", "landing"}. Our prose writes
    `landing#N` and `core#N` constantly, and without this every such mention is rendered
    under "referenced in another repository" -- which is both wrong and the kind of
    confident wrong line that gets believed.
    """
    name = repo.split("/")[-1].lower()
    return {name, name.rsplit("-", 1)[-1]}


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


def find_cross_repo_refs(subject: str, body: str, mine: set[str]) -> set[str]:
    """Keyword-qualified `core#1040`-style references, as `repo#number` strings.

    Deliberately NOT parsed into a number: these are not addressable in this repo and must
    never reach the closing or candidate lists. They exist so the coverage check can say
    *"this commit referenced something, elsewhere"* rather than *"this commit referenced
    nothing"* -- two different states that looked identical before core#1040.

    `mine` are the spellings that mean this repo; a self-qualified `landing#N` is dropped
    here and handled by the same-repo patterns (or, if it was a bare mention, by not being
    a reference at all).
    """
    out = set()
    for blob in (subject or "", strip_non_declarative(body or "")):
        for owner, num in CROSS_REPO.findall(blob):
            if owner.lower() in mine:
                continue
            out.add(f"{owner}#{num}")
    return out


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


def gh_issue(repo: str, num: int) -> tuple[str, dict | None]:
    """Fetch one issue, distinguishing *does not exist* from *could not ask*.

    Returns `("ok", issue)`, `("missing", None)` or `("error", None)`.

    🚨 This distinction is the whole safety property of the unresolvable bucket.
    `gh api` exits non-zero for a 404 **and** for a rate limit, a network blip, an
    expired token and a DNS failure. Collapsing them means a transient error renders as
    *"this commit references an issue that does not exist"* — a confident, wrong,
    permanent-looking line in a promotion body, about a commit whose reference is fine.

    So only a literal `Not Found` / `HTTP 404` on stderr yields `missing`. Anything else
    is `error`, and an `error` deliberately leaves the commit **unaccounted** — where it
    surfaces under *"No issue reference derived"* instead. That is the honest state: we
    could not tell. Failing toward visibility, never toward a confident wrong line.

    ⚠️ A pull request is `missing` for our purposes, not `ok`. `repos/{r}/issues/{n}`
    happily returns a PR — GitHub numbers them in one sequence — and a promotion body
    must not list a PR as an issue to close.
    """
    result = subprocess.run(
        ("gh", "api", f"repos/{repo}/issues/{num}"),
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode == 0:
        try:
            data = json.loads(result.stdout)
        except json.JSONDecodeError:
            return ("error", None)
        if not isinstance(data, dict) or "number" not in data:
            return ("error", None)
        if data.get("pull_request"):
            return ("missing", None)
        return ("ok", data)
    stderr = (result.stderr or "").lower()
    if "not found" in stderr or "http 404" in stderr:
        return ("missing", None)
    print(f"  ! could not resolve #{num}: {result.stderr.strip()[:200]}")
    return ("error", None)


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
    # sha -> what we derived from it, and the commit subject for the report. A sha whose
    # set stays empty is one this script could not classify, and landing#493 is that it
    # used to disappear rather than say so.
    accounted: dict[str, set[str]] = {}
    subjects: dict[str, str] = {}
    # issue number -> the shas that referenced it, so an unresolvable number can name the
    # commit that wrote it. Without this the promoter sees `#676` and no way to find it.
    cited_by: dict[int, set[str]] = {}
    mine = repo_aliases(repo)
    shas = []
    for entry in commits:
        sha, _, message = entry.strip().partition("\x1f")
        shas.append(sha)
        subject, _, msg_body = message.strip().partition("\n")
        subjects[sha] = subject.strip()
        accounted.setdefault(sha, set())
        for num in find_refs(subject, msg_body):
            refs.setdefault(num, set()).add(f"commit {sha[:7]}")
            accounted[sha].add(f"closes #{num}")
            cited_by.setdefault(num, set()).add(sha)
        for num in find_tracking_refs(subject, msg_body):
            tracking.setdefault(num, set()).add(f"commit {sha[:7]}")
            accounted[sha].add(f"refs #{num}")
            cited_by.setdefault(num, set()).add(sha)
        for ref in find_cross_repo_refs(subject, msg_body, mine):
            accounted[sha].add(ref)

    # Also consult the source PRs: a rebase-merge can leave the keyword only on the PR.
    for sha in shas:
        pulls = gh_api(f"repos/{repo}/commits/{sha}/pulls")
        if not isinstance(pulls, list):
            continue
        for pull in pulls:
            if not introduced_the_commit(pull):
                continue
            title, body_text = pull.get("title", ""), pull.get("body") or ""
            for num in find_refs(title, body_text):
                refs.setdefault(num, set()).add(f"#{pull['number']}")
                accounted[sha].add(f"closes #{num}")
                cited_by.setdefault(num, set()).add(sha)
            for num in find_tracking_refs(title, body_text):
                tracking.setdefault(num, set()).add(f"#{pull['number']}")
                accounted[sha].add(f"refs #{num}")
                cited_by.setdefault(num, set()).add(sha)
            for ref in find_cross_repo_refs(title, body_text, mine):
                accounted[sha].add(ref)

    # An issue that some commit genuinely closes is not also a candidate.
    for num in refs:
        tracking.pop(num, None)

    def _is_cross_repo(label: str) -> bool:
        """`core#1040` yes; the `closes #12` / `refs #34` labels this repo owns, no."""
        return "#" in label and not label.startswith(("closes ", "refs "))

    elsewhere = sorted({r for s in shas for r in accounted.get(s, set()) if _is_cross_repo(r)})

    print(
        f"  closing: {len(refs)}  tracking: {len(tracking)}  "
        f"cross-repo: {len(elsewhere)}"
    )

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
    # with no issue is legitimate and must not go red. A *partially* unaccounted batch is
    # not red either -- it is REPORTED, in the body, which is landing#493's whole point:
    # the promoter needs to see it, not to be blocked by it.
    #
    # 🚨 `elsewhere` belongs in this condition, and leaving it out would be a FALSE RED.
    # A batch whose commits all carry `refs core#1040` derives no same-repo reference of
    # either kind, so without this three such commits fail the job saying not one
    # reference was derived -- while every one of them referenced something. A job that
    # goes red when nothing is wrong teaches people to merge past it, which costs more
    # than the check earns.
    if not refs and not tracking and not elsewhere:
        if len(commits) >= 3:
            print(
                f"::error::{len(commits)} commits promoted and NOT ONE issue reference was "
                "derived. Either the commit convention has drifted or this parser is broken. "
                "Refusing to report success on an empty derivation (landing#455)."
            )
            return 1
        print("  no references found in a short promotion; leaving the body unchanged")
        return 0

    # A reference that resolves to nothing in this repo. Collected across both loops
    # below so it is reported once, whichever kind of keyword wrote it.
    unresolvable: dict[int, set[str]] = {}

    def _unresolve(num: int) -> None:
        """Record #num as pointing at nothing here, and un-account the commits citing it.

        Un-accounting is the load-bearing half. Without it a commit whose ONLY reference
        is `refs #676` counts toward the coverage line while appearing in no section —
        which is precisely landing#493 restated, and is what core's version still does.
        A commit that also carries a real reference keeps it and stays accounted.
        """
        for sha in cited_by.get(num, set()):
            accounted.get(sha, set()).discard(f"refs #{num}")
            accounted.get(sha, set()).discard(f"closes #{num}")
        unresolvable.setdefault(num, set()).update(cited_by.get(num, set()))

    # Don't re-list issues that are already closed -- keeps the block honest about what
    # this promotion actually closes.
    lines = []
    for num in sorted(refs):
        status, issue = gh_issue(repo, num)
        if status == "missing":
            _unresolve(num)
            continue
        if status != "ok" or issue is None:
            continue
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
    suppressed_closed = 0
    for num in sorted(tracking):
        status, issue = gh_issue(repo, num)
        if status == "missing":
            _unresolve(num)
            continue
        if status != "ok" or issue is None:
            continue
        if issue.get("state") == "closed":
            # Already reconciled; re-listing it is noise. But it DID account for a
            # commit, so it is counted -- otherwise the coverage number below has no
            # visible explanation and reads like an arithmetic error.
            suppressed_closed += 1
            continue
        title = (issue.get("title") or "").strip()
        via = ", ".join(sorted(tracking[num]))
        candidate_lines.append(f"- #{num} — {title} · via {via}")

    # Computed AFTER the two loops above, because `_unresolve` un-accounts commits whose
    # only reference turned out to point at nothing. Ordering it earlier would report the
    # pre-resolution view and reintroduce the defect this section exists to remove.
    unaccounted = [s for s in shas if not accounted.get(s)]

    # The "referenced something that does not exist here" bucket (landing#493).
    unresolvable_lines = []
    for num in sorted(unresolvable):
        who = ", ".join(f"`{s[:7]}`" for s in sorted(unresolvable[num]))
        subject_hint = "; ".join(
            subjects.get(s, "") for s in sorted(unresolvable[num]) if subjects.get(s)
        )
        unresolvable_lines.append(f"- `#{num}` — cited by {who} — {subject_hint}")

    # The "I could not tell" half. Two distinct states, kept distinct: a commit that
    # referenced ANOTHER repo's tracker, and a commit that referenced nothing at all.
    # Both used to vanish; only one of them is a convention lapse.
    unaccounted_lines = [f"- `{sha[:7]}` — {subjects.get(sha, '')}" for sha in unaccounted]

    if (
        not lines
        and not candidate_lines
        and not unresolvable_lines
        and not unaccounted_lines
        and not elsewhere
    ):
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
    if elsewhere:
        sections += [
            "### Referenced in another repository — not closable from here",
            "",
            "_A `datanika-core` or `datanika-cloud` issue is closed by that repo's own "
            "deploy, not by this merge. Listed so the commit is accounted for._",
            "",
            *[f"- `{r}`" for r in elsewhere],
            "",
        ]
    if unresolvable_lines:
        sections += [
            "### 🚨 Referenced an issue that does not exist in this repository",
            "",
            "_These numbers resolve to nothing here. **Nothing is closed and nothing "
            "should be** — almost certainly a cross-repo reference missing its `core#` / "
            "`cloud#` prefix, which `WORKFLOW_RULES` §4 requires. Do not close the "
            "same-numbered issue in another repo on the strength of this line; go and "
            "read the commit. This bucket exists because the alternative was silence: "
            "landing PR #492 promoted 9 commits, spoke for 3, and dropped a commit "
            "carrying `refs #676` with no signal at all (landing#493)._",
            "",
            *unresolvable_lines,
            "",
        ]
    if unaccounted_lines:
        sections += [
            "### ⚠️ No issue reference derived — I could not tell",
            "",
            "_These commits carry no closing, tracking or cross-repo reference this "
            "generator can parse, so **nothing above speaks for them**. That may be "
            "correct (a comment-only or tooling commit), or it may be a missed reference. "
            "It is stated rather than omitted because an absent line and a correct "
            "derivation used to look identical (landing#493). A commit also lands here "
            "when its only reference could not be checked — a rate limit or a network "
            "failure, which is reported as an unknown rather than asserted as a typo._",
            "",
            "_A commit listed in the section above appears here too when that reference "
            "was its **only** one. That is not duplication: the first line says what it "
            "cited, this one says nothing speaks for it, and the coverage figure counts "
            "the second._",
            "",
            *unaccounted_lines,
            "",
        ]
    coverage = (
        f"_Coverage: **{len(shas) - len(unaccounted)} of {len(shas)}** promoted commits "
        "accounted for."
    )
    if suppressed_closed:
        coverage += (
            f" {suppressed_closed} reference(s) resolved to an already-closed issue and "
            "are not listed."
        )
    coverage += "_"
    sections += [coverage, "", END]
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
    print(
        f"  wrote {len(lines)} closing + {len(candidate_lines)} candidate reference(s), "
        f"{len(unresolvable_lines)} unresolvable, {len(unaccounted_lines)} unaccounted "
        f"commit(s); coverage {len(shas) - len(unaccounted)}/{len(shas)}:"
    )
    for line in lines + candidate_lines + unresolvable_lines + unaccounted_lines:
        print(f"    {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
