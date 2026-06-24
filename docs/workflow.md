# Development workflow

This is how work moves from "someone had a problem" to "it shipped to
production." It is the doc to read first; it governs how the GitHub board,
issues, and PRs are organized — and it's **enacted by skills** (`/triage`,
`/sync`, `/issue`, `/release`, `/standup`) so the workflow ships with the code
rather than living only in someone's head.

> **Code and PRs are the source of truth; GitHub is the mirror.** Anything that
> can be derived from a PR or a git event is *never* hand-set — it's **computed
> from git** by `/sync`. The board is a projection of the repo plus one small
> queue (`Priority`) you point your coding agent at. Every field a human has to
> *remember* to update is a liability — there is exactly one (`Priority`), and
> you only touch it at triage.

Context: built for a **one-person dev team driving a coding agent** (plus maybe
one person reporting issues from support channels). Continuous release — feature
PRs accumulate on a staging branch, then a batch ships to production. No sprints,
no story points, no velocity.

> **Project-specific terms used below:** `dev` is your integration
> branch (e.g. `dev`); `main` is production (e.g. `main`). Set the board
> coordinates (`PROJECT_OWNER` / `PROJECT_NUMBER` / `PROJECT_REPO`) once in the
> sync/standup scripts.

## The fields

| Field | Type | Values | Owner |
|---|---|---|---|
| **Status** | single-select | `Todo → In Progress → Ready → In Dev → Done` | **`/sync`** — derived from git |
| **Priority** | single-select | `(unset = Inbox) → Now → Next → Later` | **`/triage`** — human judgment |
| **`shaped`** | label | present / absent | `/triage` — marks issues that meet the `Now` bar |

Plus type labels (`bug · feature · chore`) and `reported` (anything raised by a
human outside dev — the signal for "what's driving support load").

Deliberately omitted: `Sprint`, `Commitment`, `Story Point`, per-epic labels, and
`priority: high/med/low` labels. They encode team/sprint machinery this setup
doesn't have. See [Why no story points](#why-no-story-points-and-no-sprints).

## Status — derived from git, never hand-set

`Status` mirrors what the code is doing. You never drag a card; `/sync` computes
it from `git` + `gh pr` and reconciles the board. It's **pull-based** (derive from
truth on demand), not event-driven, which is what makes it idempotent and immune
to missed events.

```
Todo  →  In Progress  →  Ready  →  In Dev  →  Done
         draft PR open   PR ready  on staging  released
                                   (batch     (on prod /
                                    test)      closed)
```

`/sync`'s derivation — all five states come from one `gh pr list --json
isDraft,state,headRefName` plus each issue's open/closed state, joined by branch
name:

| Condition | Status |
|---|---|
| no branch / no PR | `Todo` (leave as-is) |
| open PR (head `issue-<N>`) **and draft** | `In Progress` — still building |
| open PR (head `issue-<N>`) **and ready for review** | `Ready` — done your side, safe to land |
| PR merged (to staging), issue still **open** | `In Dev` |
| issue **closed** | `Done` |

(`Done = issue closed` is exact because `/release` closes the `In Dev` batch when
it ships to production; a manually-closed issue is terminal too.)

`In Progress` vs `Ready` is the **draft→ready** line — "still building" vs "ready
to land" — which you control with the PR's draft toggle and which tells `/release`
what's batchable. `In Dev` is a real resting state: feature PRs accumulate on
staging and get a batch test round before `/release` cuts staging→production.
`/sync` never touches `Priority` — that's `/triage`'s field.

**Why Status is derived, not driven by GitHub automation.** You might expect a
`Closes #N` on the feature PR to drive this for free. It won't: GitHub interprets
closing keywords **only on a PR targeting the default branch** (production), and
per the docs — *"if the pull request targets any other branch, then these keywords
are ignored, no links are created."* A feature PR to staging is silently unlinked.
GitHub Projects' built-in automations are also thin (only *added → Todo*, *closed
→ Done*, *PR merged → Done* — **no** "PR opened" or "PR ready" trigger). Rather
than fight that with a brittle Action, `/sync` derives the whole board from git.
Keep GitHub's two free built-ins (*PR merged → Done*, *item closed → Done*)
**enabled as a backstop** so the terminal state is right even if you act in the
web UI without running `/sync`.

> **Join key:** because staging-targeted PRs aren't auto-linked, `/sync` maps a PR
> to its issue via the **branch-name convention `issue-<N>`** that `/issue`
> creates (`gh issue develop`), not GitHub's link graph.

## Priority — the one thing you set by hand

`Priority` is your queue. It collapses "how important" and "when do I pull it"
into one axis — solo, they're the same decision — and `/triage` owns it.

```
(unset)  →  Now  →  Next  →  Later
 Inbox       committed   on deck    backlog
            + shaped    to shape   (unshaped)
```

- **Inbox** (unset) — just arrived, untriaged.
- **Later** — raw idea / backlog. Unshaped.
- **Next** — candidate, roughly understood, on deck to be shaped.
- **Now** — **shaped + appetite set + committed.** Ready to hand to the agent.

