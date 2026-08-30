#!/usr/bin/env bash
#
# landing#354 — the test that would have failed.
#
# `scripts/test-site-urls.sh` checks `site-urls.sh` against a SYNTHETIC build.
# That is the right shape for the mapping's mechanics, and it is structurally
# unable to catch a mapping that is simply pointed at the wrong page: the
# fixture is written by the same person, from the same belief, as the mapping.
# landing#354 is exactly that failure — `src/content/connectors/<slug>.md` was
# mapped to `/connectors/<slug>/`, the fixture contained `/connectors/mysql/`,
# and both agreed with each other and with nothing else.
#
# So this harness asserts against GROUND TRUTH instead: the real repository and
# the real `dist/`. It never reads `site-urls.sh`'s mapping table. For every
# content-collection entry it asks a question the table cannot influence —
#
#     which built page carries THIS SOURCE FILE'S OWN TITLE?
#
# — and then requires `from-sources` to have named that page and no other.
#
# The distinction that matters, and the one every existing gate missed:
#
#     ROUTABLE    the URL exists in dist                  <- what was checked
#     CORRESPONDS the URL is the page this source renders <- what was meant
#
# `/connectors/mongodb/` is routable. It is a real page serving 200, built from
# `src/data/connectors.ts`. That is why `from-sources` logged `keep`, the
# post-publish probe logged `verified 4 URL(s) serving 200`, and the deploy went
# green while 36 connector guides were announced under the wrong URL and the
# pages that actually changed were never submitted at all.
#
# Run against the pre-fix `site-urls.sh` this harness reports 36 failures.
#
# Requires a build. `dist/` missing is a HARD FAILURE, never a skip — a harness
# that quietly does nothing is the thing being defended against here.
#
# Usage: npm run build && bash scripts/test-url-correspondence.sh

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SCRIPT() { bash "$ROOT/scripts/site-urls.sh" "$@"; }
PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); printf '  ok   %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); printf '  FAIL %s\n       expected: %s\n       actual:   %s\n' "$1" "$2" "$3"; }

DIST="${1:-dist}"

if [ ! -d "$DIST" ]; then
    echo "FAIL: no build at '$DIST'. Run 'npm run build' first." >&2
    echo "      This harness compares the mapping against the real build output;" >&2
    echo "      without one it would pass by testing nothing." >&2
    exit 1
fi
if [ ! -d src/content ]; then
    echo "FAIL: src/content missing — run this from the repository root." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Ground truth: every built URL and the title it serves.
#
# Read through `site-urls.sh titles` rather than a private HTML scrape, because
# that decoder already handles the entity forms Astro emits (`Here&#39;s`) and
# the site-name suffix Layout.astro appends. It is a different code path from
# the mapping under test — `cmd_titles` cannot make a wrong mapping look right.
# ---------------------------------------------------------------------------
TITLES="$(mktemp)"; BUILT="$(mktemp)"
trap 'rm -f "$TITLES" "$BUILT" 2>/dev/null || true' EXIT

SCRIPT from-dist "$DIST" > "$BUILT"
SCRIPT titles "$DIST" < "$BUILT" > "$TITLES"

N_BUILT=$(grep -c . "$BUILT" || true)
echo "ground truth: $N_BUILT built URLs, $(grep -c . "$TITLES" || true) titled"
# An empty or truncated build would make every assertion below vacuous. Refuse.
if [ "$N_BUILT" -lt 50 ]; then
    echo "FAIL: only $N_BUILT built URLs — the build looks truncated, refusing to" >&2
    echo "      report a result from it." >&2
    exit 1
fi

# Normalise away punctuation and case so the comparison survives entity
# encoding, smart quotes and em dashes without a decoding rabbit hole.
norm() { tr -cd '[:alnum:]' | tr '[:upper:]' '[:lower:]'; }

# The front-matter title, verbatim.
fm_title() {
    awk 'NR==1 && $0=="---" { inb=1; next }
         inb && /^---[[:space:]]*$/ { exit }
         inb && /^title:/ {
             sub(/^title:[[:space:]]*/, "")
             gsub(/^"|"$/, "")
             print; exit
         }' "$1"
}

