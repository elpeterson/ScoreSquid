-- Access checks for the crawler migration. Runs in a transaction that is rolled back.
-- Prints PASS or FAIL per check. Set crawler=1 where the session can SET ROLE be_crawler
-- (plain Postgres with stubs.sql); crawler=0 on the Supabase image.
\set QUIET on
\set ON_ERROR_STOP on
begin;
\if :crawler
\else
-- A local database may be a migration behind; this is rolled back too.
\i /prereq.sql
\endif
\i /migration.sql
\i /retention.sql

create function pg_temp.t(label text, role_name text, uid uuid, q text, want text) returns void language plpgsql as $$
declare n bigint; got text; begin
  set local role none;
  perform set_config('request.jwt.claims', coalesce(json_build_object('sub', uid, 'role', role_name)::text, ''), true);
  execute format('set local role %I', role_name);
  begin
    if q ~* '^select' then execute 'select count(*) from (' || q || ') x' into n; got := 'rows:' || n;
    else execute q; get diagnostics n = row_count; got := 'rows:' || n; end if;
  exception when others then got := 'denied:' || sqlstate; end;
  set local role none;
  raise notice '% % [%] got %', case when got like want then 'PASS' else 'FAIL' end, label, role_name, got;
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');
insert into public.athletes (id, user_id, sport, name) values
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-00000000000a', 'archery', 'Test Archer A'),
  ('00000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000a', 'archery', 'Test Archer No Details'),
  ('00000000-0000-0000-0000-0000000000ac', '00000000-0000-0000-0000-00000000000a', 'archery', 'Test Archer C'),
  ('00000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-0000-00000000000a', 'archery', 'Test Archer D'),
  ('00000000-0000-0000-0000-0000000000ae', '00000000-0000-0000-0000-00000000000a', 'archery', 'Test Archer E'),
  ('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-00000000000b', 'archery', 'Test Archer B'),
  ('00000000-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-00000000000b', 'gymnastics', 'Test Gymnast');
insert into public.archer_profiles (athlete_id, membership_number, competition_start_date) values
  ('00000000-0000-0000-0000-0000000000aa', '111111', '2025-01-01'),
  ('00000000-0000-0000-0000-0000000000ab', null, null),
  ('00000000-0000-0000-0000-0000000000ac', '333333', '2025-01-01'),
  ('00000000-0000-0000-0000-0000000000ad', '444444', '2025-01-01'),
  ('00000000-0000-0000-0000-0000000000ae', '555555', '2025-01-01'),
  ('00000000-0000-0000-0000-0000000000bb', '222222', '2025-01-01');
insert into public.be_tournaments (id, name, start_date, source_updated_at) values (1, 'Made Up Open', '2026-01-01', now());
insert into public.be_events (id, tournament_id, event_type) values (1, 1, 'RankingEvent');
insert into public.be_entries (event_id, aid, alt_norm, first_name) values (1, 1, '111111', 'Someone');
insert into public.arch_be_searches (id, user_id, athlete_id, membership_number, archer_name, from_date, to_date, status)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
          '00000000-0000-0000-0000-0000000000aa', '111111', 'Test Archer A', '2026-01-01', '2026-02-01', 'finished');
insert into public.arch_be_search_matches values ('00000000-0000-0000-0000-000000000001', 1, 1, 'number', 'Made Up Open', '2026-01-01', null, 500, null);