### The `shaped` label and the promotion gate

Shaping — turning a vague issue into something workable, *before any code* — is
the gate into `Now`. The `shaped` label makes it visible. It's an **attribute, not
a workflow stage**, which is exactly why it's a label and not a Status/Priority
value: it stays off both single-select axes and can't reconflate them.

| Priority | `shaped`? |
|---|---|
| `Later` | never (unshaped by definition) |
| `Next` | **the real signal** — splits "raw candidate, needs shaping" from "shaped, ready to pull" |
| `Now` | always (implied — it's the entry bar) |

So its job is to surface your **ready-to-pull pool**: the `Next + shaped` view is
your on-deck queue. It also separates the two things the `Next→Now` move bundles:

```
shape a Next item  →  add `shaped` + write appetite   (now meets the Now bar)
decide to commit   →  pull it to Now                  (one move, no re-evaluation)
```

`shaped` = "meets the `Now` bar, not yet committed."

> **Invariant: `Now ⊆ shaped`.** Everything in `Now` must carry `shaped`. If
> something is in `Now` without it, you committed to unshaped work — the exact
> failure the gate exists to prevent. `/triage` asserts this and flags violations.

### Appetite (written at promotion, not a field)

When an item moves to `Now`, write its **appetite** in the issue/epic body:

```
Appetite: 1 day — cut scope to fit, don't gold-plate.
```

Appetite is fixed-time / variable-scope: the time it's *worth*, not an estimate of
what it'll cost. You shape the solution to fit the budget and cut scope to land
inside it. It's only meaningful on things you're committing to, so it's a body
line on `Now` items — never a board column. It is *not* priority: two items can
share an appetite and still need ordering.

### Caps

| Cap | Limit | Why |
|---|---|---|
| **`Status: In Progress`** | **1–2, hard** | Real focus lever (Kanban WIP limit). Solo + agent, you can only meaningfully drive one or two PRs at once. |
| **`Priority: Now`** | **~a week, soft** | "What I've committed to before I'd re-triage." A handful of items. |

To check `Now`, **sum the appetites** already written on its items. Over your
horizon (~a week) → `Now` is overcommitted; bump something to `Next`. Capacity
check from a signal you already write — no estimation ritual.

## Epics and sub-issues

Epics use **native sub-issues only** — not a body-checkbox list, not a per-epic
label. One canonical mechanism so the agent never has to guess which is
authoritative.

> **An epic is a context document, not a work item.** It never flows through
> `Status` and never gets a `Priority`. Only its leaves do.

The epic issue does three jobs:

1. Holds the **why** + links to the `docs/…` design doc + a decisions log + the
   dependency chain.
2. Owns its **leaves** via native sub-issues (auto progress, machine-readable via
   the GraphQL API).
3. Carries the generic `epic` label so it filters *out* of the work pipeline.

**An epic's status is its sub-issue rollup, not a pipeline state.** Progress is the
native **`Sub-issues progress`** field (`closed / total`), computed by GitHub as
leaves close — a *different axis* from `Status`, so the two aren't conflated.
`/sync` therefore **skips `epic`-labelled items** and clears any `Status` that
leaks onto them. An epic reaches `Done` the normal way: when its last leaf ships,
you **close the epic**, and `closed → Done` applies. (A *leaf* that itself has a
sub-task is still a leaf; it carries the `feature` label, not `epic`, and flows
the pipeline normally.)

**Sequencing lives in the epic body / design doc, not in a field.** Native
sub-issues are an unordered set; the ordered, annotated plan belongs in the body
where the agent already reads it.

Each **leaf = one issue = one PR = one agent session** — self-contained enough to
hand the agent just the number, which it expands by following links (leaf → parent
epic → design doc → code paths).

## Milestones — dormant

Leave milestones out of the daily flow. Reach for them *only* when you want to
declare a roadmap (`v1.3`, `Q3`) — time-anchored grouping with a due date,
orthogonal to epics (a leaf can sit in an epic *and* a milestone). Until then,
ignore the field; the Roadmap layout is there when you want it.

## The skills (the workflow, codified)

The skills *are* the workflow; this doc just describes what they enact. Each board
field has exactly one owner.

| Skill | Owns | What it does |
|---|---|---|
| **`/triage`** | `Priority` + `shaped` | Sweep `Inbox`: summarize each issue, propose `Now/Next/Later` + type label + epic attachment + `shaped`, apply on confirm. Asserts `Now ⊆ shaped`. Your one judgment ritual. |
| **`/sync`** | `Status` | Read `git` + `gh pr`, derive Status for every board item (table above), reconcile. Idempotent; run anytime. |
| **`/issue`** | — | Implement a leaf end-to-end (branch `issue-<N>` → PR), then call `/sync` so the card lands in `In Progress`/`Ready`. |
| **`/release`** | — | Cut the staging→production PR; after merge, **close the batched issues directly** (`gh issue close`), then `/sync` flips them to `Done`. No `Closes #N` plumbing needed. |
| **`/standup`** | — (read-only) | Daily brief over the board: the `Now` batch with PR/CI state, blockers, what needs attention, epic progress, a suggested sequence. |

`/sync` is the heart — the pull-based translator. `/issue` and `/release` just
call it at the right moments; `/triage` owns the human axis. Small skills, the
board always derivable from the repo, zero GitHub Actions.

## Saved views — three: two axes for leaves, one for epics

Leaves are tracked on two axes (Status, Priority); epics on a third (their
sub-issue rollup). That's three genuinely-distinct surfaces — *not* six. A "Now"
list, an "on deck" pool, a "shipped" log are all *filters* inside one of these,
not views of their own.

| View | Tracks | Layout | Filter | Use |
|---|---|---|---|---|
| **FLOW** | leaves you're *doing* — `Status` (machine, `/sync`) | board, grouped by `Status` | **`priority:Now -label:epic`** | Daily driver. The `Done` column is your recently-shipped log (bounded by auto-archive — see below). |
| **SHAPE** | leaves you're *deciding* — `Priority` (human, `/triage`) | table, grouped by `Priority`, `shaped` as a column | **`is:open -label:epic`** | Triage Inbox, add `shaped` + appetite to `Next`, commit to `Now`. Absorbs triage / on-deck / now. |
| **MAP** | epics — bodies of work (`Sub-issues progress`) | table (→ Roadmap layout once milestones land) | **`label:epic is:open`** | Rollup of in-flight epics; the lay of the land. Becomes the roadmap when you populate milestones. |

**You SHAPE the work, watch it FLOW, and zoom out to the MAP.** Two notes:

- FLOW shows only the `Now` batch so its `Todo` column can't become the backlog
  dump again — `Next`/`Later` aren't moving, so they stay in SHAPE. This implies
  one discipline (same spirit as the `In Progress` WIP cap): **if you start
  working something, promote it to `Now`** — otherwise it's invisible in FLOW.
- Both leaf views exclude epics (`-label:epic`); epics live only in MAP, tracked
  by their rollup, never by Status/Priority.

### Closed-issue lifecycle

`Priority` is never cleared on close, so a shipped issue keeps `Now` and stays
visible in FLOW's `Done` column (the single `priority:Now` filter has no other way
to show it). Bound that column with GitHub's built-in **auto-archive** workflow —
archive `is:closed updated:<@today-1w` — so `Done` self-trims to the last week's
shipped work; the archive window *is* your lookback. (Archived items leave the
board but stay in the project archive.)

