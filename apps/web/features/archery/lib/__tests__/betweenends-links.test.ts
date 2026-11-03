import { describe, expect, it } from 'vitest';
import {
  relateToExisting,
  type ExistingScorecard,
  type StoredMatch,
} from '@/features/archery/lib/betweenends/import-plan';
import { autoLinks, beResultUrl, BE_SITE_ORIGIN, canLink } from '@/features/archery/lib/betweenends/links';

// Made-up tournaments, as in betweenends-import-plan.test.ts.
const match = (over: Partial<StoredMatch> = {}): StoredMatch => ({
  event_id: 100, aid: 1, match_kind: 'number', tournament_id: 10, event_type: 'RankingEvent',
  tournament_name: 'Made Up Open', tournament_date: '2026-02-01', tournament_end_date: '2026-02-02',
  division: 'Recurve U13 Women', division_code: 'RU13W', venue: null, session: 'Range, Saturday 9am', target: '7B',
  total: 57, arrows: 'XTT999', rounds: 1, ends_per_round: 2, arrows_per_end: 3, scoring_rule: 0, round_totals: null,
  ...over,
});

const pdf = (over: Partial<ExistingScorecard> = {}): ExistingScorecard => ({
  id: 'e1', name: 'Made Up Open', start_date: '2026-02-01', session: 'Range, Saturday 9am', source: 'betweenends',
  be_event_id: null, be_aid: null, be_arrows: null, rounds: [{ round_number: 1, total: 57 }], ...over,
});

const relate = (matches: StoredMatch[], existing: ExistingScorecard[]) => matches.map((m) => relateToExisting(m, existing));

describe('beResultUrl', () => {
  it('links a ranking event to its own page', () => {
    expect(beResultUrl({ tournamentId: 10, eventId: 100, eventType: 'RankingEvent' })).toBe(
      `${BE_SITE_ORIGIN}/tournament/10/event/100`,
    );
  });

  it('links other or unknown event types to the tournament', () => {
    expect(beResultUrl({ tournamentId: 10, eventId: 100, eventType: 'CombinedRankingEvent' })).toBe(
      `${BE_SITE_ORIGIN}/tournament/10`,
    );
    expect(beResultUrl({ tournamentId: 10, eventId: 100 })).toBe(`${BE_SITE_ORIGIN}/tournament/10`);
  });

  it('gives no link without a usable tournament id', () => {
    expect(beResultUrl({ tournamentId: null, eventId: 100, eventType: 'RankingEvent' })).toBeNull();
    expect(beResultUrl({ tournamentId: 0, eventId: 100 })).toBeNull();
    expect(beResultUrl({ tournamentId: 1.5, eventId: 100 })).toBeNull();
    expect(beResultUrl({ tournamentId: '10/../x' as unknown as number, eventId: 100 })).toBeNull();
  });

  it('never puts anything but integer ids in the path', () => {
    expect(beResultUrl({ tournamentId: 10, eventId: '5?x=1' as unknown as number, eventType: 'RankingEvent' })).toBe(
      `${BE_SITE_ORIGIN}/tournament/10`,
    );
  });
});

describe('autoLinks', () => {
  it('links an uploaded scorecard a number match finds exactly', () => {
    const matches = [match()];
    expect(autoLinks(matches, relate(matches, [pdf()]))).toEqual([
      { scorecardId: 'e1', tournamentId: 10, eventId: 100, aid: 1 },
    ]);
  });

  it('leaves a name match for the parent to link', () => {
    const matches = [match({ match_kind: 'name' })];
    const relations = relate(matches, [pdf()]);
    expect(relations[0]!.kind).toBe('imported-pdf');
    expect(autoLinks(matches, relations)).toEqual([]);
  });

  it('does not link a possible match', () => {
    const matches = [match()];
    const relations = relate(matches, [pdf({ rounds: [{ round_number: 1, total: 50 }] })]);
    expect(relations[0]!.kind).toBe('maybe-imported');
    expect(autoLinks(matches, relations)).toEqual([]);
  });

  it('links nothing when no scorecard matches', () => {
    const matches = [match()];
    expect(autoLinks(matches, relate(matches, [pdf({ name: 'Another Made Up Shoot' })]))).toEqual([]);
  });

  it('links each scorecard once', () => {
    const matches = [match(), match({ event_id: 101, aid: 2 })];
    expect(autoLinks(matches, relate(matches, [pdf()]))).toHaveLength(1);
  });

  it('keeps a missing tournament id as null', () => {
    const matches = [match({ tournament_id: null })];
    expect(autoLinks(matches, relate(matches, [pdf()]))[0]!.tournamentId).toBeNull();
  });
});

describe('canLink', () => {
  it('allows linking the scorecard a result was matched with', () => {
    expect(canLink({ kind: 'maybe-imported', eventId: 'e1' }, 'e1')).toBe(true);
    expect(canLink({ kind: 'imported-pdf', eventId: 'e1' }, 'e1')).toBe(true);
  });

  it('refuses any other scorecard', () => {
    expect(canLink({ kind: 'maybe-imported', eventId: 'e1' }, 'e2')).toBe(false);
  });

  it('refuses a result that is new, already imported or changed', () => {
    expect(canLink({ kind: 'new' }, 'e1')).toBe(false);
    expect(canLink({ kind: 'imported', eventId: 'e1' }, 'e1')).toBe(false);
    expect(canLink({ kind: 'changed', eventId: 'e1', yours: 1, theirs: 2 }, 'e1')).toBe(false);
  });
});

describe('a linked scorecard (criterion 5)', () => {
  it('counts as imported, with no "changed" prompt, as its be_arrows stay empty', () => {
    const linked = pdf({ be_event_id: 100, be_aid: 1, be_arrows: null });
    expect(relateToExisting(match({ arrows: 'XTT998' }), [linked])).toEqual({ kind: 'imported', eventId: 'e1' });
  });
});
