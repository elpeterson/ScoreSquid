import { describe, expect, it } from 'vitest';
import { repeatedScorecards, suggestedKeep } from '@/features/archery/lib/repeats';
import type { EventRow } from '@/features/archery/lib/stats';

const card = (id: string, over: Partial<EventRow> = {}): EventRow => ({
  id,
  name: 'Made Up Open',
  shot_on: '2026-02-01',
  start_date: '2026-02-01',
  bow_style: 'recurve',
  environment: 'indoor',
  distance_m: null,
  face_cm: null,
  arrows_per_end: 3,
  rounds: [{ round_number: 1, total: 57, ends: [{ end_number: 1, arrows: ['X', '10', '10'] }, { end_number: 2, arrows: ['9', '9', '9'] }] }],
  ...over,
});

describe('repeatedScorecards', () => {
  it('groups the same arrows on the same day, whatever the tournament is called', () => {
    const groups = repeatedScorecards([card('a'), card('b', { name: 'Made Up Final', start_date: '2026-03-05' }), card('c')]);
    expect(groups.map((g) => g.map((e) => e.id))).toEqual([['a', 'b', 'c']]);
  });

  it('ignores arrow order within an end', () => {
    const shuffled = card('b', { rounds: [{ round_number: 1, total: 57, ends: [{ end_number: 1, arrows: ['10', 'X', '10'] }, { end_number: 2, arrows: ['9', '9', '9'] }] }] });
    expect(repeatedScorecards([card('a'), shuffled])).toHaveLength(1);
  });

  it('leaves different arrows or another day alone', () => {
    const other = card('b', { rounds: [{ round_number: 1, total: 54, ends: [{ end_number: 1, arrows: ['9', '9', '9'] }, { end_number: 2, arrows: ['9', '9', '9'] }] }] });
    expect(repeatedScorecards([card('a'), other])).toEqual([]);
    expect(repeatedScorecards([card('a'), card('c', { shot_on: '2026-02-02' })])).toEqual([]);
  });

  it('never treats scorecards with no arrows as repeats', () => {
    const totalsOnly = (id: string) => card(id, { rounds: [{ round_number: 1, total: 250, ends: [] }] });
    expect(repeatedScorecards([totalsOnly('a'), totalsOnly('b')])).toEqual([]);
  });
});

describe('suggestedKeep', () => {
  it('offers the card with the most setup filled in', () => {
    expect(suggestedKeep([card('a'), card('b', { face_cm: 40, distance_m: 18 })]).id).toBe('b');
  });
  it('offers the first when they are equal', () => {
    expect(suggestedKeep([card('a'), card('b')]).id).toBe('a');
  });
});
