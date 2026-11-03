// Saved scorecards that are the same result: the same arrows on the same day. Between
// Ends lists some results in several roll-up tournaments, and each could be imported
// before search results were grouped. Pure, and it only reports: a parent chooses what
// to remove.

import { eventDate, type EventRow } from './stats';

/** The arrows of a scorecard, or null if it has none stored. */
function arrowFingerprint(event: Pick<EventRow, 'rounds'>): string | null {
  const rounds = [...event.rounds]
    .sort((a, b) => a.round_number - b.round_number)
    .map((round) =>
      [...round.ends]
        .sort((a, b) => a.end_number - b.end_number)
        .map((end) => [...end.arrows].sort().join(','))
        .join('/'),
    );
  return rounds.some((r) => r.replaceAll('/', '') !== '') ? rounds.join('|') : null;
}

/** Groups of two or more scorecards with the same arrows on the same day, in the order given. */
export function repeatedScorecards<T extends EventRow>(events: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const event of events) {
    const arrows = arrowFingerprint(event);
    if (!arrows) continue;
    const key = `${eventDate(event)}|${arrows}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

/** The card to offer keeping first: the one with the most setup filled in, as it may have been edited. */
export function suggestedKeep<T extends EventRow>(group: T[]): T {
  const filled = (e: T) => [e.bow_style, e.environment, e.distance_m, e.face_cm].filter((v) => v != null).length;
  return group.reduce((best, e) => (filled(e) > filled(best) ? e : best));
}
