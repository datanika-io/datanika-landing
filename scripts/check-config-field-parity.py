#!/usr/bin/env python3
"""Compare `src/data/connectors.ts` configFields against core's PUBLISHED SCHEMA.

Why this exists
---------------
`connectors.ts` is hand-written marketing copy that happens to describe a form.
`datanika/services/connection_schemas.py` in `datanika-core` is what core
*publishes* as the field list. Nothing compared them, so they drifted freely for
months while `npm run build` stayed green: on 2026-08-30 **25 of 36** connector
reference pages documented at least one field that does not exist, and in every
one of those a field the connector actually requires was either misnamed or
missing (landing#310).

Some of that was cosmetic (`username` for `user`). Some was not — `/connectors/s3/`
told readers to enter a `bucket_name` when the required field is `bucket_url`, a
URL; `/connectors/mongodb/` documented a `connection_string` illustrated with
`mongodb+srv://`, a scheme the connector cannot accept at all.

This is the same shape as the connector *count* drift that the sibling job in
`connector-count-parity.yml` was built for: two internally-consistent guards,
mutually blind, both green.

🔴 CORRECTED 2026-09-25 (Product, landing#698) — THIS DOCSTRING CLAIMED
`connection_schemas.py` *IS* THE FORM. IT IS NOT, AND THE CLAIM WAS LOAD-BEARING
---------------------------------------------------------------------------------
The Reflex form is `datanika/ui/components/connection_config_fields.py` — 28
hand-written field groups dispatched through `rx.cond`. `connection_schemas.py`'s
own module docstring lists "(future) UI form rendering" and "(future)
Connection.config validation": it renders nothing and validates nothing. Its live
consumers are `/api/v1/meta/connection-types`, the published OpenAPI document, and
the credential key set used for masking.

The two disagree for **13 of 37** connector types (core#662), and for four of them
the *guide* is right and the schema is wrong — salesforce, shopify, bigquery and
kafka, each measured against the form, the state serialiser and what
`dlt_runner.py` reads. So this check, believing the schema was the form, held
`connectors.ts` in agreement with a field list no user ever sees, and its failure
text told the next author to keep doing that. landing#698 was filed against a
CORRECT guide on the strength of it.

⚠️ What this check actually asserts, stated so nobody re-derives the wrong thing:
**the marketing reference pages agree with the discovery document core publishes.**
That is a real and worthwhile invariant — an API client and a `/connectors/*`
reader should not be told different things — but it is NOT "the page matches the
form", and a green run here is not evidence that a documented field exists on any
screen.

⚠️ There is NO form-side check. Building one is landing#698 AC6, and it is harder
than it looks: the form COMPOSES (`clickhouse_fields()` and `oracle_fields()` call
`db_fields()`, so a walker over one function body misses five shared fields),
non-text controls are fields too (`mongodb`'s `srv` and `tls` are checkboxes), and
the state-var → config-key mapping lives in a third file. Two attempts at a census
returned EMPTY for `clickhouse` and `oracle`; both were caught only by a control
asserting every dispatched type parses non-empty. Do not ship one without that
control.

⚠️ When core#662 item 3 corrects the schema, THIS CHECK WILL GO RED on the
correction. That is expected. Update `connectors.ts` to follow the corrected
schema — do not revert the schema to satisfy this script.

Usage
-----
    python scripts/check-config-field-parity.py \\
        --schema /tmp/connection_schemas.py \\
        --connectors src/data/connectors.ts

Fetch the schema from core `master` — NOT from a local monorepo checkout, which
has been observed stale (it still served pre-#550 MongoDB code during the
landing#309 work):

    gh api repos/datanika-io/datanika-core/contents/datanika/services/connection_schemas.py?ref=master \\
      --jq '.content' | base64 -d > /tmp/connection_schemas.py

Exits 0 when every marketed connector's documented field names match the schema
exactly, 1 otherwise. Field *descriptions* are not compared — only names, which
are the part a reader matches against the form.
"""

from __future__ import annotations

import argparse
import re
import sys

# connectors.ts slugs that do not equal the schema key after `-` -> `_`.
SLUG_ALIASES = {
    "postgresql": "postgres",
    "rest-api": "rest_api",
}

