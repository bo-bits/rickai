---
name: standup
description: "What are we working on? A read-only daily brief over the board: the committed Now batch with PR/CI state, blockers, what needs attention (inbox, awaiting-release), epic progress, and a suggested sequence for today."
allowed-tools: Bash(python3 *), Bash(gh project *), Bash(gh pr *), Bash(gh issue *), Bash(gh api *)
---

# Standup

Answers "**what are we working on today?**" — read-only orientation over the
board (see `docs/workflow.md`). Run it any morning, or whenever you context-switch
back in.

## 1. Gather the snapshot

```
python3 .claude/skills/standup/standup.py
```

(Reads the same `PROJECT_*` config as `reconcile.py`.) This prints, all derived
live from the board + open PRs:
- **NOW** — the committed batch (`priority:Now`), grouped by `Status`, each leaf
  tagged with its PR / CI / review state.
- **BLOCKERS** — `Now` leaves with failing CI or changes-requested reviews.
- **NEEDS ATTENTION** — untriaged Inbox count, In-Dev (awaiting-release) count.
- **EPICS** — sub-issue rollup for in-flight epics.

## 2. Narrate it

Turn the snapshot into a short, human brief — don't just echo it:

1. **One-line focus.** What today is mostly about.
2. **Blockers first.** Call out anything failing CI / awaiting changes — these
   jump the queue.
3. **Suggested sequence**, honoring the model's rules:
   - **WIP cap (1–2 In Progress):** finish what's `In Progress` before pulling
     new work.
   - Then land what's `Ready` (mark ready / merge to staging).
   - If the **In Dev** pile is sizeable, suggest **`/release`** to ship the batch.
   - Then pull the next **`shaped`, unblocked `Now`** leaf — respect epic
     dependency order (read the parent epic's plan; don't start a leaf whose
     prerequisites are open).
4. **Nudges.** If Inbox is piling, suggest **`/triage`**. If an epic is near-done,
   flag it.

Keep it tight — a brief, not a report. End by offering to start the top item
(hand it to `/issue <N>`).

## Notes

- **Read-only.** This never mutates the board; it reads truth. `Status` shown is
  whatever `/sync` last derived — run `/sync` first if you've merged/closed
  something outside the agent and want the brief current.
- Sequencing is a *suggestion* grounded in the WIP cap + epic order, not a
  mandate — you decide.
