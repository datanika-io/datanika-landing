#!/usr/bin/env python3
"""The docs' materialization options must be the dropdown the product renders.

The product list is the ``rx.select`` bound to
``TransformationState.form_materialization`` in
``datanika/ui/pages/transformations.py``. The ``Materialization`` enum is a
different list: it still contains ``snapshot``, and the select does not.
Comparing the docs to the enum would bless an option the dropdown does not
offer (landing#695, the same split as landing#449).

A page that merely contains the word "snapshot" is not evidence either way.
This reads the materialization table, and the "Choose a Materialization"
sentence where a page has one.

Fails closed. No dropdown, no table, or an empty option list is a refusal,
not a match.
"""

import argparse
import re
import sys

DROPDOWN = re.compile(
    r"rx\.select\(\s*\[(?P<body>[^\]]*)\]\s*,\s*"
    r"value\s*=\s*TransformationState\.form_materialization\b",
    re.S,
)
OPTION = re.compile(r"""["']([a-z][a-z0-9_+-]*)["']""")
TABLE = re.compile(r"<h2>Materializations</h2>(.*?)</table>", re.S)
ROW = re.compile(r"<tr>\s*<td>\s*<code>([a-z][a-z0-9_+-]*)</code>", re.S)
CHOICE = re.compile(
    r"<li>\s*Choose a <strong>Materialization</strong>:(.*?)</li>",
    re.S,
)
CODE = re.compile(r"<code>([a-z][a-z0-9_+-]*)</code>")


def dropdown_options(source):
    found = DROPDOWN.findall(source)
    if len(found) != 1:
        raise SystemExit(
            "could not find the materialization dropdown "
            "(%d rx.select lists bound to form_materialization)" % len(found)
        )
    options = OPTION.findall(found[0])
    if not options:
        raise SystemExit("could not read any option from the materialization dropdown")
    return options


def table_options(source, label):
    found = TABLE.findall(source)
    if len(found) != 1:
        raise SystemExit(
            "could not find the Materializations table in %s (%d)" % (label, len(found))
        )
    options = ROW.findall(found[0])
    if not options:
        raise SystemExit("the Materializations table in %s has no type codes" % label)
    return options


def choice_options(source, label):
    found = CHOICE.findall(source)
    if len(found) != 1:
        raise SystemExit(
            "could not find the Choose a Materialization sentence in %s (%d)"
            % (label, len(found))
        )
    options = CODE.findall(found[0])
    if not options:
        raise SystemExit(
            "the Choose a Materialization sentence in %s names no option" % label
        )
    return options


def problems(dropdown, documented, label):
    extra = sorted(set(documented) - set(dropdown))
    missing = sorted(set(dropdown) - set(documented))
    lines = []
    if extra:
        lines.append(
            "%s names %s and the dropdown does not offer it"
            % (label, ", ".join(extra))
        )
    if missing:
        lines.append(
            "%s omits %s and the dropdown offers it" % (label, ", ".join(missing))
        )
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--core", required=True)
    ap.add_argument("--table", action="append", required=True)
    ap.add_argument("--choice", action="append", required=True)
    args = ap.parse_args()

    dropdown = dropdown_options(open(args.core, encoding="utf-8").read())
    print("dropdown: %s" % " ".join(sorted(dropdown)))

    lines = []
    for path in args.table:
        documented = table_options(open(path, encoding="utf-8").read(), path)
        print("table %s: %s" % (path, " ".join(sorted(documented))))
        lines.extend(problems(dropdown, documented, "table %s" % path))
    for path in args.choice:
        documented = choice_options(open(path, encoding="utf-8").read(), path)
        print("choice %s: %s" % (path, " ".join(sorted(documented))))
        lines.extend(problems(dropdown, documented, "choice %s" % path))

    if lines:
        print("\n".join(lines))
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
