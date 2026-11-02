// What the Between Ends search screen shows, given a search and its matches.

export type SearchStatus = 'queued' | 'running' | 'finished' | 'failed' | 'cancelled';

export type SearchMatch = {
  event_id: number;
  aid: number;
  match_kind: 'number' | 'name';
  tournament_name: string;
  tournament_date: string;
  division: string | null;
  total: number | null;
};

export const isActive = (status: SearchStatus) => status === 'queued' || status === 'running';

/**
 * Where a new search starts: from the day the last finished search reached, which
 * repeats that day as results can still arrive on it, or else the archer's start date.
 */
export function defaultSearchFrom(startDate: string | null, lastFinishedTo: string | null): string | null {
  return lastFinishedTo ?? startDate;
}

/** A later search can offer to go back, unless it would start from the same date anyway. */
export function canGoBackToStart(startDate: string | null, from: string | null): boolean {
  return !!startDate && !!from && startDate < from;
}

/** Whole percent, or null until the crawl knows how many tournaments it will read. */
export function progressPercent(done: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.floor((done / total) * 100));
}

/** Number matches are this archer's; name matches may be someone else, so they're apart. */
export function splitMatches<T extends { match_kind: 'number' | 'name' }>(
  matches: T[],
): { confirmed: T[]; possible: T[] } {
  return {
    confirmed: matches.filter((m) => m.match_kind === 'number'),
    possible: matches.filter((m) => m.match_kind === 'name'),
  };
}
