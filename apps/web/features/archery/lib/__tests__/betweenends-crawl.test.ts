import { describe, expect, it, vi, type Mock } from 'vitest';
import type { BeClient, BeResponse } from '@/features/archery/lib/betweenends/client';
import {
  isStale,
  normaliseName,
  planTournaments,
  runBatch,
  STALE_AFTER_MS,
  type CachedTournament,
  type CrawlStore,
  type EntryRow,
  type MatchRow,
  type SearchRow,
} from '@/features/archery/lib/betweenends/crawl';
import type { BeRankingEvent, BeTournament } from '@/features/archery/lib/betweenends/types';

// All names and numbers are made up.
const NOW = Date.parse('2026-06-01T12:00:00Z');
const UPDATED = '2026-03-01T00:00:00.000Z';

const row = (id: number, start: string, updated = UPDATED) =>
  ({ id, start_date: start, updated_at: updated }) as BeTournament;

const eventBody = (): BeRankingEvent =>
  ({
    id: 999, enm: 'Ranking', etp: 'RankingEvent', dor: 1, rds: 1, epr: 2, ape: 3, srl: 0,
    tnm: 'Made Up Open', tdt: '', tlc: '', tnl: {}, nos: 1,
    cgs: [{ nm: 'Recurve U13 Women', dor: 1, cut: 0, ars: [{ aid: 1 }, { aid: 2 }, { aid: 3 }] }],
    rps: {
      1: { aid: 1, fnm: 'Test', lnm: 'Archer', alt: ' 111111C', cnd: 'RU13W', tm: '', tgt: [], tnl: [], rtl: '', tbs: '' },
      2: { aid: 2, fnm: 'Other', lnm: 'Person', alt: '222222', cnd: 'RSM', tm: '', tgt: [], tnl: [], rtl: '', tbs: '' },
      3: { aid: 3, fnm: 'Blank', lnm: 'Number', alt: 'N/A', cnd: 'RSM', tm: '', tgt: [], tnl: [], rtl: '', tbs: '' },
    },
  }) as unknown as BeRankingEvent;

const scores = { ars: { 1: 'TTTTTT', 2: '999999', 3: '888888' } };

function fakeStore(search: Partial<SearchRow> = {}) {
  const s: SearchRow = {
    id: 's1', membershipNumber: '111111', archerName: 'Test Archer', fromDate: '2026-01-01',
    toDate: '2026-12-31', status: 'running', tournamentsDone: 0, heartbeatAt: new Date(NOW).toISOString(),
    ...search,
  };
  const state = {
    search: s as SearchRow | null,
    queued: [] as SearchRow[],
    tournaments: new Map<number, CachedTournament>(),
    entries: new Map<number, EntryRow[]>(),
    matches: [] as MatchRow[],
    touched: [] as number[],
    finished: null as string | null,
    tookOver: 0,
  };
  const store: CrawlStore = {
    getSearch: async (id) => (state.search?.id === id ? { ...state.search } : null),
    runningSearch: async () => (state.search?.status === 'running' ? { ...state.search } : null),
    claimNext: async () => {
      const next = state.queued.shift();
      if (next) state.search = { ...next, status: 'running' };
      return next ? { ...next, status: 'running' } : null;
    },
    takeOver: async () => { state.tookOver++; return true; },
    setTotal: async () => undefined,
    saveProgress: async (_id, done) => {
      if (state.search?.status !== 'running') return false;
      state.search.tournamentsDone = done;
      return true;
    },
    finish: async (_id, status) => { state.finished = status; if (state.search) state.search.status = status; },
    getTournament: async (id) => state.tournaments.get(id) ?? null,
    saveTournament: async (t) => {
      state.tournaments.set(t.id, { name: t.name, startDate: t.startDate, sourceUpdatedAt: t.sourceUpdatedAt, etag: t.etag, events: [] });
    },
    touchTournament: async (id) => { state.touched.push(id); },
    saveEventSummary: async (tid, e) => {
      state.tournaments.get(tid)!.events.push({ id: e.id, eventType: e.eventType, etag: null });
    },
    replaceEntries: async (id, _etag, rows) => { state.entries.set(id, rows); },
    findMatches: async (id, number, name) =>
      (state.entries.get(id) ?? []).filter(
        (e) => e.altNorm === number || (!e.altNorm && normaliseName(`${e.firstName} ${e.lastName}`) === name),
      ),
    saveMatch: async (m) => { state.matches.push(m); },
  };
  return { store, state };
}

function fakeClient(list: BeTournament[] = [row(10, '2026-02-01')]) {
  const ok = <T,>(data: T, etag = 'W/"e"'): BeResponse<T> => ({ status: 'ok', data, etag });
  return {
    tournaments: vi.fn(async () => ok(list)),
    tournament: vi.fn(async (id: number) =>
      ok({ id, tournament_name: 'Made Up Open', start_date: '2026-02-01', events: [
        { id: 100, event_type: 'RankingEvent' }, { id: 101, event_type: 'MatchEvent' },
      ] })),
    events: vi.fn(),
    event: vi.fn(async () => ok(eventBody())),
    eventScores: vi.fn(async () => ok(scores)),
  } as unknown as Record<keyof BeClient, Mock>;
}

