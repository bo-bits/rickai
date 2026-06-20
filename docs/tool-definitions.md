# Tool Definitions — Backend Handoff

_This document defines every tool Claude will call during a Rikai session. For each tool: what triggers it, what Claude sends, what the backend must return, and what the backend executes against the DB._

_The system prompt (teacher_persona + session_start) instructs Claude on when to call each tool. The backend's job is to execute the tool correctly and return a response Claude can use._

---

## Agentic loop pattern

Every API call to Claude includes:
1. The system prompt (assembled from `system/teacher_persona.md` + `system/prompts/session_start.md`)
2. The full conversation history for this session (including prior tool calls and their results)
3. The tool definitions below

Claude responds with either a text message or a `tool_use` block. If `tool_use`:
1. Execute the tool
2. Send back a `tool_result` message
3. Claude continues — either another tool call or a text message
4. Loop until Claude returns a plain message, then stream it to the user

---

## DB Schema

```sql
-- One row per student
CREATE TABLE students (
  id TEXT PRIMARY KEY,           -- e.g. "jimmy"
  name TEXT,
  language TEXT DEFAULT 'en',
  why_here TEXT,
  pace TEXT,                     -- "fast and broad" | "slow and thorough"
  approach TEXT,                 -- "big picture first" | "examples first" | "step by step" | "key ideas first"
  feedback TEXT,                 -- "direct" | "gentle"
  never_do TEXT[],               -- array of strings
  inferred_style_notes TEXT,
  interests TEXT[],              -- broad interest areas from onboarding Q1
  created_at TIMESTAMPTZ DEFAULT now()
);

-- One row per topic per student
CREATE TABLE topics (
  id SERIAL PRIMARY KEY,
  student_id TEXT REFERENCES students(id),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'exploring',   -- exploring | developing | solid | mastered
  confidence TEXT DEFAULT 'low',     -- low | medium | high
  tags TEXT[],
  what_they_know TEXT,
  misconceptions TEXT[],
  what_clicked TEXT[],
  open_thread TEXT,
  related_slugs TEXT[],              -- wikilinks to other topic slugs
  interest_note TEXT,                -- why they wanted to learn this
  last_visited DATE,
  session_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, slug)
);

-- One row per signal
CREATE TABLE signals (
  id SERIAL PRIMARY KEY,
  student_id TEXT REFERENCES students(id),
  topic_slug TEXT,
  type TEXT NOT NULL,            -- reaches-for | avoids | lights-up | confused-by | explains-well
  observation TEXT NOT NULL,
  significance TEXT,
  session_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- One row per session
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  student_id TEXT REFERENCES students(id),
  topic_slug TEXT,
  mode TEXT NOT NULL,            -- explore | deepen | recall | onboarding
  date DATE NOT NULL,
  covered TEXT,
  explained_back TEXT,
  explained_back_quality TEXT,   -- accurate | close but vague | wrong confidently | couldn't recall
  clicked TEXT[],
  didnt_stick TEXT[],
  unprompted_connections TEXT[],
  opened_with TEXT,
  closed_with TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Tools

### `get_student_context`

**When Claude calls it:** At the start of every session, before the first teaching message.

**Trigger condition in prompt:** Session start — always called automatically.

**Input:**
```json
{
  "student_id": "jimmy"
}
```

**Backend executes:**
```sql
SELECT * FROM students WHERE id = ?;
SELECT slug, title, status, last_visited, tags FROM topics WHERE student_id = ? ORDER BY last_visited DESC;
SELECT type, observation, topic_slug, session_date FROM signals WHERE student_id = ? ORDER BY created_at DESC LIMIT 10;
```

**Returns:**
```json
{
  "profile": { "name": "Jimmy", "pace": "fast and broad", "approach": "big picture first", "never_do": ["..."], "interests": ["history", "philosophy"] },
  "topics_index": [
    { "slug": "roman-empire", "title": "Roman Empire", "status": "developing", "last_visited": "2025-06-15", "tags": ["history"] }
  ],
  "recent_signals": [
    { "type": "reaches-for", "observation": "...", "topic_slug": "roman-empire", "date": "2025-06-15" }
  ]
}
```

---

### `read_topic`

**When Claude calls it:** Mid-session, when a genuine connection to a prior topic emerges.

**Trigger condition in prompt:** Student makes unprompted reference to a prior topic, conversation drifts into territory matching a known slug, or Claude wants to check if student has encountered something before.

**Input:**
```json
{
  "student_id": "jimmy",
  "slug": "roman-empire"
}
```

**Backend executes:**
```sql
SELECT * FROM topics WHERE student_id = ? AND slug = ?;
```

**Returns:** Full topic row. If not found, returns `{ "found": false }` — Claude handles gracefully (treats it as a new topic).

---

### `search_topics`

**When Claude calls it:** When Claude senses a connection but isn't sure which slug it maps to.

**Input:**
```json
{
  "student_id": "jimmy",
  "query": "greek democracy"
}
```

**Backend executes:** Fuzzy match (trigram similarity or ILIKE) against `slug`, `title`, and `tags` in the topics table.

**Returns:**
```json
{
  "matches": [
    { "slug": "greek-democracy", "title": "Greek Democracy", "status": "solid", "last_visited": "2025-06-10" }
  ]
}
```

Empty array if no matches — Claude treats as new territory.

---

### `create_topic`

**When Claude calls it:** When a new topic is introduced (Explore mode) — called at session end after the SESSION_LOG is output.

**Input:**
```json
{
  "student_id": "jimmy",
  "slug": "roman-empire",
  "title": "Roman Empire",
  "tags": ["history", "politics"],
  "interest_note": "Curious how it held together for so long, and why it fell",
  "status": "exploring",
  "what_they_know": "Knows it was big and fell; unclear on the timeline",
  "open_thread": "Why did a society that built such sophisticated law also rely on military dictatorship?"
}
```

**Backend executes:**
```sql
INSERT INTO topics (student_id, slug, title, tags, interest_note, status, what_they_know, open_thread, last_visited)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE)
ON CONFLICT (student_id, slug) DO NOTHING;
```

**Returns:** `{ "created": true }` or `{ "created": false, "reason": "already exists" }`

---

### `update_topic`

**When Claude calls it:** At session end (update status, confidence, what they know, open thread) or after inline recall (update confidence, add/remove misconceptions).

**Input:**
```json
{
  "student_id": "jimmy",
  "slug": "roman-empire",
  "fields": {
    "status": "developing",
    "confidence": "medium",
    "what_they_know": "Understands the Republic/Empire distinction; knows key figures; still fuzzy on economic causes of decline",
    "misconceptions": ["thinks Caesar was an Emperor — he wasn't"],
    "what_clicked": ["the analogy between Senate factions and modern political parties"],
    "open_thread": "Why did a society that built such sophisticated law also rely on military dictatorship?",
    "last_visited": "2025-06-20",
    "session_count": 2
  }
}
```

**Backend executes:** UPDATE topics SET {fields} WHERE student_id = ? AND slug = ?

**Returns:** `{ "updated": true }`

---

### `write_signal`

**When Claude calls it:** When a strong signal fires mid-session — student reaches toward something unprompted, lights up with genuine enthusiasm, or consistently avoids an angle. Don't call for every mild reaction — only when it's clearly meaningful.

**Input:**
```json
{
  "student_id": "jimmy",
  "topic_slug": "roman-empire",
  "type": "reaches-for",
  "observation": "Unprompted asked whether Roman governance influenced the US constitution — wasn't in the session plan",
  "significance": "Strong interest in the through-line from ancient to modern political structures",
  "session_date": "2025-06-20"
}
```

**Signal types:** `reaches-for` | `avoids` | `lights-up` | `confused-by` | `explains-well`

**Backend executes:**
```sql
INSERT INTO signals (student_id, topic_slug, type, observation, significance, session_date)
VALUES (?, ?, ?, ?, ?, ?);
```

**Returns:** `{ "written": true }`

---

### `create_session_record`

**When Claude calls it:** At session end, after the SESSION_LOG block is output.

**Input:**
```json
{
  "student_id": "jimmy",
  "topic_slug": "roman-empire",
  "mode": "explore",
  "date": "2025-06-20",
  "covered": "Introduced the Republic vs Empire distinction. Covered the role of the Senate and the transition from Republic to Empire under Caesar and Augustus.",
  "explained_back": "They described the Republic as 'rule by committee that got taken over by whoever had the biggest army'",
  "explained_back_quality": "close but vague",
  "clicked": ["the committee → strongman analogy", "Augustus keeping Senate as a rubber stamp"],
  "didnt_stick": ["specific timeline of Republic collapse"],
  "unprompted_connections": ["asked about US constitution influence"],
  "opened_with": "What do you already know about the Roman Empire, if anything?",
  "closed_with": "Why did a society that built such sophisticated law also rely on military dictatorship?"
}
```

**Backend executes:**
```sql
INSERT INTO sessions (...) VALUES (...);
```

**Returns:** `{ "created": true, "session_id": 42 }`

---

### `end_session`

**When Claude calls it:** When the student signals they're done or the session reaches a natural end. This is the compound call that wraps everything up.

**What it triggers on the backend:**
1. `create_session_record` (as above)
2. `update_topic` (status, confidence, open thread from session)
3. Any `write_signal` calls that weren't made inline

**Input:** Same as `create_session_record` plus any pending topic updates.

**Returns:** `{ "session_closed": true }` — Claude then reminds the student to push to git.

---

## Conversation state shape

Every API call must include the full conversation history for the current session, including tool calls and their results. The shape per turn:

```json
[
  { "role": "user", "content": "I want to learn about the Roman Empire" },
  { "role": "assistant", "content": [{ "type": "tool_use", "name": "get_student_context", "input": { "student_id": "jimmy" } }] },
  { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "...", "content": "{ ... }" }] },
  { "role": "assistant", "content": "Before we dive in — what do you already know about the Roman Empire?" },
  { "role": "user", "content": "Not much — I know it was huge and it fell" }
]
```

Store this in your session state (Redis or DB) keyed by `session_id`. Append each turn before sending to the API.

---

## Session end detection

Three ways to trigger `end_session`:

1. **Claude calls it** — Claude judges the session is winding down naturally. Most graceful.
2. **Student taps "End session"** — UI button, backend triggers `end_session` with current history.
3. **Inactivity timeout** — after 10 minutes of no messages, backend auto-closes and runs extraction.

Option 1 is the goal. Option 2 is the safety net. Option 3 is the fallback for abandoned sessions.
