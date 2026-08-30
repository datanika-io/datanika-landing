#!/usr/bin/env bash
#
# Harness for `scripts/site-urls.sh` (landing#340 / #339 / #336). Gated in
# `ci.yml` alongside `test-publish-web-root.sh`.
#
# Why this exists rather than trusting review: landing#339 was a one-character
# defect in a shell one-liner inside a workflow, and it survived four and a half
# months of green deploys because every available signal — `bash -e`, the step's
# exit code, IndexNow's HTTP 200 — was green while the feature did nothing. The
# only thing that could have caught it is an assertion on the mapping's OUTPUT.
#
# Every test below was run against a deliberately re-broken `site-urls.sh` (the
# original `sed -E 's|\.(astro|md|mdx)$||'` put back) and went red. A test that
# has never failed has never been shown to be able to.
#
# Usage: bash scripts/test-site-urls.sh

set -uo pipefail

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/site-urls.sh"

# Invoked through `bash`, exactly as ci.yml and deploy.yml invoke it. The
# script is committed 100644 like its sibling publish-web-root.sh, so calling
# it directly is `Permission denied` on Linux — and MSYS fakes the exec bit,
# so a local run passes and CI does not. Caught by CI on the first push of
# this harness, which is the whole argument for running a new test against
# its real consumer rather than only against the machine that wrote it.
SCRIPT() { bash "$SCRIPT_PATH" "$@"; }
PASS=0
FAIL=0

ok()   { PASS=$((PASS + 1)); printf '  ok   %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); printf '  FAIL %s\n       expected: %s\n       actual:   %s\n' "$1" "$2" "$3"; }

assert_eq() {  # <label> <expected> <actual>
    if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "$2" "$3"; fi
}

assert_contains() {  # <label> <needle> <haystack>
    case "$3" in
        *"$2"*) ok "$1" ;;
        *)      bad "$1" "contains: $2" "$3" ;;
    esac
}

assert_not_contains() {  # <label> <needle> <haystack>
    case "$3" in
        *"$2"*) bad "$1" "does NOT contain: $2" "$3" ;;
        *)      ok "$1" ;;
    esac
}

TMP="$(mktemp -d)"
# Tolerant on purpose: on Windows the just-killed static server can still hold
# its cwd, and a noisy cleanup failure must not look like a test result.
trap 'rm -rf "$TMP" 2>/dev/null || true' EXIT

# ---------------------------------------------------------------------------
# A synthetic build. `/blog/scheduled-post/` is deliberately ABSENT: that is the
# state of a post whose `publishedAt` is still in the future.
# ---------------------------------------------------------------------------
DIST="$TMP/dist"
page() {  # <path-under-dist> <title>
    mkdir -p "$DIST/$(dirname "$1")"
    printf '<!doctype html>\n<html><head>\n<title>%s</title>\n</head><body>x</body></html>\n' "$2" > "$DIST/$1"
}
page "index.html"                              "Datanika — Home"
page "blog/index.html"                         "Blog — Datanika"
page "blog/live-post/index.html"               "A Live Post — Datanika Blog"
page "blog/quoted-post/index.html"             "It&#39;s Fine &amp; Good — Datanika Blog"
page "blog/dashed-post/index.html"             "Why — Datanika Style — Wins — Datanika Blog"
page "pricing/index.html"                      "Pricing, Per-GB | Datanika"
page "docs/getting-started/index.html"         "Getting Started"
page "docs/guides/deep/index.html"             "Deep Guide"
page "connectors/mysql/index.html"             "MySQL Connector"
page "test-fixtures/layout-fixture/index.html" "Fixture"
# Non-page build output must never become a URL.
mkdir -p "$DIST/_astro"
printf 'body{}' > "$DIST/_astro/a.css"
printf 'not a page' > "$DIST/404.html"

echo "== from-dist =="
ALL="$(SCRIPT from-dist "$DIST")"
assert_eq "root maps to /" \
    "/" "$(printf '%s\n' "$ALL" | head -1)"