\set a '''00000000-0000-0000-0000-00000000000a'''
\set b '''00000000-0000-0000-0000-00000000000b'''
\set arch_a '''00000000-0000-0000-0000-0000000000aa'''
-- The cache is hidden from app users.
select pg_temp.t('cache hidden', 'anon', null, 'select 1 from public.be_entries', 'denied:%');
select pg_temp.t('cache hidden', 'authenticated', :a, 'select 1 from public.be_entries', 'denied:%');
select pg_temp.t('cache hidden', 'authenticated', :a, 'select 1 from public.be_events', 'denied:%');
select pg_temp.t('cache hidden', 'authenticated', :a, 'select 1 from public.be_tournaments', 'denied:%');
select pg_temp.t('searches hidden', 'anon', null, 'select 1 from public.arch_be_searches', 'denied:%');
select pg_temp.t('matches hidden', 'anon', null, 'select 1 from public.arch_be_search_matches', 'denied:%');
-- Parents see only their own.
select pg_temp.t('owner sees search', 'authenticated', :a, 'select 1 from public.arch_be_searches', 'rows:1');
select pg_temp.t('owner sees match', 'authenticated', :a, 'select 1 from public.arch_be_search_matches', 'rows:1');
select pg_temp.t('other user no search', 'authenticated', :b, 'select 1 from public.arch_be_searches', 'rows:0');
select pg_temp.t('other user no match', 'authenticated', :b, 'select 1 from public.arch_be_search_matches', 'rows:0');
-- Parents can't write directly, so they can't choose the number searched.
select pg_temp.t('no direct insert', 'authenticated', :a, $q$insert into public.arch_be_searches (user_id, athlete_id, membership_number, archer_name, from_date, to_date) values ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000aa','999999','x','2026-01-01','2026-01-02')$q$, 'denied:42501');
select pg_temp.t('no direct status change', 'authenticated', :a, $q$update public.arch_be_searches set status='finished'$q$, 'denied:42501');
select pg_temp.t('no direct delete', 'authenticated', :a, 'delete from public.arch_be_searches', 'denied:42501');
select pg_temp.t('no match insert', 'authenticated', :a, $q$insert into public.arch_be_search_matches values ('00000000-0000-0000-0000-000000000001', 1, 2, 'number', 'x', '2026-01-01', null, 1, null)$q$, 'denied:42501');
-- Starting a search.
select pg_temp.t('anon cannot start', 'anon', null, 'select public.start_be_search(''00000000-0000-0000-0000-0000000000aa'')', 'denied:42501');
select pg_temp.t('another user''s archer', 'authenticated', :b, 'select public.start_be_search(''00000000-0000-0000-0000-0000000000aa'')', 'denied:P0002');
select pg_temp.t('a gymnast', 'authenticated', :b, 'select public.start_be_search(''00000000-0000-0000-0000-0000000000b9'')', 'denied:P0002');
select pg_temp.t('details missing', 'authenticated', :a, 'select public.start_be_search(''00000000-0000-0000-0000-0000000000ab'')', 'denied:22023');
select pg_temp.t('dates reversed', 'authenticated', :a, 'select public.start_be_search(''00000000-0000-0000-0000-0000000000aa'', ''2026-02-01'', ''2026-01-01'')', 'denied:22023');
select pg_temp.t('end date in the future', 'authenticated', :a, 'select public.start_be_search(''00000000-0000-0000-0000-0000000000aa'', null, current_date + 1)', 'denied:22023');
select pg_temp.t('start own', 'authenticated', :a, 'select public.start_be_search(''00000000-0000-0000-0000-0000000000aa'')', 'rows:1');
select pg_temp.t('number and date from profile', 'authenticated', :a, $q$select 1 from public.arch_be_searches where status='queued' and membership_number='111111' and archer_name='Test Archer A' and from_date='2025-01-01' and to_date=current_date$q$, 'rows:1');
select pg_temp.t('one active per archer', 'authenticated', :a, 'select public.start_be_search(''00000000-0000-0000-0000-0000000000aa'')', 'denied:23505');
select pg_temp.t('second archer', 'authenticated', :a, 'select public.start_be_search(''00000000-0000-0000-0000-0000000000ac'')', 'rows:1');
select pg_temp.t('third archer', 'authenticated', :a, 'select public.start_be_search(''00000000-0000-0000-0000-0000000000ad'')', 'rows:1');
select pg_temp.t('fourth is over the limit', 'authenticated', :a, 'select public.start_be_search(''00000000-0000-0000-0000-0000000000ae'')', 'denied:54000');
-- Cancelling.
select pg_temp.t('anon cannot cancel', 'anon', null, 'select public.cancel_be_search(''00000000-0000-0000-0000-000000000001'')', 'denied:42501');
select pg_temp.t('finished can''t cancel', 'authenticated', :a, 'select public.cancel_be_search(''00000000-0000-0000-0000-000000000001'')', 'denied:P0002');
select id as queued_id from public.arch_be_searches where membership_number = '111111' and status = 'queued' \gset
select pg_temp.t('other user can''t cancel', 'authenticated', :b, format('select public.cancel_be_search(%L)', :'queued_id'), 'denied:P0002');
select pg_temp.t('cancel own', 'authenticated', :a, format('select public.cancel_be_search(%L)', :'queued_id'), 'rows:1');
select pg_temp.t('cancelled', 'authenticated', :a, format('select 1 from public.arch_be_searches where id=%L and status=''cancelled''', :'queued_id'), 'rows:1');
select pg_temp.t('can start again, from before the data', 'authenticated', :a, 'select public.start_be_search(''00000000-0000-0000-0000-0000000000aa'', ''1900-01-01'')', 'rows:1');
select pg_temp.t('early date clamped', 'authenticated', :a, $q$select 1 from public.arch_be_searches where status='queued' and membership_number='111111' and from_date='2017-12-01'$q$, 'rows:1');
select id as second_id from public.arch_be_searches where membership_number = '333333' \gset
select pg_temp.t('cancel to make room', 'authenticated', :a, format('select public.cancel_be_search(%L)', :'second_id'), 'rows:1');
select pg_temp.t('sixth today is over the limit', 'authenticated', :a, 'select public.start_be_search(''00000000-0000-0000-0000-0000000000ae'')', 'denied:54000');
select pg_temp.t('other accounts unaffected', 'authenticated', :b, 'select public.start_be_search(''00000000-0000-0000-0000-0000000000bb'')', 'rows:1');

\if :crawler
select pg_temp.t('reads cache', 'be_crawler', null, 'select 1 from public.be_entries', 'rows:1');
select pg_temp.t('writes cache', 'be_crawler', null, $q$insert into public.be_entries (event_id, aid) values (1, 2)$q$, 'rows:1');
select pg_temp.t('removes an entry', 'be_crawler', null, 'delete from public.be_entries where aid=2', 'rows:1');
select pg_temp.t('can''t delete events', 'be_crawler', null, 'delete from public.be_events', 'denied:42501');
select pg_temp.t('reads searches', 'be_crawler', null, 'select 1 from public.arch_be_searches', 'rows:6');
select pg_temp.t('sets progress', 'be_crawler', null, $q$update public.arch_be_searches set tournaments_done=1 where id='00000000-0000-0000-0000-000000000001'$q$, 'rows:1');
select pg_temp.t('can''t change owner', 'be_crawler', null, 'update public.arch_be_searches set user_id=null', 'denied:42501');
select pg_temp.t('can''t change number', 'be_crawler', null, $q$update public.arch_be_searches set membership_number='1'$q$, 'denied:42501');
select pg_temp.t('can''t delete searches', 'be_crawler', null, 'delete from public.arch_be_searches', 'denied:42501');
select pg_temp.t('adds a match', 'be_crawler', null, $q$insert into public.arch_be_search_matches values ('00000000-0000-0000-0000-000000000001', 1, 3, 'name', 'x', '2026-01-01', null, 1, null)$q$, 'rows:1');
select pg_temp.t('name match can''t carry arrows', 'be_crawler', null, $q$insert into public.arch_be_search_matches values ('00000000-0000-0000-0000-000000000001', 1, 4, 'name', 'x', '2026-01-01', null, 1, 'TTT')$q$, 'denied:23514');
select pg_temp.t('no athletes', 'be_crawler', null, 'select 1 from public.athletes', 'denied:42501');
select pg_temp.t('no profiles', 'be_crawler', null, 'select 1 from public.archer_profiles', 'denied:42501');
select pg_temp.t('no scorecards', 'be_crawler', null, 'select 1 from public.arch_rounds', 'denied:42501');
select pg_temp.t('no archer view', 'be_crawler', null, 'select 1 from public.archer_athletes', 'denied:42501');
select pg_temp.t('no gym data', 'be_crawler', null, 'select 1 from public.gym_scores', 'denied:42501');
select pg_temp.t('no auth.users', 'be_crawler', null, 'select 1 from auth.users', 'denied:42501');
select pg_temp.t('can''t start searches', 'be_crawler', null, 'select public.start_be_search(''00000000-0000-0000-0000-0000000000aa'')', 'denied:42501');
select pg_temp.t('first running', 'be_crawler', null, $q$update public.arch_be_searches set status='running' where membership_number='444444'$q$, 'rows:1');
select pg_temp.t('only one running', 'be_crawler', null, $q$update public.arch_be_searches set status='running' where membership_number='222222'$q$, 'denied:23505');
\endif
-- Retention.
select pg_temp.t('anon can''t purge', 'anon', null, 'select public.purge_be_cache()', 'denied:42501');
select pg_temp.t('parent can''t purge', 'authenticated', :a, 'select public.purge_be_cache()', 'denied:42501');
\if :crawler
select pg_temp.t('crawler can''t purge', 'be_crawler', null, 'select public.purge_be_cache()', 'denied:42501');
\endif
insert into public.be_tournaments (id, name, start_date, source_updated_at, read_at) values (2, 'Made Up Old', '2024-01-01', now(), now() - interval '13 months');
insert into public.be_events (id, tournament_id, event_type) values (2, 2, 'RankingEvent');
insert into public.be_entries (event_id, aid) values (2, 1);
select public.purge_be_cache();
do $$ begin
  raise notice '% old tournament and its rows purged', case when not exists (select 1 from public.be_tournaments where id = 2) and not exists (select 1 from public.be_entries where event_id = 2) then 'PASS' else 'FAIL' end;
  raise notice '% recent tournament kept', case when exists (select 1 from public.be_tournaments where id = 1) then 'PASS' else 'FAIL' end;
  raise notice '% parent''s matches kept', case when exists (select 1 from public.arch_be_search_matches where event_id = 1) then 'PASS' else 'FAIL' end;
end $$;
rollback;
