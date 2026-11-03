// Archery server actions are public endpoints: each must reject bad input, need a
// signed-in user, and touch only that user's rows (SQ-046). Supabase is faked, and
// Between Ends and the crawl workflow are never reached.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, form, USER_ID, type Handler } from '@/lib/__tests__/support/fake-supabase';

const h = vi.hoisted(() => ({ client: null as unknown, cookies: new Map<string, string>(), started: 0 }));
vi.mock('@scoresquid/auth/server', () => ({ createClient: async () => h.client }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (h.cookies.has(name) ? { value: h.cookies.get(name) } : undefined),
    set: (name: string, value: string) => h.cookies.set(name, value),
  }),
}));
vi.mock('workflow/api', () => ({ start: async () => void h.started++ }));
vi.mock('@/features/archery/workflows/be-search', () => ({ beSearchWorkflow: () => undefined }));
vi.mock('@/features/archery/lib/betweenends/client', () => {
  const refuse = async () => {
    throw new Error('No Between Ends in unit tests');
  };
  return { createBeClient: () => ({ event: refuse, eventScores: refuse }) };
});

import { createArcher, deleteArcher, ensureActiveArcher, updateArcher } from '@/app/archery/actions/archer';
import { deleteEvent, updateEventSetup } from '@/app/archery/(main)/events/[id]/actions';
import { saveScorecard, type ImportPayload } from '@/app/archery/(main)/import/actions';
import { keepOneScorecard } from '@/app/archery/(main)/dashboard/actions';
import {
  cancelBeSearch,
  getBeSearch,
  getLatestBeSearch,
  importBeResults,
  resolveBeChange,
  startBeSearch,
} from '@/app/archery/actions/between-ends';

const ARCHER = '22222222-2222-4222-8222-222222222222';
const EVENT = '33333333-3333-4333-8333-333333333333';
const SETUP = { environment: 'indoor', bow_style: 'compound', distance_m: 18, face_cm: 40 } as const;

let fake: ReturnType<typeof fakeSupabase>;
const install = (opts: Parameters<typeof fakeSupabase>[0] = {}) => {
  fake = fakeSupabase(opts);
  h.client = fake.client;
  return fake;
};
const signedOut = () => install({ user: null });
const archerForm = (over: Record<string, string> = {}) =>
  form({ name: 'Robin Madeup', membership_number: '100001', competition_start_date: '2024-01-01', ...over });

beforeEach(() => {
  h.cookies.clear();
  h.started = 0;
  vi.stubGlobal('fetch', () => {
    throw new Error('No network in unit tests');
  });
  install();
});

describe('archer profiles', () => {
  it("ensureActiveArcher only accepts the user's own archer", async () => {
    h.cookies.set('scoresquid_active_archer', ARCHER);
    install({ handler: () => ({ data: null }) });
    expect(await ensureActiveArcher()).toBeNull();
    expect(fake.unscoped()).toEqual([]);
    signedOut();
    expect(await ensureActiveArcher()).toBeNull();
  });

  it('createArcher and updateArcher need a user and valid details', async () => {
    signedOut();
    expect(await createArcher(archerForm())).toEqual({ error: 'Not authenticated' });
    expect(await updateArcher(ARCHER, archerForm())).toEqual({ error: 'Not authenticated' });
    install();
    expect((await createArcher(archerForm({ name: '' }))).error).toBeTruthy();
    expect((await createArcher(archerForm({ competition_start_date: '2999-01-01' }))).error).toMatch(/future/);
    expect((await updateArcher(ARCHER, archerForm({ competition_start_date: 'soon' }))).error).toBeTruthy();
    expect(await updateArcher('x', archerForm())).toEqual({ error: 'Failed to update this archer.' });
    expect(fake.writes()).toEqual([]);
  });

  it("a taken membership number is looked up among the user's own archers", async () => {
    install({
      handler: (c) =>
        c.kind === 'rpc' ? { error: { code: '23505', message: 'duplicate' } } : { data: { id: ARCHER, name: 'Sky Madeup' } },
    });
    expect(await updateArcher(ARCHER, archerForm())).toMatchObject({ existingArcherId: ARCHER });
    expect(fake.unscoped()).toEqual([]);
  });

  it("deleteArcher removes only the user's own archer and its files", async () => {
    expect(await deleteArcher('x')).toEqual({ error: 'Archer not found' });
    install({
      handler: (c) => {
        if (c.name === 'archer_athletes') return { count: 2 };
        if (c.name === 'arch_events') return { data: [{ source_path: `${USER_ID}/card.pdf` }] };
        return undefined;
      },
    });
    expect(await deleteArcher(ARCHER)).toEqual({ success: true });
    expect(fake.unscoped()).toEqual([]);
    const del = fake.writes().find((c) => c.name === 'athletes')!;
    expect(del.filters).toEqual(expect.arrayContaining([['eq', 'sport', 'archery'], ['eq', 'user_id', USER_ID]]));
    expect(fake.writes().find((c) => c.kind === 'storage')!.values).toEqual([`${USER_ID}/card.pdf`]);
  });

  it('deleteArcher refuses to delete the only profile', async () => {
    install({ handler: () => ({ count: 1 }) });
    expect((await deleteArcher(ARCHER)).error).toMatch(/only archer/);
    expect(fake.writes()).toEqual([]);
  });
});

