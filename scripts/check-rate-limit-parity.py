#!/usr/bin/env python3
"""Do our published rate limits and concurrency ceilings still match what core intends?

landing#531. Sibling of ``check-plan-catalogue-parity.py``, which does this for the
volume and run columns. This one covers ``rate_limit_rpm`` and ``max_parallel_runs``,
which that job does not touch and nothing else binds.

## What it compares, and why NOT the obvious thing

⚠️ **It reads the migrations' DECLARED CONSTANTS, never the effect of their SQL.**

That distinction is the whole design, and the first version of this issue got it wrong.
The rate columns are set by ``UPDATE plans SET ... WHERE slug = ...`` statements, and
**no migration has ever created the paid plan rows** — so on a from-scratch build every
one of those UPDATEs matches *zero rows* and the columns keep their server default. A
checker bound to "what the SQL would do" would therefore certify numbers that
demonstrably never reached the table. That is the scar in ``SPEC_PRICING_V2`` §2.5, and
it is why ``max_parallel_runs`` was published as 20 while production held 5.

Both migrations avoid this by naming their intent as a module-level constant, which the
cloud seed then reads:

    f6a7b8c9d0e1  PUBLISHED_MAX_PARALLEL_RUNS
    g7h8i9j0k1l2  PUBLISHED_RATE_LIMIT_RPM

Those constants are the contract — *"this is the number the page publishes"* — and they
are what the seed writes into a fresh database. Binding to them binds us to the same
thing the seed binds to. Binding to the UPDATE would bind us to a statement that may
match nothing.

## 🚨 What this job CANNOT tell you, and must keep saying so

**It compares two artifacts we control. Neither of them is the database.**

Green here means *landing's published figures agree with core's declared intent*. It does
NOT mean production serves those numbers — a row created out of band, a reseed that runs
before the correction, or a manual UPDATE all leave this green. Only reading the ``plans``
table answers that, and CI has no box.

⚠️ **Do not delete the paragraph above for tidiness.** A guard that states its own blind
spot is worth more than one that does not, and this repository has repeatedly paid for
checks whose scope was assumed to be wider than it was.

The complement that *can* see production is Infra's rebuild-parity drill (core#1060),
which reads what the box actually serves. The two answer different questions and neither
substitutes for the other.

Usage::

    python scripts/check-rate-limit-parity.py \\
        --rpm-migration /tmp/g7h8i9j0k1l2_correct_paid_plan_rate_limits.py \\
        --parallel-migration /tmp/f6a7b8c9d0e1_correct_paid_plan_concurrency.py \\
        --guard tests/rate-limit-claims.test.ts

Exit 0 = agree. Exit 1 = drift (details on stdout). Exit 2 = could not compare, which is
deliberately NOT the same as agreement.
"""

from __future__ import annotations

import argparse
import ast
import re
import sys

#: core slug -> the tier name landing publishes. Landing sells three tiers; core seeds
#: five rows, because monthly and annual are separate slugs at the same entitlements.
SLUG_TO_TIER = {
    "free": "Free",
    "pro-monthly": "Pro",
    "pro-annual": "Pro",
    "enterprise-monthly": "Enterprise",
    "enterprise-annual": "Enterprise",
}


def cannot_compare(msg: str) -> "NoReturn":  # noqa: F821
    """Exit 2 — *could not compare*, which is deliberately NOT agreement.

    ⚠️ `SystemExit("message")` exits **1**, not 2. The first version of this file used
    that everywhere and every "cannot compare" path reported as *drift* instead. Arming
    caught it; nothing else would have, because both are non-zero and both file an issue.
    """
    print(msg)
    sys.exit(2)


def parse_migration_constant(source: str, name: str) -> dict[str, int]:
    """Read ``name = {"slug": int, ...}`` out of a migration, via ast.

    Deliberately not a regex over the file: a constant that has been renamed, moved
    inside a function, or turned into a computed expression must fail loudly here rather
    than silently matching nothing. `ast` gives us that for free.
    """
    tree = ast.parse(source)
    for node in ast.walk(tree):
        targets: list[ast.expr] = []
        if isinstance(node, ast.Assign):
            targets = list(node.targets)
        elif isinstance(node, ast.AnnAssign):
            targets = [node.target]
        else:
            continue
        if not any(isinstance(t, ast.Name) and t.id == name for t in targets):
            continue
        value = node.value
        if not isinstance(value, ast.Dict):
            cannot_compare(f"FAIL: {name} is not a dict literal — cannot compare")
        out: dict[str, int] = {}
        for k, v in zip(value.keys, value.values):
            if not isinstance(k, ast.Constant) or not isinstance(v, ast.Constant):
                cannot_compare(f"FAIL: {name} holds a non-literal entry — cannot compare")
            out[str(k.value)] = int(v.value)
        return out
    cannot_compare(
        f"FAIL: {name} not found. It was renamed, moved, or the migration was replaced — "
        f"either way this check can no longer see core's intent and must not report agreement."
    )


