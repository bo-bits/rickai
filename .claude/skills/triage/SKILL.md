---
name: triage
description: "Sweep the board's Inbox (untriaged issues): summarize each, propose Priority (Now/Next/Later) + type label + epic + shaped, apply on confirm. Enforces the Now ⊆ shaped invariant."
allowed-tools: Bash(gh issue *), Bash(gh project *), Bash(gh api *), AskUserQuestion
---

# Triage

The one human ritual (see `docs/workflow.md`). Every inbound issue — support
report, mid-dev discovery, planned work — lands in **Inbox** (the unset
`Priority`). This sweeps the Inbox and gives each issue one decision.

> Owns the **`Priority`** field and the **`shaped`** label. Never touches
> `Status` — that's `/sync`'s, derived from git.
>
> Owner/repo are pre-filled for `bo-bits/rikai`. Replace the one remaining
> placeholder, `<PROJECT_NUMBER>`, with the board's number once it exists.

## 1. List untriaged issues

Inbox = open board issues with no `Priority` value. Resolve IDs by name and list
them:

```
gh project item-list <PROJECT_NUMBER> --owner bo-bits --format json --limit 200 \
  | jq -r '.items[] | select(.content.type=="Issue" and (.priority==null)) |
           "\(.content.number)\t\(.content.title)"'
```

(If the `priority` key isn't present in the output, the board hasn't been
configured yet — the `Priority` field must exist first.)

## 2. For each untriaged issue, decide

Read the issue (`gh issue view <N>`). Then make **one** decision, surfacing a
recommendation and confirming with `AskUserQuestion` when the call isn't obvious:

1. **Actionable?** If not → close with a comment explaining why.
2. **Type** → ensure a `bug` / `feature` / `chore` label. Keep `reported` if a
   support person filed it (signal for support-driven load).
3. **Epic?** If it's a leaf of an existing epic, attach it as a native
   sub-issue; otherwise leave it standalone.
4. **Priority:**
   - `Later` — backlog, unshaped.
   - `Next` — candidate on deck to shape.
   - `Now` — only if it's **shaped** (clear enough to hand the agent) **and**
     you've written an **appetite** line in the body. Shaping a `Next` item means
     adding the `shaped` label + the appetite note.

### Shaping & the `shaped` label

`shaped` marks an issue that meets the `Now` bar (clear + appetite written),
whether or not it's committed yet. Its real signal is on `Next` items — your
**ready-to-pull** pool. To shape an issue: confirm the problem/scope/acceptance
are clear (refine the body if not, like `/issue` step 2b), write
`Appetite: <budget>` in the body, then `gh issue edit <N> --add-label shaped`.

## 3. Apply

- **Priority** (project field):
  ```
  gh project item-edit --project-id <PROJECT_ID> --id <ITEM_ID> \
    --field-id <PRIORITY_FIELD_ID> --single-select-option-id <OPTION_ID>
  ```
  Resolve `<PROJECT_ID>`, `<PRIORITY_FIELD_ID>`, and the option IDs by name via
  `gh api graphql` (same pattern as `.claude/skills/sync/reconcile.py`). Get the
  per-issue `<ITEM_ID>` from the `gh project item-list` output.
- **Labels** (`shaped`, type): `gh issue edit <N> --add-label <label>`.

## 4. Enforce `Now ⊆ shaped`

After the sweep, assert the invariant — nothing committed to `Now` may be
unshaped:

```
gh project item-list <PROJECT_NUMBER> --owner bo-bits --format json --limit 200 \
  | jq -r '.items[] | select(.priority=="Now") | select((.labels // []) |
           index("shaped") | not) | "UNSHAPED IN NOW: #\(.content.number) \(.content.title)"'
```

Any line printed is a violation — either shape it (add `shaped` + appetite) or
move it back to `Next`. Report violations; don't silently leave them.
