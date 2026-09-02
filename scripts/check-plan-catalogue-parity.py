#!/usr/bin/env python3
"""Compare landing's published plan catalogue against the one production enforces.

landing#403 / landing#396 / core#713.

`tests/byte-pricing-surface-inventory.test.ts` computes every rendered byte-pricing
string from a `PRODUCT` constant. That constant is transcribed from the migration
that seeds the `plans` table — and a transcription is exactly the hand-maintained
half that `docs/GROWTH_RULES.md` says always rots:

    "Bind a number to the fact it derives from. A copied number is a claim with
     no owner. Every drift incident on this site has the same shape — the derived
     half survives and the hand-written half rots."

This script is the binding. It reads core's seed migration and landing's guard and
fails when they disagree.

It is run by `.github/workflows/pricing-catalogue-parity.yml` as a **daily cron**,
not as a required PR check, for the reason `connector-count-parity.yml` already
documents: the change that would break us lands in `datanika-core`, so a PR-time
check in `datanika-landing` could never see it.

## Two things it deliberately does

1. **Exits non-zero when it parsed nothing.** A checker that finds no plans and
   reports no drift is indistinguishable from one that found agreement. That is
   the restore-drill defect (`plans >= 5` on seed data) in a different costume.
2. **Compares `hard_cap_runs` too, not only the byte columns.** The 2026-08-31
   migration flipped Pro from capped to uncapped in the same commit that seeded
   the allotments, and the run figures are published on `/pricing` beside the
   volume ones. A parity check that watched only the bytes would have called that
   deploy clean.

## What it cannot see

Whether any of it is *enforced*. `bytes_quota_enforce` and `overage_charge_enable`
are environment variables on the production box (`datanika_cloud/billing/config.py`,
both default `False`) and neither this script nor CI can read them. Agreement here
means the page and the plan catalogue match. It does not mean a customer is billed.
"""

from __future__ import annotations

import argparse
import ast
import re
import sys

GIB = 1024**3
TIB = 1024**4

# Landing names its tiers; core keys plans by subscription slug. The monthly slug
# is the canonical one — the annual slugs carry identical volume terms, and the
# migration asserts that by seeding both from the same tuple.
SLUG_FOR = {"Free": "free", "Pro": "pro-monthly", "Enterprise": "enterprise-monthly"}


_BINOPS = {
    ast.Mult: lambda a, b: a * b,
    ast.Pow: lambda a, b: a**b,
    ast.Add: lambda a, b: a + b,
    ast.Sub: lambda a, b: a - b,
    ast.FloorDiv: lambda a, b: a // b,
}


def _safe_eval(node: ast.AST, consts: dict[str, object]) -> object:
    """Evaluate the small expression grammar a seed migration uses.

    `ast.literal_eval` is not enough and the first draft of this script proved it
    by failing on the real file: the catalogue is written `10 * _GIB` against
    `_GIB = 1024**3`, and neither the multiplication by a *name* nor the power is
    a literal. Rather than reach for `eval` — this source is fetched over the
    network into a job holding an `issues: write` token — the grammar is spelled
    out: constants, names already bound in this module, tuples, dicts, and the
    four arithmetic operators a byte count needs.
    """
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        if node.id not in consts:
            raise ValueError(f"unbound name {node.id!r}")
        return consts[node.id]
    if isinstance(node, ast.Tuple):
        return tuple(_safe_eval(e, consts) for e in node.elts)
    if isinstance(node, ast.List):
        return [_safe_eval(e, consts) for e in node.elts]
    if isinstance(node, ast.Dict):
        return {
            _safe_eval(k, consts): _safe_eval(v, consts)
            for k, v in zip(node.keys, node.values)
            if k is not None
        }
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return -_safe_eval(node.operand, consts)  # type: ignore[operator]
    if isinstance(node, ast.BinOp) and type(node.op) in _BINOPS:
        return _BINOPS[type(node.op)](
            _safe_eval(node.left, consts), _safe_eval(node.right, consts)
        )
    raise ValueError(f"unsupported expression: {ast.dump(node)[:80]}")


