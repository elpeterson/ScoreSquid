import { describe, expect, it } from 'vitest';
import {
  isMsoMeetId,
  matchImportedMeets,
  nameSimilarity,
  suggestSavedMeets,
  msoMeetIdFromUrl,
  monthYearLabel,
  type MsoMeetRef,
  type SavedMeet,
} from '../meet-match';

const saved = (over: Partial<SavedMeet> = {}): SavedMeet => ({
  id: 's1',
  name: 'State Championship',
  start_date: '2025-03-15',
  mso_meet_id: null,
  ...over,
});
const meet = (over: Partial<MsoMeetRef> = {}): MsoMeetRef => ({
  meetId: '100',
  name: 'State Championship',
  dateHint: '3-25',
  ...over,
});

describe('msoMeetIdFromUrl', () => {
  it('reads the ID from a results link', () => {
    expect(msoMeetIdFromUrl('/results/12345')).toBe('12345');
    expect(msoMeetIdFromUrl('https://www.meetscoresonline.com/results/12345?athlete=9')).toBe('12345');
  });

  it("reads the ID from an athlete's own results link, as women's meet lists give", () => {
    expect(msoMeetIdFromUrl('/results/12345/678')).toBe('12345');
    expect(msoMeetIdFromUrl('/results/12345/678/')).toBe('12345');
    expect(msoMeetIdFromUrl('https://www.meetscoresonline.com/results/12345/678#IA1__6__Group%202')).toBe('12345');
  });

  it('gives null for anything else', () => {
    expect(msoMeetIdFromUrl('/results/abc')).toBeNull();
    expect(msoMeetIdFromUrl('/Athlete.MyScores/1')).toBeNull();
    expect(msoMeetIdFromUrl(null)).toBeNull();
  });

  it('only reads the path, not the query string', () => {
    expect(msoMeetIdFromUrl('https://www.meetscoresonline.com/results/abc?x=/results/5')).toBeNull();
    expect(msoMeetIdFromUrl('/results/12/extra')).toBeNull();
    expect(msoMeetIdFromUrl('/results/12/34/56')).toBeNull();
    expect(msoMeetIdFromUrl('/results/12/34abc')).toBeNull();
  });
});

describe('isMsoMeetId', () => {
  it('accepts digits only', () => {
    expect(isMsoMeetId('5001')).toBe(true);
    expect(isMsoMeetId('5001; drop')).toBe(false);
    expect(isMsoMeetId('')).toBe(false);
    expect(isMsoMeetId(5001)).toBe(false);
  });
});

describe('matchImportedMeets', () => {
  it('lets a same-named meet in a later season be imported', () => {
    const [m] = matchImportedMeets([meet({ dateHint: '3-26' })], [saved()]);
    expect(m.saved).toBeNull();
  });

  it('still recognises a meet after it is renamed', () => {
    const s = saved({ name: 'My Renamed Meet', mso_meet_id: '100' });
    const [m] = matchImportedMeets([meet()], [s]);
    expect(m).toEqual({ saved: s, linkMeetId: null });
  });

  it('does not match another meet with the same name once one has an ID', () => {
    const [m] = matchImportedMeets([meet({ meetId: '200', dateHint: '3-25' })], [saved({ mso_meet_id: '100' })]);
    expect(m.saved).toBeNull();
  });

  it('recognises an older import by name and date, and links it', () => {
    const s = saved();
    const [m] = matchImportedMeets([meet()], [s]);
    expect(m).toEqual({ saved: s, linkMeetId: '100' });
  });

  it('allows a month of difference across a month boundary', () => {
    const [m] = matchImportedMeets([meet({ dateHint: '1-26' })], [saved({ start_date: '2025-12-31' })]);
    expect(m.saved).not.toBeNull();
  });

  it('reads a scrape date string', () => {
    const scrape = meet({ meetId: null, dateHint: 'Mar 15, 2025' });
    expect(matchImportedMeets([scrape], [saved()])[0].saved).not.toBeNull();
    expect(matchImportedMeets([{ ...scrape, dateHint: 'Mar 15, 2026' }], [saved()])[0].saved).toBeNull();
  });

  it('falls back to the name when there is no date to compare', () => {
    expect(matchImportedMeets([meet({ dateHint: 'Date TBD' })], [saved()])[0].saved).not.toBeNull();
    expect(matchImportedMeets([meet()], [saved({ start_date: null })])[0].saved).not.toBeNull();
  });

  it('matches a saved meet to only one MSO meet', () => {
    const matches = matchImportedMeets(
      [meet({ meetId: '100', dateHint: null }), meet({ meetId: '200', dateHint: null })],
      [saved()],
    );
    expect(matches.map((m) => m.saved?.id ?? null)).toEqual(['s1', null]);
  });

  it('prefers an ID match over an earlier name match', () => {
    const linked = saved({ id: 'linked', mso_meet_id: '200', name: 'Renamed' });
    const legacy = saved({ id: 'legacy' });
    const matches = matchImportedMeets(
      [meet({ meetId: '100' }), meet({ meetId: '200' })],
      [linked, legacy],
    );
    expect(matches.map((m) => m.saved?.id)).toEqual(['legacy', 'linked']);
  });

  it('gives no link when the MSO meet has no ID', () => {
    const [m] = matchImportedMeets([meet({ meetId: null })], [saved()]);
    expect(m.linkMeetId).toBeNull();
  });
});

