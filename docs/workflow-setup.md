# Set up the git-derived board workflow

You're reading this in Claude Code. This guide explains a lightweight
GitHub-board development workflow **and walks you (the agent) through installing
it** on this project. Read the whole thing, then drive the setup with the user,
pausing at the two human-only steps.

> **The one idea:** code and PRs are the source of truth; the GitHub board is a
> mirror. Exactly one board field is set by a human (`Priority`, at triage);
> everything else about board state is **derived from git by a script**, so the
> board can never drift from reality. There are no GitHub Actions and no sprints.

Full rationale lives in `docs/workflow.md` (shipped alongside this file). Skim it
once; this guide is the operational checklist.

> **Where rikai stands right now (read before you start):**
> - This repo has **only `main`** — you'll create the `dev` staging branch (Step 0).
> - The docs + skills are **already filled in for `bo-bits/rikai`** (staging `dev`,
>   production `main`). The single remaining fill-in is `<PROJECT_NUMBER>`, set once
>   the board exists.
> - rikai already has **~10 open issues** with existing labels (`frontend`,
>   `backend`, `blocked:backend`, `enhancement`). Those labels coexist fine — the
>   workflow just adds its own. Once you add the issues to the new board they'll all
>   land in **Inbox** (no `Priority`); a first `/triage` pass sorts them.
> - `gh` is already authenticated as `bo-bits` with `project` scope.

---

## What gets installed

- **2 branches** — a staging/integration branch (e.g. `dev`) and production
  (e.g. `main`). Feature PRs target staging; batches ship staging→production.
- **2 board fields** — `Status` (derived) and `Priority` (human).
- **labels** — `shaped`, `epic`, `bug`, `feature`, `chore`, `reported`.
- **3 saved views** — FLOW, SHAPE, MAP.
- **4 GitHub automations** (built-ins only).
- **5 skills** — `/triage`, `/sync`, `/issue`, `/release`, `/standup` (under
  `.claude/skills/`).

---

## Step 0 — Prerequisites (check, don't assume)

Run these and confirm:

```
gh auth status                 # authenticated, with project scope
gh auth refresh -s project     # if project scope is missing
git branch -a                  # confirm the two branches exist (create staging if not)
python3 --version              # the sync/standup engines are Python 3
```

Ask the user for: their **GitHub owner login**, whether the repo's Project is
**user- or org-owned**, and the **staging** + **production** branch names. (The
sync script auto-detects user vs org, but you need the owner login + project
number regardless.)

## Step 1 — Create the Project board and its fields  ⚠️ human-assisted

GitHub Projects v2 fields are easiest to create in the web UI. **Pause and ask
the user to do this**, or do it via `gh project` if they prefer CLI:

1. Create a Project (note its **number** — it's in the URL `/projects/<N>`).
2. Add a **single-select field `Status`** with options, in this order:
   `Todo`, `In Progress`, `Ready`, `In Dev`, `Done`.
   *(Exact spelling — the sync script matches options by name.)*
3. Add a **single-select field `Priority`** with options: `Now`, `Next`, `Later`.
   *(Leave a card's Priority unset to mean "Inbox".)*

Do **not** invent extra options or fields. The model depends on exactly these.

## Step 2 — Labels

```
gh label create shaped   --color BFD4F2 --description "Meets the Now bar (clear + appetite)" --force
gh label create epic     --color 5319E7 --description "Context doc; tracked by sub-issue rollup, not Status" --force
gh label create bug      --color D73A4A --force
gh label create feature  --color 0E8A16 --force
gh label create chore    --color FBCA04 --force
gh label create reported --color C2E0C6 --description "Raised by a human outside dev" --force
```

## Step 3 — GitHub automations (built-ins only)

In the Project's **⋯ → Workflows**, enable exactly these (ask the user to toggle
them — they're UI-only):

1. **Auto-add to project** — items from this repo land on the board.
2. **Item closed → Done** *(backstop)*.
3. **Pull request merged → Done** *(backstop)*.
4. **Auto-archive items** — filter `is:closed updated:<@today-1w` so FLOW's `Done`
   column self-trims to the last week.

Deliberately **do not** add any custom GitHub Action for board state — `/sync`
derives it all.

## Step 4 — Saved views

Create three views (ask the user, or note these for them to add):

| View | Layout | Group by | Filter |
|---|---|---|---|
| **FLOW** | Board | `Status` | `priority:Now -label:epic` |
| **SHAPE** | Table | `Priority` (show `shaped` as a column) | `is:open -label:epic` |
| **MAP** | Table | — (show `Sub-issues progress`) | `label:epic is:open` |

## Step 5 — Install the skills

The `.claude/skills/` directory in this bundle holds the five skills. Copy it into
the repo root (so they live at `.claude/skills/<name>/`). Then **point the engines
at this project** — set these once, either as env vars (e.g. in the user's shell
profile or `.claude/settings.json`) or by editing the `DEFAULT_*` constants at the
top of `.claude/skills/sync/reconcile.py` and `.claude/skills/standup/standup.py`:

```
PROJECT_OWNER=<github-login>        # user or org login that owns the Project
PROJECT_NUMBER=<n>                  # the number in the Project URL
PROJECT_REPO=<owner>/<repo>         # where issues + PRs live
```

Owner/repo/branches are already filled in for `bo-bits/rikai` (staging `dev`,
production `main`). The **one** remaining placeholder across the `SKILL.md` files
is `<PROJECT_NUMBER>` — replace it with the board's number once you've created the
board in Step 1, or rely on the `PROJECT_NUMBER` env var the scripts read.

## Step 6 — Smoke test

```
git fetch origin --prune
python3 .claude/skills/sync/reconcile.py --dry-run    # should print a diff or "already in sync"
python3 .claude/skills/standup/standup.py             # should print the board snapshot
```

If `reconcile.py` complains about missing Status options, Step 1 isn't done
correctly. If it errors on the owner/number, fix the `PROJECT_*` config.

## Step 7 — Hand off into the loop

The workflow is now live. The daily cadence:

```
/standup            # what are we working on? (read-only brief)
/triage             # clear the Inbox: set Priority + shaped, enforce Now ⊆ shaped
/issue <N>          # pick up a Now/shaped leaf → branch → implement → PR → /sync
/release            # cut staging→production, close the In-Dev batch, /sync → Done
/sync               # reconcile the board from git anytime you acted in the web UI
```

Branch + PR conventions the skills rely on (don't break these):
- Feature branches are named `…issue-<N>-…` and created with `gh issue develop`
  (this both links the PR to the issue and gives `/sync` its join key).
- Feature PRs target **staging** and say **`Refs #N`**, never `Closes #N`
  (closing keywords are ignored on non-default-branch PRs).
- Feature PRs are **squash-merged**; the **release PR is merge-committed, never
  squashed** (otherwise the changelog range stays polluted forever).

That's the whole system. Add a short pointer to `docs/workflow.md` from the
project's `CLAUDE.md` so future sessions discover it.
