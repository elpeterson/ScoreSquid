'use server';

import { start } from 'workflow/api';
import { createClient } from '@scoresquid/auth/server';
import { isStale } from '@/features/archery/lib/betweenends/crawl';
import { beSearchWorkflow } from '@/features/archery/workflows/be-search';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Result = { error?: string; searchId?: string };

/** Starts a run. It ends at once if another is already working the queue. */
const startWorker = () => start(beSearchWorkflow, [], { experimental_retention: 0 });

function startErrorMessage(code: string | undefined): string {
  switch (code) {
    case '23505':
      return 'A search is already running for this archer';
    case '22023':
      return 'This archer needs a membership number and start date, and valid search dates';
    case '54000':
      return 'Too many searches right now. Please try again later';
    case 'P0002':
      return 'Archer not found';
    default:
      return 'Could not start the search';
  }
}

/** Queues a search of Between Ends for one of the user's archers. */
export async function startBeSearch(athleteId: string, fromDate?: string): Promise<Result> {
  if (typeof athleteId !== 'string' || !UUID.test(athleteId)) return { error: 'Archer not found' };
  if (fromDate !== undefined && (typeof fromDate !== 'string' || !DATE.test(fromDate))) {
    return { error: 'That date is not valid' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in' };

  // The function checks ownership and takes the number and name from the profile.
  const { data, error } = await supabase.rpc('start_be_search', {
    p_athlete: athleteId,
    ...(fromDate ? { p_from: fromDate } : {}),
  });
  if (error) return { error: startErrorMessage(error.code) };

  try {
    await startWorker();
  } catch (err) {
    // The search is saved and queued; viewing it starts a run once it counts as stale.
    console.error('Could not start the Between Ends worker', (err as Error).name);
  }
  return { searchId: data as string };
}

export async function cancelBeSearch(searchId: string): Promise<{ error?: string }> {
  if (typeof searchId !== 'string' || !UUID.test(searchId)) return { error: 'Search not found' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in' };
  const { error } = await supabase.rpc('cancel_be_search', { p_id: searchId });
  return error ? { error: 'There is no running search to cancel' } : {};
}

/** The user's search and its matches. May restart a run if the search has gone silent. */
export async function getBeSearch(searchId: string) {
  if (typeof searchId !== 'string' || !UUID.test(searchId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: search } = await supabase
    .from('arch_be_searches')
    .select('id, athlete_id, from_date, to_date, status, tournaments_total, tournaments_done, heartbeat_at, created_at')
    .eq('id', searchId)
    .eq('user_id', user.id)
    .single();
  if (!search) return null;

  const { data: matches } = await supabase
    .from('arch_be_search_matches')
    .select('event_id, aid, match_kind, tournament_name, tournament_date, division, total')
    .eq('search_id', searchId)
    .order('tournament_date', { ascending: false });

  const stale = isStale(
    { status: search.status, heartbeatAt: search.heartbeat_at, createdAt: search.created_at },
    Date.now(),
  );
  if (stale) {
    // Limited in the database, so polling this can't start runs without end.
    const { data: kicked } = await supabase.rpc('kick_be_search', { p_id: searchId });
    if (kicked) await startWorker().catch(() => undefined);
  }

  return { search, matches: matches ?? [] };
}
