// The MSO import actions are public endpoints: bad input and signed-out calls are
// refused before MSO is read, and a saved meet must be the user's own (SQ-046).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, USER_ID, type Handler } from '@/lib/__tests__/support/fake-supabase';

const h = vi.hoisted(() => ({ client: null as unknown, fetches: [] as string[] }));
vi.mock('@scoresquid/auth/server', () => ({ createClient: async () => h.client }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

import {
  applyMsoLink,
  applyMsoReimport,
  fetchMsoMeets,
  importMsoMeet,
  previewMsoLink,
  previewMsoReimport,
  rejectMsoSuggestion,
  type MsoMeetSummary,
} from '@/app/gymnastics/actions/mso';

const GYMNAST = '22222222-2222-4222-8222-222222222222';
const SAVED = '33333333-3333-4333-8333-333333333333';
const meet: MsoMeetSummary = {
  id: '90001',
  name: 'Made Up Meet',
  dateStr: '2-26',
  level: '6',
  detailsUrl: 'https://www.meetscoresonline.com/results/90001',
  meetId: '90001',
  athleteMsoId: '5550001',
};

let fake: ReturnType<typeof fakeSupabase>;
const install = (opts: Parameters<typeof fakeSupabase>[0] = {}) => {
  fake = fakeSupabase(opts);
  h.client = fake.client;
};
// The user's gymnast; no saved meet unless the handler adds one.
const gymnastOnly: Handler = (c) =>
  c.name === 'gymnast_athletes' ? { data: { id: GYMNAST, discipline: 'WAG', mso_id: '5550001' } } : { data: null };

beforeEach(() => {
  h.fetches = [];
  vi.stubGlobal('fetch', (url: string) => {
    h.fetches.push(String(url));
    throw new Error('No network in unit tests');
  });
  install({ handler: gymnastOnly });
});

describe('fetchMsoMeets', () => {
  it('refuses an Athlete ID that is not digits, without reading MSO', async () => {
    expect(await fetchMsoMeets('')).toEqual({ error: 'No MSO ID provided' });
    expect(await fetchMsoMeets('12; drop')).toEqual({ error: 'That MSO ID should be numbers only' });
    expect(h.fetches).toEqual([]);
  });

  it('needs a signed-in user before reading MSO', async () => {
    install({ user: null });
    expect(await fetchMsoMeets('5550001')).toEqual({ error: 'Authentication required' });
    expect(h.fetches).toEqual([]);
  });
});

describe('importMsoMeet', () => {
  it('refuses a meet summary that fails validation', async () => {
    expect(await importMsoMeet(null as unknown as MsoMeetSummary)).toEqual({ error: 'That meet was not found' });
    expect(await importMsoMeet({ ...meet, athleteMsoId: '../x' })).toEqual({ error: 'That meet was not found' });
    expect(await importMsoMeet({ ...meet, name: 'x'.repeat(201) })).toEqual({ error: 'That meet was not found' });
    expect(h.fetches).toEqual([]);
    expect(fake.writes()).toEqual([]);
  });

  it('needs a signed-in user', async () => {
    install({ user: null });
    expect(await importMsoMeet(meet)).toEqual({ error: 'Authentication required' });
    expect(await importMsoMeet({ ...meet, meetId: undefined })).toEqual({ error: 'Authentication required' });
    expect(h.fetches).toEqual([]);
  });

  it('never fetches a meet link pointing anywhere but MSO', async () => {
    const scraped = { ...meet, meetId: undefined };
    expect(await importMsoMeet({ ...scraped, detailsUrl: 'http://169.254.169.254/results/1' })).toEqual({
      error: 'Invalid meet link',
    });
    expect(h.fetches).toEqual([]);
  });
});

describe('re-import, link and reject', () => {
  it('refuse a saved id that is not a uuid', async () => {
    for (const action of [previewMsoReimport, previewMsoLink, rejectMsoSuggestion]) {
      expect(await action('x', meet)).toEqual({ error: 'That meet was not found' });
    }
    for (const action of [applyMsoReimport, applyMsoLink]) {
      expect(await action('x', meet, [])).toEqual({ error: 'That meet was not found' });
    }
    expect(fake.calls).toEqual([]);
  });

  it('need a signed-in user', async () => {
    install({ user: null });
    expect(await previewMsoReimport(SAVED, meet)).toEqual({ error: 'Authentication required' });
    expect(await applyMsoLink(SAVED, meet, [])).toEqual({ error: 'Authentication required' });
    expect(await rejectMsoSuggestion(SAVED, meet)).toEqual({ error: 'Authentication required' });
    expect(fake.writes()).toEqual([]);
  });

  it("do nothing to a meet that isn't the user's, and don't read MSO for it", async () => {
    expect((await previewMsoReimport(SAVED, meet)).error).toMatch(/not linked/);
    expect((await applyMsoReimport(SAVED, meet, ['score:vault:value'])).error).toMatch(/not linked/);
    expect((await previewMsoLink(SAVED, meet)).error).toMatch(/could not be found/);
    expect((await rejectMsoSuggestion(SAVED, meet)).error).toMatch(/could not be found/);
    expect(h.fetches).toEqual([]);
    expect(fake.writes()).toEqual([]);
    // Every saved-meet read was limited to this user.
    expect(fake.calls.filter((c) => c.name === 'gym_competitions').every((c) => c.filters.some(([, col, v]) => col === 'user_id' && v === USER_ID))).toBe(true);
  });

  it('applyMsoReimport refuses a list of choices that is not a list', async () => {
    expect(await applyMsoReimport(SAVED, meet, 'all' as unknown as string[])).toEqual({ error: 'Nothing was chosen' });
    expect(fake.writes()).toEqual([]);
  });

  it("rejectMsoSuggestion records the meet only on the user's own row", async () => {
    install({
      handler: (c) =>
        c.name === 'gym_competitions' && c.op === 'select'
          ? { data: { name: 'Made Up Meet', mso_meet_id: null, rejected_mso_meet_ids: ['10'], scores: [] } }
          : gymnastOnly(c),
    });
    expect(await rejectMsoSuggestion(SAVED, meet)).toEqual({ success: true });
    const [update] = fake.writes();
    expect(update).toMatchObject({ name: 'gym_competitions', op: 'update', values: { rejected_mso_meet_ids: ['10', '90001'] } });
    expect(update!.filters).toEqual([['eq', 'id', SAVED], ['eq', 'user_id', USER_ID]]);
  });
});