# In the schema but deliberately not marketed on the site.
#
# 🔴 EMPTY since landing#519 (2026-09-07). It held `"openapi"`, justified as
# *"has no connector page by design, which is why the live picker offers 37
# types against the README's 36"* — and every clause of that was false or
# self-inflicted by the time it was read: openapi now has a connector page and
# a setup guide, "by design" described an omission nobody had decided, and the
# README said 35, not 36.
#
# 🚨 That is the shape to watch, not the entry. Every exclusion marker for
# openapi justified itself by an absence one of the OTHERS created — core's
# cited the missing guide, this one cited the missing page, and the missing
# page cited neither. Three guards, all green, all pointing at each other,
# while a shipping connector stayed invisible to every count we publish
# (landing#508). **Do not add an entry here whose reason is that some other
# artifact is missing.** A skip earns its place by naming something that will
# never exist, not something nobody has got round to.
UNMARKETED: set[str] = set()


def parse_schema(path: str) -> dict[str, list[str]]:
    src = open(path, encoding="utf-8").read()
    out: dict[str, list[str]] = {}
    for m in re.finditer(r'^    "([a-z0-9_]+)": _schema\(', src, re.M):
        name = m.group(1)
        i = m.end()
        depth = 1
        while i < len(src) and depth > 0:
            if src[i] == "(":
                depth += 1
            elif src[i] == ")":
                depth -= 1
            i += 1
        body = src[m.end() : i]
        out[name] = re.findall(
            r'"([a-z0-9_]+)":\s*_(?:str|int|bool)\(', body
        )
    if not out:
        sys.exit(
            "Parsed zero connectors out of the schema. The file shape changed — "
            "fix this parser rather than letting it pass vacuously."
        )
    return out


def parse_connectors_ts(path: str) -> list[tuple[str, list[str]]]:
    ts = open(path, encoding="utf-8").read()
    rows: list[tuple[str, list[str]]] = []
    for m in re.finditer(r'\n    slug: "([a-z0-9-]+)",', ts):
        slug = m.group(1)
        seg = ts[m.start() :]
        cf = re.search(r"    configFields: \[\n(.*?)\n    \],\n", seg, re.S)
        fields = re.findall(r'name: "([^"]+)"', cf.group(1)) if cf else []
        rows.append((slug, fields))
    if not rows:
        sys.exit(
            "Parsed zero connectors out of connectors.ts. The file shape changed — "
            "fix this parser rather than letting it pass vacuously."
        )
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", required=True)
    ap.add_argument("--connectors", required=True)
    args = ap.parse_args()

    schema = parse_schema(args.schema)
    rows = parse_connectors_ts(args.connectors)

    print(f"schema connectors: {len(schema)}  (unmarketed: {sorted(UNMARKETED)})")
    print(f"connectors.ts entries: {len(rows)}\n")

    problems: list[str] = []
    for slug, documented in rows:
        key = SLUG_ALIASES.get(slug, slug.replace("-", "_"))
        if key in UNMARKETED:
            continue
        if key not in schema:
            problems.append(
                f"/connectors/{slug}/ — no `{key}` in the published schema. Either the "
                f"connector was withdrawn in core, or the slug needs a SLUG_ALIASES entry."
            )
            continue
        real = schema[key]
        ghost = [f for f in documented if f not in real]
        missing = [f for f in real if f not in documented]
        if ghost or missing:
            bits = []
            if ghost:
                bits.append(
                    "documented but absent from the published schema: "
                    + ", ".join(f"`{g}`" for g in ghost)
                )
            if missing:
                bits.append(
                    "in the published schema but undocumented: " + ", ".join(f"`{x}`" for x in missing)
                )
            problems.append(f"/connectors/{slug}/ — " + "; ".join(bits))

    if not problems:
        print(
            f"OK - all {len(rows)} connector pages match the published schema "
            f"(`/api/v1/meta/connection-types`). This is NOT a check that the fields exist "
            f"on the Reflex form - see this file's docstring and landing#698 AC6."
        )
        return 0

    print(f"DRIFT on {len(problems)} of {len(rows)} connector pages:\n")
    for p in problems:
        print(f"  - {p}")
    print(
        "\nThis compares the pages against the schema core PUBLISHES, not against the form.\n"
        "Normally the fix is to correct `connectors.ts` from `connection_schemas.py` at core\n"
        "`master`. But check the FORM first (`datanika/ui/components/connection_config_fields.py`)\n"
        "when the slug is one of the 13 types core#662 records as divergent: for salesforce,\n"
        "shopify, bigquery and kafka the SCHEMA is the wrong side, and copying it onto the page\n"
        "documents a field no user can see. If the schema is wrong, fix it in core - do not\n"
        "propagate it here to make this script green."
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
