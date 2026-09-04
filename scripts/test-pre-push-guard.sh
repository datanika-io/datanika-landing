#!/usr/bin/env bash
# Controls for scripts/hooks/pre-push's refspec guard — landing#504.
#
# The guard decides whether a push gets the build+test gate or skips it. Both answers are
# dangerous when wrong: skipping a real branch push removes the gate entirely, and gating a
# refspec push is the bug this exists to fix (the post-promotion resync silently did not
# happen on 2026-09-04, refused by a build of an unrelated working tree).
#
# So every case below asserts BOTH directions, and case 7 mutates the real hook to prove
# this harness can actually see the defect. A harness that stops intercepting fails
# permissively, which is invisible.
#
# Run: bash scripts/test-pre-push-guard.sh     (gated in ci.yml's build job)

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
HOOK="$REPO_ROOT/scripts/hooks/pre-push"

PASS=0
FAIL=0

fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }
ok()   { echo "  ok:   $*"; PASS=$((PASS + 1)); }

[ -f "$HOOK" ] || { echo "FATAL: $HOOK does not exist"; exit 1; }

# --- a throwaway repo with a real HEAD, and a fake npm we can prove is intercepting -------
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/repo/scripts/hooks" "$TMP/bin"
cd "$TMP/repo"
git init -q .
git -c user.email=t@example.com -c user.name=t commit -q --allow-empty -m "base"
HEAD_SHA=$(git rev-parse HEAD)
ZEROS=0000000000000000000000000000000000000000

cat > "$TMP/bin/npm" <<'FAKE'
#!/usr/bin/env bash
echo "npm $*" >> "$NPM_LOG"
exit 0
FAKE
chmod +x "$TMP/bin/npm"

# ⚠️ bash splits PATH on ':', so a Windows drive letter (D:/tmp/x) becomes two nonexistent
# directories and the fake silently never intercepts — the machine's real npm runs instead.
BIN_POSIX=$(cygpath -u "$TMP/bin" 2>/dev/null || echo "$TMP/bin")
export PATH="$BIN_POSIX:$PATH"
export NPM_LOG="$TMP/npm.log"

# Assert the interception itself before trusting a single result below.
: > "$NPM_LOG"
npm run build >/dev/null 2>&1
if [ "$(wc -l < "$NPM_LOG")" -eq 1 ]; then
  ok "harness: the fake npm is on PATH and intercepting"
else
  echo "FATAL: fake npm is NOT intercepting — every 'skipped' result below would be a lie"
  exit 1
fi

# run_hook <hook-file> <stdin-lines>  ->  prints "ran" or "skipped"; sets HOOK_OUT / HOOK_RC
run_hook() {
  local hook="$1" input="$2"
  : > "$NPM_LOG"
  HOOK_OUT=$(printf '%s' "$input" | bash "$hook" origin https://example.invalid/x.git 2>&1)
  HOOK_RC=$?
  if [ -s "$NPM_LOG" ]; then echo "ran"; else echo "skipped"; fi
}

expect() {
  local label="$1" want="$2" hook="$3" input="$4"
  local got
  got=$(run_hook "$hook" "$input")
  if [ "$got" = "$want" ]; then ok "$label -> $got"; else fail "$label -> $got (wanted $want)"; fi
}

cp "$HOOK" "$TMP/repo/scripts/hooks/pre-push"
H="$TMP/repo/scripts/hooks/pre-push"

echo "== cases that must SKIP the gate (nothing new is being pushed) =="
# 1. The post-promotion resync: `git push origin origin/main:refs/heads/dev`.
expect "1 refspec push (resync)"        skipped "$H" "refs/remotes/origin/main $ZEROS refs/heads/dev $HEAD_SHA
"
# 2. Several refs, none of them HEAD.
expect "2 multi-ref, none is HEAD"      skipped "$H" "refs/heads/a 1111111111111111111111111111111111111111 refs/heads/a $ZEROS
refs/heads/b 2222222222222222222222222222222222222222 refs/heads/b $ZEROS
"
# 3. A branch deletion pushes an all-zero local sha.
expect "3 branch delete"                skipped "$H" "(delete) $ZEROS refs/heads/gone $HEAD_SHA
"

echo "== cases that must RUN the gate =="
# 4. An ordinary branch push.
expect "4 ordinary push of HEAD"        ran     "$H" "refs/heads/f $HEAD_SHA refs/heads/f $ZEROS
"
# 5. HEAD among several refs still earns the gate.
expect "5 multi-ref including HEAD"     ran     "$H" "refs/heads/a 1111111111111111111111111111111111111111 refs/heads/a $ZEROS
refs/heads/f $HEAD_SHA refs/heads/f $ZEROS
"
# 6. 🚨 Empty stdin (hand-invoked). Skipping here would turn the guard into a way to never
#    run the gate at all, which is why the hook keys on SAW_ANY and not on PUSHING_HEAD alone.
expect "6 empty stdin (hand-invoked)"   ran     "$H" ""

echo "== 7. anti-vacuity: strip the guard from the REAL hook; case 1 must flip to 'ran' =="
# Mutating a fixture would agree with the guard including where the guard is wrong, so this
# mutates the shipped file. Anchor asserted present AND unique before writing.
ANCHOR='if [ "$SAW_ANY" = "1" ] && [ "$PUSHING_HEAD" = "0" ]; then'
COUNT=$(grep -cF "$ANCHOR" "$HOOK")
if [ "$COUNT" != "1" ]; then
  fail "anchor for the mutation appears $COUNT times, expected exactly 1 — control not armed"
else
  # ⚠️ Literal line comparison, not sed: this anchor contains [ ] " $ and &, every one of
  # which is a metacharacter to sed's BRE or its replacement text. The first version of
  # this control used `sed s|^ANCHOR$|...|` and applied nothing, silently — the count
  # assertion above passed while the mutation never happened. Caught only because this
  # block asserts the mutation took effect as well as that the anchor exists.
  while IFS= read -r line; do
    if [ "${line%$'\r'}" = "$ANCHOR" ]; then printf 'if false; then\n'; else printf '%s\n' "$line"; fi
  done < "$HOOK" > "$TMP/repo/scripts/hooks/broken"
  if grep -qF "$ANCHOR" "$TMP/repo/scripts/hooks/broken"; then
    fail "the mutation did not apply — this control proves nothing"
  else
    got=$(run_hook "$TMP/repo/scripts/hooks/broken" "refs/remotes/origin/main $ZEROS refs/heads/dev $HEAD_SHA
")
    if [ "$got" = "ran" ]; then
      ok "7 guard removed -> refspec push is gated again (this harness can see the bug)"
    else
      fail "7 guard removed -> still '$got'; this harness cannot detect landing#504"
    fi
  fi
fi

echo "== 8. the skip must SAY so, and must succeed =="
run_hook "$H" "refs/remotes/origin/main $ZEROS refs/heads/dev $HEAD_SHA
" >/dev/null
case "$HOOK_OUT" in
  *"skipping build and tests"*) ok "8 skip prints why" ;;
  *) fail "8 skip printed no explanation: $HOOK_OUT" ;;
esac
[ "$HOOK_RC" = "0" ] && ok "8 skip exits 0" || fail "8 skip exited $HOOK_RC — the push would be refused"

echo
echo "pre-push guard: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
