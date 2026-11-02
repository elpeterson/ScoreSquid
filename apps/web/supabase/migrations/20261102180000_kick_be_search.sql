-- Lets a parent's page restart the crawler for a search gone silent (SQ-004), at most
-- once per search every 15 minutes, so polling can't start runs without limit. It has
-- its own column: refreshing heartbeat_at would make a dead search look alive, and then
-- nothing would take it over. True means the caller should start a run.
alter table public.arch_be_searches add column kicked_at timestamptz;

create function public.kick_be_search(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.arch_be_searches
  set kicked_at = now()
  where id = p_id
    and user_id = auth.uid()
    and status in ('queued', 'running')
    and coalesce(heartbeat_at, created_at) < now() - interval '15 minutes'
    and coalesce(kicked_at, created_at) < now() - interval '15 minutes';
  return found;
end;
$$;

revoke execute on function public.kick_be_search(uuid) from public, anon;
grant execute on function public.kick_be_search(uuid) to authenticated;
