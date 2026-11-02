const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Display a stored date such as `2026-03-01`. It reads the text rather than using
 * `new Date`, which treats a date-only string as UTC and can show the day before.
 */
export function formatDate(value: string | null | undefined, short = false): string {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const month = match && MONTHS[Number(match[2]) - 1];
  if (!match || !month) return value;
  const day = Number(match[3]);
  return short ? `${month} ${day}` : `${month} ${day}, ${match[1]}`;
}