const deps = (store: CrawlStore, client: Record<keyof BeClient, Mock>, now = () => NOW) => ({
  store,
  client: client as unknown as BeClient,
  now,
});
const running = { searchId: 's1', plan: null };

describe('planTournaments', () => {
  it('keeps those starting in the range, by id', () => {
    const list = [row(3, '2026-03-01'), row(1, '2026-01-01'), row(2, '2025-12-31'), row(4, '2027-01-01')];
    expect(planTournaments(list, '2026-01-01', '2026-12-31').map((p) => p.id)).toEqual([1, 3]);
  });
});

describe('isStale', () => {
  const at = (ms: number) => new Date(NOW - ms).toISOString();
  it('only applies to active searches gone quiet', () => {
    const old = STALE_AFTER_MS + 1000;
    expect(isStale({ status: 'running', heartbeatAt: at(old), createdAt: at(old) }, NOW)).toBe(true);
    expect(isStale({ status: 'running', heartbeatAt: at(1000), createdAt: at(old) }, NOW)).toBe(false);
    expect(isStale({ status: 'queued', heartbeatAt: null, createdAt: at(old) }, NOW)).toBe(true);
    expect(isStale({ status: 'finished', heartbeatAt: at(old), createdAt: at(old) }, NOW)).toBe(false);
  });
});

