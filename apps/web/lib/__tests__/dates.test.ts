import { describe, expect, it } from 'vitest';
import { formatDate } from '../dates';

describe('formatDate', () => {
  it('shows the stored date', () => {
    expect(formatDate('2026-03-01')).toBe('Mar 1, 2026');
    expect(formatDate('2026-12-31')).toBe('Dec 31, 2026');
  });

  it('keeps the first of January in its own year', () => {
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026');
  });

  it('can leave out the year', () => {
    expect(formatDate('2026-03-01', true)).toBe('Mar 1');
  });

  it('uses the date part of a timestamp', () => {
    expect(formatDate('2026-03-01T00:00:00.000Z')).toBe('Mar 1, 2026');
  });

  it('shows a dash for no date', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('returns anything else unchanged', () => {
    expect(formatDate('Date TBD')).toBe('Date TBD');
    expect(formatDate('2026-13-01')).toBe('2026-13-01');
  });
});
