// Gymnastics server actions are public endpoints: each must reject bad input, need a
// signed-in user, and touch only that user's rows (SQ-046). Supabase is faked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, form, USER_ID, type Handler } from '@/lib/__tests__/support/fake-supabase';

const h = vi.hoisted(() => ({ client: null as unknown, cookies: new Map<string, string>() }));
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

import {
  createGymnast,
  deleteGymnast,
  ensureActiveGymnast,
  setActiveGymnast,
  updateGymnast,
} from '@/app/gymnastics/actions/gymnast';
import { createScore, deleteCompetition, updateCompetition } from '@/app/gymnastics/(main)/scores/actions';
import { loadMoreCompetitions } from '@/app/gymnastics/(main)/dashboard/actions';

const GYMNAST = '22222222-2222-4222-8222-222222222222';
const MEET = '33333333-3333-4333-8333-333333333333';

let fake: ReturnType<typeof fakeSupabase>;
const install = (opts: Parameters<typeof fakeSupabase>[0] = {}) => {
  fake = fakeSupabase(opts);
  h.client = fake.client;
  return fake;
};
const signedOut = () => install({ user: null });

beforeEach(() => {
  h.cookies.clear();
  vi.stubGlobal('fetch', () => {
    throw new Error('No network in unit tests');
  });
  install();
});

describe('gymnast profiles', () => {
  it('setActiveGymnast only remembers a real id', async () => {
    await expect(setActiveGymnast('not-an-id')).rejects.toThrow('NEXT_REDIRECT');
    expect(h.cookies.size).toBe(0);
    await expect(setActiveGymnast(GYMNAST)).rejects.toThrow('NEXT_REDIRECT');
    expect([...h.cookies.values()]).toEqual([GYMNAST]);
  });

  it("ensureActiveGymnast checks a remembered gymnast is the user's own", async () => {
    h.cookies.set('scoresquid_active_gymnast', GYMNAST);
    install({ handler: () => ({ data: null }) });
    await ensureActiveGymnast();
    expect(fake.calls.length).toBeGreaterThan(0);
    expect(fake.unscoped()).toEqual([]);
  });

  it('ensureActiveGymnast gives nothing when signed out', async () => {
    signedOut();
    expect(await ensureActiveGymnast()).toBeNull();
    expect(fake.calls).toEqual([]);
  });

  it('createGymnast needs a user, a name and a known discipline', async () => {
    signedOut();
    expect(await createGymnast(form({ name: 'Sam Madeup' }))).toEqual({ error: 'Not authenticated' });
    install();
    expect((await createGymnast(form({ name: '' }))).error).toBeTruthy();
    expect(await createGymnast(form({ name: 'Sam Madeup', discipline: 'TRA' }))).toEqual({
      error: 'That discipline is not valid',
    });
    expect(fake.writes()).toEqual([]);
  });

  it('updateGymnast rejects a bad id or MSO ID before writing', async () => {
    expect(await updateGymnast('x', form({ name: 'Sam Madeup' }))).toEqual({ error: 'Gymnast not found' });
    expect(await updateGymnast(GYMNAST, form({ name: 'Sam Madeup', mso_id: '12a' }))).toEqual({
      error: 'That MSO ID should be numbers only',
    });
    signedOut();
    expect(await updateGymnast(GYMNAST, form({ name: 'Sam Madeup' }))).toEqual({ error: 'Not authenticated' });
    expect(fake.writes()).toEqual([]);
  });

  it("deleteGymnast deletes only the user's own gymnastics profile", async () => {
    expect(await deleteGymnast('x')).toEqual({ error: 'Gymnast not found' });
    install({ handler: (c) => (c.op === 'select' ? { count: 2 } : undefined) });
    expect(await deleteGymnast(GYMNAST)).toEqual({ success: true });
    const [del] = fake.writes();
    expect(del).toMatchObject({ name: 'athletes', op: 'delete' });
    expect(del!.filters).toEqual(
      expect.arrayContaining([['eq', 'id', GYMNAST], ['eq', 'user_id', USER_ID], ['eq', 'sport', 'gymnastics']]),
    );
    expect(fake.unscoped()).toEqual([]);
  });

  it('deleteGymnast refuses to delete the only profile', async () => {
    install({ handler: (c) => (c.op === 'select' ? { count: 1 } : undefined) });
    expect((await deleteGymnast(GYMNAST)).error).toMatch(/only gymnast/);
    expect(fake.writes()).toEqual([]);
  });
});

