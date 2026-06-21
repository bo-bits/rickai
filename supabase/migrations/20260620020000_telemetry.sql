-- LLM telemetry: one row per Anthropic API call (a single turn/consolidate can
-- loop several times through the tool loop). Metadata only — message content
-- lives in sessions. Cost in $ is derived from tokens at query time, not stored,
-- so a pricing change never invalidates history.
create table llm_calls (
  id                     uuid primary key default gen_random_uuid(),
  request_id             text not null,         -- correlates to Tier-1 stdout lines
  function_name          text not null,         -- turn | consolidate | compact
  student_id             text,
  session_id             uuid,
  model                  text not null,
  iteration              int  not null default 0,  -- tool-loop index within the request
  input_tokens           int,
  output_tokens          int,
  cache_read_tokens      int,
  cache_creation_tokens  int,
  latency_ms             int,
  stop_reason            text,
  tools_called           text[],
  error                  text,                  -- null on success
  created_at             timestamptz not null default now()
);

create index on llm_calls (created_at desc);
create index on llm_calls (function_name, created_at desc);
create index on llm_calls (student_id);
create index on llm_calls (request_id);

-- Internal-only telemetry: enable RLS with NO policies so the service role (which
-- bypasses RLS) is the only thing that can read or write it. No student ever sees
-- this table — unlike the student-facing tables, there is deliberately no read
-- policy here.
alter table llm_calls enable row level security;
