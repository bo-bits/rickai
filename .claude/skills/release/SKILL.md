---
name: release
description: "Create a release PR from dev to main with a changelog of all commits since the last release, then close the shipped batch and sync the board."
allowed-tools: Bash(gh pr create *), Bash(gh pr list *), Bash(gh pr merge *), Bash(gh issue close *), Bash(gh project *), Bash(gh api *), Bash(git log *), Bash(git fetch *), Bash(git rev-parse *), Bash(python3 *)
---

# Release Workflow

Cuts a release PR from `dev` (staging) → `main` (production) for `bo-bits/rikai`.
Replace `<PROJECT_NUMBER>` with the board's number once it exists.

## 1. Fetch latest

```
git fetch origin
```

## 2. Check for an existing release PR

```
gh pr list --base main --head dev --state open --json number,url
```

If a PR already exists, update it instead of creating a new one.

## 3. Generate changelog

All commits on `dev` since it diverged from `main`:

```
git log origin/main..origin/dev --oneline --no-merges
```

Group by type (feat, fix, refactor, docs, chore) for the PR body. Omit empty
sections.

This range is only accurate because release PRs are **merge-committed** (step 6):
every `dev` commit becomes an ancestor of `main`, so after a release the range is
empty and only grows with genuinely new work. If a release is ever squash-merged
instead, the squashed commits keep reappearing here forever — cross-check against
the real diff and drop anything already on `main`.

## 4. Determine impact radius and write a manual test plan

List files changed since `main` so you can judge which surfaces this release
touches:

```
git log origin/main..origin/dev --name-only --pretty=format: | sort -u
```

Keep the plan **minimal by default** — releasing often means short smoke tests:
the fewest steps that exercise the highest-impact path. **Only expand** to broader
coverage when the release is genuinely high-risk (many areas, DB migrations,
auth, or the tutoring/LLM loop).

Map impacted paths to the surface a **non-developer** would use:

| Changed paths (impact area) | Surface | What the tester does |
|---|---|---|
| `mobile/**` (Expo screens, components, hooks) | **Mobile app** | Open the affected screen in the app (Expo Go / dev build), perform the action, confirm the result on screen |
| `supabase/functions/turn/**`, `compact/**`, `consolidate/**`, `_shared/**` | **Mobile app (tutoring)** | In the app, run a tutoring conversation that exercises the changed function; confirm the assistant responds correctly and state persists |
| `supabase/migrations/**` or schema changes | **Mobile app (smoke)** | Open a screen that reads the changed tables; confirm it still loads with correct data |
| auth / accounts / data-access code | **Mobile app (end-to-end)** | Sign in and run the full affected flow; verify access + data are correct |

Write steps a non-dev can follow with no CLI and no SQL. Each step gets an
explicit **Expected:** outcome. Tests run against the **staging deployment (the
`dev` environment)** before this PR merges to production.

## 5. Create or update the release PR

Write the body to a temp file to avoid shell-quoting issues:

```
cat > /tmp/release-body.md << 'ENDOFFILE'
## Release

### Features
- <feat commits>

### Fixes
- <fix commits>

### Other
- <remaining commits>

## Manual QA (non-dev)

> Test on the staging deployment (the `dev` environment) before merging. Steps
> reflect this release's impact radius — kept minimal unless the change is high-risk.

### <Surface>
1. <step> — **Expected:** <result>
ENDOFFILE
```

Include one `### <Surface>` subsection per impacted surface; drop the rest. The
**Manual QA** section is required on every release PR — keep it proportional to risk.

**Create:**
```
gh pr create --base main --head dev --title "release: <brief summary>" --body-file /tmp/release-body.md
```

**Update** (if a PR exists):
```
gh api repos/:owner/:repo/pulls/<number> --method PATCH --field title="release: <brief summary>" --field body="$(cat /tmp/release-body.md)"
```

## 6. Merge strategy (when approved)

**Merge the release PR with a real merge commit — never squash it.** Squashing
collapses every `dev` commit into one new SHA on `main`, so the originals never
become `main` ancestors and step 3's range stays polluted with already-released
commits release after release.

- Release PR (`dev` → `main`): **merge commit** (`gh pr merge --merge`).
- Feature PRs (`* → dev`): keep **squashing** — that's what gives `dev` its clean
  one-commit-per-feature history.

## 7. Close the shipped batch and sync the board

Once the release PR merges to `main`, the work it carried is live — so the issues
behind it must close and their cards flip to `Done`. The batch is exactly the set
of board items currently in **`In Dev`** (each got there when its feature PR
merged to `dev`).

Feature PRs use `Refs #N`, not `Closes #N` — closing keywords are ignored on
non-default-branch PRs, so nothing auto-closes. `/release` closes the batch:

```
# The In-Dev batch (issues shipped by this release):
gh project item-list <PROJECT_NUMBER> --owner bo-bits --format json --limit 200 \
  | jq -r '.items[] | select(.status=="In Dev") | .content.number'

# Close each (a one-line comment ties it to the release):
gh issue close <N> --comment "Shipped in release <PR-url-or-title>."

# Reconcile — closed issues derive to Done:
python3 .claude/skills/sync/reconcile.py
```

Only close issues whose work is genuinely on `main`. If something sat in `In Dev`
but was intentionally held back, leave it open — but that shouldn't happen, since
everything merged to `dev` ships in the next batch by construction.
