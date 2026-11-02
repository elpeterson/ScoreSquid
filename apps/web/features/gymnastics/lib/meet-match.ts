import { parseMeetDates } from './mso-parser';

/** The parts of a saved competition needed to recognise an imported meet. */
export type SavedMeet = {
  id: string;
  name: string;
  start_date: string | null;
  mso_meet_id: string | null;
};

/** An MSO meet from a gymnast's history. */
export type MsoMeetRef = {
  meetId: string | null;
  name: string;
  /** Roughly when it was: `8-26` from the JSON API, or a date string from the scrape. */
  dateHint: string | null;
};

export const isMsoMeetId = (value: unknown): value is string =>
  typeof value === 'string' && /^\d+$/.test(value);

/** The meet ID in an MSO results link: `/results/12345` gives `12345`. */
export function msoMeetIdFromUrl(url: string | null | undefined): string | null {
  try {
    const { pathname } = new URL(url ?? '', 'https://www.meetscoresonline.com');
    return /^\/results\/(\d+)\/?$/.exec(pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** A count of months, so two dates can be compared, or null if there's no usable date. */
function hintMonth(hint: string | null): number | null {
  if (!hint) return null;
  const monthYear = /^(\d{1,2})-(\d{2})$/.exec(hint.trim());
  if (monthYear) {
    const month = Number(monthYear[1]);
    if (month < 1 || month > 12) return null;
    return (2000 + Number(monthYear[2])) * 12 + month - 1;
  }
  const { startDate } = parseMeetDates(hint);
  return startDate ? isoMonth(startDate) : null;
}

function isoMonth(value: string | null): number | null {
  const match = /^(\d{4})-(\d{2})/.exec(value ?? '');
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

/**
 * Whether a saved meet with no MSO ID is this one. The name must match. Dates up
 * to a month apart count, since MSO's month and the stored day can straddle one.
 * With no date to compare, the name alone decides, which avoids a duplicate.
 */
function isSameUnlinkedMeet(saved: SavedMeet, meet: MsoMeetRef): boolean {
  if (saved.mso_meet_id !== null || saved.name !== meet.name) return false;
  const a = isoMonth(saved.start_date);
  const b = hintMonth(meet.dateHint);
  return a === null || b === null || Math.abs(a - b) <= 1;
}

export type MeetMatch = {
  /** The saved meet this MSO meet is already imported as, if any. */
  saved: SavedMeet | null;
  /** Set when that saved meet has no ID yet and should now be given this one. */
  linkMeetId: string | null;
};

/**
 * Match each MSO meet to a saved meet, by ID first, then by name and date. Each
 * saved meet matches one MSO meet at most, earlier meets in the list first.
 */
export function matchImportedMeets(meets: MsoMeetRef[], saved: SavedMeet[]): MeetMatch[] {
  const used = new Set<string>();
  const byId = new Map(saved.filter((s) => s.mso_meet_id).map((s) => [s.mso_meet_id, s]));

  const matches: (SavedMeet | null)[] = meets.map((meet) => {
    const found = meet.meetId ? byId.get(meet.meetId) : undefined;
    if (found) used.add(found.id);
    return found ?? null;
  });

  return meets.map((meet, i) => {
    if (matches[i]) return { saved: matches[i], linkMeetId: null };
    const found = saved.find((s) => !used.has(s.id) && isSameUnlinkedMeet(s, meet));
    if (!found) return { saved: null, linkMeetId: null };
    used.add(found.id);
    return { saved: found, linkMeetId: meet.meetId };
  });
}
