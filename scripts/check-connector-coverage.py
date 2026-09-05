#!/usr/bin/env python3
"""Name any connector a user can PICK that the site says nothing about.

Why this exists
---------------
Every connector number this repo keeps is a *count*, and every one of those
counts is taken over a set that already excludes the thing being looked for.

- `connector-count-parity.yml` compares `src/data/connectors.ts` entries against
  core's README number. Core derives its number as
  `len(ConnectionType) - len(UNMARKETED_TYPES | WITHDRAWN_SOURCE_TYPES)`.
- `connector-count-prose.test.ts` and `connector-count-dist.test.ts` compare
  prose and rendered HTML against `availableConnectors`, i.e. `connectors.ts`.

So when `openapi` shipped -- a full connector with its own form, a 591-line
spec parser, Swagger 2.0 conversion, auth extraction and a `SAAS_PROBE_EXEMPT`
entry -- it was absent from `connectors.ts`, absent from
`src/content/connectors/`, and listed in core's `UNMARKETED_TYPES`. **Both
numbers read 35 and agreed.** The parity cron was green. The prose guard was
green. The dist guard was green. A connector a user could select in the product
had nothing written about it anywhere, and no count we publish was capable of
saying so (landing#508).

The three exclusion markers each justified themselves by an absence the others
produced:

    core  tests/test_docs/test_readme_claims.py
        UNMARKETED_TYPES = {"openapi"}   # "has no connector page, setup guide,
                                         #  or docs entry"
    landing  scripts/check-config-field-parity.py
        UNMARKETED = {"openapi"}         # "has no connector page by design"
    landing  the absence itself, in connectors.ts and src/content/connectors/

None of them states a product reason. That is the shape this script exists to
break: **a denominator taken from the page set cannot show a missing page.**

What it compares
----------------
The denominator is `PICKER_TYPES` from core's `datanika/ui/pages/connections.py`
-- the literal dropdown a user chooses from. Not the enum (which contains types
never offered), not the README number (which subtracts the gap), not
`connectors.ts` (which is what we are checking).

A picker type is REPORTED when it has **neither** a setup guide under
`src/content/connectors/<slug>.md` **nor** an entry in `src/data/connectors.ts`.
That is the landing#508 AC2 condition, and it is deliberately the conjunction:
adding a `connectors.ts` entry moves the marketed count and so has to land with
a matching core change, while a guide alone is a pure addition. Half-covered
types are printed as NOTES so the state is visible without failing the check.

Usage
-----
    python scripts/check-connector-coverage.py \\
        --picker /tmp/connections.py \\
        --connectors src/data/connectors.ts \\
        --guides src/content/connectors

Fetch the picker from core `master` -- NOT from a local monorepo checkout, which
has been observed stale (it served pre-#550 MongoDB code during landing#309, and
the cloud main checkout was four months behind on 2026-09-04):

    gh api "repos/datanika-io/datanika-core/contents/datanika/ui/pages/connections.py?ref=master" \\
      --jq '.content' | base64 -d > /tmp/connections.py

Exits 0 when every picker type has a guide or an entry, 1 otherwise.
"""

from __future__ import annotations

import argparse
import os
import re
import sys

#: Landing slugs that do not equal the core type after `_` -> `-`.
#: Mirrors SLUG_ALIASES in check-config-field-parity.py, inverted.
TYPE_TO_SLUG = {
    "postgres": "postgresql",
}

#: Below this, assume the input shape changed rather than that the product
#: shrank. A parser that silently returns nothing reports perfect coverage --
#: the `plans >= 5` restore-drill failure, which is this project's signature
#: defect. Refuse to pass vacuously.
MIN_PICKER_TYPES = 20
MIN_LANDING_ENTRIES = 20


def slug_for(core_type: str) -> str:
    return TYPE_TO_SLUG.get(core_type, core_type.replace("_", "-"))


def parse_picker(path: str) -> list[str]:
    """Extract PICKER_TYPES from core's connections.py.

    Reads only the bracketed literal, so commented-out entries -- e.g. the
    withdrawn `s3` line -- are correctly absent: a withdrawn connector is not
    something a user can pick, and must not be reported as missing coverage.
    """
    src = open(path, encoding="utf-8").read()
    m = re.search(r"^PICKER_TYPES:\s*list\[str\]\s*=\s*\[(.*?)^\]", src, re.M | re.S)
    if not m:
        sys.exit(
            "Could not find a PICKER_TYPES list literal in the picker file.\n"
            "The declaration shape changed -- fix this parser rather than "
            "letting the check pass over an empty set."
        )
    types = re.findall(r'^\s*"([a-z0-9_]+)",', m.group(1), re.M)
    if len(types) < MIN_PICKER_TYPES:
        sys.exit(
            f"Parsed only {len(types)} picker types (expected >= {MIN_PICKER_TYPES}).\n"
            "A count that silently collapses reports full coverage. Refusing."
        )
    return types


def parse_connectors_ts(path: str) -> list[str]:
    ts = open(path, encoding="utf-8").read()
    # Four leading spaces = an entry field. The interface declares `slug: string;`
    # at two spaces, so the indent is what excludes it.
    slugs = re.findall(r'^\s{4}slug: "([a-z0-9-]+)",', ts, re.M)
    if len(slugs) < MIN_LANDING_ENTRIES:
        sys.exit(
            f"Parsed only {len(slugs)} slugs out of connectors.ts "
            f"(expected >= {MIN_LANDING_ENTRIES}). The file shape changed. Refusing."
        )
    return slugs


def parse_guides(directory: str) -> list[str]:
    if not os.path.isdir(directory):
        sys.exit(f"Guide directory not found: {directory}")
    return sorted(f[:-3] for f in os.listdir(directory) if f.endswith(".md"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--picker", required=True, help="core's datanika/ui/pages/connections.py")
    ap.add_argument("--connectors", default="src/data/connectors.ts")
    ap.add_argument("--guides", default="src/content/connectors")
    args = ap.parse_args()

    picker = parse_picker(args.picker)
    entries = set(parse_connectors_ts(args.connectors))
    guides = set(parse_guides(args.guides))

    uncovered: list[str] = []
    guide_only: list[str] = []
    entry_only: list[str] = []

    for core_type in picker:
        slug = slug_for(core_type)
        has_guide = slug in guides
        has_entry = slug in entries
        if not has_guide and not has_entry:
            uncovered.append(f"{core_type} (expected slug: {slug})")
        elif not has_entry:
            guide_only.append(slug)
        elif not has_guide:
            entry_only.append(slug)

    print(f"picker types: {len(picker)}  connectors.ts entries: {len(entries)}  guides: {len(guides)}")

    if guide_only:
        print(
            "\nNOTE — has a setup guide but no connectors.ts entry "
            "(so it is in no published count):"
        )
        for s in guide_only:
            print(f"  {s}")
        print(
            "  Adding the entry moves the marketed count, so it must land with the "
            "matching core change (drop it from UNMARKETED_TYPES, bump the README)."
        )

    if entry_only:
        print("\nNOTE — marketed in connectors.ts but no setup guide:")
        for s in entry_only:
            print(f"  {s}")

    if uncovered:
        print("\nFAIL — a user can pick these and the site says nothing about them:")
        for t in uncovered:
            print(f"  {t}")
        print(
            "\nWrite src/content/connectors/<slug>.md. Do not 'fix' this by adding the "
            "type to an exclusion list: every existing exclusion marker for `openapi` "
            "justified itself by the absence the others created, which is how a "
            "shipping connector stayed invisible to three green guards (landing#508)."
        )
        return 1

    print("\nOK — every picker type has a guide or an entry.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
