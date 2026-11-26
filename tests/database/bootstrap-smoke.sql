-- Minimal disposable Supabase-compatible role/auth structure for PostgreSQL CI.
-- Never run this bootstrap against a real Supabase project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create schema extensions;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable
as $$ select null::uuid $$;
