import { normaliseAlt } from './betweenends/entries';

export type ArcherDetails = {
  name: string;
  membershipNumber: string | null;
  competitionStartDate: string | null;
};

const MAX_NAME = 100;
const MAX_NUMBER = 20;

const field = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const isRealDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/**
 * Validate an archer's details from a form. `latestDate` is the last allowed start
 * date, as `YYYY-MM-DD`. Number and date are optional: blank means not set.
 */
export function parseArcherDetails(
  input: { name: unknown; membershipNumber: unknown; competitionStartDate: unknown },
  latestDate: string,
): { details: ArcherDetails } | { error: string } {
  const name = field(input.name);
  if (!name) return { error: 'Name is required' };
  if (name.length > MAX_NAME) return { error: 'That name is too long' };

  const rawNumber = field(input.membershipNumber);
  const membershipNumber = normaliseAlt(rawNumber);
  if (rawNumber && !membershipNumber) {
    return { error: "That doesn't look like a membership number" };
  }
  if (membershipNumber && membershipNumber.length > MAX_NUMBER) {
    return { error: 'That membership number is too long' };
  }

  const date = field(input.competitionStartDate);
  if (date && !isRealDate(date)) return { error: 'That is not a valid date' };
  if (date > latestDate) return { error: 'The competition start date cannot be in the future' };

  return { details: { name, membershipNumber, competitionStartDate: date || null } };
}

/**
 * The last start date to allow. A day past today in UTC, so a parent west or east
 * of UTC can always enter their own today.
 */
export function latestStartDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
