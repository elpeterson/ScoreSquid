-- Archer profiles gain a competition start date: when the archer began competing,
-- which limits how far back a Between Ends search looks. Creating and updating go
-- through functions, so the athlete and profile change together, and a membership
-- number can be used only once per account.

alter table public.archer_profiles
  add column competition_start_date date;

create or replace view public.archer_athletes
with (security_invoker = true) as
select a.id, a.user_id, a.name, a.created_at, p.membership_number, p.competition_start_date
from public.athletes a
join public.archer_profiles p on p.athlete_id = a.id
where a.sport = 'archery';

-- Raises a unique violation if another of this user's archers has the number. The
-- lock makes two requests at once take turns; the tables can't express this rule,
-- since the number and its owner are in different tables.
create function public.check_archer_number_free(p_number text, p_except uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_number is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('archer_number:' || auth.uid()::text));

  if exists (
    select 1 from public.archer_athletes
    where user_id = auth.uid()
      and membership_number = p_number
      and id is distinct from p_except
  ) then
    raise exception 'An archer already has this membership number' using errcode = '23505';
  end if;
end;
$$;

drop function public.create_archer(text);

create function public.create_archer(
  p_name text,
  p_membership_number text default null,
  p_competition_start_date date default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_id uuid;
begin
  perform public.check_archer_number_free(p_membership_number, null);

  insert into public.athletes (user_id, sport, name)
  values (auth.uid(), 'archery', p_name)
  returning id into new_id;

  insert into public.archer_profiles (athlete_id, membership_number, competition_start_date)
  values (new_id, p_membership_number, p_competition_start_date);

  return new_id;
end;
$$;

-- Sets all three: a null number or date clears it.
create function public.update_archer(
  p_id uuid,
  p_name text,
  p_membership_number text,
  p_competition_start_date date
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform public.check_archer_number_free(p_membership_number, p_id);

  update public.athletes
  set name = p_name, updated_at = now()
  where id = p_id and sport = 'archery' and user_id = auth.uid();

  if not found then
    raise exception 'Archer not found' using errcode = 'P0002';
  end if;

  update public.archer_profiles
  set membership_number = p_membership_number,
      competition_start_date = p_competition_start_date
  where athlete_id = p_id;
end;
$$;

revoke execute on function public.check_archer_number_free(text, uuid) from public, anon;
revoke execute on function public.create_archer(text, text, date) from public, anon;
revoke execute on function public.update_archer(uuid, text, text, date) from public, anon;
grant execute on function public.check_archer_number_free(text, uuid) to authenticated;
grant execute on function public.create_archer(text, text, date) to authenticated;
grant execute on function public.update_archer(uuid, text, text, date) to authenticated;