describe('rejected suggestions', () => {
  it('never links a meet the parent said is different', () => {
    const [m] = matchImportedMeets([meet()], [saved({ rejected_mso_meet_ids: ['100'] })]);
    expect(m.saved).toBeNull();
  });
});

describe('nameSimilarity', () => {
  it('compares words, ignoring case and punctuation', () => {
    expect(nameSimilarity('State Championship', 'state  championship!')).toBe(1);
    expect(nameSimilarity('Spring State Championship', 'State Championship')).toBeCloseTo(2 / 3);
    expect(nameSimilarity('Alpha', 'Beta')).toBe(0);
    expect(nameSimilarity('', 'Beta')).toBe(0);
  });
});

describe('suggestSavedMeets', () => {
  const none = new Set<string>();
  const hand = (id: string, name: string, start_date: string | null) => saved({ id, name, start_date });

  it('suggests a hand-entered meet from the same month with a different name', () => {
    const found = suggestSavedMeets(meet(), [hand('h', 'States', '2025-03-14')], none);
    expect(found.map((s) => s.id)).toEqual(['h']);
  });

  it('allows a month either side, and no further', () => {
    expect(suggestSavedMeets(meet(), [hand('h', 'X', '2025-04-02')], none)).toHaveLength(1);
    expect(suggestSavedMeets(meet(), [hand('h', 'X', '2025-05-02')], none)).toHaveLength(0);
  });

  it('puts the most similar name first', () => {
    const found = suggestSavedMeets(
      meet(),
      [hand('other', 'Spring Open', '2025-03-01'), hand('close', 'State Meet', '2025-03-20')],
      none,
    );
    expect(found.map((s) => s.id)).toEqual(['close', 'other']);
  });

  it('needs a similar name when there is no date to compare', () => {
    expect(suggestSavedMeets(meet(), [hand('h', 'State Championship 2025', null)], none)).toHaveLength(1);
    expect(suggestSavedMeets(meet(), [hand('h', 'Spring Open', null)], none)).toHaveLength(0);
  });

  it('leaves out linked, already matched and rejected meets', () => {
    const list = [
      saved({ id: 'linked', mso_meet_id: '9' }),
      saved({ id: 'claimed' }),
      saved({ id: 'rejected', rejected_mso_meet_ids: ['100'] }),
    ];
    expect(suggestSavedMeets(meet(), list, new Set(['claimed']))).toEqual([]);
  });
});

describe('monthYearLabel', () => {
  it("reads MSO's month and year", () => {
    expect(monthYearLabel('2-26')).toBe('Feb 2026');
    expect(monthYearLabel('12-25')).toBe('Dec 2025');
    expect(monthYearLabel(' 1-23 ')).toBe('Jan 2023');
  });

  it('gives null for anything else', () => {
    expect(monthYearLabel('Date TBD')).toBeNull();
    expect(monthYearLabel('13-25')).toBeNull();
    expect(monthYearLabel('0-25')).toBeNull();
    expect(monthYearLabel('Feb 13, 2026')).toBeNull();
    expect(monthYearLabel(null)).toBeNull();
  });
});
