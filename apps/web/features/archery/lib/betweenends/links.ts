// Linking scorecards to their Between Ends results (SQ-036). Pure, so the rules for
// what links on its own, what a parent may link, and where a link points are tested.

import type { Relation, StoredMatch } from './import-plan';

/** Between Ends' public site. Only ever linked to, never fetched. */
export const BE_SITE_ORIGIN = 'https://www.betweenends.com';

const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

/**
 * The Between Ends page for a result, built only from stored integer ids. A ranking
 * event has its own page; other event types, or a result whose type isn't known, go to
 * the tournament, which always shows the full standings. Null without a tournament id.
 */
export function beResultUrl(ids: {
  tournamentId: number | null | undefined;
  eventId: number | null | undefined;
  eventType?: string | null;
}): string | null {
  if (!isId(ids.tournamentId)) return null;
  const tournament = `${BE_SITE_ORIGIN}/tournament/${ids.tournamentId}`;
  return ids.eventType === 'RankingEvent' && isId(ids.eventId) ? `${tournament}/event/${ids.eventId}` : tournament;
}

export type ScorecardLink = { scorecardId: string; tournamentId: number | null; eventId: number; aid: number };

/**
 * The uploaded scorecards to link without asking: a result found by membership number
 * that is exactly the same as one (same tournament, date and round totals). A name
 * match is only possibly the archer, so the parent links that one. One link per
 * scorecard, to the result kept after repeats are collapsed.
 */
export function autoLinks(matches: StoredMatch[], relations: Relation[]): ScorecardLink[] {
  const links = new Map<string, ScorecardLink>();
  matches.forEach((m, i) => {
    const relation = relations[i];
    if (m.match_kind !== 'number' || relation?.kind !== 'imported-pdf' || links.has(relation.eventId)) return;
    links.set(relation.eventId, {
      scorecardId: relation.eventId,
      tournamentId: m.tournament_id,
      eventId: m.event_id,
      aid: m.aid,
    });
  });
  return [...links.values()];
}

/** Whether a parent may link this scorecard to this result: the one it was matched with, not yet linked. */
export function canLink(relation: Relation, scorecardId: string): boolean {
  return (relation.kind === 'maybe-imported' || relation.kind === 'imported-pdf') && relation.eventId === scorecardId;
}