assert_contains "nested page becomes a directory URL" "/docs/guides/deep/" "$ALL"
assert_contains "collection page is present" "/connectors/mysql/" "$ALL"
assert_not_contains "test-fixtures are excluded (mirrors the sitemap filter)" "/test-fixtures/" "$ALL"
assert_not_contains "404.html is not a URL" "404" "$ALL"
assert_not_contains "assets are not URLs" "_astro" "$ALL"
assert_eq "one line per built page" "9" "$(printf '%s\n' "$ALL" | grep -c .)"
assert_eq "output is sorted and unique" "$ALL" "$(printf '%s\n' "$ALL" | LC_ALL=C sort -u)"
assert_not_contains "no doubled slash anywhere (landing#339's signature)" "//" "$ALL"

OUT="$(SCRIPT from-dist "$TMP/nope" 2>&1)"; RC=$?
assert_eq "missing dist dir is a hard failure" "1" "$RC"
assert_contains "...and says so" "no such dist dir" "$OUT"

echo "== from-sources: the mapping landing#339 broke =="
map() { printf '%s\n' "$1" | SCRIPT from-sources "$DIST" 2>/dev/null; }

assert_eq "content collection file -> collection route" \
    "/blog/live-post/" "$(map 'src/content/blog/live-post.md')"
assert_eq "second collection uses its own directory name" \
    "/connectors/mysql/" "$(map 'src/content/connectors/mysql.md')"
assert_eq "page route, extension stripped" \
    "/docs/getting-started/" "$(map 'src/pages/docs/getting-started.astro')"
assert_eq "deeply nested page route" \
    "/docs/guides/deep/" "$(map 'src/pages/docs/guides/deep.astro')"
assert_eq "index.astro is the site root, not /index/" \
    "/" "$(map 'src/pages/index.astro')"
assert_eq "a directory's index.astro is that directory" \
    "/blog/" "$(map 'src/pages/blog/index.astro')"
assert_eq ".mdx is stripped like .md" \
    "/docs/getting-started/" "$(map 'src/pages/docs/getting-started.mdx')"

echo "== from-sources: what must be dropped =="
assert_eq "a post not in the build is dropped (landing#336, commit day)" \
    "" "$(map 'src/content/blog/scheduled-post.md')"
assert_eq "a dynamic route template is dropped" \
    "" "$(map 'src/pages/blog/[id].astro')"
assert_eq "test fixtures are dropped" \
    "" "$(map 'src/pages/test-fixtures/layout-fixture.astro')"
assert_eq "a file outside the routable trees is dropped" \
    "" "$(map 'README.md')"
assert_eq "a non-page file inside src/pages is dropped" \
    "" "$(map 'src/pages/styles.css')"
assert_eq "empty input yields nothing" \
    "" "$(printf '' | SCRIPT from-sources "$DIST" 2>/dev/null)"

echo "== from-sources: the landing#339 regression pins =="
# The broken sed produced an empty `url`, which the old `case` turned into `//`,
# so every changed file collapsed onto `https://datanika.io//`. Both halves of
# that signature are pinned: nothing may map to a doubled slash, and N distinct
# inputs may not collapse onto one output.
MANY="$(printf '%s\n' \
    'src/content/blog/live-post.md' \
    'src/content/blog/quoted-post.md' \
    'src/pages/docs/getting-started.astro' \
    'src/pages/docs/guides/deep.astro' \
    'src/content/connectors/mysql.md' | SCRIPT from-sources "$DIST" 2>/dev/null)"
assert_eq "five distinct sources stay five distinct URLs" \
    "5" "$(printf '%s\n' "$MANY" | grep -c .)"
assert_not_contains "no result is a doubled slash" "//" "$MANY"
assert_eq "a source that maps to nothing does not become the site root" \
    "" "$(map 'src/content/blog/scheduled-post.md')"

echo "== from-sources: decisions are logged, and the log names the reason =="
LOG="$(printf 'src/content/blog/scheduled-post.md\n' | SCRIPT from-sources "$DIST" 2>&1 >/dev/null)"
assert_contains "a dropped URL says why" "not in build output" "$LOG"
LOG2="$(printf 'src/content/blog/live-post.md\n' | SCRIPT from-sources "$DIST" 2>&1 >/dev/null)"
assert_contains "a kept URL is shown with its mapping" "-> /blog/live-post/" "$LOG2"
assert_contains "a summary count is printed" "1 kept, 0 skipped" "$LOG2"

