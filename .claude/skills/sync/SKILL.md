---
name: sync
description: "Reconcile the GitHub Project board's Status from git/PR reality. Idempotent — derives Todo/In Progress/Ready/In Dev/Done for every item and applies the diff. Run anytime, or it's called by /issue and /release."
allowed-tools: Bash(python3 *), Bash(gh project *), Bash(gh pr list *), Bash(gh api *), Bash(git fetch *)
---

# Board Sync

The board is a **projection of the repo** (see `docs/workflow.md`). `Status` is
derived from git, never hand-set. This skill computes the correct `Status` for
every board item and applies the diff. It is **pull-based and idempotent** — run
it anytime; it converges the board to truth and is safe to re-run.

> Touches **only** the `Status` field. `Priority` (`Inbox/Now/Next/Later`) and
> the `shaped` label are human-owned (`/triage`) and are never modified here.

## 1. Fetch latest git state

```
git fetch origin --prune
```

## 2. Reconcile

```
python3 .claude/skills/sync/reconcile.py
```

Add `--dry-run` to preview the diff without applying. The script reads its target
from flags > env vars (`PROJECT_OWNER` / `PROJECT_NUMBER` / `PROJECT_REPO`) > the
`DEFAULT_*` constants at the top of the file — set those once for your project.
It auto-detects whether the owner is a user or an org.

## How it derives Status

PRs are joined to issues by the **`issue-<N>` branch name** that `/issue` creates
via `gh issue develop` (e.g. `feat/issue-128-…`). Per board issue:

| Condition | Status |
|---|---|
| issue closed | `Done` |
| open PR (head `issue-<N>`) is a **draft** | `In Progress` |
| open PR (head `issue-<N>`) is **ready** | `Ready` |
| PR merged (head `issue-<N>`), issue still open | `In Dev` |
| no PR | `Todo` (left untouched if already `Todo`/empty) |

`Done = issue closed` is exact because `/release` closes the `In Dev` batch when
it ships to the production branch (a manually-closed issue is terminal too). The
script resolves the Status field and its option IDs **by name at runtime**, so it
survives board edits; if the five options don't exist yet it exits and tells you
to reconfigure the board first.

## When it runs

- **`/issue`** calls it after opening a PR → card lands in `In Progress`/`Ready`.
- **`/release`** calls it after closing the shipped batch → cards flip to `Done`.
- **Manually**, anytime you've merged/closed something in the web UI and want the
  board to catch up.
