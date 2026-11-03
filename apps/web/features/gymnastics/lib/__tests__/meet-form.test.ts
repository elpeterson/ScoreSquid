import { describe, expect, it } from 'vitest';
import {
  apparatusFor,
  isDiscipline,
  isMsoAthleteId,
  isValidMsoSummary,
  parseGymnastName,
  parseMeetForm,
} from '@/features/gymnastics/lib/meet-form';

const form = (values: Record<string, string>) => ({ get: (k: string) => values[k] ?? null });
const parse = (values: Record<string, string>) => parseMeetForm(form({ name: 'Made Up Invitational', ...values }), ['vault']);

describe('parseMeetForm', () => {
  it('reads a normal meet', () => {
    const result = parse({
      name: '  Made Up Invitational ', level: '5', start_date: '2026-02-01', all_around_place: '3',
      vault: '9.5', vault_place: '2', vault_sv: '10', show_place: 'true',
    });
    expect(result).toEqual({
      meet: {
        name: 'Made Up Invitational', level: '5', division: null, start_date: '2026-02-01', end_date: null,
        all_around_place: 3, show_start_value: false, show_place: true,
      },
      scores: [{ apparatus: 'vault', value: 9.5, place: 2, start_value: 10 }],
    });
  });

  it('lets scores be blank', () => {
    expect(parse({})).toMatchObject({ scores: [{ value: null, place: null, start_value: null }] });
  });

  it.each(['abc', '9.5abc', 'NaN', 'Infinity', '-1', '101'])('refuses the score %s, so NaN is never stored', (vault) => {
    expect(parse({ vault })).toEqual({ error: 'Scores must be numbers' });
    expect(parse({ vault_sv: vault })).toEqual({ error: 'Scores must be numbers' });
  });

  it.each(['abc', '1.5', '-1', '10000'])('refuses the place %s', (place) => {
    expect(parse({ vault_place: place })).toEqual({ error: 'Places must be whole numbers' });
    expect(parse({ all_around_place: place })).toEqual({ error: 'That all-around place is not valid' });
  });

  it('refuses a blank or too-long name', () => {
    expect(parse({ name: '   ' })).toHaveProperty('error');
    expect(parse({ name: 'x'.repeat(201) })).toHaveProperty('error');
  });

  it('refuses a too-long level and a date that does not exist', () => {
    expect(parse({ level: 'x'.repeat(51) })).toHaveProperty('error');
    expect(parse({ start_date: '2026-02-30' })).toHaveProperty('error');
    expect(parse({ end_date: 'soon' })).toHaveProperty('error');
  });

  it('only reads the apparatus it was given', () => {
    const result = parseMeetForm(form({ name: 'x', vault: '9', floor: 'abc' }), ['vault']);
    expect(result).toHaveProperty('scores');
  });
});

describe('apparatusFor', () => {
  it('goes by the discipline, defaulting to MAG', () => {
    expect(apparatusFor('WAG')).toHaveLength(4);
    expect(apparatusFor('MAG')).toHaveLength(6);
    expect(apparatusFor(null)).toHaveLength(6);
  });
});

describe('gymnast fields', () => {
  it('trims a name, and refuses one that is only spaces or too long', () => {
    expect(parseGymnastName('  Test Gymnast ')).toEqual({ name: 'Test Gymnast' });
    expect(parseGymnastName('   ')).toHaveProperty('error');
    expect(parseGymnastName('x'.repeat(101))).toHaveProperty('error');
    expect(parseGymnastName(null)).toHaveProperty('error');
  });
  it('knows the disciplines and MSO athlete ids', () => {
    expect(isDiscipline('WAG')).toBe(true);
    expect(isDiscipline('X')).toBe(false);
    expect(isMsoAthleteId('12345')).toBe(true);
    expect(isMsoAthleteId('12/../3')).toBe(false);
  });
});

describe('isValidMsoSummary', () => {
  it('accepts a normal meet, with optional fields missing', () => {
    expect(isValidMsoSummary({ name: 'Made Up Invitational', level: '5', dateStr: 'Feb 1, 2026', athleteMsoId: '12345' })).toBe(true);
    expect(isValidMsoSummary({ name: 'Made Up Invitational' })).toBe(true);
  });
  it('refuses oversized text, a bad athlete id, and non-objects', () => {
    expect(isValidMsoSummary({ name: 'x'.repeat(201) })).toBe(false);
    expect(isValidMsoSummary({ level: 'x'.repeat(51) })).toBe(false);
    expect(isValidMsoSummary({ athleteMsoId: '../1' })).toBe(false);
    expect(isValidMsoSummary(null)).toBe(false);
  });
});
