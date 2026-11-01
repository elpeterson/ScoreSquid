-- Copy live gymnastics data into the ScoreSquid tables, keeping every ID.
--
-- Run at cutover, right before the new app deploys. NOT in migrations/, so
-- `supabase db push` can't run it early. Safe to re-run: each run makes the new
-- tables match the old ones, including edits and deletes. Do not re-run once the
-- new app is live, or it would overwrite newer data.
--
-- All or nothing: a failed count check at the end rolls everything back.

begin;

-- Deletes first: anything removed from the old tables since an earlier run.
delete from public.athletes a
where a.sport = 'gymnastics'
  and not exists (select 1 from public.gymnasts g where g.id = a.id);

delete from public.gym_competitions n
where not exists (select 1 from public.competitions o where o.id = n.id);

delete from public.gym_scores n
where not exists (select 1 from public.scores o where o.id = n.id);

insert into public.athletes (id, user_id, sport, name, created_at, updated_at)
select id, user_id, 'gymnastics', name, created_at, updated_at
from public.gymnasts
on conflict (id) do update set
  user_id = excluded.user_id, name = excluded.name, updated_at = excluded.updated_at;

insert into public.gymnast_profiles (athlete_id, mso_id, discipline)
select id, mso_id, discipline
from public.gymnasts
on conflict (athlete_id) do update set
  mso_id = excluded.mso_id, discipline = excluded.discipline;

insert into public.gym_settings (user_id, show_start_values, show_placements, updated_at)
select user_id, show_start_values, show_placements, updated_at
from public.user_settings
on conflict (user_id) do update set
  show_start_values = excluded.show_start_values,
  show_placements = excluded.show_placements,
  updated_at = excluded.updated_at;

insert into public.gym_competitions (
  id, user_id, athlete_id, name, start_date, end_date, level, division,
  all_around_place, show_start_value, show_place, created_at, updated_at
)
select
  id, user_id, gymnast_id, name, start_date, end_date, level, division,
  all_around_place, show_start_value, show_place, created_at, updated_at
from public.competitions
on conflict (id) do update set
  user_id = excluded.user_id, athlete_id = excluded.athlete_id, name = excluded.name,
  start_date = excluded.start_date, end_date = excluded.end_date, level = excluded.level,
  division = excluded.division, all_around_place = excluded.all_around_place,
  show_start_value = excluded.show_start_value, show_place = excluded.show_place,
  updated_at = excluded.updated_at;

insert into public.gym_scores (
  id, competition_id, apparatus, value, start_value, place, created_at, updated_at
)
select id, competition_id, apparatus, value, start_value, place, created_at, updated_at
from public.scores
on conflict (id) do update set
  competition_id = excluded.competition_id, apparatus = excluded.apparatus,
  value = excluded.value, start_value = excluded.start_value, place = excluded.place,
  updated_at = excluded.updated_at;

do $$
begin
  if (select count(*) from public.gymnasts) <> (select count(*) from public.athletes where sport = 'gymnastics')
    or (select count(*) from public.gymnasts) <> (select count(*) from public.gymnast_profiles)
    or (select count(*) from public.competitions) <> (select count(*) from public.gym_competitions)
    or (select count(*) from public.scores) <> (select count(*) from public.gym_scores)
    or (select count(*) from public.user_settings) <> (select count(*) from public.gym_settings)
    or exists (
      select 1 from public.scores o
      left join public.gym_scores n on n.id = o.id
      where n.id is null or n.value is distinct from o.value
    )
  then
    raise exception 'Gymnastics copy check failed: nothing was changed';
  end if;
end $$;

commit;
