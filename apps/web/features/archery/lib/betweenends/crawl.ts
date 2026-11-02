// One batch of the on-request Between Ends crawl (SQ-004). Postgres holds the
// progress, so a batch can stop anywhere and the next one picks up from what's saved.
// Everything outside is passed in, which keeps this testable without a network or
// database. Logs carry counts only, never an archer's name or number.

import type { BeClient } from './client';
import { normaliseAlt, rankingEntries } from './entries';
import type { BeEventType, BeRankingEvent, BeTournament } from './types';

/** Longer than the 8-minute stall seen when Vercel retried a killed step. */
export const STALE_AFTER_MS = 15 * 60 * 1000;
/** Time to start new tournaments in one batch; well inside Hobby's 300 s limit. */
const BATCH_BUDGET_MS = 120_000;
/** `updated_at` isn't known to move on every score edit, so sample it. */
const CHECK_EVERY_CACHE_HIT = 20;

const RANKING_TYPES: ReadonlySet<BeEventType> = new Set(['RankingEvent', 'CombinedRankingEvent']);

export type SearchRow = {
  id: string;
  membershipNumber: string;
  archerName: string;
  fromDate: string;
  toDate: string;
  status: 'queued' | 'running' | 'finished' | 'failed' | 'cancelled';
  tournamentsDone: number;
  heartbeatAt: string | null;
};

export type CachedEvent = { id: number; eventType: BeEventType; etag: string | null };

export type CachedTournament = {
  name: string;
  startDate: string;
  sourceUpdatedAt: string;
  etag: string | null;
  events: CachedEvent[];
};

export type EntryRow = {
  aid: number;
  altRaw: string;
  altNorm: string | null;
  firstName: string;
  lastName: string;
  team: string;
  divisionCode: string;
  divisionName: string | null;
};

export type MatchRow = {
  searchId: string;
  eventId: number;
  aid: number;
  matchKind: 'number' | 'name';
  tournamentName: string;
  tournamentDate: string;
  division: string | null;
  total: number | null;
  arrows: string | null;
};

export type TournamentDetails = {
  id: number;
  name: string;
  startDate: string;
  sourceUpdatedAt: string;
  etag: string | null;
};

export interface CrawlStore {
  getSearch(id: string): Promise<SearchRow | null>;
  runningSearch(): Promise<SearchRow | null>;
  /** Moves the oldest queued search to running; null if none, or another run got there first. */
  claimNext(): Promise<SearchRow | null>;
  /** Refreshes the heartbeat only if it is still older than `staleBefore`. */
  takeOver(id: string, staleBefore: string): Promise<boolean>;
  setTotal(id: string, total: number): Promise<void>;
  /** False if the search is no longer running, as when a parent cancelled it. */
  saveProgress(id: string, tournamentsDone: number): Promise<boolean>;
  finish(id: string, status: 'finished' | 'failed'): Promise<void>;
  getTournament(id: number): Promise<CachedTournament | null>;
  saveTournament(tournament: TournamentDetails): Promise<void>;
  /** Marks a tournament as checked, so the 12-month purge keeps it. */
  touchTournament(id: number, sourceUpdatedAt: string): Promise<void>;
  saveEventSummary(tournamentId: number, event: { id: number; eventType: BeEventType }): Promise<void>;
  replaceEntries(eventId: number, etag: string | null, entries: EntryRow[]): Promise<void>;
  /** Archers with this number, or with no number and this normalised name. */
  findMatches(eventId: number, number: string, name: string): Promise<EntryRow[]>;
  saveMatch(match: MatchRow): Promise<void>;
}

/** What a run carries between batches. Holds only Between Ends' public ids and dates. */
export type CrawlState = { searchId: string; plan: PlanItem[] | null } | null;
export type PlanItem = { id: number; updatedAt: string };
export type BatchResult = { idle: boolean; state: CrawlState };

export type BatchDeps = {
  store: CrawlStore;
  client: BeClient;
  now?: () => number;
  log?: (message: string) => void;
};

