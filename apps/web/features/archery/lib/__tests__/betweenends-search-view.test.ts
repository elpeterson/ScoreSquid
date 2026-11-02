import { describe, expect, it } from 'vitest';
import {
  canGoBackToStart,
  defaultSearchFrom,
  isActive,
  progressPercent,
} from '@/features/archery/lib/betweenends/search-view';

describe('defaultSearchFrom', () => {
  it('starts a first search from the start date', () => {
    expect(defaultSearchFrom('2024-01-01', null)).toBe('2024-01-01');
  });
  it('starts a later search from where the last finished one reached', () => {
    expect(defaultSearchFrom('2024-01-01', '2026-05-01')).toBe('2026-05-01');
  });
  it('has nothing to offer without either', () => {
    expect(defaultSearchFrom(null, null)).toBeNull();
  });
});

describe('canGoBackToStart', () => {
  it('offers it only when that is further back', () => {
    expect(canGoBackToStart('2024-01-01', '2026-05-01')).toBe(true);
    expect(canGoBackToStart('2024-01-01', '2024-01-01')).toBe(false);
    expect(canGoBackToStart(null, '2026-05-01')).toBe(false);
  });
});

describe('progressPercent', () => {
  it('is unknown until there is a total', () => {
    expect(progressPercent(0, 0)).toBeNull();
  });
  it('rounds down, so it only says 100 when done', () => {
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(199, 200)).toBe(99);
    expect(progressPercent(200, 200)).toBe(100);
  });
  it('never passes 100', () => {
    expect(progressPercent(5, 4)).toBe(100);
  });
});

describe('isActive', () => {
  it('covers waiting and running only', () => {
    expect(isActive('queued')).toBe(true);
    expect(isActive('running')).toBe(true);
    expect(isActive('finished')).toBe(false);
    expect(isActive('failed')).toBe(false);
    expect(isActive('cancelled')).toBe(false);
  });
});