# Every built URL whose title normalises to $1. Ground truth; no mapping input.
urls_serving_title() {
    awk -F'\t' -v want="$1" '
        { t = tolower($2); gsub(/[^a-z0-9]/, "", t); if (t == want) print $1 }
    ' "$TITLES"
}

# ---------------------------------------------------------------------------
echo "== every content-collection entry is announced under the page it renders =="
# ---------------------------------------------------------------------------
checked=0; matched=0; unbuilt=0
for f in $(git ls-files 'src/content/**/*.md' 'src/content/**/*.mdx' | LC_ALL=C sort); do
    [ -f "$f" ] || continue
    checked=$((checked + 1))

    title="$(fm_title "$f")"
    if [ -z "$title" ]; then
        bad "$f has a front-matter title" "a title: line" "(none)"
        continue
    fi
    tn="$(printf '%s' "$title" | norm)"

    truth="$(urls_serving_title "$tn")"
    got="$(printf '%s\n' "$f" | SCRIPT from-sources "$DIST" 2>/dev/null)"

    if [ -z "$truth" ]; then
        # No built page carries this source's title: it is a draft, or a
        # scheduled post whose date has not arrived. `from-sources` must drop
        # it — announcing it would be landing#336's commit-day bug.
        assert_label="$f is not built, so it is not announced"
        if [ -z "$got" ]; then ok "$assert_label"; unbuilt=$((unbuilt + 1))
        else bad "$assert_label" "(nothing)" "$got"; fi
        continue
    fi

    # Built. The announced URL must be one of the pages actually serving this
    # source's title — not merely *a* URL that happens to exist.
    if [ -z "$got" ]; then
        bad "$f is announced at all" "$truth" "(nothing)"
        continue
    fi
    if printf '%s\n' "$truth" | grep -qxF -- "$got"; then
        ok "$f -> $got"
        matched=$((matched + 1))
    else
        bad "$f is announced under the page it renders" "$truth" "$got"
    fi
done

echo "checked $checked collection entries: $matched built-and-correct, $unbuilt correctly withheld"
# A pass with nothing checked is the failure mode this file exists to prevent.
if [ "$checked" -lt 20 ]; then
    bad "the corpus was actually walked" "at least 20 collection entries" "$checked"
fi
if [ "$matched" -lt 20 ]; then
    bad "most entries were live and asserted" "at least 20 built entries" "$matched"
fi

# ---------------------------------------------------------------------------
echo "== the wrong-but-routable neighbour is specifically rejected =="
# ---------------------------------------------------------------------------
# The precise shape of landing#354, pinned so it cannot come back by a
# different route. Both URLs exist and serve 200; only one is the guide.
GUIDE="$(git ls-files 'src/content/connectors/*.md' | LC_ALL=C sort | head -1)"
if [ -z "$GUIDE" ]; then
    bad "there is at least one connector guide to check" "a src/content/connectors/*.md" "(none)"
else
    SLUG="$(basename "$GUIDE" .md)"
    GOT="$(printf '%s\n' "$GUIDE" | SCRIPT from-sources "$DIST" 2>/dev/null)"
    assert_marketing="$DIST/connectors/$SLUG/index.html"
    if [ -r "$assert_marketing" ]; then
        ok "the marketing page /connectors/$SLUG/ exists (so routability cannot discriminate)"
    else
        bad "the marketing page exists" "$assert_marketing" "(missing)"
    fi
    if [ "$GOT" = "/docs/connectors/$SLUG/" ]; then
        ok "the guide is announced as /docs/connectors/$SLUG/"
    else
        bad "the guide is announced as the guide" "/docs/connectors/$SLUG/" "$GOT"
    fi
    if [ "$GOT" = "/connectors/$SLUG/" ]; then
        bad "the guide is NOT announced as the marketing page" "not /connectors/$SLUG/" "$GOT"
    else
        ok "the guide is NOT announced as the marketing page"
    fi
fi

echo
echo "passed: $PASS   failed: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
