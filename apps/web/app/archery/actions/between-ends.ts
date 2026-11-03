'use server';

import { revalidatePath } from 'next/cache';
import { start } from 'workflow/api';
import { z } from 'zod';
import { createClient } from '@scoresquid/auth/server';
import { createBeClient } from '@/features/archery/lib/betweenends/client';
import { isStale } from '@/features/archery/lib/betweenends/crawl';
import { rankingEntries } from '@/features/archery/lib/betweenends/entries';
import {
  collapseRepeats,
  dropRepeatedCombined,
  IMPORT_BATCH_SIZE,
  importProblem,
  MAX_CONFIRMED_PER_IMPORT,
  planRounds,
  relateToExisting,
  type ExistingScorecard,
  type Relation,
  type StoredMatch,
} from '@/features/archery/lib/betweenends/import-plan';
import { autoLinks, canLink, type ScorecardLink } from '@/features/archery/lib/betweenends/links';
import { resolveSessionDate } from '@/features/archery/lib/scorecard/dates';
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
    athlete_id: string;
    from_date: string;
    to_date: string;
    status: SearchStatus;
    tournaments_total: number;
    tournaments_done: number;
    heartbeat_at: string | null;
    created_at: string;
  };
  matches: SearchMatch[];
  results: BeResult[];
};

