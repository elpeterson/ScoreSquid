// Validates a meet from a form. Anything not a number is refused here, since parseFloat
// would pass 'abc' on as NaN and '9.5abc' on as 9.5.

import { formText, isRealDate } from '@/lib/validation';
import { MAG_APPARATUS, WAG_APPARATUS } from './constants';

const MAX_NAME = 200;
const MAX_LABEL = 50;
const MAX_SCORE = 100;
const MAX_PLACE = 9999;

export type MeetFields = {
  name: string;
  level: string | null;
  division: string | null;
  start_date: string | null;
  end_date: string | null;
  all_around_place: number | null;
  show_start_value: boolean;
  show_place: boolean;
};

export type MeetScore = {
  apparatus: string;
  value: number | null;
  place: number | null;
  start_value: number | null;
};

type FormLike = { get(name: string): unknown };

/** The apparatus come from the gymnast's record, never from the form. */
export function apparatusFor(discipline: string | null | undefined): string[] {
  return (discipline === 'WAG' ? WAG_APPARATUS : MAG_APPARATUS).map((a) => a.id);
}

/** Null when blank; undefined when it isn't a number in range. */
function number(raw: unknown, max: number, whole: boolean): number | null | undefined {
  const text = formText(raw);
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > max) return undefined;
  if (whole && !Number.isInteger(value)) return undefined;
  return value;
}

export function parseMeetForm(
  form: FormLike,
  apparatus: string[],
): { meet: MeetFields; scores: MeetScore[] } | { error: string } {
  const name = formText(form.get('name'));
  if (!name) return { error: 'The meet needs a name' };
  if (name.length > MAX_NAME) return { error: 'That meet name is too long' };

  const level = formText(form.get('level'));
  const division = formText(form.get('division'));
  if (level.length > MAX_LABEL || division.length > MAX_LABEL) return { error: 'That level or division is too long' };

  const startDate = formText(form.get('start_date'));
  const endDate = formText(form.get('end_date'));
  if ((startDate && !isRealDate(startDate)) || (endDate && !isRealDate(endDate))) {
    return { error: 'That is not a valid date' };
  }

  const allAround = number(form.get('all_around_place'), MAX_PLACE, true);
  if (allAround === undefined) return { error: 'That all-around place is not valid' };

  const scores: MeetScore[] = [];
  for (const app of apparatus) {
    const value = number(form.get(app), MAX_SCORE, false);
    const place = number(form.get(`${app}_place`), MAX_PLACE, true);
    const startValue = number(form.get(`${app}_sv`), MAX_SCORE, false);
    if (value === undefined || startValue === undefined) return { error: 'Scores must be numbers' };
    if (place === undefined) return { error: 'Places must be whole numbers' };
    scores.push({ apparatus: app, value, place, start_value: startValue });
  }

  return {
    meet: {
      name,
      level: level || null,
      division: division || null,
      start_date: startDate || null,
      end_date: endDate || null,
      all_around_place: allAround,
      show_start_value: form.get('show_start_value') === 'true',
      show_place: form.get('show_place') === 'true',
    },
    scores,
  };
}

const MAX_GYMNAST_NAME = 100;

export function parseGymnastName(raw: unknown): { name: string } | { error: string } {
  const name = formText(raw);
  if (!name) return { error: 'Name is required' };
  if (name.length > MAX_GYMNAST_NAME) return { error: 'That name is too long' };
  return { name };
}

export const isDiscipline = (value: unknown): value is 'MAG' | 'WAG' => value === 'MAG' || value === 'WAG';
export const isMsoAthleteId = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{1,20}$/.test(value);

/** The browser sends back a meet it was shown, so it's untrusted input like any other. */
export function isValidMsoSummary(meet: unknown): boolean {
  if (typeof meet !== 'object' || meet === null) return false;
  const m = meet as Record<string, unknown>;
  const within = (value: unknown, max: number) =>
    value === undefined || value === null || (typeof value === 'string' && value.length <= max);
  if (!within(m.name, MAX_NAME) || !within(m.level, MAX_LABEL) || !within(m.dateStr, MAX_NAME)) return false;
  return !m.athleteMsoId || isMsoAthleteId(m.athleteMsoId);
}