/** Tournaments starting in the range, oldest id first so new ones can't shift saved progress. */
export function planTournaments(list: BeTournament[], fromDate: string, toDate: string): PlanItem[] {
  return list
    .filter((t) => t.start_date >= fromDate && t.start_date <= toDate)
    .sort((a, b) => a.id - b.id)
    .map((t) => ({ id: t.id, updatedAt: t.updated_at }));
}

export function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** True when a search has been waiting or silent long enough to need a new run. */
export function isStale(
  search: { status: string; heartbeatAt: string | null; createdAt: string },
  now: number,
): boolean {
  if (search.status !== 'queued' && search.status !== 'running') return false;
  return now - Date.parse(search.heartbeatAt ?? search.createdAt) > STALE_AFTER_MS;
}

const sameInstant = (a: string, b: string) => Date.parse(a) === Date.parse(b);

function entryRows(eventId: number, event: BeRankingEvent): EntryRow[] {
  return rankingEntries(eventId, event, null).map((e) => ({
    aid: e.aid,
    altRaw: e.altRaw,
    altNorm: normaliseAlt(e.altRaw),
    firstName: e.firstName,
    lastName: e.lastName,
    team: e.team,
    divisionCode: e.divisionCode,
    divisionName: e.divisionName,
  }));
}

async function claim(deps: BatchDeps, state: CrawlState): Promise<CrawlState> {
  const { store, now = Date.now } = deps;
  if (state) {
    const current = await store.getSearch(state.searchId);
    if (current?.status === 'running') return state;
  }
  const running = await store.runningSearch();
  if (running) {
    // A fresh heartbeat belongs to another run, which will drain the queue when it's done.
    const staleBefore = new Date(now() - STALE_AFTER_MS).toISOString();
    if (!running.heartbeatAt || running.heartbeatAt < staleBefore) {
      if (await store.takeOver(running.id, staleBefore)) return { searchId: running.id, plan: null };
    }
    return null;
  }
  const next = await store.claimNext();
  return next ? { searchId: next.id, plan: null } : null;
}

/** Reads what's new about a tournament and returns its details and any event bodies read. */
async function refreshTournament(
  deps: BatchDeps,
  item: PlanItem,
  cached: CachedTournament | null,
  checkCache: boolean,
): Promise<{ tournament: CachedTournament; bodies: Map<number, BeRankingEvent> } | null> {
  const { store, client, log } = deps;
  const bodies = new Map<number, BeRankingEvent>();

  const refreshEvent = async (event: CachedEvent) => {
    const res = await client.event(event.id, event.etag);
    if (res.status === 'ok' && res.data.rps) {
      await store.replaceEntries(event.id, res.etag, entryRows(event.id, res.data));
      bodies.set(event.id, res.data);
      return true;
    }
    return false;
  };

  if (cached && sameInstant(cached.sourceUpdatedAt, item.updatedAt)) {
    await store.touchTournament(item.id, item.updatedAt);
    const sample = cached.events.find((e) => RANKING_TYPES.has(e.eventType));
    if (checkCache && sample && (await refreshEvent(sample))) {
      log?.('Between Ends: an event changed without updated_at moving');
    }
    return { tournament: cached, bodies };
  }

  const detail = await client.tournament(item.id, cached?.etag);
  if (detail.status === 'not-found') return null;

  let tournament: CachedTournament;
  if (detail.status === 'not-modified') {
    if (!cached) return null;
    await store.touchTournament(item.id, item.updatedAt);
    tournament = { ...cached, sourceUpdatedAt: item.updatedAt };
  } else {
    const d = detail.data;
    const known = new Map(cached?.events.map((e) => [e.id, e.etag]));
    tournament = {
      name: d.tournament_name,
      startDate: d.start_date,
      sourceUpdatedAt: item.updatedAt,
      etag: detail.etag,
      events: d.events.map((e) => ({ id: e.id, eventType: e.event_type, etag: known.get(e.id) ?? null })),
    };
    await store.saveTournament({ ...tournament, id: item.id });
    for (const e of tournament.events) await store.saveEventSummary(item.id, e);
  }

  // An event answering 304 keeps its stored archers.
  for (const event of tournament.events) {
    if (RANKING_TYPES.has(event.eventType)) await refreshEvent(event);
  }
  return { tournament, bodies };
}