describe('scorecards', () => {
  it('updateEventSetup validates the setup and the id', async () => {
    expect(await updateEventSetup('x', SETUP)).toEqual({ error: 'Invalid setup' });
    expect(await updateEventSetup(EVENT, { ...SETUP, environment: 'space' as 'indoor' })).toEqual({ error: 'Invalid setup' });
    expect(await updateEventSetup(EVENT, { ...SETUP, distance_m: -1 })).toEqual({ error: 'Invalid setup' });
    signedOut();
    expect(await updateEventSetup(EVENT, SETUP)).toEqual({ error: 'Not authenticated' });
    expect(fake.writes()).toEqual([]);
  });

  it("updateEventSetup changes only the user's own scorecard", async () => {
    expect(await updateEventSetup(EVENT, SETUP)).toEqual({ success: true });
    expect(fake.writes()[0]!.filters).toEqual([['eq', 'id', EVENT], ['eq', 'user_id', USER_ID]]);
  });

  it("deleteEvent deletes only the user's own scorecard and its PDF", async () => {
    expect(await deleteEvent('x')).toEqual({ error: 'Invalid event' });
    signedOut();
    expect(await deleteEvent(EVENT)).toEqual({ error: 'Not authenticated' });
    install({ handler: (c) => (c.op === 'select' ? { data: { source_path: `${USER_ID}/a.pdf` } } : undefined) });
    await expect(deleteEvent(EVENT)).rejects.toThrow('NEXT_REDIRECT /dashboard');
    expect(fake.unscoped()).toEqual([]);
    expect(fake.writes().map((c) => c.op)).toEqual(['delete', 'remove']);
  });

  const payload = (over: Partial<ImportPayload['event']> = {}): ImportPayload => ({
    event: {
      athlete_id: ARCHER, name: 'Made Up Open', venue: null, start_date: '2026-02-01', end_date: null, shot_on: null,
      session: null, target: null, division: null, bow_style: 'compound', environment: 'indoor', distance_m: 18,
      face_cm: 40, arrows_per_end: 3, bonus_labels: [], source_path: `${USER_ID}/card.pdf`, source_hash: 'a'.repeat(64),
      name_on_card: null, ...over,
    },
    rounds: [{ round_number: 1, total: 30, bonus: [], ends: [{ end_number: 1, arrows: ['X', '10', '10'] }] }],
  });

  it('saveScorecard rejects bad data and signed-out calls', async () => {
    expect((await saveScorecard({ ...payload(), rounds: [] })).error).toMatch(/invalid data/);
    expect((await saveScorecard(payload({ source_hash: 'nope' }))).error).toMatch(/invalid data/);
    signedOut();
    expect(await saveScorecard(payload())).toEqual({ error: 'Not authenticated' });
    expect(fake.writes()).toEqual([]);
  });

  it("saveScorecard refuses a PDF path outside the user's own folder", async () => {
    expect((await saveScorecard(payload({ source_path: 'someone-else/card.pdf' }))).error).toMatch(/invalid data/);
    expect(fake.writes()).toEqual([]);
  });

  it('saveScorecard saves through the import function once checked', async () => {
    install({ handler: (c) => (c.kind === 'rpc' ? { data: EVENT } : { data: [] }) });
    expect(await saveScorecard(payload())).toEqual({ id: EVENT });
    expect(fake.unscoped()).toEqual([]);
    expect(fake.writes()).toEqual([expect.objectContaining({ name: 'import_scorecard' })]);
  });

  it("keepOneScorecard works only from the user's own scorecards", async () => {
    expect(await keepOneScorecard('x')).toEqual({ error: 'That scorecard was not found.' });
    signedOut();
    expect(await keepOneScorecard(EVENT)).toEqual({ error: 'Please sign in' });
    install({ handler: () => ({ data: null }) });
    expect(await keepOneScorecard(EVENT)).toEqual({ error: 'That scorecard was not found.' });
    expect(fake.unscoped()).toEqual([]);
    expect(fake.writes()).toEqual([]);
  });
});

