import { formatDate } from '@/lib/dates';

export { formatDate };

/** Short dates for a chart axis, with the year when the dates span more than one. */
export function chartDateFormatter(dates: (string | null)[]): (value: string) => string {
  const years = new Set(dates.filter((d): d is string => !!d).map((d) => d.slice(0, 4)));
  if (years.size <= 1) return (value) => formatDate(value, true);
  return (value) => (value ? `${formatDate(value, true)} '${value.slice(2, 4)}` : formatDate(value, true));
}

export function formatNumber(value: number, digits = 2): string {
  return value.toFixed(digits);
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
