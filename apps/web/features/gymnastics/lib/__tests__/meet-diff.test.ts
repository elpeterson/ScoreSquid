import { describe, expect, it } from 'vitest';
import { buildMeetUpdate, diffMeet, type MsoMeetData, type SavedCompetition } from '../meet-diff';

const saved = (over: Partial<SavedCompetition> = {}): SavedCompetition => ({
  name: 'State',
  level: '4',
  division: '1',
  start_date: '2026-03-01',
  end_date: '2026-03-01',
  all_around_place: 3,
  scores: [{ apparatus: 'vault', value: 9.5, place: 2 }],
  ...over,
});
const mso = (over: Partial<MsoMeetData> = {}): MsoMeetData => ({
  name: 'State',
  level: '4',
  division: '1',
  startDate: '2026-03-01',
  endDate: '2026-03-01',
  allAroundPlace: 3,
  scores: [{ apparatus: 'vault', value: 9.5, place: 2 }],
  ...over,
});

describe('diffMeet', () => {
  it('finds nothing when the meet matches MSO', () => {
    expect(diffMeet(saved(), mso())).toEqual([]);
  });

  it('lists each changed field with both values', () => {
    const changes = diffMeet(
      saved({ name: 'My name' }),
      mso({ scores: [{ apparatus: 'vault', value: 9.75, place: 2 }] }),
    );
    expect(changes).toEqual([
      { key: 'name', label: 'Name', mine: 'My name', mso: 'State', gap: false },
      { key: 'score:vault:value', label: 'Vault score', mine: '9.5', mso: '9.75', gap: false },
    ]);
  });

  it('treats a numeric string from the database as the same number', () => {
    const s = saved({ scores: [{ apparatus: 'vault', value: '9.50' as unknown as number, place: 2 }] });
    expect(diffMeet(s, mso())).toEqual([]);
  });

  it('compares the date part of a timestamp from the scrape', () => {
    expect(diffMeet(saved(), mso({ startDate: '2026-03-01T00:00:00.000Z', endDate: '2026-03-01T00:00:00.000Z' }))).toEqual([]);
  });

  it('offers a score the parent is missing', () => {
    const [change] = diffMeet(saved({ scores: [] }), mso({ scores: [{ apparatus: 'vault', value: 9, place: null }] }));
    expect(change).toEqual({ key: 'score:vault:value', label: 'Vault score', mine: 'Not set', mso: '9', gap: true });
  });

  it('never offers to blank out what MSO leaves out', () => {
    const changes = diffMeet(
      saved(),
      mso({ division: null, level: null, startDate: null, endDate: null, allAroundPlace: null, scores: [{ apparatus: 'vault', value: 9.5, place: null }] }),
    );
    expect(changes).toEqual([]);
  });

  it('ignores scores MSO does not list', () => {
    const s = saved({ scores: [{ apparatus: 'vault', value: 9.5, place: 2 }, { apparatus: 'high_bar', value: 8, place: 1 }] });
    expect(diffMeet(s, mso())).toEqual([]);
  });
});

describe('buildMeetUpdate', () => {
  const s = saved({ name: 'Mine', level: '5', all_around_place: 9, scores: [{ apparatus: 'vault', value: 1, place: 1 }] });

  it('includes only what was chosen', () => {
    expect(buildMeetUpdate(s, mso(), ['level', 'score:vault:value'])).toEqual({
      fields: { level: '4' },
      scores: [{ apparatus: 'vault', value: 9.5 }],
    });
  });

  it('groups value and place by apparatus', () => {
    expect(buildMeetUpdate(s, mso(), ['score:vault:value', 'score:vault:place']).scores).toEqual([
      { apparatus: 'vault', value: 9.5, place: 2 },
    ]);
  });

  it('ignores keys that are not current changes', () => {
    const update = buildMeetUpdate(s, mso(), ['user_id', 'end_date', 'score:vault:start_value', 42, null]);
    expect(update).toEqual({ fields: {}, scores: [] });
  });
});
