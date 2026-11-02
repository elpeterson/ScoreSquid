'use server';

import { start } from 'workflow/api';
import { createClient } from '@scoresquid/auth/server';
import { isStale } from '@/features/archery/lib/betweenends/crawl';
import type { SearchMatch, SearchStatus } from '@/features/archery/lib/betweenends/search-view';
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
  return error ? { error: 'There is no running search to stop' } : {};
}

export type BeSearchView = {
  search: {
    id: string;
    from_date: string;
    to_date: string;
    status: SearchStatus;
    tournaments_total: number;
    tournaments_done: number;
    heartbeat_at: string | null;
    created_at: string;
  };
  matches: SearchMatch[];
};

const SEARCH_COLUMNS = 'id, from_date, to_date, status, tournaments_total, tournaments_done, heartbeat_at, created_at';

async function loadMatches(supabase: Awaited<ReturnType<typeof createClient>>, search: BeSearchView['search']) {
  const { data: matches } = await supabase
    .from('arch_be_search_matches')
    .select('event_id, aid, match_kind, tournament_name, tournament_date, division, total')
    .eq('search_id', search.id)
    .order('tournament_date', { ascending: false });

  const stale = isStale(
    { status: search.status, heartbeatAt: search.heartbeat_at, createdAt: search.created_at },
    Date.now(),
  );
  if (stale) {
    // Limited in the database, so polling this can't start runs without end.
    const { data: kicked } = await supabase.rpc('kick_be_search', { p_id: search.id });
    if (kicked) await startWorker().catch(() => undefined);
  }

  return { search, matches: (matches ?? []) as SearchMatch[] };
}

/** The user's search and its matches. May restart a run if the search has gone silent. */
export async function getBeSearch(searchId: string): Promise<BeSearchView | null> {
  if (typeof searchId !== 'string' || !UUID.test(searchId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: search } = await supabase
    .from('arch_be_searches')
    .select(SEARCH_COLUMNS)
    .eq('id', searchId)
    .eq('user_id', user.id)
    .single();
  return search ? loadMatches(supabase, search as BeSearchView['search']) : null;
}

/** An archer's latest search, and how far their last finished one reached. */
export async function getLatestBeSearch(
  athleteId: string,
): Promise<{ view: BeSearchView | null; lastFinishedTo: string | null }> {
  const none = { view: null, lastFinishedTo: null };
  if (typeof athleteId !== 'string' || !UUID.test(athleteId)) return none;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return none;

  const [{ data: latest }, { data: finished }] = await Promise.all([
    supabase
      .from('arch_be_searches')
      .select(SEARCH_COLUMNS)
      .eq('athlete_id', athleteId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('arch_be_searches')
      .select('to_date')
      .eq('athlete_id', athleteId)
      .eq('user_id', user.id)
      .eq('status', 'finished')
      .order('to_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    view: latest ? await loadMatches(supabase, latest as BeSearchView['search']) : null,
    lastFinishedTo: finished?.to_date ?? null,
  };
}
