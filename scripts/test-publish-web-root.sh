#!/usr/bin/env bash
#
# Tests for `scripts/publish-web-root.sh` (landing#301).
#
# Runs in CI on ubuntu (`.github/workflows/ci.yml`, the `build` job — the
# required check on `dev`). Self-contained: a temp dir, no root, no network,
# no nginx. Every case is about the *live root*, because that is the thing a
# deploy can break in a way nothing reports.
#
# ⚠️ This harness is not decoration. It was written before the script shipped
# and it went RED on the first run, catching a live-site destroyer that reading
# the script had not: release directories are named
# `<second-granularity timestamp>-<short sha>`, so two runs of the SAME COMMIT
# inside ONE SECOND produced the same path, and the staging step's
# `rm -rf "$REL"` then deleted the tree the live symlink was pointing at — in
# place, mid-serve. On the bad-build path it was worse: verification failed
# *after* the live release had been emptied, so the site was left serving an
# empty directory by the code whose entire purpose is to never do that.
#
# Case 2 below is that regression, kept permanently. See also WORKFLOW_RULES §3:
# "run your new test against the broken version" — a test that has never failed
# has never been shown to be able to.
set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/publish-web-root.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

# ⚠️ Git Bash / MSYS on Windows does not create real symlinks by default — `ln -s`
# silently copies instead (`MSYS=winsymlinks:nativestrict` and Developer Mode
# change that, but neither is on by default). Every assertion here is about a
# symlink swap, so on such a host the suite goes red for a reason that has
# nothing to do with the code under test. A spurious red is not harmless: it
# trains the next reader to ignore this file, which is the same failure as a
# test that cannot fail, pointed the other way.
#
# So probe the CAPABILITY rather than guessing from `uname`, and skip loudly.
# Deploys run on Ubuntu and CI runs `ubuntu-latest`, which is where the coverage
# actually lives.
printf x > "$T/.probe-target"
ln -s "$T/.probe-target" "$T/.probe-link" 2>/dev/null || true
if [ ! -L "$T/.probe-link" ]; then
    echo "SKIP: this shell cannot create symlinks (Git Bash/MSYS on Windows)."
    echo "      publish-web-root.sh is a symlink-swap script, so these tests are"
    echo "      meaningless here. They run for real in CI on ubuntu-latest."
    exit 0
fi
rm -f "$T/.probe-link" "$T/.probe-target"

LIVE="$T/live"
RELS="$T/releases"
pass=0
fail=0

chk() {
    if [ "$2" = "$3" ]; then
        echo "  PASS  $1"
        pass=$((pass + 1))
    else
        echo "  FAIL  $1 — expected [$3], got [$2]"
        fail=$((fail + 1))
    fi
}

# A minimal but structurally valid Astro build output.
mkdist() {
    rm -rf "$1"
    mkdir -p "$1/_astro"
    printf '<html><body>%s</body></html>\n' "$2" > "$1/index.html"
    echo "css-$2" > "$1/_astro/main.css"
    echo "$2" > "$1/marker-$2.txt"
}

echo "### 1 — legacy real directory converts to a symlink, once"
mkdir -p "$LIVE"
echo "<html>old</html>" > "$LIVE/index.html"
echo orphan > "$LIVE/ORPHAN.txt"
mkdist "$T/dist1" one
KEEP_RELEASES=3 bash "$SCRIPT" "$T/dist1" "$LIVE" "$RELS" > "$T/log1" 2>&1
chk "exits 0" "$?" "0"
chk "live path is now a symlink" "$([ -L "$LIVE" ] && echo yes || echo no)" "yes"
chk "serves the new build" "$(cat "$LIVE/index.html")" "<html><body>one</body></html>"
chk "legacy tree preserved, not deleted" \
    "$(ls -d "$LIVE".pre-symlink-* > /dev/null 2>&1 && echo yes || echo no)" "yes"
chk "legacy orphan no longer served" "$([ -e "$LIVE/ORPHAN.txt" ] && echo yes || echo no)" "no"
R1="$(readlink -f "$LIVE")"

echo "### 2 — REGRESSION: same-second re-run of the same SHA (see header)"
mkdist "$T/dist2" two
KEEP_RELEASES=3 bash "$SCRIPT" "$T/dist2" "$LIVE" "$RELS" > "$T/log2" 2>&1
chk "exits 0" "$?" "0"
chk "allocates a DIFFERENT release dir" \
    "$([ "$(readlink -f "$LIVE")" != "$R1" ] && echo yes || echo no)" "yes"
chk "previous release left intact" "$(cat "$R1/index.html" 2>/dev/null)" "<html><body>one</body></html>"
chk "serves the new build" "$(cat "$LIVE/index.html")" "<html><body>two</body></html>"
chk "a removed file stops being served" "$([ -e "$LIVE/marker-one.txt" ] && echo yes || echo no)" "no"
R2="$(readlink -f "$LIVE")"

