-- The on-request Between Ends crawler (SQ-004). See docs/archery/sq-004/README.md.
--
-- be_* tables are a deliberate exception to "RLS scoped to auth.uid()": they have no
-- owner, because one tournament is shared by every archer in it. They hold other
-- people's names and numbers, many of them minors', so app users can't read them. Only
-- the crawler can, and a parent sees a copy of their own search's matches.
--
-- be_crawler can't log in until its password is set by hand, never in this public repo:
--   alter role be_crawler login password '...';
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'be_crawler') then
    create role be_crawler nologin;
  end if;
end;
$$;

create table public.be_tournaments (
  id integer primary key,              -- Between Ends' id
  name text not null,
  start_date date not null,
  source_updated_at timestamptz not null,
  etag text,
  read_at timestamptz default now() not null
);

create table public.be_events (
  id integer primary key,              -- the id in the URL, not the one in the body
  tournament_id integer not null references public.be_tournaments (id) on delete cascade,
  event_type text not null,
  etag text,
  read_at timestamptz default now() not null
);

create index be_events_tournament_idx on public.be_events (tournament_id);

create table public.be_entries (
  event_id integer not null references public.be_events (id) on delete cascade,
  aid integer not null,                -- unique per event only
  alt_raw text default '' not null,    -- the number as the organiser typed it
  alt_norm text,                       -- digits only; null when there are none
  first_name text default '' not null,
  last_name text default '' not null,
  team text default '' not null,
  division_code text default '' not null,
  division_name text,
  primary key (event_id, aid)
);

create index be_entries_alt_norm_idx on public.be_entries (alt_norm) where alt_norm is not null;
-- Entries with no number are matched by name, and only ever offered as possible matches.
create index be_entries_blank_name_idx on public.be_entries (lower(last_name), lower(first_name))
  where alt_norm is null;

-- A parent's search. The number and name are copies, so editing the archer later
-- doesn't change what a running search looks for.
create table public.arch_be_searches (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  athlete_id uuid references public.athletes (id) on delete cascade not null,
  membership_number text not null check (membership_number ~ '^[0-9]+$'),
  archer_name text not null,
  from_date date not null,
  to_date date not null,
  status text default 'queued' not null
    check (status in ('queued', 'running', 'finished', 'failed', 'cancelled')),
  tournaments_total integer default 0 not null,
  tournaments_done integer default 0 not null,
  heartbeat_at timestamptz,
  created_at timestamptz default now() not null,
  check (from_date <= to_date)
);

create index arch_be_searches_user_idx on public.arch_be_searches (user_id, created_at desc);
create index arch_be_searches_queue_idx on public.arch_be_searches (created_at) where status = 'queued';
-- One search reads at a time, so the one-request limit holds across all parents.
create unique index arch_be_searches_one_running on public.arch_be_searches ((true))
  where status = 'running';
create unique index arch_be_searches_one_active_per_archer on public.arch_be_searches (athlete_id)
  where status in ('queued', 'running');

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
  primary key (search_id, event_id, aid),
  -- A name match may be someone else, so it carries no arrows until a parent confirms it.
  check (match_kind = 'number' or arrows is null)
);

alter table public.be_tournaments enable row level security;
alter table public.be_events enable row level security;
alter table public.be_entries enable row level security;
alter table public.arch_be_searches enable row level security;
alter table public.arch_be_search_matches enable row level security;

-- Supabase grants new tables to the app roles by default, so this is what hides them.
revoke all on public.be_tournaments, public.be_events, public.be_entries,
  public.arch_be_searches, public.arch_be_search_matches
  from public, anon, authenticated;

-- Parents read their own; starting and cancelling go through the functions below.
grant select on public.arch_be_searches, public.arch_be_search_matches to authenticated;

create policy "Users read own searches" on public.arch_be_searches
  for select to authenticated
  using (auth.uid() = user_id);

create policy "Users read own search matches" on public.arch_be_search_matches
  for select to authenticated
  using (exists (
    select 1 from public.arch_be_searches s
    where s.id = search_id and s.user_id = auth.uid()
  ));

