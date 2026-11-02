export { formatDate } from '@/lib/dates';

export function formatNumber(value: number, digits = 2): string {
  return value.toFixed(digits);
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
