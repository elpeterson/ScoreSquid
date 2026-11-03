// Checks for values a server action receives: every action is a public endpoint, and
// a bad value should be turned away here rather than reach the database.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

/** A real calendar date as YYYY-MM-DD: 2026-02-30 is not one. */
export function isRealDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** A trimmed form string, or '' for anything else, such as a file. */
export const formText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