describe('runBatch', () => {
  it('stores every archer in a new tournament and matches by digits of the number', async () => {
    const { store, state } = fakeStore();
    const client = fakeClient();
    await runBatch(deps(store, client), running);

    expect(state.entries.get(100)).toHaveLength(3);
    expect(state.entries.get(100)![0]).toMatchObject({ altRaw: ' 111111C', altNorm: '111111' });
    expect(state.matches).toHaveLength(1);
    expect(state.matches[0]).toMatchObject({
      matchKind: 'number', total: 60, arrows: 'TTTTTT', division: 'Recurve U13 Women', tournamentName: 'Made Up Open',
    });
    expect(state.matches[0]).toMatchObject({
      tournamentId: 10, eventType: 'RankingEvent', rounds: 1, endsPerRound: 2, arrowsPerEnd: 3, scoringRule: 0, divisionCode: 'RU13W',
    });
    expect(state.finished).toBe('finished');
  });

  it('never reads match events', async () => {
    const { store } = fakeStore();
    const client = fakeClient();
    await runBatch(deps(store, client), running);
    expect(client.event).toHaveBeenCalledTimes(1);
    expect(client.event).toHaveBeenCalledWith(100, null);
  });

  it('reads no scores when the archer is not in the event', async () => {
    const { store, state } = fakeStore({ membershipNumber: '333333', archerName: 'Nobody Here' });
    const client = fakeClient();
    await runBatch(deps(store, client), running);
    expect(client.eventScores).not.toHaveBeenCalled();
    expect(state.matches).toHaveLength(0);
    expect(state.finished).toBe('finished');
  });

  it('gives a name match on a blank number no arrows', async () => {
    const { store, state } = fakeStore({ membershipNumber: '333333', archerName: '  blank   NUMBER ' });
    await runBatch(deps(store, fakeClient()), running);
    expect(state.matches).toHaveLength(1);
    expect(state.matches[0]).toMatchObject({ matchKind: 'name', arrows: null, total: 48 });
  });

  it("doesn't name-match an archer who has a different number", async () => {
    const { store, state } = fakeStore({ membershipNumber: '333333', archerName: 'Other Person' });
    await runBatch(deps(store, fakeClient()), running);
    expect(state.matches).toHaveLength(0);
  });

  function cachedStore(search: Partial<SearchRow> = {}) {
    const f = fakeStore(search);
    f.state.tournaments.set(10, {
      name: 'Made Up Open', startDate: '2026-02-01', sourceUpdatedAt: UPDATED, etag: 'W/"t"',
      events: [{ id: 100, eventType: 'RankingEvent', etag: 'W/"e"' }],
    });
    f.state.entries.set(100, [
      { aid: 2, altRaw: '222222', altNorm: '222222', firstName: 'Other', lastName: 'Person', team: '', divisionCode: 'RSM', divisionName: null },
    ]);
    return f;
  }

  it('reads nothing about an unchanged tournament with no match, and keeps it from being purged', async () => {
    const { store, state } = cachedStore({ membershipNumber: '333333', archerName: 'Nobody Here' });
    const client = fakeClient();
    await runBatch(deps(store, client), running);
    expect(client.tournaments).toHaveBeenCalledTimes(1);
    expect(client.tournament).not.toHaveBeenCalled();
    expect(client.event).not.toHaveBeenCalled();
    expect(state.touched).toEqual([10]);
  });

  it('serves a second archer from the cache, reading the event and scores only on a match', async () => {
    const { store, state } = cachedStore({ membershipNumber: '222222', archerName: 'Other Person' });
    const client = fakeClient();
    await runBatch(deps(store, client), running);
    expect(client.tournament).not.toHaveBeenCalled();
    expect(client.event).toHaveBeenCalledTimes(1);
    expect(client.eventScores).toHaveBeenCalledTimes(1);
    expect(state.matches[0]).toMatchObject({ aid: 2, total: 54 });
  });

  it('sends stored ETags when a tournament moved, and keeps its archers on a 304', async () => {
    const { store, state } = cachedStore({ membershipNumber: '333333', archerName: 'Nobody Here' });
    const client = fakeClient([row(10, '2026-02-01', '2026-04-01T00:00:00.000Z')]);
    client.tournament.mockResolvedValue({ status: 'not-modified', etag: 'W/"t"' });
    client.event.mockResolvedValue({ status: 'not-modified', etag: 'W/"e"' });
    await runBatch(deps(store, client), running);
    expect(client.tournament).toHaveBeenCalledWith(10, 'W/"t"');
    expect(client.event).toHaveBeenCalledWith(100, 'W/"e"');
    expect(state.entries.get(100)).toHaveLength(1);
  });

  it('resumes from saved progress', async () => {
    const { store, state } = fakeStore({ tournamentsDone: 1 });
    const client = fakeClient([row(10, '2026-02-01'), row(11, '2026-02-02')]);
    await runBatch(deps(store, client), running);
    expect(client.tournament).toHaveBeenCalledTimes(1);
    expect(client.tournament.mock.calls[0]![0]).toBe(11);
    expect(state.search!.tournamentsDone).toBe(2);
  });

  it('stops when a parent cancels', async () => {
    const { store, state } = fakeStore();
    const client = fakeClient([row(10, '2026-02-01'), row(11, '2026-02-02')]);
    store.saveProgress = async () => false;
    const result = await runBatch(deps(store, client), running);
    expect(result).toEqual({ idle: false, state: null });
    expect(client.tournament).toHaveBeenCalledTimes(1);
    expect(state.finished).toBeNull();
  });

  it('hands over the plan when its time budget runs out', async () => {
    const { store } = fakeStore();
    const client = fakeClient([row(10, '2026-02-01'), row(11, '2026-02-02')]);
    let t = NOW;
    const result = await runBatch(deps(store, client, () => (t += 100_000)), running);
    expect(result.idle).toBe(false);
    expect(result.state?.plan?.map((p) => p.id)).toEqual([10, 11]);
  });

  it('marks the search failed when Between Ends is down, and goes on', async () => {
    const { store, state } = fakeStore();
    const client = fakeClient();
    client.tournament.mockRejectedValue(new Error('Between Ends /tournaments/10 failed: HTTP 503'));
    const result = await runBatch(deps(store, client), running);
    expect(state.finished).toBe('failed');
    expect(result).toEqual({ idle: false, state: null });
  });

  it('rethrows database errors so the step retries', async () => {
    const { store } = fakeStore();
    store.saveTournament = async () => { throw new Error('connection reset'); };
    await expect(runBatch(deps(store, fakeClient()), running)).rejects.toThrow('connection reset');
  });

  it('is idle when another run holds a fresh search', async () => {
    const { store, state } = fakeStore();
    const client = fakeClient();
    expect(await runBatch(deps(store, client), null)).toEqual({ idle: true, state: null });
    expect(client.tournaments).not.toHaveBeenCalled();
    expect(state.tookOver).toBe(0);
  });

  it('takes over a search gone silent', async () => {
    const { store, state } = fakeStore({ heartbeatAt: new Date(NOW - STALE_AFTER_MS - 1000).toISOString() });
    await runBatch(deps(store, fakeClient()), null);
    expect(state.tookOver).toBe(1);
    expect(state.finished).toBe('finished');
  });

  it('claims the next queued search, and is idle when none is left', async () => {
    const { store, state } = fakeStore({ status: 'finished' });
    state.queued.push({ ...state.search!, id: 's2', status: 'queued' });
    const client = fakeClient();
    const first = await runBatch(deps(store, client), null);
    expect(first.idle).toBe(false);
    expect(state.search!.id).toBe('s2');
    expect(await runBatch(deps(store, client), first.state)).toEqual({ idle: true, state: null });
  });

  it('checks a sample of cache hits, and logs no names or numbers', async () => {
    const list = Array.from({ length: 20 }, (_, i) => row(i + 1, '2026-02-01'));
    const { store, state } = fakeStore({ membershipNumber: '333333', archerName: 'Nobody Here' });
    for (const t of list) {
      state.tournaments.set(t.id, {
        name: 'x', startDate: '2026-02-01', sourceUpdatedAt: UPDATED, etag: null,
        events: [{ id: 1000 + t.id, eventType: 'RankingEvent', etag: 'W/"e"' }],
      });
    }
    const client = fakeClient(list);
    const log = vi.fn();
    await runBatch({ ...deps(store, client), log }, running);
    expect(client.event).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Between Ends: an event changed without updated_at moving');
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/333333|Nobody/);
  });
});