/** Copies this search's matches. Only a match costs score requests. */
async function saveMatches(
  deps: BatchDeps,
  search: SearchRow,
  tournament: CachedTournament,
  bodies: Map<number, BeRankingEvent>,
): Promise<void> {
  const { store, client } = deps;
  const name = normaliseName(search.archerName);

  for (const event of tournament.events) {
    if (!RANKING_TYPES.has(event.eventType)) continue;
    const matches = await store.findMatches(event.id, search.membershipNumber, name);
    if (matches.length === 0) continue;

    let body = bodies.get(event.id);
    if (!body) {
      const res = await client.event(event.id);
      if (res.status === 'ok') body = res.data;
    }
    const scores = await client.eventScores(event.id);
    const decoded = body?.rps
      ? rankingEntries(event.id, body, scores.status === 'ok' ? scores.data : null)
      : [];

    for (const m of matches) {
      const entry = decoded.find((d) => d.aid === m.aid);
      const matchKind = m.altNorm === search.membershipNumber ? 'number' : 'name';
      await store.saveMatch({
        searchId: search.id,
        eventId: event.id,
        aid: m.aid,
        matchKind,
        tournamentName: tournament.name,
        tournamentDate: tournament.startDate,
        division: m.divisionName ?? (m.divisionCode || null),
        total: entry ? entry.decoded.total : null,
        // A name match may be someone else, so it carries no arrows until confirmed.
        arrows: matchKind === 'number' && entry?.arrows ? entry.arrows : null,
      });
    }
  }
}

/**
 * Advances the crawl by about two minutes of work. `idle` means nothing is left for
 * this run: the queue is empty, or another run is working it.
 */
export async function runBatch(deps: BatchDeps, previous: CrawlState): Promise<BatchResult> {
  const { store, client, now = Date.now, log } = deps;
  const state = await claim(deps, previous);
  if (!state) return { idle: true, state: null };

  const search = await store.getSearch(state.searchId);
  if (!search) return { idle: false, state: null };

  try {
    let plan = state.plan;
    if (!plan) {
      const list = await client.tournaments();
      if (list.status !== 'ok') throw new Error('Between Ends tournament list unavailable');
      plan = planTournaments(list.data, search.fromDate, search.toDate);
      await store.setTotal(search.id, plan.length);
    }

    const started = now();
    let done = search.tournamentsDone;
    let cacheHits = 0;
    while (done < plan.length) {
      if (now() - started > BATCH_BUDGET_MS) return { idle: false, state: { searchId: search.id, plan } };

      const item = plan[done]!;
      const cached = await store.getTournament(item.id);
      if (cached && sameInstant(cached.sourceUpdatedAt, item.updatedAt)) cacheHits++;
      const checkCache = cacheHits > 0 && cacheHits % CHECK_EVERY_CACHE_HIT === 0;
      const refreshed = await refreshTournament(deps, item, cached, checkCache);
      if (refreshed) await saveMatches(deps, search, refreshed.tournament, refreshed.bodies);

      done++;
      if (!(await store.saveProgress(search.id, done))) return { idle: false, state: null };
    }
    await store.finish(search.id, 'finished');
  } catch (err) {
    if (!isBetweenEndsError(err)) throw err;
    // Saved scorecards aren't touched, and a retry reuses what's cached.
    log?.(`Between Ends search failed: ${(err as Error).message}`);
    await store.finish(search.id, 'failed');
  }
  return { idle: false, state: null };
}

/** Database errors rethrow so the step retries; Between Ends being down fails the search. */
function isBetweenEndsError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.startsWith('Between Ends') || err.name === 'TimeoutError' || err.name === 'TypeError';
}
