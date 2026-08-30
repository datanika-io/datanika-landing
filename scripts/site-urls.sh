#!/usr/bin/env bash
#
# The one computation behind three consumers: "which URLs does this build make
# available, and which of them were not available before" (landing#340, #339, #336).
#
# Called by `.github/workflows/deploy.yml`. Lives in the repo, not inline in the
# workflow, so it can be unit-tested against synthetic trees — see
# `scripts/test-site-urls.sh`, gated in `ci.yml`. Same shape as
# `publish-web-root.sh`, for the same reason.
#
# ---------------------------------------------------------------------------
# Why the build output is the source of truth
#
# The old IndexNow step derived URLs from `git diff HEAD~1 HEAD`. That is wrong
# in both directions at once, and both directions were live bugs:
#
#   * COMMIT DAY (landing#336). A scheduled post's `.md` lands in the diff days
#     before `publishedAt`, so the URL was submitted to Bing/Yandex/Seznam while
#     it still 404'd — `isPostVisible` removes the post from `getStaticPaths`,
#     not merely from listings.
#
#   * PUBLISH DAY (landing#336). The post appears because `daily-rebuild`
#     dispatches a build on an *unchanged* `main`. A git diff cannot see that:
#     the one day the URL is genuinely new is the one day git has nothing to
#     say. Visibility here is a function of the clock, not of a commit.
#
# `dist/<path>/index.html` exists <=> the page is served. That predicate is
# derived from the artifact instead of restating the `publishedAt` rule, so it
# stays correct if the scheduling rule changes, and it answers both days.
#
# ---------------------------------------------------------------------------
# Why there is no `sed` in the path mapping
#
# landing#339: `sed -E 's|\.(astro|md|mdx)$||'` used `|` as the `s` delimiter
# AND as the alternation character. sed read the pattern as `\.(astro`, the
# replacement as `md`, and `mdx)$||` as flags — `unknown option to 's'`. It was
# the second of four seds in a pipeline, the last one succeeded, there was no
# `pipefail`, so the step stayed green for four and a half months while every
# deploy submitted N copies of `https://datanika.io//`.
#
# The mapping below uses bash parameter expansion only. There is no delimiter to
# collide with, nothing to quote, and no exit status to swallow. Fixing the
# delimiter would have left the same class of bug one edit away; removing the
# expression removes the class. `test-site-urls.sh` pins every mapping, so a
# regression is red at PR time rather than invisible for a third of a year.
# ---------------------------------------------------------------------------

set -euo pipefail

# Internal fixtures. Deliberately built (a layout regression test renders them)
# but excluded from the sitemap, so they must not be announced or submitted
# either. Mirrors the `filter` in astro.config.mjs — keep the two in step.
EXCLUDE_PREFIX="/test-fixtures/"

usage() {
    cat >&2 <<'USAGE'
usage:
  site-urls.sh from-dist    <dist-dir>
        Every URL path this build makes available, one per line, sorted.
        `dist/index.html` -> `/`;  `dist/blog/x/index.html` -> `/blog/x/`.

  site-urls.sh from-sources <dist-dir>   < changed-source-paths
        Map changed source files to URL paths, keeping ONLY those the build
        actually produced. Decisions are logged to stderr.

  site-urls.sh probe        <base-url>   < url-paths
        Print "<http-code> <url-path>" per line. Cache-busted, so the answer
        comes from the origin and not from a stale Cloudflare edge entry.

  site-urls.sh titles       <dist-dir>   < url-paths
        Print "<url-path><TAB><title>" read out of the built HTML.
USAGE
    exit 2
}

# ---------------------------------------------------------------------------
# from-dist
# ---------------------------------------------------------------------------
cmd_from_dist() {
    local dist="${1:?usage: site-urls.sh from-dist <dist-dir>}"
    [ -d "$dist" ] || { echo "FAIL: no such dist dir: $dist" >&2; exit 1; }
    dist="${dist%/}"

    local file rel dir url
    while IFS= read -r file; do
        rel="${file#"$dist"/}"          # blog/x/index.html   |   index.html
        dir="${rel%index.html}"         # blog/x/             |   (empty)
        url="/$dir"                     # /blog/x/            |   /
        case "$url" in
            "$EXCLUDE_PREFIX"*) continue ;;
        esac
        printf '%s\n' "$url"
    done < <(find "$dist" -type f -name index.html) | LC_ALL=C sort -u
}

# ---------------------------------------------------------------------------
# from-sources
# ---------------------------------------------------------------------------
# Pure parameter expansion. See the header for why this is not a sed pipeline.
source_to_url() {
    local f="$1" p

    case "$f" in
        *test-fixtures*) return 1 ;;
        src/pages/*)     p="${f#src/pages/}" ;;
        # A content collection's directory name is its route prefix:
        # src/content/blog/x.md -> blog/x ; src/content/connectors/y.md -> connectors/y
        src/content/*)   p="${f#src/content/}" ;;
        *)               return 1 ;;
    esac

    # Strip exactly one known extension.
    case "$p" in
        *.astro) p="${p%.astro}" ;;
        *.mdx)   p="${p%.mdx}" ;;
        *.md)    p="${p%.md}" ;;
        *)       return 1 ;;
    esac

    # index.astro is the directory itself, not a child named "index".
    if [ "$p" = "index" ]; then
        p=""
    else
        case "$p" in
            */index) p="${p%index}" ;;   # keeps the trailing slash
        esac
    fi

    if [ -z "$p" ]; then
        printf '/\n'
    else
        case "$p" in
            */) printf '/%s\n' "$p" ;;
            *)  printf '/%s/\n' "$p" ;;
        esac
    fi
}

