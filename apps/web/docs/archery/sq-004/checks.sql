\set QUIET on
\set ON_ERROR_STOP on
begin;
\i /draft-schema.sql

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
  ('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-00000000000b', 'archery', 'Test Archer B');
insert into public.be_tournaments values (1, 'Made Up Open', '2026-01-01', now());
insert into public.be_events (id, tournament_id, event_type) values (1, 1, 'RankingEvent');
insert into public.be_entries (event_id, aid, alt_norm, first_name) values (1, 1, '111111', 'Someone');
insert into public.arch_be_searches (id, user_id, athlete_id, membership_number, archer_name, from_date, to_date)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
          '00000000-0000-0000-0000-0000000000aa', '111111', 'Test Archer A', '2026-01-01', '2026-02-01');
insert into public.arch_be_search_matches values ('00000000-0000-0000-0000-000000000001', 1, 1, 'number', 'Made Up Open', '2026-01-01', null, 500, null);

\set a '''00000000-0000-0000-0000-00000000000a'''
\set b '''00000000-0000-0000-0000-00000000000b'''
select pg_temp.t('cache hidden', 'anon', null, 'select 1 from public.be_entries', 'denied:%');
select pg_temp.t('cache hidden', 'authenticated', :a, 'select 1 from public.be_entries', 'denied:%');
select pg_temp.t('cache hidden', 'authenticated', :a, 'select 1 from public.be_tournaments', 'denied:%');
select pg_temp.t('searches hidden', 'anon', null, 'select 1 from public.arch_be_searches', 'denied:%');
select pg_temp.t('owner sees search', 'authenticated', :a, 'select 1 from public.arch_be_searches', 'rows:1');
select pg_temp.t('owner sees match', 'authenticated', :a, 'select 1 from public.arch_be_search_matches', 'rows:1');
select pg_temp.t('other user no search', 'authenticated', :b, 'select 1 from public.arch_be_searches', 'rows:0');
select pg_temp.t('other user no match', 'authenticated', :b, 'select 1 from public.arch_be_search_matches', 'rows:0');
select pg_temp.t('search on own archer', 'authenticated', :a, $q$insert into public.arch_be_searches (athlete_id, membership_number, archer_name, from_date, to_date) values ('00000000-0000-0000-0000-0000000000aa','1','x','2026-01-01','2026-01-02')$q$, 'rows:1');
select pg_temp.t('search on another''s archer', 'authenticated', :a, $q$insert into public.arch_be_searches (athlete_id, membership_number, archer_name, from_date, to_date) values ('00000000-0000-0000-0000-0000000000bb','1','x','2026-01-01','2026-01-02')$q$, 'denied:%');
select pg_temp.t('parent cannot set status', 'authenticated', :a, $q$update public.arch_be_searches set status='finished'$q$, 'denied:%');
select pg_temp.t('crawler reads cache', 'be_crawler', null, 'select 1 from public.be_entries', 'rows:1');
select pg_temp.t('crawler writes cache', 'be_crawler', null, $q$insert into public.be_entries (event_id, aid) values (1, 2)$q$, 'rows:1');
select pg_temp.t('crawler reads searches', 'be_crawler', null, 'select 1 from public.arch_be_searches', 'rows:2');
select pg_temp.t('crawler sets progress', 'be_crawler', null, $q$update public.arch_be_searches set tournaments_done=1 where id='00000000-0000-0000-0000-000000000001'$q$, 'rows:1');
select pg_temp.t('crawler cannot change owner', 'be_crawler', null, $q$update public.arch_be_searches set user_id=null$q$, 'denied:%');
select pg_temp.t('crawler cannot delete', 'be_crawler', null, 'delete from public.arch_be_searches', 'denied:%');
select pg_temp.t('crawler no athletes', 'be_crawler', null, 'select 1 from public.athletes', 'denied:%');
select pg_temp.t('crawler no scorecards', 'be_crawler', null, 'select 1 from public.arch_rounds', 'denied:%');
select pg_temp.t('crawler no archer view', 'be_crawler', null, 'select 1 from public.archer_athletes', 'denied:%');
select pg_temp.t('crawler no gym data', 'be_crawler', null, 'select 1 from public.gym_scores', 'denied:%');
select pg_temp.t('crawler no auth.users', 'be_crawler', null, 'select 1 from auth.users', 'denied:%');
select pg_temp.t('first running search', 'be_crawler', null, $q$update public.arch_be_searches set status='running' where membership_number='111111'$q$, 'rows:1');
select pg_temp.t('second running search', 'be_crawler', null, $q$update public.arch_be_searches set status='running' where membership_number='1'$q$, 'denied:23505');
rollback;
