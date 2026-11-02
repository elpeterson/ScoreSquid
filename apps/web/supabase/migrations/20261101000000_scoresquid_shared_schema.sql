-- ScoreSquid: one account across sports. Shared identity (athletes, settings)
-- with per-sport competition tables.
--
-- Adds tables only; the existing gymnastics tables and the live app are untouched.
-- Data moves at cutover with supabase/pending/1_copy_gymnastics.sql.
--
-- Every sport table carries a fixed `sport` value and a foreign key on
-- (athlete_id, sport), so the database refuses, say, a gymnastics meet on an archer.

-- 1. Shared --------------------------------------------------------------------

create table public.athletes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  sport text not null check (sport in ('gymnastics', 'archery')),
  name text not null check (char_length(name) > 0),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint athletes_id_sport_unique unique (id, sport)
);

create index athletes_user_sport_idx on public.athletes (user_id, sport, created_at);

alter table public.athletes enable row level security;

create policy "Users manage own athletes" on public.athletes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Gymnastics ----------------------------------------------------------------

create table public.gymnast_profiles (
  athlete_id uuid primary key,
  sport text default 'gymnastics' not null check (sport = 'gymnastics'),
  mso_id text, -- MeetScoresOnline athlete ID
  discipline text default 'MAG' not null check (discipline in ('MAG', 'WAG')),
  constraint gymnast_profiles_athlete_fk foreign key (athlete_id, sport)
    references public.athletes (id, sport) on delete cascade
);

create table public.gym_settings (
  user_id uuid references auth.users(id) on delete cascade primary key,
  show_start_values boolean default false not null,
  show_placements boolean default true not null,
  updated_at timestamptz default now() not null
);

create table public.gym_competitions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  athlete_id uuid not null,
  sport text default 'gymnastics' not null check (sport = 'gymnastics'),
  name text not null check (char_length(name) > 0),
  start_date date,
  end_date date,
  level text,      -- e.g. '4' (men's DP), 'Gold' (women's Xcel)
  division text,   -- e.g. '1'/'2', a track ('E'/'J'/'S'), or free text
  all_around_place integer,
  show_start_value boolean default false not null,
  show_place boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint gym_competitions_athlete_fk foreign key (athlete_id, sport)
    references public.athletes (id, sport) on delete cascade
);

create index gym_competitions_athlete_idx on public.gym_competitions (athlete_id);

create table public.gym_scores (
  id uuid default gen_random_uuid() primary key,
  competition_id uuid references public.gym_competitions(id) on delete cascade not null,
  apparatus text not null check (char_length(apparatus) > 0),
  value numeric check (value >= 0), -- null for future or incomplete meets
  start_value numeric,
  place integer,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint gym_scores_competition_apparatus_unique unique (competition_id, apparatus)
);

alter table public.gymnast_profiles enable row level security;
alter table public.gym_settings enable row level security;
alter table public.gym_competitions enable row level security;
alter table public.gym_scores enable row level security;

create policy "Users manage own gymnast profiles" on public.gymnast_profiles
  for all
  using (exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid()))
  with check (exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid()));

create policy "Users manage own gymnastics settings" on public.gym_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own competitions" on public.gym_competitions
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid())
  );

create policy "Users manage own scores" on public.gym_scores
  for all
  using (exists (select 1 from public.gym_competitions c where c.id = competition_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.gym_competitions c where c.id = competition_id and c.user_id = auth.uid()));

create view public.gym_competitions_with_scores
with (security_invoker = true) as
select
  c.id, c.user_id, c.athlete_id, c.name, c.start_date, c.end_date, c.level,
  c.division, c.all_around_place, c.show_start_value, c.show_place, c.created_at,
  coalesce(
    (select json_agg(json_build_object('apparatus', s.apparatus, 'value', s.value, 'start_value', s.start_value, 'place', s.place))
     from public.gym_scores s where s.competition_id = c.id),
    '[]'::json
  ) as scores,
  (select sum(s.value) from public.gym_scores s where s.competition_id = c.id) as all_around_score
from public.gym_competitions c;

grant select on public.gym_competitions_with_scores to authenticated;

-- 3. Archery -------------------------------------------------------------------
-- Athlete -> event -> round -> end. Arrows are stored as printed ('X', '10' .. '1', 'M').

create table public.archer_profiles (
  athlete_id uuid primary key,
  sport text default 'archery' not null check (sport = 'archery'),
  membership_number text check (membership_number ~ '^[0-9]+$'), -- USA Archery, digits only
  constraint archer_profiles_athlete_fk foreign key (athlete_id, sport)
    references public.athletes (id, sport) on delete cascade
);

create table public.arch_events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  athlete_id uuid not null,
  sport text default 'archery' not null check (sport = 'archery'),
  name text not null,
  venue text,
  start_date date,
  end_date date,
  shot_on date,                -- the day actually shot (from the session label)
  session text,
  target text,
  division text,               -- raw Class/Div, e.g. 'RU13W'
  bow_style text,              -- 'recurve' | 'barebow' | 'compound' | ...
  environment text check (environment in ('indoor', 'outdoor')),
  distance_m numeric,          -- not on the card; confirmed at import
  face_cm integer,             -- not on the card; confirmed at import
  arrows_per_end smallint not null check (arrows_per_end between 1 and 12),
  bonus_labels text[] default '{}' not null,
  source text default 'betweenends' not null check (source in ('betweenends', 'manual')),
  source_path text,            -- original PDF in the 'scorecards' bucket
  source_hash text,            -- sha-256 of the PDF, to skip duplicate imports
  name_on_card text,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint arch_events_athlete_fk foreign key (athlete_id, sport)
    references public.athletes (id, sport) on delete cascade,
  constraint arch_events_athlete_source_unique unique (athlete_id, source_hash)
);

