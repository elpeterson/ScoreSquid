import { describe, expect, it } from 'vitest';
import {
  isMsoMeetId,
  matchImportedMeets,
  msoMeetIdFromUrl,
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

  it('gives null for anything else', () => {
    expect(msoMeetIdFromUrl('/results/abc')).toBeNull();
    expect(msoMeetIdFromUrl('/Athlete.MyScores/1')).toBeNull();
    expect(msoMeetIdFromUrl(null)).toBeNull();
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