def parse_core_catalogue(source: str) -> dict[str, dict[str, object]]:
    """Read `_CATALOGUE` and `_NO_MID_CYCLE_BLOCK` out of the seed migration.

    Uses `ast`, not `eval`: this file is fetched over the network from another
    repository, and executing it to read three numbers out of it would be a
    remote-code path in a CI job that has an issues:write token.
    """
    tree = ast.parse(source)
    consts: dict[str, object] = {}
    catalogue: dict[str, tuple] | None = None
    no_block: tuple = ()

    # `tree.body` in source order, not `ast.walk`: `_GIB` has to be bound before
    # the catalogue that multiplies by it.
    for node in tree.body:
        if not isinstance(node, (ast.Assign, ast.AnnAssign)):
            continue
        target = node.targets[0] if isinstance(node, ast.Assign) else node.target
        if not isinstance(target, ast.Name) or node.value is None:
            continue
        try:
            value = _safe_eval(node.value, consts)
        except ValueError:
            continue
        if target.id == "_CATALOGUE":
            catalogue = value  # type: ignore[assignment]
        elif target.id == "_NO_MID_CYCLE_BLOCK":
            no_block = tuple(value)  # type: ignore[arg-type]
        else:
            consts[target.id] = value

    if not catalogue:
        raise SystemExit(
            "FATAL: parsed no `_CATALOGUE` out of the migration.\n"
            "Either the file moved, or its shape changed. This is a hard failure "
            "on purpose — a parity check that examines nothing must never report "
            "agreement."
        )

    out: dict[str, dict[str, object]] = {}
    for slug, row in catalogue.items():
        included, cents, hard_cap_bytes = row
        out[slug] = {
            "bytes_included": included,
            "overage_cents_per_gb": cents,
            "hard_cap_bytes": hard_cap_bytes,
            # The migration's second statement: these slugs are set uncapped.
            "hard_cap_runs": slug not in no_block,
        }
    return out


_NUM = re.compile(r"^\s*([0-9_]+)\s*\*\s*(GIB|TIB)\s*$|^\s*(GIB|TIB)\s*$|^\s*([0-9_]+)\s*$")


def _bytes(expr: str) -> int:
    """Evaluate the small arithmetic the guard uses: `10 * GIB`, `TIB`, `500`."""
    m = _NUM.match(expr)
    if not m:
        raise SystemExit(f"FATAL: cannot read a byte count out of {expr!r}.")
    unit = {"GIB": GIB, "TIB": TIB}
    if m.group(1):
        return int(m.group(1).replace("_", "")) * unit[m.group(2)]
    if m.group(3):
        return unit[m.group(3)]
    return int(m.group(4).replace("_", ""))


def parse_landing_product(source: str) -> dict[str, dict[str, object]]:
    """Read the `PRODUCT` object out of the guard test."""
    start = source.find("const PRODUCT")
    if start == -1:
        raise SystemExit("FATAL: no `const PRODUCT` in the guard. Did it get renamed?")
    body = source[start : source.find("\n};", start)]

    out: dict[str, dict[str, object]] = {}
    for name in SLUG_FOR:
        block = re.search(
            rf"\b{name}:\s*\{{(.*?)\}},", body, re.S
        )
        if not block:
            raise SystemExit(f"FATAL: no `{name}:` entry in PRODUCT.")
        b = block.group(1)

        def field(key: str) -> str:
            m = re.search(rf"{key}:\s*([^,\n]+)", b)
            if not m:
                raise SystemExit(f"FATAL: `{name}.{key}` is missing from PRODUCT.")
            return m.group(1).strip()

        cents_raw = field("overageCentsPerGib")
        out[name] = {
            "bytes_included": _bytes(field("bytesIncluded")),
            "overage_cents_per_gb": None if cents_raw == "null" else int(cents_raw),
            "hard_cap_bytes": field("hardCapBytes") == "true",
            "hard_cap_runs": field("hardCapRuns") == "true",
            "runs_included": int(field("runsIncluded").replace("_", "")),
        }
    if not out:
        raise SystemExit("FATAL: parsed no plans out of PRODUCT.")
    return out


FIELDS = ("bytes_included", "overage_cents_per_gb", "hard_cap_bytes", "hard_cap_runs")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--migration", required=True, help="core's seed_plan_byte_allotments.py")
    ap.add_argument("--guard", required=True, help="tests/byte-pricing-surface-inventory.test.ts")
    args = ap.parse_args()

    with open(args.migration, encoding="utf-8") as fh:
        core = parse_core_catalogue(fh.read())
    with open(args.guard, encoding="utf-8") as fh:
        landing = parse_landing_product(fh.read())

    compared = 0
    drift: list[str] = []
    for name, slug in SLUG_FOR.items():
        if slug not in core:
            drift.append(
                f"- **{name}**: the migration no longer seeds a plan with slug "
                f"`{slug}`. The slug map in this script needs updating, or the "
                f"tier was renamed in core."
            )
            continue
        for field in FIELDS:
            compared += 1
            want, got = core[slug][field], landing[name][field]
            if want != got:
                drift.append(
                    f"- **{name}** (`{slug}`) `{field}`: core enforces `{want}`, "
                    f"landing publishes `{got}`."
                )

    # A vacuous pass must not read as a clean one.
    if compared == 0:
        print("FATAL: compared zero fields. Refusing to report agreement.")
        return 2

    print(f"Compared {compared} fields across {len(SLUG_FOR)} tiers.")
    for name, slug in SLUG_FOR.items():
        row = core.get(slug, {})
        print(
            f"  {name:<11} slug={slug:<20} bytes={row.get('bytes_included')} "
            f"overage={row.get('overage_cents_per_gb')} "
            f"hard_cap_runs={row.get('hard_cap_runs')}"
        )

    if drift:
        print()
        print("DRIFT:")
        for line in drift:
            print(line)
        return 1

    print("OK — the published catalogue matches the one production seeds.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
