import { describe, expect, it } from 'vitest';
import {
  collapseRepeats,
  defaultSetup,
  dropRepeatedCombined,
  findImportedTwin,
  importBatches,
  importProblem,
  planRounds,
  relateToExisting,
  SEARCH_AGAIN,
  type ExistingScorecard,
  type StoredMatch,
} from '@/features/archery/lib/betweenends/import-plan';

// Made-up tournaments. 1 round of 2 ends of 3 arrows.
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

const imported = (over: Partial<ExistingScorecard> = {}) =>
  pdf({ source: 'betweenends_api', be_event_id: 100, be_aid: 1, be_arrows: 'XTT999', ...over });

describe('planRounds', () => {
  it('splits arrows into rounds and ends', () => {
    const plan = planRounds(match());
    expect(plan).toMatchObject({ ok: true, arrowsAvailable: true });
    if (!plan.ok) return;
    expect(plan.rounds).toHaveLength(1);
    expect(plan.rounds[0]).toMatchObject({ total: 57 });
    expect(plan.rounds[0]!.ends.map((e) => e.arrows)).toEqual([['X', '10', '10'], ['9', '9', '9']]);
  });

  it('flags arrows that disagree with the published total', () => {
    const plan = planRounds(match({ round_totals: '60' }));
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.problem).toContain('add up to 57');
  });

  it('accepts a published total that agrees', () => {
    expect(planRounds(match({ round_totals: '57' })).ok).toBe(true);
  });

  it('saves totals alone when there are no arrows', () => {
    const plan = planRounds(match({ arrows: null, round_totals: '250|260' }));
    expect(plan).toMatchObject({ ok: true, arrowsAvailable: false });
    if (plan.ok) expect(plan.rounds.map((r) => [r.total, r.ends.length])).toEqual([[250, 0], [260, 0]]);
  });

  it('refuses a result with no score at all', () => {
    expect(planRounds(match({ arrows: null })).ok).toBe(false);
    expect(planRounds(match({ arrows: 'EEEEEE' })).ok).toBe(false);
  });

  it('keeps a part-shot round without flagging it', () => {
    const plan = planRounds(match({ arrows: 'XTTEEE' }));
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.rounds[0]!.ends).toHaveLength(1);
  });

  it('refuses scoring it cannot store or compare', () => {
    expect(planRounds(match({ scoring_rule: 4 })).ok).toBe(false);
    expect(planRounds(match({ arrows: 'abdabd' })).ok).toBe(false);
    expect(planRounds(match({ arrows_per_end: 13 })).ok).toBe(false);
  });

  it('asks for a new search on matches stored before import existed', () => {
    expect(planRounds(match({ rounds: null }))).toEqual({ ok: false, problem: SEARCH_AGAIN });
  });
});

describe('importProblem', () => {
  it("doesn't hold a name match's missing arrows against it", () => {
    expect(importProblem(match({ match_kind: 'name', arrows: null }))).toBeNull();
  });
  it('still refuses unsupported scoring on a name match', () => {
    expect(importProblem(match({ match_kind: 'name', arrows: null, scoring_rule: 4 }))).toContain('supported');
  });
});

