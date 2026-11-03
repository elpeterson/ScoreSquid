import { parseMeetDates } from './mso-parser';

/** The parts of a saved competition needed to recognise an imported meet. */
export type SavedMeet = {
  id: string;
  name: string;
  start_date: string | null;
  mso_meet_id: string | null;
  /** MSO meets the parent said this is not. */
  rejected_mso_meet_ids?: string[] | null;
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

/**
 * The meet ID in an MSO results link: `/results/12345` gives `12345`, and so does
 * `/results/12345/678`, the athlete's own page, which women's meet lists link to.
 */
export function msoMeetIdFromUrl(url: string | null | undefined): string | null {
  try {
    const { pathname } = new URL(url ?? '', 'https://www.meetscoresonline.com');
    return /^\/results\/(\d+)(?:\/\d+)?\/?$/.exec(pathname)?.[1] ?? null;
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** MSO's `2-26` as `Feb 2026`, or null when it isn't a month and year. */
export function monthYearLabel(hint: string | null | undefined): string | null {
  const match = /^(\d{1,2})-(\d{2})$/.exec(hint?.trim() ?? '');
  const month = match ? MONTHS[Number(match[1]) - 1] : undefined;
  return month ? `${month} 20${match![2]}` : null;
}

function isoMonth(value: string | null): number | null {
  const match = /^(\d{4})-(\d{2})/.exec(value ?? '');
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

const isRejected = (saved: SavedMeet, meet: MsoMeetRef) =>
  meet.meetId !== null && (saved.rejected_mso_meet_ids ?? []).includes(meet.meetId);

/**
 * Whether a saved meet with no MSO ID is this one. The name must match. Dates up
 * to a month apart count, since MSO's month and the stored day can straddle one.
 * With no date to compare, the name alone decides, which avoids a duplicate.
 */
function isSameUnlinkedMeet(saved: SavedMeet, meet: MsoMeetRef): boolean {
  if (saved.mso_meet_id !== null || saved.name !== meet.name) return false;
  if (isRejected(saved, meet)) return false;
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

const words = (name: string) =>
  new Set(name.toLowerCase().match(/[a-z0-9]+/g) ?? []);

/** How alike two names are, from 0 (no words shared) to 1 (the same words). */
export function nameSimilarity(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.max(left.size, right.size);
}

/**
 * Saved meets with no MSO ID that may be this MSO meet, likeliest first. A meet
 * qualifies if it's within a month, or has no date to compare and a similar name.
 * These are only suggestions: nothing changes until the parent confirms one.
 */
export function suggestSavedMeets(
  meet: MsoMeetRef,
  saved: SavedMeet[],
  claimedIds: ReadonlySet<string>,
): SavedMeet[] {
  const month = hintMonth(meet.dateHint);
  return saved
    .filter((s) => s.mso_meet_id === null && !claimedIds.has(s.id) && !isRejected(s, meet))
    .map((s) => {
      const savedMonth = isoMonth(s.start_date);
      const distance = month === null || savedMonth === null ? null : Math.abs(month - savedMonth);
      return { s, distance, similarity: nameSimilarity(s.name, meet.name) };
    })
    .filter(({ distance, similarity }) =>
      distance === null ? similarity >= 0.5 : distance <= 1,
    )
    .sort(
      (a, b) =>
        b.similarity - a.similarity || (a.distance ?? 99) - (b.distance ?? 99),
    )
    .map(({ s }) => s);
}
