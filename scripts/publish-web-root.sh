#!/usr/bin/env bash
#
# Publish a built Astro `dist/` to the live web root atomically (landing#301).
#
# Called by `.github/workflows/deploy.yml` over SSH on Aweb, after `npm run
# build`. Lives in the repo rather than inline in the workflow so it can be
# rehearsed against scratch paths before it is ever pointed at production —
# which is how the one-time conversion branch and the prune guard below were
# actually exercised. Same shape as core's `scripts/deploy-bluegreen.sh`.
#
# Usage:  publish-web-root.sh <dist-dir> [live-path] [releases-dir]
#
# ---------------------------------------------------------------------------
# What this replaces, and why
#
# The old deploy step was a single line:
#
#     cp -r dist/* /var/www/datanika.io/
#
# which is wrong twice over:
#
#   1. NON-ATOMIC. It writes the *live* root in place over several seconds.
#      Interrupt it — a cancelled workflow run, a dropped SSH session, a
#      failure partway — and the site serves new HTML referencing `_astro/`
#      hashes that were never copied. Nothing reports it; the site is just
#      broken until someone deploys again.
#
#   2. APPEND-ONLY. `cp` never removes. A page deleted or renamed in the repo
#      keeps serving from disk indefinitely. Measured on Aweb 2026-08-30:
#      24 orphan files / 1020 KB with no corresponding build output, including
#      two Astro SSR manifests last produced 2026-04-12 and a raw
#      `/docs/connectors/google-ads/README.md` still returning HTTP 200.
#
# The fix is release directories plus a symlink swap. `rename(2)` over an
# existing symlink is atomic, so a request gets the whole old release or the
# whole new one — never a mix. Deletions propagate for free, because every
# release directory is populated fresh from `dist/`.
#
# `rsync -a --delete` was the other candidate and is NOT equivalent: it still
# mutates the live root file-by-file, so it addresses (2) and not (1). It also
# has to be trusted not to delete anything hand-placed. Checked empirically
# before choosing: the web root holds no dotfiles, no `.well-known/`, and
# nothing outside build output — TLS is a Cloudflare Origin cert, so there is
# no ACME challenge path to preserve.
# ---------------------------------------------------------------------------
set -euo pipefail

DIST="${1:?usage: publish-web-root.sh <dist-dir> [live-path] [releases-dir]}"
LIVE="${2:-/var/www/datanika.io}"
RELEASES="${3:-/var/www/datanika.io-releases}"
KEEP="${KEEP_RELEASES:-5}"

# Release names sort lexically by time, and carry the source commit so the
# serving revision is readable from `readlink` alone.
#
# ⚠️ `SOURCE_SHA` is load-bearing, not a convenience (landing#388). The site is
# now built on the GitHub runner and only `dist/` is shipped here, so the commit
# that produced these bytes is NOT necessarily the commit this box's checkout is
# sitting on: the deploy still `git pull`s to fetch *this script*, and a queued
# newer deploy can move `main` in between.
#
# The git probe below also fails in the reassuring direction. `git -C` on a
# directory outside any working tree exits non-zero, `2>/dev/null || echo nogit`
# swallows it, and every release silently becomes `<stamp>-nogit` — destroying
# the single property the name exists for, which is `readlink -f` telling an
# incident responder which commit is serving. Nothing would have reported that;
# the deploy stays green and the site is correct. So the caller passes the SHA
# it actually built, and the git probe is kept ONLY for the manual fallback in
# CLAUDE.md, which still runs from inside the checkout with a relative `dist`.
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SHA="${SOURCE_SHA:-$(git -C "$(dirname "$DIST")" rev-parse --short HEAD 2>/dev/null || echo nogit)}"

mkdir -p "$RELEASES"

# --- allocate a release directory that is guaranteed NOT to be in use -------
#
# ⚠️ This loop replaces `rm -rf "$REL"; mkdir -p "$REL"`, which was a live-site
# destroyer and was caught by rehearsing this script rather than by reading it.
# The name is `<second-granularity timestamp>-<short sha>`, so two runs of the
# SAME COMMIT inside ONE SECOND collide — and `rm -rf` on the colliding name
# deletes the tree the live symlink is currently pointing at, in place. That is
# exactly the torn web root this whole change exists to prevent, and the unwind
# path made it worse: a bad build would then fail verification having already
# emptied the live release, leaving the site serving an empty directory.
#
# Not hypothetical, and not rare in the direction that matters: re-running a
# failed deploy on the same SHA is the most common manual action there is, and
# making the concurrency group QUEUE instead of cancel (landing#301, the other
# half of this fix) means two runs of one commit can now execute back to back
# rather than one killing the other.
#
# `mkdir` without `-p` fails when the directory exists, so the create IS the
# collision test — no TOCTOU gap between checking and claiming. And the script
# now never removes anything outside the explicit prune step below, which
# already refuses to touch the live target.
REL="$RELEASES/$STAMP-$SHA"
_n=0
until mkdir "$REL" 2>/dev/null; do
    _n=$((_n + 1))
    if [ "$_n" -gt 50 ]; then
        echo "FAIL: could not allocate a release directory under $RELEASES"
        exit 1
    fi
    REL="$RELEASES/$STAMP-$SHA.$_n"
