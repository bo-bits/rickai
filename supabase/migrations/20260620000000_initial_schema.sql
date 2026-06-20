-- documents: profile, signals, and topic content blobs per student
create table documents (
  id           uuid primary key default gen_random_uuid(),
  student_id   text not null,
  doc_type     text not null check (doc_type in ('profile', 'signals', 'topic')),
  topic_slug   text,
  content      text not null,
  updated_at   timestamptz not null default now(),

  -- one profile row and one signals row per student; multiple topic rows keyed by slug
  constraint documents_unique unique nulls not distinct (student_id, doc_type, topic_slug)
);

-- topics: manifest row per topic per student (lightweight, always available)
create table topics (
  id               uuid primary key default gen_random_uuid(),
  student_id       text not null,
  topic_slug       text not null,
  title            text not null,
  status           text not null default 'exploring' check (status in ('exploring', 'developing', 'solid', 'mastered')),
  last_session_at  timestamptz,
  resume_prompt    text,
  created_at       timestamptz not null default now(),

  constraint topics_unique unique (student_id, topic_slug)
);

-- sessions: one row per conversation, messages persisted as jsonb
create table sessions (
  id           uuid primary key default gen_random_uuid(),
  student_id   text not null,
  topic_slug   text,
  messages     jsonb not null default '[]',
  started_at   timestamptz not null default now(),
  ended_at     timestamptz
);

create index on sessions (student_id, topic_slug, started_at desc);
create index on documents (student_id, doc_type);
create index on topics (student_id);

-- RLS: enabled per the design brief so the eventual client-side "home read" is
-- guarded. In V0 there is no auth — the `turn` edge function uses the service-role
-- key (which bypasses RLS) and filters by student_id itself. These policies are
-- inert placeholders until real identity (auth.users + JWT) lands.
alter table documents enable row level security;
alter table topics enable row level security;
alter table sessions enable row level security;

create policy "students read own documents" on documents
  for select using (auth.uid()::text = student_id);
create policy "students read own topics" on topics
  for select using (auth.uid()::text = student_id);
create policy "students read own sessions" on sessions
  for select using (auth.uid()::text = student_id);