-- The crawler's whole reach: nothing else in public, and nothing in auth. Delete on
-- entries is for an organiser removing one between reads.
grant usage on schema public to be_crawler;
grant select, insert, update on public.be_tournaments, public.be_events to be_crawler;
grant select, insert, update, delete on public.be_entries to be_crawler;
grant select on public.arch_be_searches to be_crawler;
grant update (status, tournaments_total, tournaments_done, heartbeat_at)
  on public.arch_be_searches to be_crawler;
grant select, insert on public.arch_be_search_matches to be_crawler;

create policy "Crawler manages tournaments" on public.be_tournaments
  for all to be_crawler using (true) with check (true);
create policy "Crawler manages events" on public.be_events
  for all to be_crawler using (true) with check (true);
create policy "Crawler manages entries" on public.be_entries
  for all to be_crawler using (true) with check (true);
create policy "Crawler reads searches" on public.arch_be_searches
  for select to be_crawler using (true);
create policy "Crawler updates search progress" on public.arch_be_searches
  for update to be_crawler using (true) with check (true);
create policy "Crawler reads matches" on public.arch_be_search_matches
  for select to be_crawler using (true);
create policy "Crawler adds matches" on public.arch_be_search_matches
  for insert to be_crawler with check (true);

-- Queues a search for one of the caller's archers, using the number and name on the
-- profile rather than values from the client. Definer, because parents have no write
-- access to searches; it checks ownership itself. p_from defaults to the archer's
-- competition start date, and p_to to today.
--
-- Nothing proves a parent is entitled to a number: Between Ends has no way to check, so
-- anyone with an account can look up a number they type. The daily limit keeps that
-- from becoming a way to list people.
create function public.start_be_search(p_athlete uuid, p_from date default null, p_to date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  v_name text;
  v_number text;
  v_start date;
  v_from date;
  v_to date := coalesce(p_to, current_date);
  new_id uuid;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select a.name, p.membership_number, p.competition_start_date
  into v_name, v_number, v_start
  from public.athletes a
  join public.archer_profiles p on p.athlete_id = a.id
  where a.id = p_athlete and a.user_id = caller and a.sport = 'archery';

  if not found then
    raise exception 'Archer not found' using errcode = 'P0002';
  end if;

  -- Between Ends' results start in December 2017, so earlier dates add nothing.
  v_from := greatest(coalesce(p_from, v_start), date '2017-12-01');
  if v_number is null or v_from is null then
    raise exception 'The archer needs a membership number and start date' using errcode = '22023';
  end if;
  if v_from > v_to or v_to > current_date then
    raise exception 'Those search dates do not work' using errcode = '22023';
  end if;

  -- Makes two requests at once take turns, so they can't both pass the limit.
  perform pg_advisory_xact_lock(hashtext('be_search:' || caller::text));

  -- Each search can read for most of an hour, and one parent shouldn't fill the queue.
  if (select count(*) from public.arch_be_searches
      where user_id = caller and status in ('queued', 'running')) >= 3 then
    raise exception 'Too many searches are waiting' using errcode = '54000';
  end if;

  if (select count(*) from public.arch_be_searches
      where user_id = caller and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Too many searches today' using errcode = '54000';
  end if;

  insert into public.arch_be_searches (user_id, athlete_id, membership_number, archer_name, from_date, to_date)
  values (caller, p_athlete, v_number, v_name, v_from, v_to)
  returning id into new_id;

  return new_id;
end;
$$;

-- Stops one of the caller's searches. The crawler checks the status between batches.
create function public.cancel_be_search(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.arch_be_searches
  set status = 'cancelled'
  where id = p_id and user_id = auth.uid() and status in ('queued', 'running');

  if not found then
    raise exception 'No search to cancel' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.start_be_search(uuid, date, date) from public, anon;
revoke execute on function public.cancel_be_search(uuid) from public, anon;
grant execute on function public.start_be_search(uuid, date, date) to authenticated;
grant execute on function public.cancel_be_search(uuid) to authenticated;
