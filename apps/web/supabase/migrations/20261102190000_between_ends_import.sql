-- Importing chosen Between Ends results as scorecards (SQ-020), and keeping them safe
-- when a later search finds them again (SQ-021).

-- What a scorecard needs from the event, kept with the match so an import reads nothing
-- from Between Ends. Null on matches found before this, which need searching again.
alter table public.arch_be_search_matches
  add column tournament_id integer,
  add column event_type text,
  add column rounds smallint,
  add column ends_per_round smallint,
  add column arrows_per_end smallint,
  add column scoring_rule smallint,
  add column round_totals text,
  add column division_code text,
  add column venue text,
  add column session text,
  add column target text,
  add column tournament_end_date date;

-- Tells an API import from a PDF, and identifies the result it came from. be_arrows is
-- what Between Ends last showed, so a later search can spot a correction. It isn't the
-- scorecard's data: arch_ends is.
alter table public.arch_events
  drop constraint arch_events_source_check,
  add constraint arch_events_source_check check (source in ('betweenends', 'betweenends_api', 'manual')),
  add column be_tournament_id integer,
  add column be_event_id integer,
  add column be_aid integer,
  add column be_arrows text,
  add constraint arch_events_be_ids_together check ((be_event_id is null) = (be_aid is null));

create unique index arch_events_be_result_unique on public.arch_events (athlete_id, be_event_id, be_aid)
  where be_event_id is not null;

create or replace function public.import_scorecard(payload jsonb)
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
    arrows_per_end, bonus_labels, source, source_path, source_hash, name_on_card,
    be_tournament_id, be_event_id, be_aid, be_arrows
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
    ev ->> 'name_on_card',
    (ev ->> 'be_tournament_id')::integer,
    (ev ->> 'be_event_id')::integer,
    (ev ->> 'be_aid')::integer,
    ev ->> 'be_arrows'
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

-- Accepts a correction from Between Ends: replaces only the rounds and arrows, in one
-- transaction. Setup the parent chose, notes and any stored PDF are not touched.
create function public.replace_be_scorecard(p_event uuid, p_rounds jsonb, p_arrows text, p_arrows_per_end smallint)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_round_id uuid;
  rnd jsonb;
  en jsonb;
begin
  update public.arch_events
  set be_arrows = p_arrows, arrows_per_end = p_arrows_per_end, updated_at = now()
  where id = p_event and user_id = auth.uid() and be_event_id is not null;

  if not found then
    raise exception 'Scorecard not found' using errcode = 'P0002';
  end if;

  delete from public.arch_rounds where event_id = p_event;

  for rnd in select * from jsonb_array_elements(p_rounds) loop
    insert into public.arch_rounds (event_id, round_number, total, bonus)
    values (p_event, (rnd ->> 'round_number')::smallint, (rnd ->> 'total')::integer, '{}')
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
end;
$$;

revoke execute on function public.replace_be_scorecard(uuid, jsonb, text, smallint) from public, anon;
grant execute on function public.replace_be_scorecard(uuid, jsonb, text, smallint) to authenticated;
