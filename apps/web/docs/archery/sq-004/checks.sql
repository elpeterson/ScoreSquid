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
\i /kick.sql
\i /import.sql

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
-- Restarting a search gone silent: once per 15 minutes, and only your own.
insert into public.arch_be_searches (id, user_id, athlete_id, membership_number, archer_name, from_date, to_date, created_at)
  values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a',
          '00000000-0000-0000-0000-0000000000ae', '555555', 'Test Archer E', '2026-01-01', '2026-02-01', now() - interval '1 hour');
\set old '''select 1 where public.kick_be_search(''''00000000-0000-0000-0000-000000000002'''')'''
select pg_temp.t('anon can''t kick', 'anon', null, :old, 'denied:42501');
select pg_temp.t('other user''s kick does nothing', 'authenticated', :b, :old, 'rows:0');
select pg_temp.t('owner''s first kick', 'authenticated', :a, :old, 'rows:1');
select pg_temp.t('second kick is refused', 'authenticated', :a, :old, 'rows:0');
do $$ begin raise notice '% kick leaves the heartbeat alone', case when (select heartbeat_at from public.arch_be_searches where id = '00000000-0000-0000-0000-000000000002') is null then 'PASS' else 'FAIL' end; end $$;
update public.arch_be_searches set kicked_at = now() - interval '1 hour' where id = '00000000-0000-0000-0000-000000000002';
select pg_temp.t('allowed again later', 'authenticated', :a, :old, 'rows:1');
update public.arch_be_searches set kicked_at = null, created_at = now() where id = '00000000-0000-0000-0000-000000000002';
select pg_temp.t('a recent search can''t be kicked', 'authenticated', :a, :old, 'rows:0');
-- Import: real scorecard tables only, so on the Supabase image.
\if :crawler
select pg_temp.t('crawler stores the layout', 'be_crawler', null, $q$insert into public.arch_be_search_matches (search_id, event_id, aid, match_kind, tournament_name, tournament_date, tournament_id, event_type, rounds, ends_per_round, arrows_per_end, scoring_rule, round_totals, division_code, venue, session, target, tournament_end_date) values ('00000000-0000-0000-0000-000000000001', 1, 9, 'number', 'x', '2026-01-01', 1, 'RankingEvent', 1, 2, 3, 0, '57', 'RU13W', 'v', 's', '7B', '2026-01-02')$q$, 'rows:1');
select pg_temp.t('crawler no scorecards', 'be_crawler', null, 'select 1 from public.arch_events', 'denied:42501');
\else
\set card '''select public.import_scorecard(''''{"event":{"athlete_id":"00000000-0000-0000-0000-0000000000aa","name":"Made Up Open","environment":"indoor","arrows_per_end":3,"bonus_labels":[],"source":"betweenends_api","bow_style":"recurve","distance_m":18,"face_cm":40,"be_tournament_id":1,"be_event_id":7,"be_aid":1,"be_arrows":"XTT"},"rounds":[{"round_number":1,"total":30,"bonus":[],"ends":[{"end_number":1,"arrows":["X","10","10"]}]}]}''''::jsonb)'''
select pg_temp.t('import a result', 'authenticated', :a, :card, 'rows:1');
select pg_temp.t('rounds and ends saved', 'authenticated', :a, 'select 1 from public.arch_ends e join public.arch_rounds r on r.id=e.round_id join public.arch_events v on v.id=r.event_id where v.be_event_id=7', 'rows:1');
select pg_temp.t('same result again is refused', 'authenticated', :a, :card, 'denied:23505');
select pg_temp.t('another''s archer is refused', 'authenticated', :b, :card, 'denied:42501');
select pg_temp.t('other user can''t see it', 'authenticated', :b, 'select 1 from public.arch_events where be_event_id=7', 'rows:0');
select pg_temp.t('bad arrow leaves no partial card', 'authenticated', :a, $q$select public.import_scorecard('{"event":{"athlete_id":"00000000-0000-0000-0000-0000000000aa","name":"Bad","environment":"indoor","arrows_per_end":3,"bonus_labels":[],"source":"betweenends_api","be_event_id":8,"be_aid":1},"rounds":[{"round_number":1,"total":1,"bonus":[],"ends":[{"end_number":1,"arrows":["a"]}]}]}'::jsonb)$q$, 'denied:23514');
select pg_temp.t('no partial card', 'authenticated', :a, 'select 1 from public.arch_events where be_event_id=8', 'rows:0');
select pg_temp.t('a PDF import still works', 'authenticated', :a, $q$select public.import_scorecard('{"event":{"athlete_id":"00000000-0000-0000-0000-0000000000aa","name":"Pdf","environment":"indoor","arrows_per_end":3,"bonus_labels":[],"source_hash":"abc"},"rounds":[{"round_number":1,"total":10,"bonus":[],"ends":[{"end_number":1,"arrows":["X"]}]}]}'::jsonb)$q$, 'rows:1');
select pg_temp.t('ids must come together', 'authenticated', :a, $q$select public.import_scorecard('{"event":{"athlete_id":"00000000-0000-0000-0000-0000000000aa","name":"Half","environment":"indoor","arrows_per_end":3,"bonus_labels":[],"be_event_id":9},"rounds":[{"round_number":1,"total":10,"bonus":[],"ends":[{"end_number":1,"arrows":["X"]}]}]}'::jsonb)$q$, 'denied:23514');
select id as api_card from public.arch_events where be_event_id = 7 \gset
select id as pdf_card from public.arch_events where name = 'Pdf' \gset
\set rounds '[{"round_number":1,"total":29,"bonus":[],"ends":[{"end_number":1,"arrows":["10","10","9"]}]}]'
select pg_temp.t('anon can''t replace', 'anon', null, format('select public.replace_be_scorecard(%L, %L::jsonb, ''TT9'', 3::smallint)', :'api_card', :'rounds'), 'denied:42501');
select pg_temp.t('other user can''t replace', 'authenticated', :b, format('select public.replace_be_scorecard(%L, %L::jsonb, ''TT9'', 3::smallint)', :'api_card', :'rounds'), 'denied:P0002');
select pg_temp.t('can''t replace a PDF', 'authenticated', :a, format('select public.replace_be_scorecard(%L, %L::jsonb, ''TT9'', 3::smallint)', :'pdf_card', :'rounds'), 'denied:P0002');
select pg_temp.t('bad correction changes nothing', 'authenticated', :a, format('select public.replace_be_scorecard(%L, %L::jsonb, ''TT9'', 3::smallint)', :'api_card', '[{"round_number":1,"total":1,"bonus":[],"ends":[{"end_number":1,"arrows":["a"]}]}]'), 'denied:23514');
select pg_temp.t('...still the old total', 'authenticated', :a, format('select 1 from public.arch_rounds where event_id=%L and total=30', :'api_card'), 'rows:1');
update public.arch_events set bow_style = 'barebow', notes = 'mine' where id = :'api_card';
select pg_temp.t('accept a correction', 'authenticated', :a, format('select public.replace_be_scorecard(%L, %L::jsonb, ''TT9'', 3::smallint)', :'api_card', :'rounds'), 'rows:1');
select pg_temp.t('new arrows, one round', 'authenticated', :a, format('select 1 from public.arch_rounds where event_id=%L and total=29', :'api_card'), 'rows:1');
select pg_temp.t('setup and notes kept', 'authenticated', :a, format('select 1 from public.arch_events where id=%L and bow_style=''barebow'' and notes=''mine'' and distance_m=18 and be_arrows=''TT9''', :'api_card'), 'rows:1');
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
