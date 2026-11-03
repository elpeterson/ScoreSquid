// linkBeResult is a public endpoint: it must refuse bad input and signed-out calls, and
// link only the user's own scorecard to one of their own results (SQ-036, criterion 6).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, USER_ID, type Handler } from '@/lib/__tests__/support/fake-supabase';

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@scoresquid/auth/server', () => ({ createClient: async () => h.client }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('workflow/api', () => ({ start: async () => undefined }));
vi.mock('@/features/archery/workflows/be-search', () => ({ beSearchWorkflow: () => undefined }));
vi.mock('@/features/archery/lib/betweenends/client', () => ({ createBeClient: () => ({}) }));

import { linkBeResult } from '@/app/archery/actions/between-ends';

const ARCHER = '22222222-2222-4222-8222-222222222222';
const CARD = '33333333-3333-4333-8333-333333333333';
const OTHER_CARD = '44444444-4444-4444-8444-444444444444';

// One made-up result the user's search found, and an uploaded scorecard that may be it.
const found = {
  search_id: 's1', event_id: 100, aid: 1, match_kind: 'number', tournament_id: 10, event_type: 'RankingEvent',
  tournament_name: 'Made Up Open', tournament_date: '2026-02-01', tournament_end_date: null, division: null,
  division_code: null, venue: null, session: null, target: null, total: 57, arrows: 'XTT999', rounds: 1,
  ends_per_round: 2, arrows_per_end: 3, scoring_rule: 0, round_totals: null,
};
const uploaded = {
  id: CARD, name: 'Made Up Open', start_date: '2026-02-01', session: null, source: 'betweenends',
  be_event_id: null, be_aid: null, be_arrows: null, rounds: [{ round_number: 1, total: 50 }],
};

const store = (update: ReturnType<Handler> = { data: [{ id: CARD }] }): Handler => (c) => {
  if (c.name === 'arch_be_searches') return { data: [{ id: 's1' }] };
  if (c.name === 'arch_be_search_matches') return { data: [found] };
  if (c.name === 'arch_events' && c.op === 'select') return { data: [uploaded] };
  if (c.name === 'arch_events' && c.op === 'update') return update;
  return undefined;
};

let fake: ReturnType<typeof fakeSupabase>;
const install = (opts: Parameters<typeof fakeSupabase>[0] = {}) => {
  fake = fakeSupabase(opts);
  h.client = fake.client;
};
const request = (over = {}) => ({ athleteId: ARCHER, event_id: 100, aid: 1, scorecardId: CARD, ...over });

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('No network in unit tests');
  });
  install({ handler: store() });
});

describe('linkBeResult', () => {
  it('refuses malformed requests before any query', async () => {
    for (const input of [null, {}, request({ scorecardId: 'x' }), request({ event_id: 0 }), request({ aid: 1.5 })]) {
      expect(await linkBeResult(input)).toEqual({ error: 'That scorecard could not be linked.' });
    }
    expect(fake.calls).toEqual([]);
  });

  it('needs a signed-in user', async () => {
    install({ user: null, handler: store() });
    expect(await linkBeResult(request())).toEqual({ error: 'Please sign in' });
    expect(fake.calls).toEqual([]);
  });

  it("links the user's own scorecard with only the result's ids, from the stored match", async () => {
    expect(await linkBeResult(request())).toEqual({});
    const [update] = fake.writes();
    expect(update).toMatchObject({
      name: 'arch_events',
      op: 'update',
      values: { be_tournament_id: 10, be_event_id: 100, be_aid: 1 },
    });
    expect(Object.keys(update!.values as object)).toEqual(['be_tournament_id', 'be_event_id', 'be_aid']);
    expect(update!.filters).toEqual([
      ['eq', 'id', CARD],
      ['eq', 'user_id', USER_ID],
      ['eq', 'athlete_id', ARCHER],
      ['is', 'be_event_id', null],
    ]);
    expect(fake.unscoped().filter((c) => c.name !== 'arch_be_search_matches')).toEqual([]);
  });

  it('refuses a result that is not in the user\'s own searches', async () => {
    install({ handler: (c) => (c.name === 'arch_be_searches' ? { data: [] } : store()(c)) });
    expect(await linkBeResult(request())).toEqual({ error: 'That scorecard can no longer be linked to this result.' });
    expect(fake.writes()).toEqual([]);
  });

  it('refuses a scorecard other than the one the result was matched with', async () => {
    expect(await linkBeResult(request({ scorecardId: OTHER_CARD }))).toEqual({
      error: 'That scorecard can no longer be linked to this result.',
    });
    expect(fake.writes()).toEqual([]);
  });

  it('says so when the result is already on another scorecard', async () => {
    install({ handler: store({ error: { code: '23505', message: 'duplicate' } }) });
    expect(await linkBeResult(request())).toEqual({ error: 'This result is already linked to another scorecard.' });
  });

  it('reports a scorecard that was linked meanwhile', async () => {
    install({ handler: store({ data: [] }) });
    expect(await linkBeResult(request())).toEqual({ error: 'That scorecard could not be linked.' });
  });
});
