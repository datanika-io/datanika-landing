#!/usr/bin/env python3
"""Compare `src/data/connectors.ts` configFields against core's shipped schema.

Why this exists
---------------
`connectors.ts` is hand-written marketing copy that happens to describe a form.
`datanika/services/connection_schemas.py` in `datanika-core` *is* that form.
Nothing compared them, so they drifted freely for months while `npm run build`
stayed green: on 2026-08-30 **25 of 36** connector reference pages documented at
least one field that does not exist, and in every one of those a field the form
actually requires was either misnamed or missing (landing#310).

Some of that was cosmetic (`username` for `user`). Some was not — `/connectors/s3/`
told readers to enter a `bucket_name` when the required field is `bucket_url`, a
URL; `/connectors/mongodb/` documented a `connection_string` illustrated with
`mongodb+srv://`, a scheme the connector cannot accept at all.

This is the same shape as the connector *count* drift that the sibling job in
`connector-count-parity.yml` was built for: two internally-consistent guards,
mutually blind, both green.

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

# In the schema but deliberately not marketed on the site. `openapi` powers
# user-supplied OpenAPI specs and has no connector page by design, which is why
# the live picker offers 37 types against the README's 36.
UNMARKETED = {"openapi"}


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
                f"/connectors/{slug}/ — no `{key}` in the shipped schema. Either the "
                f"connector was withdrawn in core, or the slug needs a SLUG_ALIASES entry."
            )
            continue
        real = schema[key]
        ghost = [f for f in documented if f not in real]
        missing = [f for f in real if f not in documented]
        if ghost or missing:
            bits = []
            if ghost:
                bits.append("documented but absent from the form: " + ", ".join(f"`{g}`" for g in ghost))
            if missing:
                bits.append("in the form but undocumented: " + ", ".join(f"`{x}`" for x in missing))
            problems.append(f"/connectors/{slug}/ — " + "; ".join(bits))

    if not problems:
        print(f"OK - all {len(rows)} connector pages match the shipped schema.")
        return 0

    print(f"DRIFT on {len(problems)} of {len(rows)} connector pages:\n")
    for p in problems:
        print(f"  - {p}")
    print(
        "\nFix by reading the field names off `connection_schemas.py` at core `master`.\n"
        "A reader matches these against the actual form; a wrong name sends them "
        "looking for a field that is not there."
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
