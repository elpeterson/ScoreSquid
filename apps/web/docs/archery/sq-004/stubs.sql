create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
create table public.athletes (id uuid primary key, user_id uuid, sport text, name text);
alter table public.athletes enable row level security;
create policy own on public.athletes for select to authenticated using (user_id = auth.uid());
grant select on public.athletes to authenticated;
create table public.arch_rounds (id int); create table public.gym_scores (id int);
create view public.archer_athletes as select * from public.athletes;
-- Mirror Supabase's default: new tables are granted to the app roles, so the revokes must do the work.
alter default privileges in schema public grant all on tables to anon, authenticated;