cmd_from_sources() {
    local dist="${1:?usage: site-urls.sh from-sources <dist-dir>}"
    local built file url kept=0 skipped=0
    local out
    out="$(mktemp)"

    built="$(cmd_from_dist "$dist")"

    # NOT piped into `sort` — a `while` loop on the left of a pipe runs in a
    # subshell, and the counters below would silently read 0.
    while IFS= read -r file; do
        [ -n "$file" ] || continue
        if ! url="$(source_to_url "$file")"; then
            printf '  skip  %s -> (not a routable source)\n' "$file" >&2
            skipped=$((skipped + 1))
            continue
        fi
        # Set membership against the build, NOT `test -f`. A mapping bug that
        # produced `//` or an empty path — landing#339's exact output — cannot
        # survive this, because `from-dist` never emits either.
        if printf '%s\n' "$built" | LC_ALL=C grep -qxF -- "$url"; then
            printf '  keep  %s -> %s\n' "$file" "$url" >&2
            printf '%s\n' "$url" >> "$out"
            kept=$((kept + 1))
        else
            printf '  skip  %s -> %s (not in build output)\n' "$file" "$url" >&2
            skipped=$((skipped + 1))
        fi
    done

    LC_ALL=C sort -u "$out"
    rm -f "$out"
    printf 'from-sources: %d kept, %d skipped\n' "$kept" "$skipped" >&2
}

# ---------------------------------------------------------------------------
# probe
# ---------------------------------------------------------------------------
# Cache-busting is not optional. Cloudflare caches HTML at the edge for 5
# minutes, so a URL that has just gone live can still answer 404 from cache, and
# a URL that has just been retired can still answer 200. Either would make this
# mechanism announce the wrong thing. A unique query string misses the edge
# cache (the cache key includes it) and the static origin serves the same file.
cmd_probe() {
    local base="${1:?usage: site-urls.sh probe <base-url>}"
    base="${base%/}"
    local nonce="cb=$(date -u +%s)-$$"
    local par="${PROBE_PARALLEL:-8}"

    # `-I URLPATH` substitutes the input line into the argv below, so the path
    # arrives as "$1" inside sh -c and is never re-parsed by a shell.
    xargs -r -P "$par" -I URLPATH sh -c '
        p="$1"; base="$2"; nonce="$3"
        code=$(curl -sS -o /dev/null -m 20 --retry 2 --retry-connrefused \
                    -w "%{http_code}" "${base}${p}?${nonce}" 2>/dev/null)
        case "$code" in ""|*[!0-9]*) code=000 ;; esac
        printf "%s %s\n" "$code" "$p"
    ' _ URLPATH "$base" "$nonce"
}

# ---------------------------------------------------------------------------
# titles
# ---------------------------------------------------------------------------
cmd_titles() {
    local dist="${1:?usage: site-urls.sh titles <dist-dir>}"
    dist="${dist%/}"
    local url f title
    while IFS= read -r url; do
        [ -n "$url" ] || continue
        f="$dist${url}index.html"
        title=""
        if [ -r "$f" ]; then
            # `awk NR==1` rather than `head -1`: head closes the pipe early, and
            # the resulting SIGPIPE upstream is a pipefail failure. That trap
            # already cost this repo one red deploy (publish-web-root.sh prune).
            title="$(tr '\n' ' ' < "$f" \
                     | grep -o '<title>[^<]*</title>' \
                     | awk 'NR==1' \
                     | sed -e 's|<title>||' -e 's|</title>||')"
        fi
        # The handful of entities Astro emits inside a <title>. `&amp;` is
        # decoded LAST so `&amp;lt;` yields `&lt;` rather than `<`.
        #
        # ⚠️ Every replacement is quoted. Since bash 5.2 an UNQUOTED `&` in the
        # replacement of `${v//p/r}` expands to the matched text, sed-style — so
        # `${title//&amp;/&}` is a no-op that looks exactly like a fix. Caught by
        # test-site-urls.sh, not by reading.
        title="${title//&#39;/\'}"
        title="${title//&#x27;/\'}"
        title="${title//&quot;/'"'}"
        title="${title//&lt;/'<'}"
        title="${title//&gt;/'>'}"
        title="${title//&amp;/'&'}"
        # Trim the site-name suffix Layout.astro appends. The consumer of this
        # is a message that already says which site it is about, so "… —
        # Datanika Blog" on every line is pure noise. `%` (shortest suffix), not
        # `%%`: a title that legitimately contains "— Datanika" mid-sentence
        # must lose only the trailing one.
        title="${title% — Datanika*}"
        title="${title% | Datanika*}"
        [ -n "$title" ] || title="$url"
        printf '%s\t%s\n' "$url" "$title"
    done
}

case "${1:-}" in
    from-dist)    shift; cmd_from_dist "$@" ;;
    from-sources) shift; cmd_from_sources "$@" ;;
    probe)        shift; cmd_probe "$@" ;;
    titles)       shift; cmd_titles "$@" ;;
    *)            usage ;;
esac
