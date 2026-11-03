import { describe, it, expect } from 'vitest';
import {
  MAG_APPARATUS,
  WAG_APPARATUS,
  WAG_LEVEL_OPTIONS,
  levelLabel,
  ALL_APPARATUS,
  COMPETITIONS_PAGE_SIZE,
} from '../constants';

describe('MAG_APPARATUS', () => {
  it('contains 6 apparatus', () => {
    expect(MAG_APPARATUS).toHaveLength(6);
  });

  it('includes the required men\'s events', () => {
    const ids = MAG_APPARATUS.map((a) => a.id);
    expect(ids).toContain('floor_exercise');
    expect(ids).toContain('pommel_horse');
    expect(ids).toContain('still_rings');
    expect(ids).toContain('vault');
    expect(ids).toContain('parallel_bars');
    expect(ids).toContain('high_bar');
  });

  it('every entry has an id and a label', () => {
    for (const apparatus of MAG_APPARATUS) {
      expect(apparatus.id).toBeTruthy();
      expect(apparatus.label).toBeTruthy();
    }
  });

  it('has no duplicate ids', () => {
    const ids = MAG_APPARATUS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('WAG_APPARATUS', () => {
  it('contains 4 apparatus', () => {
    expect(WAG_APPARATUS).toHaveLength(4);
  });

  it('includes the required women\'s events', () => {
    const ids = WAG_APPARATUS.map((a) => a.id);
    expect(ids).toContain('vault');
    expect(ids).toContain('uneven_bars');
    expect(ids).toContain('balance_beam');
    expect(ids).toContain('floor_exercise');
  });

  it('every entry has an id and a label', () => {
    for (const apparatus of WAG_APPARATUS) {
      expect(apparatus.id).toBeTruthy();
      expect(apparatus.label).toBeTruthy();
    }
  });

  it('has no duplicate ids', () => {
    const ids = WAG_APPARATUS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ALL_APPARATUS', () => {
  it('contains all MAG apparatus', () => {
    const allIds = ALL_APPARATUS.map((a) => a.id);
    for (const apparatus of MAG_APPARATUS) {
      expect(allIds).toContain(apparatus.id);
    }
  });

  it('contains WAG-only events', () => {
    const allIds = ALL_APPARATUS.map((a) => a.id);
    expect(allIds).toContain('uneven_bars');
    expect(allIds).toContain('balance_beam');
  });
});

describe('COMPETITIONS_PAGE_SIZE', () => {
  it('is a positive integer', () => {
    expect(COMPETITIONS_PAGE_SIZE).toBeGreaterThan(0);
    expect(Number.isInteger(COMPETITIONS_PAGE_SIZE)).toBe(true);
  });
});

describe('WAG_LEVEL_OPTIONS', () => {
  it("offers levels 1-10 and the Xcel divisions, as MSO's codes", () => {
    expect(WAG_LEVEL_OPTIONS.map((o) => o.value)).toEqual([
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'XB', 'XS', 'XG', 'XP', 'XD', 'XSA',
    ]);
  });
});

describe('levelLabel', () => {
  it('names numeric levels', () => {
    expect(levelLabel('4')).toBe('Level 4');
    expect(levelLabel('10')).toBe('Level 10');
  });

  it('names Xcel codes', () => {
    expect(levelLabel('XG')).toBe('Xcel Gold');
    expect(levelLabel('XSA')).toBe('Xcel Sapphire');
  });

  it("names men's elite and special codes as before", () => {
    expect(levelLabel('SR')).toBe('Senior');
    expect(levelLabel('J6')).toBe('Junior 6');
  });

  it('shows anything else as it is', () => {
    expect(levelLabel('Gold')).toBe('Gold');
    expect(levelLabel('Level 4')).toBe('Level 4');
    expect(levelLabel('Unspecified')).toBe('Unspecified');
    expect(levelLabel(null)).toBe('');
  });
});