## Intake paths

Every path funnels into `Inbox`, gets one `/triage` decision, then rides the same
git-derived lifecycle.

### ① From support / a reporter

```
Reporter files issue → labels: reported, bug → lands in Inbox.
/triage sweeps (≈10s each):
  real + urgent  → shape it, add `shaped` + appetite → Now, attach to active epic or standalone
  real + later   → Next (+ `shaped` if already clear) / Later
  not actionable → close with a comment
```

A standalone bug needs no epic — it flows `Todo → … → Done` on its own.

### ② Surfaces mid-development

```
Hit something while working:
  in scope for the current leaf?  → fix it in the same PR, no issue.
  out of scope but real?          → file an issue, label it, drop in Inbox, keep going.
```

> **Surfacing ≠ doing.** Out-of-scope discoveries go to `Inbox` and wait for a
> triage pass. They never derail the leaf in flight.

### ③ Planned epic work

```
Shape the epic (why, doc links, decisions) → break into leaf sub-issues →
filter FLOW to the epic → pull `shaped` leaves in dependency order.
```

## The execution loop (the agent as driver)

Same for any leaf, whatever its origin:

```
1. Pick a leaf (`Now`, shaped, unblocked) — you choose from SHAPE, or hand the agent the `Now` group.
2. Agent reads the leaf + its parent epic + linked docs → full context.
3. /issue: branch issue-<N> → implement → draft PR.      → In Progress
4. Mark PR ready.                                        → Ready
5. Merge to staging (PR references #N).                  → In Dev
6. Work accumulates on staging across leaves.
7. /release cuts staging→production → batch-test → merge →
   closes the batch → /sync flips cards to Done.         → Done
```

(`/issue` and `/release` call `/sync` at steps 3 and 7; run `/sync` anytime to
reconcile after a manual action.)

## Why no story points (and no sprints)

Story points and sprints are machinery for forecasting how much a **team** clears
in a **sprint** by tracking **velocity**. This setup has no team, no sprint, and
continuous release — there's no velocity to compute and nothing to fill.

Story points also *contradict* appetite: points fix scope and estimate time;
appetite fixes time and cuts scope. Adopting both on the same items is
self-cancelling. Appetite already does the sizing, the right way for this setup;
the `In Progress` WIP cap already does the focus-limiting a sprint commitment would.
`Now` is the sprint, without the ritual.
