-- Draft for SQ-004. Not a migration yet.
-- Private cache of what the crawler has read. RLS on, and no policy for anon or
-- authenticated: other people's entries are never readable by app users.
create role be_crawler nologin;  -- the password is set by hand, never in this public repo

create table public.be_tournaments (
  id integer primary key,
  name text not null,
  start_date date not null,
  source_updated_at timestamptz not null,
  read_at timestamptz not null default now()
);

create table public.be_events (
  id integer primary key,
  tournament_id integer not null references public.be_tournaments (id) on delete cascade,
  event_type text not null,
  etag text,
  read_at timestamptz not null default now()
);

create table public.be_entries (
  event_id integer not null references public.be_events (id) on delete cascade,
  aid integer not null,
  alt_raw text not null default '',
  alt_norm text,
  first_name text not null default '',
  last_name text not null default '',
  team text not null default '',
  division_code text not null default '',
  division_name text,
  primary key (event_id, aid)
);
create index be_entries_alt_norm on public.be_entries (alt_norm) where alt_norm is not null;

-- A parent's search. The owner reads it; the crawler works it.
create table public.arch_be_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  membership_number text not null,
  archer_name text not null,
  from_date date not null,
  to_date date not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'finished', 'failed', 'cancelled')),
  tournaments_total integer not null default 0,
  tournaments_done integer not null default 0,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now()
);
-- One search reads at a time, so the 1 request a second limit is global.
create unique index arch_be_one_running on public.arch_be_searches ((true)) where status = 'running';

-- Only this search's matches: a copy, so a parent never reads be_entries.
create table public.arch_be_search_matches (
  search_id uuid not null references public.arch_be_searches (id) on delete cascade,
  event_id integer not null,
  aid integer not null,
  match_kind text not null check (match_kind in ('number', 'name')),
  tournament_name text not null,
  tournament_date date not null,
  division text,
  total integer,
  arrows text,
  primary key (search_id, event_id, aid)
);

alter table public.be_tournaments enable row level security;
alter table public.be_events enable row level security;
alter table public.be_entries enable row level security;
alter table public.arch_be_searches enable row level security;
alter table public.arch_be_search_matches enable row level security;

revoke all on public.be_tournaments, public.be_events, public.be_entries from public, anon, authenticated;
revoke all on public.arch_be_searches, public.arch_be_search_matches from public, anon, authenticated;

grant select on public.arch_be_searches, public.arch_be_search_matches to authenticated;
grant insert (athlete_id, membership_number, archer_name, from_date, to_date)
  on public.arch_be_searches to authenticated;

create policy "own searches" on public.arch_be_searches for select to authenticated
  using (user_id = auth.uid());
create policy "start own searches" on public.arch_be_searches for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.athletes a
                where a.id = athlete_id and a.user_id = auth.uid() and a.sport = 'archery')
  );
create policy "own matches" on public.arch_be_search_matches for select to authenticated
  using (exists (select 1 from public.arch_be_searches s
                 where s.id = search_id and s.user_id = auth.uid()));

-- The crawler's whole reach. Nothing else in public or auth.
grant usage on schema public to be_crawler;
grant select, insert, update on public.be_tournaments, public.be_events, public.be_entries to be_crawler;
grant select on public.arch_be_searches to be_crawler;
grant update (status, tournaments_total, tournaments_done, heartbeat_at) on public.arch_be_searches to be_crawler;
grant select, insert on public.arch_be_search_matches to be_crawler;
create policy "crawler" on public.be_tournaments for all to be_crawler using (true) with check (true);
create policy "crawler" on public.be_events for all to be_crawler using (true) with check (true);
create policy "crawler" on public.be_entries for all to be_crawler using (true) with check (true);
create policy "crawler reads" on public.arch_be_searches for select to be_crawler using (true);
create policy "crawler progress" on public.arch_be_searches for update to be_crawler using (true) with check (true);
create policy "crawler reads" on public.arch_be_search_matches for select to be_crawler using (true);
create policy "crawler adds" on public.arch_be_search_matches for insert to be_crawler with check (true);
