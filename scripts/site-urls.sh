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
# What `from-sources` does and does not promise (landing#354)
#
# SOUND, and now asserted: every URL it emits is a URL the changed source
# actually renders. That is the property landing#354 broke and the property
# `scripts/test-url-correspondence.sh` checks against the built artifact.
#
# NOT COMPLETE, and deliberately so for now: not every changed page is
# announced. Two known gaps, both accepted explicitly rather than half-fixed:
#
#   * `src/data/connectors.ts` builds all of `/connectors/*` and is under
#     neither `src/pages` nor `src/content`, so `deploy.yml`'s pathspec never
#     sees it. Editing one connector's blurb would have to announce ~36 URLs to
#     be correct, and announcing 36 pages because one line moved is its own kind
#     of wrong. Left unannounced on purpose.
#   * A shared component (`src/components/Pricing.astro` renders on `/` AND
#     `/pricing/`) legitimately maps to many URLs. Deriving that set is a real
#     problem, not an oversight.
#
# The asymmetry is the point: a MISSED announcement costs a delayed recrawl; a
# WRONG announcement hands a crawler a page that did not change and hides the
# one that did. Soundness first.
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
# Exit status is three-valued:
#   0  -> a URL was printed
#   1  -> this source is not routable; the caller skips it
#   2  -> this source IS routable but we do not know where it renders. FATAL.
#         See the collection block below for why that is not a skip.
source_to_url() {
    local f="$1" p rest coll slugpath

    case "$f" in
        *test-fixtures*) return 1 ;;
    esac

    # Only these three extensions describe a route at all. Checked up front so
    # an image or a helper sitting beside a post is an ordinary skip and never
    # reaches the fatal branch below.
    case "$f" in
        *.astro|*.md|*.mdx) ;;
        *) return 1 ;;
    esac

    case "$f" in
        src/pages/*)     p="${f#src/pages/}" ;;
        src/content/*)
            # ⚠️ A collection's DIRECTORY NAME IS NOT ITS ROUTE PREFIX. Assuming
            # it was is landing#354. A collection is routed by wherever the page
            # that calls `getCollection("<name>")` happens to live:
            #
            #   src/content/blog/x.md        src/pages/blog/[id].astro
            #                             -> /blog/x/                    (agrees)
            #   src/content/connectors/y.md  src/pages/docs/connectors/[slug].astro
            #                             -> /docs/connectors/y/         (does NOT)
            #
            # `/connectors/y/` is a different page, built from the plain TS array
            # in src/data/connectors.ts. It is real and serves 200 — which is
            # exactly why the swapped mapping passed every gate for 36 guides:
            # `from-sources` filters on ROUTABILITY, and the wrong URL is
            # routable. Correspondence to the changed source is the invariant
            # that matters, and `test-url-correspondence.sh` is where it is now
            # asserted, against the built artifact rather than against this list.
            #
            # There is deliberately NO convention fallback. An unrecognised
            # collection is fatal, not a silent skip: a skip is how 36 changed
            # guides went unannounced without anything going red.
            rest="${f#src/content/}"
            coll="${rest%%/*}"
            slugpath="${rest#*/}"
            case "$coll" in
                blog)       p="blog/$slugpath" ;;
                connectors) p="docs/connectors/$slugpath" ;;
                *)          return 2 ;;
            esac
            ;;
        *)               return 1 ;;
    esac

    # Strip exactly one known extension.
    case "$p" in
        *.astro) p="${p%.astro}" ;;
        *.mdx)   p="${p%.mdx}" ;;
        *.md)    p="${p%.md}" ;;
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
    local built file url rc kept=0 skipped=0
    local out
    out="$(mktemp)"

    built="$(cmd_from_dist "$dist")"

    # NOT piped into `sort` — a `while` loop on the left of a pipe runs in a
    # subshell, and the counters below would silently read 0.
    while IFS= read -r file; do
        [ -n "$file" ] || continue
        rc=0
        url="$(source_to_url "$file")" || rc=$?
        if [ "$rc" -eq 2 ]; then
            # Loud on purpose. This step runs AFTER the atomic publish, so the
            # site is already live and correct; what is at stake is only whether
            # the announcement is right. A red run plus a Telegram alert is the
            # cheap outcome. Silently announcing nothing — or worse, announcing
            # a neighbouring page that happens to exist — is landing#354.
            printf 'FAIL: %s belongs to a content collection with no route mapping.\n' "$file" >&2
            printf '      Add it to source_to_url() in scripts/site-urls.sh.\n' >&2
            printf '      The route is the page that calls getCollection() on the\n' >&2
            printf '      collection, NOT the collection directory name (landing#354).\n' >&2
            rm -f "$out"
            exit 1
        elif [ "$rc" -ne 0 ]; then
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
