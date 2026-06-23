-- Explicit grants for the local Supabase stack.
--
-- Production Supabase applies these automatically when tables are created via
-- the dashboard or API. Local development only runs migration files as-is, so
-- the grants must be explicit. Without them, even service_role gets
-- "permission denied" because it holds BYPASSRLS but is not a PostgreSQL
-- superuser — it still needs table-level GRANTs.

grant usage on schema public to anon, authenticated, service_role;

-- service_role: full access (bypasses RLS for all edge function operations)
grant all on table documents to service_role;
grant all on table topics    to service_role;
grant all on table sessions  to service_role;
grant all on table llm_calls to service_role;

-- anon / authenticated: standard CRUD access (RLS policies filter rows)
grant select, insert, update, delete on table documents    to anon, authenticated;
grant select, insert, update, delete on table topics       to anon, authenticated;
grant select, insert, update, delete on table sessions     to anon, authenticated;
grant select, insert, update          on table llm_calls   to anon, authenticated;
