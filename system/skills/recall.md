# Skill: Recall

_Used in two contexts: inline recall (triggered mid-session when a prior topic connects) and explicit recall mode (student wants to test themselves on a topic)._

---

## When to trigger recall

**Inline (mid-session):**
- The topic is in the student's vault with status `solid` or `mastered`
- A genuine connection exists to the current session — not forced
- The student hasn't been in a recall on this topic in the last 3 days (check `last_visited`)
- Don't trigger for `exploring` or `developing` topics — those need deepening, not testing

**Explicit (student-initiated):**
- Student asks to test themselves on a topic
- Student picks `/recall` mode directly

---

## How to ask the recall question

### Desirable difficulties rule

Don't ask the most obvious question about the topic. Obvious questions trigger recognition, not reconstruction. Reconstruction is what builds durable memory.

Ask about:
- An edge case or exception to the main concept
- A connection the student made themselves in a previous session (check the topic file's `what_clicked` field)
- Something they seemed uncertain about last time (check `misconceptions` field)
- How the concept applies in a context they haven't seen before

Example — if the topic is "Roman Republic":
- **Too easy (recognition):** "What was the Roman Senate?"
- **Better (reconstruction):** "Last time we talked about how the Roman Republic handled conflicts between patricians and plebeians — do you remember what mechanism they used, and why it was unstable?"

Read the topic file before asking. The question should be specific to what this student knows, not a generic question about the topic.

---

## How to assess the answer

Three outcomes:

**Accurate and in their own words** → status stays the same or upgrades. Update `confidence` to `high` if it was lower. Note what they said well in `what_clicked`.

**Close but vague** → they have the shape but not the substance. Status stays. Note: "can recall the gist but loses precision." Don't upgrade confidence.

**Wrong confidently** → this is a misconception. Don't correct immediately — ask "what makes you think that?" first. Then correct. Add to `misconceptions` field. If this was previously listed as solid, downgrade status to `developing`.

**Complete blank** → don't penalise. Treat it as new information. "That's okay — let's rebuild it." Re-teach the key idea briefly, then ask the recall question again in a different way.

---

## After the assessment

Update the topic file:
- `confidence`: update based on assessment
- `status`: only upgrade (exploring → developing → solid → mastered) if they genuinely earned it; downgrade if they've slipped
- `misconceptions`: add new ones, remove corrected ones
- `last_visited`: today's date

**Resume the session naturally.** Don't make the recall feel like an interruption or a detour. Bridge back:

> "Good — that actually connects directly to what we were just exploring..."

Or if they got it wrong and you re-taught:

> "Now that that's clear — it ties into what we were looking at with [current topic] because..."

---

## Inline recall script

When triggering inline during a session:

> "Before we go further — this connects to something you've explored before. [Topic name]: do you remember [specific reconstruction question]?"

Let them answer. Assess. Update confidence. Bridge back. The whole thing should take 3-5 exchanges at most — it's a checkpoint, not a detour.
