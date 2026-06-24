---
name: issue
description: "Resume or start a GitHub issue. Gathers full context, briefs you with a plain-language summary + proposed next steps + open questions, and only on your confirmation implements → PR → /sync. Re-runnable: always re-derives where the work left off."
argument-hint: "[issue-number]"
allowed-tools: Bash(gh issue *), Bash(gh pr *), Bash(gh api *), Bash(git checkout *), Bash(git fetch *), Bash(git status*), Bash(git log*), Bash(git diff*), Bash(git push *), Bash(python3 *), AskUserQuestion, EnterPlanMode, ExitPlanMode
---

# Issue Workflow

`/issue <N>` means **"pick up issue N."** It's re-runnable across sessions: it
always re-derives where the work stands from the issue + the repo (never assumes
a blank slate), briefs you, and waits for your go-ahead before touching anything.

> Replace `bo-bits` / `rikai` / `dev` below with your project's
> values (`dev` is the integration branch feature PRs target — e.g.
> `dev` or `develop`).

## 1. Orient — gather all the context

Pull everything in parallel; **read, don't write.** Nothing is created or edited
in this step.

**The issue and its intent:**
```
gh issue view $ARGUMENTS --json number,title,body,labels,state,comments,projectItems
gh api graphql -f query='{ repository(owner:"bo-bits",name:"rikai"){ issue(number:'"$ARGUMENTS"'){ parent{ number title } subIssues(first:30){ totalCount nodes{ number title state } } } } }'
```
Read the **body** (problem/scope/acceptance), the **comments** (prior decisions —
often where "where we left off" lives), the **parent epic**, and any **`docs/…`
links** in the body or epic. Follow them.

**The work-in-progress (git/PR reality):**
```
git fetch origin --prune
git branch -a --list '*issue-'"$ARGUMENTS"'-*'        # does a branch exist?
gh pr list --repo bo-bits/rikai --state all --search "head:issue-$ARGUMENTS" --json number,state,isDraft,headRefName,reviewDecision,statusCheckRollup
```
If a branch/PR exists, also inspect the **diff so far**
(`git diff origin/dev...<branch>`), **unaddressed review comments**,
**CI status** (`statusCheckRollup`), and the board **Status** (`projectItems`).

## 2. Brief & confirm — the gate

Present a **plain-language** briefing and **stop**. Keep it proportional: short
when the path is obvious, fuller when scope is ambiguous. Don't manufacture
questions — if it's clear, say so.

```
📋 Issue #<N> — "<title>"

Where it stands
• <what it wants, 1–2 lines>
• <cold start: "not started, no branch" — or resume: branch / PR draft|ready /
   % of acceptance criteria done / CI / open review comments>

Proposed next steps
1. <concrete step>
2. ...

Open questions
• <only the ones that actually block — or "None, scope is clear">

Proceed, or want to adjust?
```

- Use `AskUserQuestion` for concrete either/or open questions.
- **Escalate to plan mode only for genuinely complex work** (large or multi-file,
  migrations, security-sensitive areas). Then `EnterPlanMode` → write a plan
  mapping each acceptance criterion to files/functions/tests → `ExitPlanMode` for
  approval. For ordinary issues the "Proposed next steps" above *is* the plan.

**Do not proceed past this gate without confirmation.**

## 3. Execute — resume-aware

Once confirmed, do only what the current state needs:

**3a. Align the ticket (if scope was clarified).** Rewrite the body in place so
it stays the source of truth, and leave an audit comment:
```
gh issue edit $ARGUMENTS --body "<refined problem + scope (+ out-of-scope) + acceptance criteria>"
gh issue comment $ARGUMENTS --body "Refined scope after planning discussion. See updated description."
```

**3b. Branch — only if absent.** Determine the prefix from labels (`bug`/`fix` →
`fix/`, else `feat/`).
- **No branch yet:** create it linked to the issue —
  ```
  gh issue develop $ARGUMENTS --base dev --name <prefix>issue-$ARGUMENTS-<brief-slug>
  git fetch origin && git checkout <branch-name>
  ```
- **Branch exists:** `git checkout <branch>` and rebase/merge `origin/dev`
  if it has drifted. (If the branch wasn't made via `gh issue develop`, run it now
  so the issue's Development sidebar links the PR — see note below.)

`gh issue develop` is what links the PR to the issue: it registers the branch in
the issue's **Development** section so the PR surfaces on the issue — without a
`Closes #N`, which a staging-targeted PR ignores anyway. The `issue-<N>` name is
also the join key `/sync` uses to set `Status`.

**3c. Implement — continue from where it left off.** Diff what's already done
against the acceptance criteria and do what remains; address any review comments
in scope. Follow the project's conventions (see `CLAUDE.md`). Small, logical
units. If reality forces a material deviation from the agreed plan, pause and
re-align.

**3d. Commit incrementally** — conventional commits as units complete
(`fix(scope):` / `feat(scope):` / `refactor(scope):`).

## 4. Test

Run the project's test suite; fix failures and commit before pushing.

## 5. Push & PR — create or update

```
git push -u origin HEAD          # any pre-push hooks (lint/type-check/tests) run here
```
If pre-push checks fail, fix, commit, push again.

- **No PR yet:** create one targeting the staging branch.
  ```
  gh pr create --base dev --title "<concise title>" --body "$(cat <<'EOF'
  ## Summary
  <1–3 bullets: what changed and why>

  Refs #<issue-number>

  ## Test plan
  - [ ] Tests pass
  - [ ] Manual verification of the change
  EOF
  )"
  ```
- **PR exists:** the push updates it; revise the body if scope changed. (If
  `gh pr edit` misbehaves, use
  `gh api repos/:owner/:repo/pulls/<n> --method PATCH --field body=...`.)

Use `Refs #<issue-number>`, **not** `Closes #` — a staging-targeted PR ignores
closing keywords (no link created). The issue is closed by `/release` at the
production ship; its card is driven by `/sync`.

## 6. Sync the board

```
python3 .claude/skills/sync/reconcile.py
```
Lands the card in `In Progress` (draft) or `Ready`. `Status` is derived from git
— never set it by hand. See `.claude/skills/sync/SKILL.md`.