echo "== titles =="
assert_eq "title comes out of the built HTML, site suffix trimmed" \
    "/blog/live-post/	A Live Post" \
    "$(printf '/blog/live-post/\n' | SCRIPT titles "$DIST")"
assert_eq "HTML entities in a title are decoded" \
    "/blog/quoted-post/	It's Fine & Good" \
    "$(printf '/blog/quoted-post/\n' | SCRIPT titles "$DIST")"
assert_eq "only the TRAILING site suffix is trimmed, not an interior dash" \
    "/blog/dashed-post/	Why — Datanika Style — Wins" \
    "$(printf '/blog/dashed-post/\n' | SCRIPT titles "$DIST")"
assert_eq "the pipe-separated suffix is trimmed too" \
    "/pricing/	Pricing, Per-GB" \
    "$(printf '/pricing/\n' | SCRIPT titles "$DIST")"
assert_eq "root title" \
    "/	Datanika — Home" \
    "$(printf '/\n' | SCRIPT titles "$DIST")"
assert_eq "an unbuilt path falls back to the URL rather than an empty label" \
    "/blog/scheduled-post/	/blog/scheduled-post/" \
    "$(printf '/blog/scheduled-post/\n' | SCRIPT titles "$DIST")"
assert_eq "two paths in, two lines out" \
    "2" "$(printf '/\n/blog/\n' | SCRIPT titles "$DIST" | grep -c .)"

echo "== probe =="
# The probe is the mechanism's only claim about the outside world, so it is
# exercised against a real server rather than mocked: a 200 and a 404 must be
# distinguishable, and the cache-busting query must not leak into the reported
# path. Needs any Python for a throwaway static server — `python3` on CI,
# `python` in Git Bash. Skipped, loudly, if neither is present.
PY=""
command -v python3 >/dev/null 2>&1 && PY=python3
[ -n "$PY" ] || { command -v python >/dev/null 2>&1 && PY=python; }
if [ -n "$PY" ]; then
    PORT=$(( 8700 + (RANDOM % 900) ))
    NONCE="harness-$$-$RANDOM"
    printf '%s' "$NONCE" > "$DIST/sentinel.txt"

    # `( cd … && exec … ) &` so `$!` is the server's own pid. The obvious
    # `( cd … && server & echo $! )` records the *sub-subshell's* pid, the kill
    # misses the server, and the next run silently probes the PREVIOUS run's
    # server on the same port — which is a flaky red that looks like a logic
    # bug. Observed once before this was written.
    ( cd "$DIST" && exec "$PY" -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 ) &
    SRV=$!

    # Readiness is checked against a nonce unique to this run, not against a
    # bare 200: a leftover server answers 200 too, and would be tested instead.
    READY=""
    for _ in $(seq 1 30); do
        if [ "$(curl -sS -m 2 "http://127.0.0.1:$PORT/sentinel.txt" 2>/dev/null)" = "$NONCE" ]; then
            READY=1; break
        fi
        sleep 0.5
    done
    [ -n "$READY" ] || bad "static server for the probe tests came up" "$NONCE on :$PORT" "(never)"

    PROBE="$(printf '/\n/blog/live-post/\n/blog/scheduled-post/\n' \
             | SCRIPT probe "http://127.0.0.1:$PORT" | LC_ALL=C sort -k2)"
    kill "$SRV" 2>/dev/null || true
    wait "$SRV" 2>/dev/null || true
    assert_contains "a served page probes 200" "200 /blog/live-post/" "$PROBE"
    assert_contains "an absent page probes 404" "404 /blog/scheduled-post/" "$PROBE"
    assert_contains "the site root probes 200" "200 /" "$PROBE"
    assert_not_contains "the cache-bust nonce never appears in a reported path" "cb=" "$PROBE"
    assert_eq "three paths in, three verdicts out" "3" "$(printf '%s\n' "$PROBE" | grep -c .)"
    # Same port, now that the server is stopped — a guaranteed-closed target
    # rather than a hardcoded one that some other process might be holding.
    assert_eq "an unreachable host reports 000, not a crash" \
        "000 /" "$(printf '/\n' | SCRIPT probe "http://127.0.0.1:$PORT" 2>/dev/null)"
else
    echo "  SKIP probe tests — no python interpreter for a throwaway static server"
fi

echo
printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