# The unwind path. A green deploy proves the happy path and says nothing about
# what happens when verification fails; these three are the only evidence that
# a bad build leaves the site alone.
echo "### 3 — a bad build must leave the previous release serving"
run_bad() {
    KEEP_RELEASES=3 bash "$SCRIPT" "$1" "$LIVE" "$RELS" > "$T/logbad" 2>&1
    local rc=$?
    chk "$2 — exits non-zero" "$([ "$rc" -ne 0 ] && echo yes || echo no)" "yes"
    chk "$2 — live target unchanged" "$(readlink -f "$LIVE")" "$R2"
    chk "$2 — STILL SERVES the previous build" \
        "$(cat "$LIVE/index.html" 2>/dev/null)" "<html><body>two</body></html>"
}
rm -rf "$T/bad1"; mkdir -p "$T/bad1/_astro"; : > "$T/bad1/index.html"
run_bad "$T/bad1" "empty index.html"
rm -rf "$T/bad2"; mkdir -p "$T/bad2/_astro"; echo "not html" > "$T/bad2/index.html"
run_bad "$T/bad2" "index.html is not HTML"
rm -rf "$T/bad3"; mkdir -p "$T/bad3"; echo "<html>x</html>" > "$T/bad3/index.html"
run_bad "$T/bad3" "no _astro directory"

echo "### 4 — prune keeps KEEP releases and never removes the live one"
# ⚠️ The `sleep 1` is REQUIRED and is not padding (landing#415). Without it all
# five publishes land in one or two seconds, and this case failed ~1 run in 3 —
# on a check that GATES `dev`. Diagnosed in a container rather than guessed:
# prune frees `<stamp>-<sha>`, the collision allocator then RE-CLAIMS that
# unsuffixed base name for the next publish, and the newest release ends up
# sorting before its own `.1`/`.2` siblings. So it lands in the stale set, the
# live-release guard skips it, and KEEP+1 directories survive.
#
# One second apart is also the only realistic shape: production deploys are
# minutes apart. The same-second path is still covered — deliberately — by case 2,
# which is what asserts the allocator never destroys a live release. Do NOT remove
# the sleeps to "speed up CI": that trades five seconds for an intermittent red
# that trains people to re-run a required check until it passes.
for i in 5 6 7 8 9; do
    mkdist "$T/dist$i" "v$i"
    KEEP_RELEASES=2 bash "$SCRIPT" "$T/dist$i" "$LIVE" "$RELS" > "$T/logp$i" 2>&1
    sleep 1
done
chk "release count == KEEP" "$(ls -1d "$RELS"/*/ 2>/dev/null | wc -l | tr -d ' ')" "2"
chk "live target still exists on disk" \
    "$([ -d "$(readlink -f "$LIVE")" ] && echo yes || echo no)" "yes"
chk "serves the newest build" "$(cat "$LIVE/index.html")" "<html><body>v9</body></html>"

echo "### 5 — fresh host with no live path at all"
mkdist "$T/dist10" fresh
bash "$SCRIPT" "$T/dist10" "$T/live2" "$T/rel2" > "$T/log10" 2>&1
chk "exits 0" "$?" "0"
chk "creates the symlink" "$([ -L "$T/live2" ] && echo yes || echo no)" "yes"
chk "serves" "$(cat "$T/live2/index.html")" "<html><body>fresh</body></html>"

echo "### 6 — the release name carries the SOURCE commit (landing#388)"
# Since the build moved to the GitHub runner, `dist/` no longer lives inside the
# checkout, so the script's git fallback cannot see a working tree. Every dist
# used in this file is already in that position (parent is $T, not a repo), so
# these two cases are the real deployed shapes rather than a contrivance.
#
# The negative control is the point. Without SOURCE_SHA the name degrades to
# `-nogit`, and it degrades SILENTLY: the deploy still exits 0 and the site is
# byte-correct, only `readlink -f` stops naming the serving commit. A test that
# asserted "publishes successfully" would pass in both directions and prove
# nothing, which is why these assert the NAME, not the outcome.
mkdist "$T/dist11" sha
SOURCE_SHA=deadbee bash "$SCRIPT" "$T/dist11" "$T/live3" "$T/rel3" > "$T/log11" 2>&1
chk "exits 0" "$?" "0"
chk "release dir ends with the passed sha" \
    "$(basename "$(readlink -f "$T/live3")" | sed 's/.*-//')" "deadbee"

mkdist "$T/dist12" nosha
bash "$SCRIPT" "$T/dist12" "$T/live4" "$T/rel4" > "$T/log12" 2>&1
chk "NEGATIVE CONTROL: without SOURCE_SHA an out-of-tree dist degrades to nogit" \
    "$(basename "$(readlink -f "$T/live4")" | sed 's/.*-//')" "nogit"

# And the fallback must still work for the manual path in CLAUDE.md, which runs
# `publish-web-root.sh dist` from inside the checkout. Build a throwaway repo so
# this asserts the git probe still resolves rather than merely not crashing.
if git init -q "$T/repo" 2>/dev/null; then
    git -C "$T/repo" config user.email t@example.com
    git -C "$T/repo" config user.name t
    echo x > "$T/repo/f"
    git -C "$T/repo" add f
    git -C "$T/repo" commit -qm init
    EXPECT="$(git -C "$T/repo" rev-parse --short HEAD)"
    mkdist "$T/repo/dist" inrepo
    ( cd "$T/repo" && bash "$SCRIPT" dist "$T/live5" "$T/rel5" ) > "$T/log13" 2>&1
    chk "in-checkout fallback still resolves the real sha" \
        "$(basename "$(readlink -f "$T/live5")" | sed 's/.*-//')" "$EXPECT"
else
    echo "  SKIP  in-checkout fallback (git init unavailable)"
fi

echo
echo "==== publish-web-root: $pass passed, $fail failed ===="
[ "$fail" -eq 0 ] || exit 1