describe('Between Ends searches and imports', () => {
  it('startBeSearch validates the archer and date, and needs a user', async () => {
    expect(await startBeSearch('x')).toEqual({ error: 'Archer not found' });
    expect(await startBeSearch(ARCHER, '2026-1-1')).toEqual({ error: 'That date is not valid' });
    signedOut();
    expect(await startBeSearch(ARCHER)).toEqual({ error: 'Please sign in' });
    expect(fake.writes()).toEqual([]);
    expect(h.started).toBe(0);
  });

  it('startBeSearch leaves ownership to the database function and reports its refusal', async () => {
    install({ handler: () => ({ error: { code: 'P0002', message: 'not found' } }) });
    expect(await startBeSearch(ARCHER)).toEqual({ error: 'Archer not found' });
    expect(fake.writes()).toEqual([expect.objectContaining({ name: 'start_be_search', values: { p_athlete: ARCHER } })]);
    expect(h.started).toBe(0);
  });

  it('cancelBeSearch and getBeSearch refuse a bad id and a signed-out user', async () => {
    expect(await cancelBeSearch('x')).toEqual({ error: 'Search not found' });
    expect(await getBeSearch('x')).toBeNull();
    expect(await getLatestBeSearch('x')).toEqual({ view: null, lastFinishedTo: null });
    signedOut();
    expect(await cancelBeSearch(EVENT)).toEqual({ error: 'Please sign in' });
    expect(await getBeSearch(EVENT)).toBeNull();
    expect(fake.calls).toEqual([]);
  });

  it("getBeSearch reads only the user's own search", async () => {
    install({ handler: () => ({ data: null }) });
    expect(await getBeSearch(EVENT)).toBeNull();
    expect(fake.unscoped()).toEqual([]);
  });

  it('importBeResults and resolveBeChange refuse malformed requests', async () => {
    const bad = [null, {}, { athleteId: 'x', items: [] }, { athleteId: ARCHER, items: [{ event_id: -1, aid: 1 }] }];
    for (const input of bad) expect((await importBeResults(input)).error).toBeTruthy();
    expect((await resolveBeChange({ athleteId: ARCHER, event_id: 1, aid: 1, choice: 'delete' })).error).toBeTruthy();
    expect(fake.calls).toEqual([]);
  });

  it("importBeResults finds nothing to import in another user's searches", async () => {
    install({ handler: () => ({ data: [] }) });
    const result = await importBeResults({
      athleteId: ARCHER,
      items: [{ event_id: 100, aid: 1, confirmed: false, setup: { environment: 'indoor', bow_style: 'compound', distance_m: 18, face_cm: 40 } }],
    });
    expect(result.outcomes).toEqual([expect.objectContaining({ status: 'failed', message: 'This result was not found.' })]);
    expect(fake.writes()).toEqual([]);
    expect(fake.unscoped()).toEqual([]);
  });

  it('resolveBeChange does nothing when no change is waiting', async () => {
    install({ handler: () => ({ data: [] }) });
    expect(await resolveBeChange({ athleteId: ARCHER, event_id: 100, aid: 1, choice: 'accept' })).toEqual({
      error: 'That change is no longer waiting.',
    });
    expect(fake.writes()).toEqual([]);
  });
});

// Keeps the Handler type import in use for readers extending these tests.
export type { Handler };