describe('relateToExisting', () => {
  it('is new with nothing like it', () => {
    expect(relateToExisting(match(), [])).toEqual({ kind: 'new' });
    expect(relateToExisting(match(), [pdf({ name: 'Another Open' })])).toEqual({ kind: 'new' });
  });

  it('recognises its own earlier import', () => {
    expect(relateToExisting(match(), [imported()])).toEqual({ kind: 'imported', eventId: 'e1' });
  });

  it('recognises a PDF by tournament, session and round totals, ignoring punctuation', () => {
    expect(relateToExisting(match(), [pdf({ name: 'MADE UP  OPEN!' })])).toEqual({ kind: 'imported-pdf', eventId: 'e1' });
  });

  it('calls it only possible when a detail differs, never merging', () => {
    expect(relateToExisting(match(), [pdf({ rounds: [{ round_number: 1, total: 50 }] })]).kind).toBe('maybe-imported');
    expect(relateToExisting(match(), [pdf({ session: 'Range, Sunday 9am' })]).kind).toBe('maybe-imported');
  });

  it('compares a name match by its overall total', () => {
    const name = match({ match_kind: 'name', arrows: null });
    expect(relateToExisting(name, [pdf()]).kind).toBe('imported-pdf');
    expect(relateToExisting({ ...name, total: 1 }, [pdf()]).kind).toBe('maybe-imported');
  });

  it('reports a correction at the source with both totals', () => {
    expect(relateToExisting(match({ arrows: 'XTT998' }), [imported()])).toEqual({
      kind: 'changed', eventId: 'e1', yours: 57, theirs: 56,
    });
  });

  it("doesn't call a correction a change until there's a usable new version", () => {
    expect(relateToExisting(match({ arrows: 'XTT998', round_totals: '60' }), [imported()]).kind).toBe('imported');
  });

  it('offers a deleted scorecard as new', () => {
    expect(relateToExisting(match(), [])).toEqual({ kind: 'new' });
  });
});

describe('findImportedTwin', () => {
  const card = { name: 'Made Up Open', start_date: '2026-02-01', session: 'Range, Saturday 9am', totals: [57] };
  it('finds the search-imported scorecard a PDF repeats', () => {
    expect(findImportedTwin(card, [imported()])?.id).toBe('e1');
  });
  it('ignores other PDFs, which the file hash handles', () => {
    expect(findImportedTwin(card, [pdf()])).toBeNull();
  });
  it('needs the totals and session to agree', () => {
    expect(findImportedTwin({ ...card, totals: [50] }, [imported()])).toBeNull();
    expect(findImportedTwin({ ...card, session: 'Range, Sunday 9am' }, [imported()])).toBeNull();
  });
});

describe('dropRepeatedCombined', () => {
  const ranking = match({ arrows: 'XTT999' });
  const combined = (arrows: string | null, over: Partial<StoredMatch> = {}) =>
    match({ event_id: 101, event_type: 'CombinedRankingEvent', arrows, ...over });

  it('drops one repeating a ranking event, or the ranking event plus a round', () => {
    expect(dropRepeatedCombined([ranking, combined('XTT999')])).toEqual([ranking]);
    expect(dropRepeatedCombined([ranking, combined('XTT999888')])).toEqual([ranking]);
  });
  it('keeps one with nothing to repeat', () => {
    expect(dropRepeatedCombined([combined('XTT999')])).toHaveLength(1);
    expect(dropRepeatedCombined([ranking, combined('111111')])).toHaveLength(2);
    expect(dropRepeatedCombined([ranking, combined('XTT999', { tournament_id: 11 })])).toHaveLength(2);
  });
  it('keeps two different ranking events', () => {
    expect(dropRepeatedCombined([ranking, match({ event_id: 102, arrows: 'XTT999' })])).toHaveLength(2);
  });
});

describe('defaultSetup', () => {
  it('reads indoor from 3-arrow ends and the bow from the division', () => {
    expect(defaultSetup(3, 'RU13W', {})).toEqual({ environment: 'indoor', bowStyle: 'recurve', distance: '18', face: '' });
  });
  it('prefills from the same indoor or outdoor and bow style', () => {
    const defaults = { 'outdoor|barebow': { distance_m: 30, face_cm: 122 } };
    expect(defaultSetup(6, 'BU13W', defaults)).toEqual({ environment: 'outdoor', bowStyle: 'barebow', distance: '30', face: '122' });
  });
});

