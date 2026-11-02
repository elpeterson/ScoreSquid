-- Deletes crawler cache rows not read for 12 months (SQ-004). They hold other people's
-- names and numbers, so they shouldn't wait for a search to clear them. This job only
-- deletes local rows: it never reads Between Ends. Parents' own matches aren't touched.
create function public.purge_be_cache()
returns void
language sql
security definer
set search_path = ''
as $$
  -- Events and entries go with their tournament. The crawler must update read_at
  -- whenever it checks a tournament, including when nothing has changed.
  delete from public.be_tournaments where read_at < now() - interval '12 months';
$$;

revoke execute on function public.purge_be_cache() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('purge-be-cache', '23 4 * * *', 'select public.purge_be_cache()');