done

echo "publish: dist=$DIST live=$LIVE release=$REL"

# --- stage -----------------------------------------------------------------
cp -a "$DIST/." "$REL/"

# --- verify BEFORE the live root is touched --------------------------------
# A failure here must leave the previous release serving, untouched. Same
# principle as the pre-repoint assertions in core's deploy-bluegreen.sh: assert
# against the thing you are about to promote, while the old one still serves.
test -s "$REL/index.html"        || { echo "FAIL: $REL/index.html missing or empty"; exit 1; }
test -d "$REL/_astro"            || { echo "FAIL: $REL/_astro missing"; exit 1; }
grep -q '<html' "$REL/index.html" || { echo "FAIL: $REL/index.html is not HTML"; exit 1; }
echo "verified: $(find "$REL" -type f | wc -l) files staged"

# --- swap ------------------------------------------------------------------
if [ -L "$LIVE" ]; then
    # Steady state. Build the new link at a temp path and rename it over the
    # live one: `ln -sfn` on its own is unlink-then-symlink, which leaves a
    # window with nothing there at all.
    ln -sfn "$REL" "$LIVE.new"
    mv -T "$LIVE.new" "$LIVE"
elif [ -e "$LIVE" ]; then
    # One-time conversion from the legacy real directory. Renaming it to a NEW
    # name is itself atomic; the gap before the symlink exists is
    # sub-millisecond and happens exactly once per host. The old tree is kept,
    # never deleted — an unattended `rm -rf` on a live web root is not something
    # a deploy should be able to do, and the orphans in it are the only record
    # of what the append-only era accumulated.
    echo "NOTE: $LIVE is a real directory — converting to a symlink once (landing#301)"
    mv "$LIVE" "$LIVE.pre-symlink-$STAMP"
    ln -s "$REL" "$LIVE"
else
    # Fresh host.
    ln -s "$REL" "$LIVE"
fi

# --- prune -----------------------------------------------------------------
# Keep the newest $KEEP releases. Never remove the one being served: resolve
# the live symlink and skip it explicitly, rather than trusting mtime ordering
# to have placed it in the head of the list.
#
# Built as one command substitution rather than an `ls | tail | while` pipeline
# on purpose: under `set -o pipefail` a SIGPIPE from the head of that pipeline
# fails the whole script *after* the swap has already succeeded, turning a
# healthy deploy into a red run.
CURRENT="$(readlink -f "$LIVE")"
# ⚠️ Ordering here is NOT reliable when several releases land in the same second,
# and the live-release guard below is what makes that survivable. Do not "tidy"
# this into a name sort — measured, landing#415:
#
#   * mtimes TIE at same-second granularity, so `ls -t` falls back to a name
#     tiebreak unrelated to creation order.
#   * and sorting by name is no better, because the collision-suffix allocator
#     above RECYCLES freed names: once a prune removes `<stamp>-<sha>`, the next
#     publish in that same second re-claims the unsuffixed base, so the NEWEST
#     release can sort before older `.1`/`.2` siblings.
#
# Consequence is cosmetic and bounded: the wrong directory can be pruned and one
# extra release can survive. The live release is never removed. Real deploys are
# minutes apart, so neither condition arises in production — it is reachable only
# by same-second re-runs. Tracked separately rather than fixed here.
STALE="$(ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +"$((KEEP + 1))" || true)"
if [ -n "$STALE" ]; then
    while read -r d; do
        [ -n "$d" ] || continue
        if [ "$(readlink -f "$d")" = "$CURRENT" ]; then
            echo "prune: skipping live release $d"
            continue
        fi
        echo "prune: removing $d"
        rm -rf "$d"
    done <<< "$STALE"
fi

echo "published: $LIVE -> $CURRENT"
