-- Filling a hand-entered meet from MSO: remember suggestions a parent rejected,
-- and let the update also link the meet to MSO in the same transaction.

alter table public.gym_competitions
  add column rejected_mso_meet_ids text[] default '{}' not null
    check (cardinality(rejected_mso_meet_ids) <= 200);

create or replace function public.update_competition_from_mso(
  p_id uuid,
  p_fields jsonb,
  p_scores jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  s jsonb;
begin
  update public.gym_competitions
  set
    name = case when p_fields ? 'name' then p_fields ->> 'name' else name end,
    level = case when p_fields ? 'level' then p_fields ->> 'level' else level end,
    division = case when p_fields ? 'division' then p_fields ->> 'division' else division end,
    start_date = case when p_fields ? 'start_date' then (p_fields ->> 'start_date')::date else start_date end,
    end_date = case when p_fields ? 'end_date' then (p_fields ->> 'end_date')::date else end_date end,
    all_around_place = case when p_fields ? 'all_around_place' then (p_fields ->> 'all_around_place')::integer else all_around_place end,
    -- Only an unlinked meet can be linked, so a repeated request can't re-link one.
    mso_meet_id = case when p_fields ? 'mso_meet_id' and mso_meet_id is null then p_fields ->> 'mso_meet_id' else mso_meet_id end,
    updated_at = now()
  where id = p_id and user_id = auth.uid();

  if not found then
    raise exception 'Competition not found' using errcode = 'P0002';
  end if;

  for s in select * from jsonb_array_elements(p_scores) loop
    insert into public.gym_scores (competition_id, apparatus, value, place)
    values (
      p_id,
      s ->> 'apparatus',
      (s ->> 'value')::numeric,
      (s ->> 'place')::integer
    )
    on conflict (competition_id, apparatus) do update set
      value = case when s ? 'value' then excluded.value else public.gym_scores.value end,
      place = case when s ? 'place' then excluded.place else public.gym_scores.place end,
      updated_at = now();
  end loop;
end;
$$;
