// Made-up data for end-to-end tests, written through the same functions the app uses
// where a user may write, and with the admin key only for what the crawler would write.
import { admin, type Account } from './app';

export async function addArcher(account: Account, name: string, membershipNumber = '100001') {
  const { data, error } = await account.db.rpc('create_archer', {
    p_name: name,
    p_membership_number: membershipNumber,
    p_competition_start_date: '2024-01-01',
  });
  if (error) throw new Error(`create_archer: ${error.message}`);
  return data as string;
}

export async function addGymnast(account: Account, name: string, discipline: 'MAG' | 'WAG', msoId: string) {
  const { data, error } = await account.db.rpc('create_gymnast', { p_name: name, p_discipline: discipline });
  if (error) throw new Error(`create_gymnast: ${error.message}`);
  const { error: updateError } = await account.db.rpc('update_gymnast', {
    p_id: data,
    p_name: name,
    p_mso_id: msoId,
    p_discipline: discipline,
  });
  if (updateError) throw new Error(`update_gymnast: ${updateError.message}`);
  return data as string;
}

/** A saved meet with its scores, as a parent would enter it. */
export async function addMeet(
  account: Account,
  gymnastId: string,
  meet: { name: string; date: string; level?: string; division?: string },
  scores: Record<string, number>,
) {
  const { data, error } = await account.db
    .from('gym_competitions')
    .insert({
      user_id: account.id,
      athlete_id: gymnastId,
      name: meet.name,
      start_date: meet.date,
      end_date: meet.date,
      level: meet.level ?? null,
      division: meet.division ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`add meet: ${error.message}`);
  const rows = Object.entries(scores).map(([apparatus, value]) => ({ competition_id: data.id, apparatus, value }));
  const { error: scoreError } = await account.db.from('gym_scores').insert(rows);
  if (scoreError) throw new Error(`add scores: ${scoreError.message}`);
  return data.id as string;
}

export type Match = {
  event_id: number;
  aid: number;
  match_kind: 'number' | 'name';
  tournament_name: string;
  tournament_date: string;
  total: number | null;
  arrows: string | null;
  event_type?: string;
};

const ARROW_VALUE: Record<string, number> = { X: 10, T: 10, M: 0 };
export const arrowTotal = (arrows: string) =>
  [...arrows].reduce((sum, a) => sum + (ARROW_VALUE[a] ?? (Number(a) || 0)), 0);

/** A finished Between Ends search with these results, as the crawler would leave it. */
export async function seedSearch(account: Account, athleteId: string, matches: Match[]) {
  const db = admin();
  const { data: search, error } = await db
    .from('arch_be_searches')
    .insert({
      user_id: account.id,
      athlete_id: athleteId,
      membership_number: '100001',
      archer_name: 'Made Up Archer',
      from_date: '2024-01-01',
      to_date: '2026-01-01',
      status: 'finished',
      tournaments_total: matches.length,
      tournaments_done: matches.length,
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed search: ${error.message}`);
  const rows = matches.map((m) => ({
    search_id: search.id,
    event_id: m.event_id,
    aid: m.aid,
    match_kind: m.match_kind,
    tournament_name: m.tournament_name,
    tournament_date: m.tournament_date,
    division: 'Compound U18 Men',
    division_code: 'CU18M',
    total: m.total,
    arrows: m.arrows,
    tournament_id: m.event_id,
    event_type: m.event_type ?? 'RankingEvent',
    rounds: 1,
    ends_per_round: 2,
    arrows_per_end: 3,
    scoring_rule: 0,
    session: 'Range, Saturday 9am',
  }));
  const { error: matchError } = await db.from('arch_be_search_matches').insert(rows);
  if (matchError) throw new Error(`seed matches: ${matchError.message}`);
}

/** Distinct made-up 6-arrow results, one per index. */
export function distinctArrows(i: number): string {
  const faces = 'T9876';
  let n = i;
  let s = '';
  for (let k = 0; k < 6; k++) {
    s += faces[n % 5];
    n = Math.floor(n / 5);
  }
  return s;
}
