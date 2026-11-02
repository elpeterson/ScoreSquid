// Turns stored Between Ends matches into scorecards, and works out how each relates to
// the scorecards an archer already has. Pure, so the rules that stop a duplicate or a
// silent overwrite can be tested directly.

import { decodeArrows, type DecodedRound } from './arrows';
import { TEN_RING_RULES } from './entries';
import { parseDivision } from '../division';

export type StoredMatch = {
  event_id: number;
  aid: number;
  match_kind: 'number' | 'name';
  tournament_id: number | null;
  event_type: string | null;
  tournament_name: string;
  tournament_date: string;
  tournament_end_date: string | null;
  division: string | null;
  division_code: string | null;
  venue: string | null;
  session: string | null;
  target: string | null;
  total: number | null;
  arrows: string | null;
  rounds: number | null;
  ends_per_round: number | null;
  arrows_per_end: number | null;
  scoring_rule: number | null;
  round_totals: string | null;
};

export type ExistingScorecard = {
  id: string;
  name: string;
  start_date: string | null;
  session: string | null;
  source: string;
  be_event_id: number | null;
  be_aid: number | null;
  be_arrows: string | null;
  rounds: { round_number: number; total: number }[];
};

export type PlannedRound = { round_number: number; total: number; bonus: number[]; ends: DecodedRound['ends'] };

export type RoundPlan =
  | { ok: true; rounds: PlannedRound[]; arrowsAvailable: boolean }
  | { ok: false; problem: string };

export const SEARCH_AGAIN = 'Found before import was available. Search again to import this one.';

/** Builds a scorecard's rounds, or says why this result can't be saved (SQ-020 criteria 3 and 4). */
export function planRounds(m: StoredMatch): RoundPlan {
  if (m.rounds == null || m.ends_per_round == null || m.arrows_per_end == null || m.scoring_rule == null) {
    return { ok: false, problem: SEARCH_AGAIN };
  }
  const unsupported = "This event's scoring isn't supported yet, so it can't be imported.";
  if (!TEN_RING_RULES.has(m.scoring_rule) || m.arrows_per_end > 12) return { ok: false, problem: unsupported };

  const layout = { rounds: m.rounds, endsPerRound: m.ends_per_round, arrowsPerEnd: m.arrows_per_end };
  const published = m.round_totals ?? '';

  if (!m.arrows) {
    const rounds = published
      .split('|')
      .map((value, i) => ({ round_number: i + 1, value: value.trim() }))
      .filter((r) => /^\d+$/.test(r.value))
      .map((r) => ({ round_number: r.round_number, total: Number(r.value), bonus: [], ends: [] }));
    if (rounds.length === 0) return { ok: false, problem: 'Between Ends has no score for this yet.' };
    return { ok: true, rounds, arrowsAvailable: false };
  }

  const decoded = decodeArrows(m.arrows, layout, published);
  if (!decoded.standard || decoded.unknown.length > 0) return { ok: false, problem: unsupported };

  // Without overrides, a round's total is the sum of its arrows.
  const summed = decodeArrows(m.arrows, layout, '');
  const shot = decoded.rounds.filter((r) => r.ends.length > 0);
  if (shot.length === 0) return { ok: false, problem: 'Between Ends has no score for this yet.' };
  for (const round of shot) {
    const sum = summed.rounds[round.round_number - 1]!.total;
    if (round.complete && round.total !== sum) {
      return {
        ok: false,
        problem: `Round ${round.round_number}'s arrows add up to ${sum}, but Between Ends publishes ${round.total}, so this wasn't saved.`,
      };
    }
  }
  return {
    ok: true,
    arrowsAvailable: true,
    rounds: shot.map((r) => ({ round_number: r.round_number, total: r.total, bonus: [], ends: r.ends })),
  };
}

/** Why a result can't be offered for import, or null. A name match reads its arrows only once confirmed. */
export function importProblem(m: StoredMatch): string | null {
  if (m.match_kind === 'name') {
    if (m.rounds == null || m.ends_per_round == null || m.arrows_per_end == null || m.scoring_rule == null) {
      return SEARCH_AGAIN;
    }
    return TEN_RING_RULES.has(m.scoring_rule) && m.arrows_per_end <= 12
      ? null
      : "This event's scoring isn't supported yet, so it can't be imported.";
  }
  const plan = planRounds(m);
  return plan.ok ? null : plan.problem;
}

const normaliseTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export type Relation =
  | { kind: 'new' }
  | { kind: 'imported'; eventId: string }
  | { kind: 'imported-pdf'; eventId: string }
  | { kind: 'maybe-imported'; eventId: string }
  | { kind: 'changed'; eventId: string; yours: number; theirs: number };

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const sameList = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** How a found result relates to what the archer already has (SQ-021). Never merges anything. */
export function relateToExisting(m: StoredMatch, existing: ExistingScorecard[]): Relation {
  const own = existing.find((e) => e.be_event_id === m.event_id && e.be_aid === m.aid);
  if (own) {
    if (m.arrows && own.be_arrows && m.arrows !== own.be_arrows) {
      const plan = planRounds(m);
      if (plan.ok) {
        return {
          kind: 'changed',
          eventId: own.id,
          yours: sum(own.rounds.map((r) => r.total)),
          theirs: sum(plan.rounds.map((r) => r.total)),
        };
      }
    }
    return { kind: 'imported', eventId: own.id };
  }

  const plan = planRounds(m);
  const planned = plan.ok ? plan.rounds.map((r) => r.total) : null;
  const sameTournament = existing.filter(
    (e) =>
      e.be_event_id === null &&
      e.start_date === m.tournament_date &&
      normaliseTitle(e.name) === normaliseTitle(m.tournament_name),
  );

  let close: ExistingScorecard | null = null;
  for (const e of sameTournament) {
    const totals = [...e.rounds].sort((a, b) => a.round_number - b.round_number).map((r) => r.total);
    const totalsAgree = planned ? sameList(totals, planned) : m.total != null && sum(totals) === m.total;
    const sessionsAgree =
      !e.session || !m.session || normaliseTitle(e.session) === normaliseTitle(m.session);
    if (totalsAgree && sessionsAgree) return { kind: 'imported-pdf', eventId: e.id };
    close ??= e;
  }
  return close ? { kind: 'maybe-imported', eventId: close.id } : { kind: 'new' };
}

/** The search-imported scorecard a PDF is the same result as, if any: the same check in reverse. */
export function findImportedTwin(
  card: { name: string; start_date: string | null; session: string | null; totals: number[] },
  existing: ExistingScorecard[],
): ExistingScorecard | null {
  return (
    existing.find((e) => {
      if (e.be_event_id === null || e.start_date !== card.start_date) return false;
      if (normaliseTitle(e.name) !== normaliseTitle(card.name)) return false;
      const totals = [...e.rounds].sort((a, b) => a.round_number - b.round_number).map((r) => r.total);
      const sessionsAgree = !e.session || !card.session || normaliseTitle(e.session) === normaliseTitle(card.session);
      return sessionsAgree && sameList(totals, card.totals);
    }) ?? null
  );
}

/**
 * Combined events often repeat a ranking round for the same archer, sometimes with an
 * extra round on the end. One result per archer per tournament then: the ranking event.
 * A Combined result with no ranking one to overlap stays.
 */
export function dropRepeatedCombined<T extends Pick<StoredMatch, 'event_type' | 'tournament_id' | 'arrows'>>(
  matches: T[],
): T[] {
  const rankings = matches.filter((m) => m.event_type === 'RankingEvent');
  return matches.filter((m) => {
    if (m.event_type !== 'CombinedRankingEvent' || !m.arrows) return true;
    const arrows = m.arrows;
    return !rankings.some(
      (r) =>
        r.tournament_id === m.tournament_id &&
        !!r.arrows &&
        (r.arrows === arrows || arrows.startsWith(r.arrows) || r.arrows.startsWith(arrows)),
    );
  });
}

export type SetupDefaults = Record<string, { distance_m: number | null; face_cm: number | null }>;
export type Setup = { environment: 'indoor' | 'outdoor'; bowStyle: string; distance: string; face: string };

/**
 * A prefilled setup, from the archer's latest with the same indoor or outdoor and bow
 * style. 3-arrow ends are the indoor format; 6-arrow ends are outdoor.
 */
export function defaultSetup(
  arrowsPerEnd: number | null,
  division: string | null,
  defaults: SetupDefaults,
): Setup {
  const environment = arrowsPerEnd === 3 ? 'indoor' : 'outdoor';
  const bowStyle = parseDivision(division).bowStyle ?? '';
  const remembered = defaults[`${environment}|${bowStyle}`];
  const distance = remembered?.distance_m ?? (environment === 'indoor' ? 18 : null);
  return {
    environment,
    bowStyle,
    distance: distance != null ? String(distance) : '',
    face: remembered?.face_cm != null ? String(remembered.face_cm) : '',
  };
}