/** One found result as the screen sees it. Arrows stay on the server. */
export type BeResult = {
  key: string;
  event_id: number;
  aid: number;
  match_kind: 'number' | 'name';
  tournament_name: string;
  tournament_date: string;
  division: string | null;
  division_code: string | null;
  arrows_per_end: number | null;
  total: number | null;
  /** How many Between Ends listings show this one result. */
  listings: number;
  relation: Relation;
  problem: string | null;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

const MATCH_COLUMNS = `search_id, event_id, aid, match_kind, tournament_id, event_type, tournament_name, tournament_date,
  tournament_end_date, division, division_code, venue, session, target, total, arrows,
  rounds, ends_per_round, arrows_per_end, scoring_rule, round_totals`;
const PAGE = 1000;

/** The archer's matches from every search, one per result, keeping the newest search's. */
async function loadStoredMatches(supabase: Supabase, userId: string, athleteId: string): Promise<StoredMatch[]> {
  const { data: searches } = await supabase
    .from('arch_be_searches')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  const order = new Map((searches ?? []).map((row, i) => [row.id as string, i]));
  if (order.size === 0) return [];

  // PostgREST returns at most 1,000 rows at a time, and the rows would silently stop there.
  type Row = StoredMatch & { search_id: string };
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from('arch_be_search_matches')
      .select(MATCH_COLUMNS)
      .in('search_id', [...order.keys()])
      .order('search_id')
      .order('event_id')
      .order('aid')
      .range(from, from + PAGE - 1);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE) break;
  }

  rows.sort((a, b) => order.get(a.search_id)! - order.get(b.search_id)!);
  const latest = new Map<string, Row>();
  for (const row of rows) {
    const key = `${row.event_id}-${row.aid}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  return collapseRepeats(dropRepeatedCombined([...latest.values()])).sort((a, b) =>
    a.tournament_date < b.tournament_date ? 1 : -1,
  );
}

async function loadExisting(supabase: Supabase, userId: string, athleteId: string): Promise<ExistingScorecard[]> {
  const { data } = await supabase
    .from('arch_events')
    .select('id, name, start_date, session, source, be_event_id, be_aid, be_arrows, rounds:arch_rounds ( round_number, total )')
    .eq('athlete_id', athleteId)
    .eq('user_id', userId);
  return (data ?? []) as unknown as ExistingScorecard[];
}

/**
 * Links an uploaded scorecard to its result: only the ids, so its arrows, totals and
 * setup stay as they are, and with no be_arrows no "changed" prompt can follow. Only
 * the user's own scorecard for this archer, and only one not linked already.
 */
async function linkScorecard(supabase: Supabase, userId: string, athleteId: string, link: ScorecardLink) {
  const { data, error } = await supabase
    .from('arch_events')
    .update({ be_tournament_id: link.tournamentId, be_event_id: link.eventId, be_aid: link.aid })
    .eq('id', link.scorecardId)
    .eq('user_id', userId)
    .eq('athlete_id', athleteId)
    .is('be_event_id', null)
    .select('id');
  return { linked: !error && (data?.length ?? 0) > 0, duplicate: error?.code === '23505' };
}

async function loadResults(supabase: Supabase, userId: string, athleteId: string): Promise<BeResult[]> {
  const [matches, existing] = await Promise.all([
    loadStoredMatches(supabase, userId, athleteId),
    loadExisting(supabase, userId, athleteId),
  ]);
  const relations = matches.map((m) => relateToExisting(m, existing));

  // An uploaded scorecard a search finds exactly gets its Between Ends link (SQ-036).
  for (const link of autoLinks(matches, relations)) {
    const { linked } = await linkScorecard(supabase, userId, athleteId, link);
    if (!linked) continue;
    relations.forEach((r, i) => {
      if (r.kind === 'imported-pdf' && r.eventId === link.scorecardId && matches[i]!.event_id === link.eventId) {
        relations[i] = { kind: 'imported', eventId: r.eventId };
      }
    });
  }

  return matches.map((m, i) => ({
    key: `${m.event_id}-${m.aid}`,
    event_id: m.event_id,
    aid: m.aid,
    match_kind: m.match_kind,
    tournament_name: m.tournament_name,
    tournament_date: m.tournament_date,
    division: m.division,
    division_code: m.division_code,
    arrows_per_end: m.arrows_per_end,
    total: m.total,
    listings: 1 + (m.copies?.length ?? 0),
    relation: relations[i]!,
    problem: importProblem(m),
  }));
}

const SEARCH_COLUMNS = 'id, athlete_id, from_date, to_date, status, tournaments_total, tournaments_done, heartbeat_at, created_at';

async function loadView(supabase: Supabase, userId: string, search: BeSearchView['search']): Promise<BeSearchView> {
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

  return {
    search,
    matches: (matches ?? []) as SearchMatch[],
    results: await loadResults(supabase, userId, search.athlete_id),
  };
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
  return search ? loadView(supabase, user.id, search as BeSearchView['search']) : null;
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
    view: latest ? await loadView(supabase, user.id, latest as BeSearchView['search']) : null,
    lastFinishedTo: finished?.to_date ?? null,
  };
}

const ImportRequest = z.object({
  athleteId: z.string().uuid(),
  items: z
    .array(
      z.object({
        event_id: z.number().int().positive(),
        aid: z.number().int().positive(),
        // Ticking a possible match is the parent saying it's their archer.
        confirmed: z.boolean(),
        setup: z.object({
          environment: z.enum(['indoor', 'outdoor']),
          bow_style: z.string().min(1).max(50).nullable(),
          distance_m: z.number().positive().max(1000).nullable(),
          face_cm: z.number().int().positive().max(500).nullable(),
        }),
      }),
    )
    .min(1)
    .max(IMPORT_BATCH_SIZE),
});

export type ImportOutcome = { key: string; status: 'saved' | 'skipped' | 'failed'; message?: string };

/** A name match keeps no arrows until confirmed, so read them now. */
async function withConfirmedArrows(m: StoredMatch, client: ReturnType<typeof createBeClient>): Promise<StoredMatch> {
  const event = await client.event(m.event_id);
  if (event.status !== 'ok' || !event.data.rps) return m;
  const scores = await client.eventScores(m.event_id);
  const entries = rankingEntries(m.event_id, event.data, scores.status === 'ok' ? scores.data : null);
  const entry = entries.find((e) => e.aid === m.aid);
  return { ...m, arrows: entry?.arrows || null, round_totals: event.data.rps[String(m.aid)]?.rtl || m.round_totals };
}

/**
 * Saves the chosen results for one of the user's archers. The arrows come from the
 * user's own stored matches, never the browser. Each scorecard is its own transaction,
 * so one failure leaves no partial card and doesn't stop the others.
 */
export async function importBeResults(input: unknown): Promise<{ error?: string; outcomes?: ImportOutcome[] }> {
  const parsed = ImportRequest.safeParse(input);
  if (!parsed.success) return { error: 'Those results could not be imported.' };
  const { athleteId } = parsed.data;
  const items = [...new Map(parsed.data.items.map((i) => [`${i.event_id}-${i.aid}`, i])).values()];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in' };

  const [matches, existing] = await Promise.all([
    loadStoredMatches(supabase, user.id, athleteId),
    loadExisting(supabase, user.id, athleteId),
  ]);
  const client = createBeClient({ minIntervalMs: 1100 });
  const outcomes: ImportOutcome[] = [];
  let liveReads = 0;

  for (const item of items) {
    const key = `${item.event_id}-${item.aid}`;
    const stored = matches.find((m) => m.event_id === item.event_id && m.aid === item.aid);
    if (!stored) {
      outcomes.push({ key, status: 'failed', message: 'This result was not found.' });
      continue;
    }
    const relation = relateToExisting(stored, existing);
    if (relation.kind === 'imported' || relation.kind === 'imported-pdf' || relation.kind === 'changed') {
      outcomes.push({ key, status: 'skipped', message: 'Already imported.' });
      continue;
    }
    if (stored.match_kind === 'name' && !item.confirmed) {
      outcomes.push({ key, status: 'skipped', message: 'A possible match has to be confirmed.' });
      continue;
    }

    // Confirming reads Between Ends live, so keep each import to a few.
    if (stored.match_kind === 'name' && ++liveReads > MAX_CONFIRMED_PER_IMPORT) {
      outcomes.push({ key, status: 'skipped', message: `Import up to ${MAX_CONFIRMED_PER_IMPORT} possible matches at a time.` });
      continue;
    }

    try {
      const match = stored.match_kind === 'name' ? await withConfirmedArrows(stored, client) : stored;
      const plan = planRounds(match);
      if (!plan.ok) {
        outcomes.push({ key, status: 'failed', message: plan.problem });
        continue;
      }
      const { error } = await supabase.rpc('import_scorecard', {
        payload: {
          event: {
            athlete_id: athleteId,
            name: match.tournament_name,
            venue: match.venue,
            start_date: match.tournament_date,
            end_date: match.tournament_end_date,
            shot_on: resolveSessionDate(match.session, match.tournament_date, match.tournament_end_date),
            session: match.session,
            target: match.target,
            division: match.division_code ?? match.division,
            ...item.setup,
            arrows_per_end: match.arrows_per_end,
            bonus_labels: [],
            source: 'betweenends_api',
            source_path: null,
            source_hash: null,
            name_on_card: null,
            be_tournament_id: match.tournament_id,
            be_event_id: match.event_id,
            be_aid: match.aid,
            be_arrows: match.arrows,
          },
          rounds: plan.rounds,
        },
      });
      if (error?.code === '23505') outcomes.push({ key, status: 'skipped', message: 'Already imported.' });
      else if (error) outcomes.push({ key, status: 'failed', message: 'This one could not be saved. Try it again.' });
      else outcomes.push({ key, status: 'saved' });
    } catch {
      outcomes.push({ key, status: 'failed', message: 'Between Ends is not answering. Try it again.' });
    }
  }

  revalidatePath('/archery/dashboard');
  revalidatePath('/archery/insights');
  return { outcomes };
}

const ChangeRequest = z.object({
  athleteId: z.string().uuid(),
  event_id: z.number().int().positive(),
  aid: z.number().int().positive(),
  choice: z.enum(['accept', 'keep']),
});

/** A correction at Between Ends: nothing changes until the parent chooses (SQ-021). */
export async function resolveBeChange(input: unknown): Promise<{ error?: string }> {
  const parsed = ChangeRequest.safeParse(input);
  if (!parsed.success) return { error: 'That change could not be applied.' };
  const { athleteId, event_id, aid, choice } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in' };

  const [matches, existing] = await Promise.all([
    loadStoredMatches(supabase, user.id, athleteId),
    loadExisting(supabase, user.id, athleteId),
  ]);
  const match = matches.find((m) => m.event_id === event_id && m.aid === aid);
  const relation = match && relateToExisting(match, existing);
  if (!match || relation?.kind !== 'changed') return { error: 'That change is no longer waiting.' };

  if (choice === 'keep') {
    // Remembers this version, so only a further correction asks again.
    const { error } = await supabase
      .from('arch_events')
      .update({ be_arrows: match.arrows })
      .eq('id', relation.eventId)
      .eq('user_id', user.id);
    return error ? { error: 'That change could not be applied.' } : {};
  }

  const plan = planRounds(match);
  if (!plan.ok) return { error: plan.problem };
  const { error } = await supabase.rpc('replace_be_scorecard', {
    p_event: relation.eventId,
    p_rounds: plan.rounds,
    p_arrows: match.arrows,
    p_arrows_per_end: match.arrows_per_end,
  });
  if (error) return { error: 'That change could not be applied.' };
  revalidatePath(`/archery/events/${relation.eventId}`);
  revalidatePath('/archery/dashboard');
  revalidatePath('/archery/insights');
  return {};
}

const LinkRequest = z.object({
  athleteId: z.string().uuid(),
  event_id: z.number().int().positive(),
  aid: z.number().int().positive(),
  scorecardId: z.string().uuid(),
});

/**
 * Links an uploaded scorecard to a result that may be the same, once the parent says
 * so (SQ-036). The result must be one of the user's own stored matches, and the
 * scorecard the one it was matched with: their own, for this archer, not yet linked.
 */
export async function linkBeResult(input: unknown): Promise<{ error?: string }> {
  const parsed = LinkRequest.safeParse(input);
  if (!parsed.success) return { error: 'That scorecard could not be linked.' };
  const { athleteId, event_id, aid, scorecardId } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in' };

  const [matches, existing] = await Promise.all([
    loadStoredMatches(supabase, user.id, athleteId),
    loadExisting(supabase, user.id, athleteId),
  ]);
  const match = matches.find((m) => m.event_id === event_id && m.aid === aid);
  if (!match || !canLink(relateToExisting(match, existing), scorecardId)) {
    return { error: 'That scorecard can no longer be linked to this result.' };
  }

  const { linked, duplicate } = await linkScorecard(supabase, user.id, athleteId, {
    scorecardId,
    tournamentId: match.tournament_id,
    eventId: match.event_id,
    aid: match.aid,
  });
  if (duplicate) return { error: 'This result is already linked to another scorecard.' };
  if (!linked) return { error: 'That scorecard could not be linked.' };
  revalidatePath(`/archery/events/${scorecardId}`);
  return {};
}
