# Runbook: Promote `dev → main` on datanika-landing

**Infra-only.** Promotion is the one thing departments do not do for themselves: it triggers CD to
`datanika.io` and needs a traffic-window judgement.

> 🚨 **Do not use `datanika-core`'s `RUNBOOK_DEV_TO_MASTER.md` for this repo.** Its pre-flight reads
> `actions/runs?branch=dev&head_sha=$SHA`, which **returns 0 on a fully-tested landing head** — and
> `0` reads exactly like *"CI has not run yet"*, which is a state a promoter waits on rather than
> investigates. See [§1](#1-pre-flight). That document is correct for core and wrong here; this one
> exists because the difference is invisible until you measure it.

**This repo is independent of core and cloud.** There is no cross-repo ordering constraint, no
pairing gate and no image. Landing can be promoted before, after or between the cloud→core pair.

---

## 1. Pre-flight

### 1.1 The trigger difference, which is the whole reason this file exists

| | `datanika-core` | `datanika-landing` |
|---|---|---|
| `ci.yml` `on:` | `pull_request` + **`push: [master, dev]`** + `merge_group` | `pull_request: [dev, main]` + `merge_group` — **no `push:`** |
| `actions/runs?branch=dev&head_sha=$SHA` | returns runs | **returns 0** |

Measured on landing `dev` head `fcb858b8`, 2026-09-24: `branch=dev` → **0 runs**; unfiltered
`head_sha=` → **1 run**; `commits/$SHA/check-runs` → `build=completed:success`.

🔑 **A landing `dev` head carries no `branch=dev` run until somebody opens the promotion PR.** So
opening the PR is what *manufactures* the rows you would then read back as evidence — the instrument
starts reporting because of the act you were trying to justify.

**Use check-runs on the SHA. It carries no branch filter.**

```bash
SHA=$(gh api repos/datanika-io/datanika-landing/commits/dev --jq .sha)
gh api "repos/datanika-io/datanika-landing/commits/$SHA/check-runs?per_page=100" \
  --jq '.check_runs[] | "\(.name)=\(.status):\(.conclusion // "pending")"'
```

`build` must read `completed:success`. Re-derive the required set rather than trusting this line:

```bash
gh api repos/datanika-io/datanika-landing/branches/dev/protection \
  --jq '.required_status_checks | "\(.contexts|join(",")) strict=\(.strict)"'
```

### 1.2 Cancelled jobs are neither green nor red

A cancelled job carries **zero steps** in the API, so the usual "drop to step level" fallback does
not exist for it. Duration does not discriminate either.

```bash
for RID in $(gh api "repos/datanika-io/datanika-landing/actions/runs?head_sha=$SHA&per_page=20" \
               --jq '.workflow_runs[].id'); do
  gh api "repos/datanika-io/datanika-landing/actions/runs/$RID/jobs?per_page=100" \
    --jq '.jobs[] | "\(.name)\t\(.conclusion)\tsteps=\(.steps|length)"'
done
```

### 1.3 Nothing in flight

```bash
gh pr list --repo datanika-io/datanika-landing --base dev --state open \
  --json number,title,mergeStateStatus
```

A merge queue governs `dev` (ruleset `merge-queue-dev`, id `22022738`). Check it too — an empty PR
list is not an empty queue:

```bash
gh api graphql -f query='query { repository(owner:"datanika-io", name:"datanika-landing") {
  mergeQueue(branch:"dev") { entries(first:20) { totalCount
    nodes { position state pullRequest { number } } } } } }'
```

---

## 2. Enumerate the batch — by SOURCE PR, never by commit subject

**A commit subject shows what the author typed. The declaration that fires lives on the PR.** On
2026-09-23 a promotion body said nothing would close while `landing#672` closed correctly: every
commit subject read `refs #672`, and the **source PR's title** read `Closes #672`.

```bash
for C in $(gh api repos/datanika-io/datanika-landing/compare/main...dev --jq '.commits[].sha'); do
  gh api "repos/datanika-io/datanika-landing/commits/$C/pulls" \
    --jq '.[] | "\(.sha[0:8]) PR #\(.number) [\(.state)] base=\(.base.ref) :: \(.title)"'
done
```

🚨 **`commits/{sha}/pulls` also returns OPEN PRs whose branch merely CONTAINS the commit.** In the
round-16 core promotion it named one unrelated open PR against six of eight commits, which would have
read as a batch six commits larger than it was. **The source PR is the merged one, based on `dev`,
that put the commit there.** Filter on `state == MERGED` and `base.ref == "dev"`.

---

## 3. Ask the oracle what will close — do not infer it from prose

GitHub answers this itself, **before** the merge:

```bash
gh api graphql -f query='query { repository(owner:"datanika-io", name:"datanika-landing") {
  pullRequest(number: <PR>) { closingIssuesReferences(first: 30) {
    totalCount nodes { number title state } } } } }'
```

🔑 **It is non-zero only on a PR whose base is the DEFAULT branch.** Measured both directions:

| PR | base | `closingIssuesReferences` |
|---|---|---|
| landing #674 — title literally `(closes #672)`, merged | `dev` | **0** |
| landing #676 — promotion | `main` | **1** → #672 |
| landing #682 — promotion | `main` | **1** → #671 |
| core #1519 — promotion | `master` | **2** |

⚠️ So this is exactly the right instrument **here** and structurally blind on feature PRs. A `0` from
a feature PR measures nothing; **always read it beside a control that can fire** — a known promotion
PR — or a broken query and a clean batch look identical.

Wait for the `Promotion PR refs` generator to write its block before reading the oracle; the oracle
reflects the body GitHub has parsed. **If the block is wrong, fix the workflow** — do not hand-edit.
⚠️ The generator cannot parse a cross-repo `refs <repo>#N` ([landing#493]).

---

## 4. Promote

```bash
gh pr create --repo datanika-io/datanika-landing --base main --head dev \
  --title "[Infra] Promote dev → main: <what shipped>" --body-file <file>

gh pr merge <PR> --repo datanika-io/datanika-landing --merge --admin
```

- **`--merge`, never `--rebase`.** A merge commit keeps `main` a *descendant* of `dev`, so the resync
  is a clean fast-forward. A `--rebase` promotion produces identical trees with different SHAs and the
  branches diverge permanently.
- **`--admin`** carries it past `reviews=1`, which is deliberate on `main` and unsatisfiable with one
  `Timev` identity.
- **Never arm auto-merge on a promotion PR** — it would wait forever on that review while looking
  like progress.
- **Write the body to a file and pass `--body-file`.** Prose through a shell gets backticks executed.
- **Re-read `dev`'s head immediately before merging and refuse if it moved.** Five departments merge
  continuously; this guard is what replaces declaring a freeze.

---

## 5. Post-deploy

Push to `main` fires `deploy.yml`, which **builds on the runner** and ships `dist/` to Aweb
(`185.226.65.96`). `concurrency: deploy-landing` is `cancel-in-progress: false` — a deploy is a
mutation, so it queues.

Read the deploy by **step**, not job conclusion:

```bash
gh api "repos/datanika-io/datanika-landing/actions/runs/<id>/jobs?per_page=100" \
  --jq '.jobs[] | .name as $n | .steps[] | "\($n) :: \(.name) = \(.conclusion)"'
```

`Publish on Aweb` and `Verify every announced URL actually serves` are the load-bearing ones.

**Then ask the box what is serving.** This is the only honest answer:

```bash
ssh root@185.226.65.96 'readlink -f /var/www/datanika.io'
# -> /var/www/datanika.io-releases/<UTC-timestamp>-<short-sha>
```

⚠️ **`/opt/datanika/datanika-landing/` still exists and is NO LONGER maintained by the deploy.** Its
`HEAD` is stale by design; never read it as evidence of what is live.

---

## 6. Resync `dev`

```bash
# from the landing worktree — NOT the monorepo root
git -C <worktree> fetch origin --prune
git -C <worktree> merge-base --is-ancestor origin/dev origin/main   # assert FIRST
git -C <worktree> push origin origin/main:refs/heads/dev
gh api repos/datanika-io/datanika-landing/compare/main...dev --jq .status   # want: identical
```

- **Assert the fast-forward before pushing.** If `dev` moved during the promotion the push is
  rejected — **that is benign and must NEVER be forced.** A force erases another department's commit
  silently, leaving `dev` green and the issue closed.
- Observed on 2026-09-24: `dev` took three commits from two departments *during* the promotion, so the
  resync refused and `main...dev` read `diverged ahead=3 behind=1`. The `behind=1` is the promotion
  merge commit, whose tree content is already on `dev`. It resolves on the next promotion.
- A `Bypassed rule violations` / `Changes must be made through the merge queue` message on a
  *successful* resync is the admin bypass working as designed, not a warning to act on.
- **Never `git push --force`**, and read the **outcome** (`compare`), never the exit code.

---

## 7. Rollback — no rebuild needed

```bash
ssh root@185.226.65.96
ls -1dt /var/www/datanika.io-releases/*/          # newest first; [1] is the previous release
ln -sfn /var/www/datanika.io-releases/<prev>/ /var/www/datanika.io.new
mv -T /var/www/datanika.io.new /var/www/datanika.io
```

Publishing is an atomic `rename(2)` over a symlink, so a request gets the whole old release or the
whole new one. The 5 newest releases are kept.

---

## 8. ⚠️ Changing a host, country, email provider or backup target is also a landing change

`/privacy` and `/trust` state the hosting provider, country, OS, reverse proxy, sub-processor list and
backup retention as **legal representations**. `tests/legal-pages-facts.test.ts` keeps the two pages
agreeing with each other but **cannot see production**, so it will not tell you the host changed.
Re-derivation procedure: `plans/growth/notes/LEGAL_PAGE_FACTS_2026-08-30.md`.

[landing#493]: https://github.com/datanika-io/datanika-landing/issues/493
