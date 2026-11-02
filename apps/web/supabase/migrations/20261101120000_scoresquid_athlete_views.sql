-- Each sport's view of its athletes, and functions that write an athlete and its
-- profile in one transaction, so no partial rows are left behind.
--
-- Everything is security invoker: row-level security on the tables still decides
-- what each user can see and change.

-- 1. Views ---------------------------------------------------------------------

create view public.gymnast_athletes
with (security_invoker = true) as
select a.id, a.user_id, a.name, a.created_at, p.mso_id, p.discipline
from public.athletes a
join public.gymnast_profiles p on p.athlete_id = a.id
where a.sport = 'gymnastics';

create view public.archer_athletes
with (security_invoker = true) as
select a.id, a.user_id, a.name, a.created_at, p.membership_number
from public.athletes a
join public.archer_profiles p on p.athlete_id = a.id
where a.sport = 'archery';

revoke all on public.gymnast_athletes, public.archer_athletes from public, anon;
grant select on public.gymnast_athletes, public.archer_athletes to authenticated;

-- 2. Writes --------------------------------------------------------------------

create function public.create_gymnast(p_name text, p_discipline text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.athletes (user_id, sport, name)
  values (auth.uid(), 'gymnastics', p_name)
  returning id into new_id;

  insert into public.gymnast_profiles (athlete_id, discipline)
  values (new_id, coalesce(p_discipline, 'MAG'));

  return new_id;
end;
$$;

-- A null discipline keeps the current one; a null mso_id clears it.
create function public.update_gymnast(
  p_id uuid,
  p_name text,
  p_mso_id text,
  p_discipline text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.athletes
  set name = p_name, updated_at = now()
  where id = p_id and sport = 'gymnastics' and user_id = auth.uid();

  if not found then
    raise exception 'Gymnast not found' using errcode = 'P0002';
  end if;

  update public.gymnast_profiles
  set mso_id = p_mso_id, discipline = coalesce(p_discipline, discipline)
  where athlete_id = p_id;
end;
$$;

create function public.create_archer(p_name text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.athletes (user_id, sport, name)
  values (auth.uid(), 'archery', p_name)
  returning id into new_id;

  insert into public.archer_profiles (athlete_id) values (new_id);

  return new_id;
end;
$$;

revoke execute on function public.create_gymnast(text, text) from public, anon;
revoke execute on function public.update_gymnast(uuid, text, text, text) from public, anon;
revoke execute on function public.create_archer(text) from public, anon;
grant execute on function public.create_gymnast(text, text) to authenticated;
grant execute on function public.update_gymnast(uuid, text, text, text) to authenticated;
grant execute on function public.create_archer(text) to authenticated;