describe('meets', () => {
  // The active gymnast is the user's, women's, with one meet.
  const owned: Handler = (c) => {
    if (c.name === 'gymnast_athletes') return { data: { id: GYMNAST, discipline: 'WAG' } };
    if (c.name === 'gym_competitions' && c.op === 'select') return { data: { athlete_id: GYMNAST } };
    if (c.name === 'gym_competitions' && c.op === 'insert') return { data: { id: MEET } };
    return undefined;
  };

  it('createScore needs a user', async () => {
    signedOut();
    await expect(createScore(form({ name: 'Made Up Meet' }))).rejects.toThrow('NEXT_REDIRECT /login');
    expect(fake.writes()).toEqual([]);
  });

  it('createScore rejects scores that are not numbers', async () => {
    install({ handler: owned });
    expect(await createScore(form({ name: 'Made Up Meet', vault: 'abc' }))).toEqual({ error: 'Scores must be numbers' });
    expect(fake.writes()).toEqual([]);
  });

  it("createScore saves the meet as the user's, for their gymnast, with only the four apparatus", async () => {
    install({ handler: owned });
    expect(await createScore(form({ name: 'Made Up Meet', vault: '9.1', pommel_horse: '12' }))).toEqual({ success: true });
    const [meet, scores] = fake.writes();
    expect(meet).toMatchObject({ name: 'gym_competitions', op: 'insert', values: { user_id: USER_ID, athlete_id: GYMNAST } });
    expect((scores!.values as { apparatus: string }[]).map((s) => s.apparatus)).toEqual([
      'vault',
      'uneven_bars',
      'balance_beam',
      'floor_exercise',
    ]);
  });

  it("deleteCompetition deletes only the user's own meet", async () => {
    expect(await deleteCompetition('x')).toEqual({ error: 'Failed to delete competition.' });
    expect(await deleteCompetition(MEET)).toEqual({ success: true });
    expect(fake.writes()[0]!.filters).toEqual([['eq', 'id', MEET], ['eq', 'user_id', USER_ID]]);
  });

  it("updateCompetition needs the user's own meet and valid scores", async () => {
    expect(await updateCompetition('x', form({ name: 'Made Up Meet' }))).toEqual({
      error: 'Failed to update competition details.',
    });
    install({ handler: () => ({ data: null }) });
    expect(await updateCompetition(MEET, form({ name: 'Made Up Meet' }))).toEqual({
      error: 'Failed to update competition details.',
    });
    expect(fake.writes()).toEqual([]);

    install({ handler: owned });
    expect(await updateCompetition(MEET, form({ name: 'Made Up Meet', vault: '9.2' }))).toEqual({ success: true });
    expect(fake.unscoped().filter((c) => c.name !== 'gym_scores')).toEqual([]);
    const upsert = fake.writes().find((c) => c.name === 'gym_scores')!;
    expect((upsert.values as { competition_id: string }[]).every((s) => s.competition_id === MEET)).toBe(true);
  });

  it("loadMoreCompetitions reads only the user's own meets", async () => {
    expect(await loadMoreCompetitions('x', 0)).toEqual({ error: 'Failed to load competitions' });
    expect(await loadMoreCompetitions(GYMNAST, -1)).toEqual({ error: 'Failed to load competitions' });
    signedOut();
    expect(await loadMoreCompetitions(GYMNAST, 0)).toEqual({ error: 'Unauthorized' });
    install({ handler: () => ({ data: [] }) });
    expect(await loadMoreCompetitions(GYMNAST, 10)).toEqual({ data: [] });
    expect(fake.unscoped()).toEqual([]);
  });
});
