import { describe, expect, it } from 'vitest';
import { latestStartDate, parseArcherDetails } from '../archer-profile';

const LATEST = '2026-11-03';
const parse = (name: unknown, membershipNumber: unknown = '', competitionStartDate: unknown = '') =>
  parseArcherDetails({ name, membershipNumber, competitionStartDate }, LATEST);

describe('parseArcherDetails', () => {
  it('accepts a name alone', () => {
    expect(parse('  Robin ')).toEqual({
      details: { name: 'Robin', membershipNumber: null, competitionStartDate: null },
    });
  });

  it('keeps only the digits of a number', () => {
    const result = parse('Robin', ' 123456C ', '2024-02-29');
    expect(result).toEqual({
      details: { name: 'Robin', membershipNumber: '123456', competitionStartDate: '2024-02-29' },
    });
  });

  it('refuses a missing or very long name', () => {
    expect(parse('   ')).toEqual({ error: 'Name is required' });
    expect(parse(null)).toEqual({ error: 'Name is required' });
    expect(parse('x'.repeat(101))).toEqual({ error: 'That name is too long' });
  });

  it('refuses a number with no digits, or too many', () => {
    expect(parse('Robin', 'abc')).toEqual({ error: "That doesn't look like a membership number" });
    expect(parse('Robin', '1'.repeat(21))).toEqual({ error: 'That membership number is too long' });
  });

  it('refuses a date that is not real', () => {
    for (const bad of ['2026-02-30', '2026-13-01', 'soon', '11/02/2026']) {
      expect(parse('Robin', '', bad)).toEqual({ error: 'That is not a valid date' });
    }
  });

  it('refuses a future date, and allows the last allowed day', () => {
    expect(parse('Robin', '', '2026-11-04')).toEqual({
      error: 'The competition start date cannot be in the future',
    });
    expect('details' in parse('Robin', '', LATEST)).toBe(true);
  });

  it('treats a value that is not a string as blank', () => {
    expect(parse('Robin', 42, { a: 1 })).toEqual({
      details: { name: 'Robin', membershipNumber: null, competitionStartDate: null },
    });
  });
});

describe('latestStartDate', () => {
  it('is the day after today in UTC', () => {
    expect(latestStartDate(new Date('2026-11-02T23:30:00Z'))).toBe('2026-11-03');
  });
});