describe('collapseRepeats', () => {
  // One made-up result, republished in Combined events across roll-up tournaments.
  const copy = (event_id: number, over: Partial<StoredMatch> = {}) =>
    match({ event_id, event_type: 'CombinedRankingEvent', tournament_id: event_id * 10, aid: 7, ...over });

  it('shows identical arrows across tournaments as one result, keeping the lowest event id', () => {
    const found = collapseRepeats([copy(306), copy(295), copy(222), copy(221)]);
    expect(found).toHaveLength(1);
    expect(found[0]!.event_id).toBe(221);
    expect(found[0]!.copies!.map((c) => c.event_id).sort()).toEqual([222, 295, 306]);
  });

  it('keeps the same one whatever order they arrive in', () => {
    const a = collapseRepeats([copy(221), copy(306)])[0]!.event_id;
    const b = collapseRepeats([copy(306), copy(221)])[0]!.event_id;
    expect(a).toBe(b);
  });

  it('prefers a ranking event over a lower-numbered Combined event', () => {
    const [found] = collapseRepeats([copy(100), copy(200, { event_type: 'RankingEvent' })]);
    expect(found!.event_id).toBe(200);
  });

  it('keeps a different shoot at the same championship', () => {
    expect(collapseRepeats([copy(221), copy(219, { aid: 8, arrows: '999888', total: 51 })])).toHaveLength(2);
  });

  it('keeps results with the same total but different arrows', () => {
    expect(collapseRepeats([copy(221), copy(222, { arrows: 'TTT999' })])).toHaveLength(2);
  });

  it("doesn't match part-shot arrows from different entries", () => {
    const part = { arrows: 'XEEEEE', total: 10 };
    expect(collapseRepeats([copy(221, part), copy(222, { ...part, aid: 8 })])).toHaveLength(2);
    expect(collapseRepeats([copy(221, part), copy(222, part)])).toHaveLength(1);
  });

  it('groups a name match, which has no arrows, by entry and total under the number match', () => {
    const name = copy(100, { match_kind: 'name', arrows: null });
    const [found, ...rest] = collapseRepeats([name, copy(221)]);
    expect(rest).toHaveLength(0);
    expect(found!.match_kind).toBe('number');
    expect(collapseRepeats([copy(100, { match_kind: 'name', arrows: null, total: null }), copy(221)])).toHaveLength(2);
  });

  it('counts a scorecard made from any copy as this result', () => {
    const [found] = collapseRepeats([copy(221), copy(306)]);
    expect(relateToExisting(found!, [imported({ be_event_id: 306, be_aid: 7 })])).toEqual({ kind: 'imported', eventId: 'e1' });
  });

  it('matches a PDF from any listed tournament', () => {
    const [found] = collapseRepeats([copy(221), copy(306, { tournament_name: 'Made Up Final', tournament_date: '2026-03-05' })]);
    expect(relateToExisting(found!, [pdf({ name: 'Made Up Final', start_date: '2026-03-05' })]).kind).toBe('imported-pdf');
  });
});

describe('importBatches', () => {
  const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => i + from);

  it('splits 60 results into calls of 25, 25 and 10, in order', () => {
    const batches = importBatches(ids(60), () => false);
    expect(batches.map((b) => b.length)).toEqual([25, 25, 10]);
    expect(batches.flat()).toEqual(ids(60));
  });

  it('sends a short list in one call', () => {
    expect(importBatches(ids(3), () => false)).toEqual([[0, 1, 2]]);
    expect(importBatches([], () => false)).toEqual([]);
  });

  it('puts no more than 5 possible matches in a call', () => {
    const batches = importBatches(ids(12), () => true);
    expect(batches.map((b) => b.length)).toEqual([5, 5, 2]);
  });

  it('fills a call with certain results around the possible matches', () => {
    const possible = (n: number) => n >= 100;
    const batches = importBatches([...ids(7, 100), ...ids(20)], possible);
    expect(batches[0]!.filter(possible)).toHaveLength(5);
    expect(batches[0]).toHaveLength(25);
    expect(batches.flat().sort((a, b) => a - b)).toEqual([...ids(20), ...ids(7, 100)]);
  });
});