def parse_guard_constant(source: str, name: str) -> dict[str, int]:
    """Read ``const NAME = { Free: 30, Pro: 120, ... }`` out of the TS guard."""
    m = re.search(rf"const\s+{name}\s*=\s*\{{(.*?)\}}", source, re.S)
    if not m:
        cannot_compare(
            f"FAIL: const {name} not found in the guard. If it was renamed, this job is "
            f"comparing nothing — fix the name here rather than deleting the check."
        )
    out: dict[str, int] = {}
    for tier, value in re.findall(r"(\w+)\s*:\s*(\d+)", m.group(1)):
        out[tier] = int(value)
    if not out:
        cannot_compare(f"FAIL: const {name} parsed to an empty map — cannot compare")
    return out


def collapse_to_tiers(by_slug: dict[str, int], label: str) -> dict[str, int]:
    """Five core slugs -> three published tiers, refusing to guess on disagreement.

    Landing publishes one number per tier. If core ever gives monthly and annual
    different values, there is no single number to publish and that is a product
    decision, not something this script may average away.
    """
    tiers: dict[str, set[int]] = {}
    unknown = sorted(s for s in by_slug if s not in SLUG_TO_TIER)
    if unknown:
        cannot_compare(
            f"FAIL: {label} names slugs this script does not map: {', '.join(unknown)}. "
            f"A new tier is a publishing decision — add it to SLUG_TO_TIER deliberately."
        )

    # 🚨 Assert every slug is PRESENT, not merely that three tiers came out the far side.
    #
    # Arming found this and nothing else would have. Dropping `enterprise-annual` from
    # core's map still yields Free / Pro / Enterprise — because `enterprise-monthly`
    # carries the tier on its own — so a downstream "did we get 3 tiers?" check passes
    # and the script reported **AGREE** while annual Enterprise had no declared intent
    # at all. Counting the output is not the same as checking the input, and the output
    # is the reassuring one.
    missing = sorted(set(SLUG_TO_TIER) - set(by_slug))
    if missing:
        cannot_compare(
            f"FAIL: {label} is missing {', '.join(missing)}. Those slugs exist in the "
            f"plans table, so a constant that omits them declares no intent for a tier we "
            f"sell — which is not the same as agreeing with it."
        )
    for slug, value in by_slug.items():
        tiers.setdefault(SLUG_TO_TIER[slug], set()).add(value)
    out: dict[str, int] = {}
    for tier, values in tiers.items():
        if len(values) > 1:
            cannot_compare(
                f"FAIL: {label} gives {tier} more than one value across its slugs "
                f"({sorted(values)}). Landing publishes one number per tier, so there is "
                f"nothing correct to publish until that is resolved."
            )
        out[tier] = values.pop()
    return out


def compare(what: str, core: dict[str, int], published: dict[str, int]) -> list[str]:
    problems: list[str] = []
    for tier in sorted(set(core) | set(published)):
        c, p = core.get(tier), published.get(tier)
        if c is None:
            problems.append(f"  {what}: landing publishes {tier}={p}, core declares no such tier")
        elif p is None:
            problems.append(f"  {what}: core declares {tier}={c}, landing publishes nothing")
        elif c != p:
            problems.append(f"  {what}: {tier} — core intends {c}, landing publishes {p}")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rpm-migration", required=True, help="core g7h8i9j0k1l2_*.py")
    ap.add_argument("--parallel-migration", required=True, help="core f6a7b8c9d0e1_*.py")
    ap.add_argument("--guard", required=True, help="tests/rate-limit-claims.test.ts")
    args = ap.parse_args()

    try:
        rpm_src = open(args.rpm_migration, encoding="utf-8").read()
        par_src = open(args.parallel_migration, encoding="utf-8").read()
        guard_src = open(args.guard, encoding="utf-8").read()
    except OSError as exc:
        print(f"FAIL: could not read an input — {exc}")
        return 2

    core_rpm = collapse_to_tiers(
        parse_migration_constant(rpm_src, "PUBLISHED_RATE_LIMIT_RPM"), "PUBLISHED_RATE_LIMIT_RPM"
    )
    core_par = collapse_to_tiers(
        parse_migration_constant(par_src, "PUBLISHED_MAX_PARALLEL_RUNS"),
        "PUBLISHED_MAX_PARALLEL_RUNS",
    )
    pub_rpm = parse_guard_constant(guard_src, "RPM")
    pub_par = parse_guard_constant(guard_src, "PARALLEL")

    # Anti-vacuity: three tiers each side, or we are comparing a truncated parse and a
    # clean exit would mean nothing. This is the check that stops "0 problems" being
    # produced by a regex that matched one entry.
    for label, m in (
        ("core rpm", core_rpm), ("core parallel", core_par),
        ("published rpm", pub_rpm), ("published parallel", pub_par),
    ):
        if len(m) != 3:
            print(f"FAIL: {label} resolved {len(m)} tiers, expected 3 — refusing to compare: {m}")
            return 2

    problems = compare("rate_limit_rpm", core_rpm, pub_rpm)
    problems += compare("max_parallel_runs", core_par, pub_par)

    print(f"core intends      rpm={core_rpm}  parallel={core_par}")
    print(f"landing publishes rpm={pub_rpm}  parallel={pub_par}")
    if problems:
        print("\nDRIFT:")
        print("\n".join(problems))
        return 1
    print("\nAGREE — on core's declared intent. This says nothing about the database (see docstring).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