create index arch_events_athlete_shot_on_idx on public.arch_events (athlete_id, shot_on desc);

create table public.arch_rounds (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.arch_events(id) on delete cascade not null,
  round_number smallint not null,
  total integer not null,
  bonus integer[] default '{}' not null, -- printed bonus totals, ordered like arch_events.bonus_labels
  constraint arch_rounds_event_number_unique unique (event_id, round_number)
);

create table public.arch_ends (
  id uuid default gen_random_uuid() primary key,
  round_id uuid references public.arch_rounds(id) on delete cascade not null,
  end_number smallint not null,
  arrows text[] not null
    check (arrows <@ array['X','10','9','8','7','6','5','4','3','2','1','M']),
  constraint arch_ends_round_number_unique unique (round_id, end_number)
);

alter table public.archer_profiles enable row level security;
alter table public.arch_events enable row level security;
alter table public.arch_rounds enable row level security;
alter table public.arch_ends enable row level security;

create policy "Users manage own archer profiles" on public.archer_profiles
  for all
  using (exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid()))
  with check (exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid()));

create policy "Users manage own archery events" on public.arch_events
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid())
  );

create policy "Users manage own archery rounds" on public.arch_rounds
  for all
  using (exists (select 1 from public.arch_events e where e.id = event_id and e.user_id = auth.uid()))
  with check (exists (select 1 from public.arch_events e where e.id = event_id and e.user_id = auth.uid()));

create policy "Users manage own archery ends" on public.arch_ends
  for all
  using (exists (
    select 1 from public.arch_rounds r join public.arch_events e on e.id = r.event_id
    where r.id = round_id and e.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.arch_rounds r join public.arch_events e on e.id = r.event_id
    where r.id = round_id and e.user_id = auth.uid()
  ));

-- Writes an event with its rounds and ends in one transaction. SECURITY INVOKER,
-- so every insert still goes through the policies above.
--
-- payload: { event: {...arch_events columns...},
--            rounds: [{ round_number, total, bonus: int[], ends: [{ end_number, arrows: text[] }] }] }
create function public.import_scorecard(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  ev jsonb := payload -> 'event';
  new_event_id uuid;
  new_round_id uuid;
  rnd jsonb;
  en jsonb;
begin
  insert into public.arch_events (
    user_id, athlete_id, name, venue, start_date, end_date, shot_on, session,
    target, division, bow_style, environment, distance_m, face_cm,
    arrows_per_end, bonus_labels, source, source_path, source_hash, name_on_card
  ) values (
    auth.uid(),
    (ev ->> 'athlete_id')::uuid,
    ev ->> 'name',
    ev ->> 'venue',
    (ev ->> 'start_date')::date,
    (ev ->> 'end_date')::date,
    (ev ->> 'shot_on')::date,
    ev ->> 'session',
    ev ->> 'target',
    ev ->> 'division',
    ev ->> 'bow_style',
    ev ->> 'environment',
    (ev ->> 'distance_m')::numeric,
    (ev ->> 'face_cm')::integer,
    (ev ->> 'arrows_per_end')::smallint,
    coalesce(array(select jsonb_array_elements_text(ev -> 'bonus_labels')), '{}'),
    coalesce(ev ->> 'source', 'betweenends'),
    ev ->> 'source_path',
    ev ->> 'source_hash',
    ev ->> 'name_on_card'
  )
  returning id into new_event_id;

  for rnd in select * from jsonb_array_elements(payload -> 'rounds') loop
    insert into public.arch_rounds (event_id, round_number, total, bonus)
    values (
      new_event_id,
      (rnd ->> 'round_number')::smallint,
      (rnd ->> 'total')::integer,
      coalesce(array(select (jsonb_array_elements_text(rnd -> 'bonus'))::integer), '{}')
    )
    returning id into new_round_id;

    for en in select * from jsonb_array_elements(rnd -> 'ends') loop
      insert into public.arch_ends (round_id, end_number, arrows)
      values (
        new_round_id,
        (en ->> 'end_number')::smallint,
        array(select jsonb_array_elements_text(en -> 'arrows'))
      );
    end loop;
  end loop;

  return new_event_id;
end;
$$;

revoke execute on function public.import_scorecard(jsonb) from public, anon;
grant execute on function public.import_scorecard(jsonb) to authenticated;

-- Private bucket for original scorecard PDFs; each user's files live under a
-- folder named after their uid.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scorecards', 'scorecards', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "Users read own scorecards" on storage.objects
  for select using (bucket_id = 'scorecards' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users upload own scorecards" on storage.objects
  for insert with check (bucket_id = 'scorecards' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete own scorecards" on storage.objects
  for delete using (bucket_id = 'scorecards' and (storage.foldername(name))[1] = auth.uid()::text);
