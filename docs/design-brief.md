# rickai — Design Brief (v3)

## What it is
A personal tutor whose value is the **context layer**, not the content. Claude already knows everything; the product knows *this student* — what they've explored, what lights them up, what doesn't stick — and teaches accordingly. Learning-for-its-own-sake users, not exam-prep.

## Core mechanics
- **Feynman.** A session lands when the student explains it back.
- **Signals, not scores.** Track curiosity (what they reach for), per-student since patterns are cross-topic.
- **No fixed mode.** Empty topic plays as exploration, a topic with content plays as recall. The entry point disambiguates before the model is called.
- **Cross-topic weaving** (the load-bearing thesis): a Greek-history student who keeps asking about philosophy gets Socrates woven in. The model can only do this if it knows the philosophy topic *exists*.

## Architecture
- **LLM:** raw Anthropic Messages API. No Agent SDK / Managed Agents (subprocess + warm-process cost, buys nothing here).
- **Orchestrator:** Supabase Edge Functions. Each turn is a stateless event.
- **DB:** Supabase Postgres (`pg_cron`/`pg_net` scheduling for free; tight Edge Function integration).

**Data model**

```
documents  student_id, doc_type('profile'|'signals'|'topic'), topic_slug, content, updated_at
topics      student_id, topic_slug, title, status, last_session_at, resume_prompt, created_at
sessions    id, student_id, topic_slug, messages(jsonb), started_at, ended_at
```

**Context strategy *(changed from v2)*** — split by cost-and-certainty:
- **Floor (always injected):** profile + signals. One row each, always relevant; never tool-gated.
- **Tool-loaded:** topic *content*. The prompt seeds a manifest (slug, title, status, last_session_at, resume_prompt); the model calls `read_topic(slug)` to pull content on demand.
- Reverses v2's "deferred tool / not agentic read path." `read_topic` is in from v0 because cross-topic weaving is the thesis.

**Reads agentic, writes deferred.** `read_topic` runs before the reply (round-trip invisible). All writes stay in a post-session pass — never live tools.

**`turn` function** owns one turn, not the conversation. Inner loop (`model → tool_use → read_topic → model …`) runs inside one invocation; the outer conversation loop is client-driven, one stateless call per message. Named `turn`, not `loop`, because it must not hold a connection open across a session. **Persist the full `messages` array including tool blocks**, or the model re-reads every turn.

## V0 scope — read/teach path only
**In:** schema + `turn` function (with `read_topic`) + minimal system prompt.
**Out (separate track):** write-back / signal+topic extraction.
**Consequence:** rows are read-only at runtime — hand-seed profile + a few topics + manifest as fixtures. Proves *"teaches well with loaded context,"* not yet *"gets better over time."*

**Schema (proposed, not frozen):** identity = `auth.users` (no `students` table), scope by `auth.uid()`. RLS on all tables guards the client home read; functions use the service role and **must filter by `student_id` themselves**. `documents` uses `unique nulls not distinct (student_id, doc_type, topic_slug)` so one profile/signals row is enforced.

## Parked
- **Anchor loading on resume:** prefetch the tapped topic inline (instant turn 1) vs. uniform manifest + `read_topic` (one code path, +1 round-trip). Doesn't block anything.
- **Write-back design:** output shape, signals full-rewrite vs. append, status taxonomy, `pg_cron` scheduling.

## Open
- Home "resume" choice when multiple topics are live; students see signals or not; voice dictation.
- Suggested-topics recommendation logic; `curriculum/paths` ownership.
- Teaching: directiveness, when to introduce unasked concepts, handling disengagement.

## Decisions
| Decision | Choice |
|---|---|
| LLM access | Raw Messages API |
| Agent framework | None |
| Orchestrator | Edge Functions |
| DB | Postgres |
| KB format | Postgres rows holding markdown |
| RAG / vector DB | No |
| Signal scope | Per-student |
| **Context injection** | **Floor (profile+signals) + tool-loaded topics, manifest in prompt** |
| **`read_topic`** | **In from v0** |
| **Read/write path** | **Reads agentic (tool); writes deferred (post-session)** |
| **`turn` granularity** | **One turn/invocation; inner tool loop; not `loop`** |
| **Identity** | **`auth.users` + RLS + explicit `student_id` scoping** |
| Extraction | Post-session call, list of topic updates *(out of v0)* |
| Teaching method | Feynman |
| Gamification | Minimal |
| Frontend | Native mobile app |
