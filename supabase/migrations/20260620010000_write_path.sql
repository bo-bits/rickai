-- Write path: drop `signals` doc_type (profile doc now carries all student
-- context) and add a compaction `summary` to sessions.

-- 1. Remove the `signals` document type. The profile doc absorbs that context.
--    No data migration needed in V0 — the local stack re-applies via `db reset`,
--    and there are no signals rows worth preserving.
alter table documents drop constraint documents_doc_type_check;
alter table documents add constraint documents_doc_type_check
  check (doc_type in ('profile', 'topic'));

-- 2. Compaction summary. When `compact` reseats a long conversation into a fresh
--    session, the internal summary of the prior conversation lives here so the
--    next `turn` can resume coherently.
alter table sessions add column summary text;
