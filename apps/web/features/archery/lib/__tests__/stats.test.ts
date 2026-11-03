import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseScorecard } from '@/features/archery/lib/scorecard/parse';
import {
  computeEventStats,
  isComparable,
  setupGroups,
  setupKey,
  setupLabel,
  trendForSetup,
  type EventRow,
} from '@/features/archery/lib/stats';
import { parseDivision } from '@/features/archery/lib/division';

function eventFromFixture(
  name: string,
  id: string,
  setup: Partial<EventRow> = {},
): EventRow {
  const card = parseScorecard(
    JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf8')),
  );
  return {
    id,
    name: card.eventName,
    shot_on: card.sessionDate,
    start_date: card.startDate,
    bow_style: parseDivision(card.division).bowStyle,
    environment: card.arrowsPerEnd === 3 ? 'indoor' : 'outdoor',
    distance_m: card.arrowsPerEnd === 3 ? 18 : 30,
    face_cm: card.arrowsPerEnd === 3 ? 60 : 122,
    arrows_per_end: card.arrowsPerEnd,
    rounds: card.rounds.map((r) => ({
      round_number: r.roundNumber,
      total: r.total,
      ends: r.ends.map((e) => ({ end_number: e.endNumber, arrows: e.arrows })),
    })),
    ...setup,
  };
}

describe('computeEventStats', () => {
  it('summarises an indoor 600 card', () => {
    const s = computeEventStats(eventFromFixture('indoor-aces-wild', 'a'));
    expect(s.total).toBe(269);
    expect(s.maxScore).toBe(600);
    expect(s.arrowCount).toBe(60);
    expect(s.arrowAverage).toBeCloseTo(269 / 60);
    expect(s.roundTotals).toEqual([133, 136]);
    expect(s.tens).toBe(1);
    expect(s.nines).toBe(6);
    expect(s.misses).toBe(7);
    expect(s.hitRate).toBeCloseTo(53 / 60);
    expect(s.bestEnd).toBe(24);
    expect(s.worstEnd).toBe(5);
    expect(Object.values(s.distribution).reduce((a, b) => a + b, 0)).toBe(60);
  });

  it('handles a single-round outdoor card', () => {
    const s = computeEventStats(eventFromFixture('outdoor-noreaster', 'n'));
    expect(s.total).toBe(203);
    expect(s.maxScore).toBe(360);
    expect(s.roundTotals).toEqual([203]);
  });
});

describe('setups and trends', () => {
  const events = [
    eventFromFixture('indoor-joad-nationals', 'joad'), // barebow, Feb
    eventFromFixture('indoor-archers-cup', 'cup'), // recurve, Mar
    eventFromFixture('indoor-aces-wild', 'aces'), // recurve, Sep
    eventFromFixture('outdoor-spirit-of-ma', 'spirit'), // recurve outdoor, Jun
    eventFromFixture('outdoor-noreaster', 'noreaster'), // recurve outdoor, Aug
  ];

  it('never mixes bow styles or indoor/outdoor', () => {
    const groups = setupGroups(events);
    expect(groups.map((g) => g.count)).toEqual([2, 2, 1]);
    expect(groups[0].label).toBe('Recurve · Indoor 18m · 60cm');
    expect(groups.map((g) => g.label)).toContain('Barebow · Indoor 18m · 60cm');
  });

  it('orders a setup chronologically and flags personal bests by arrow average', () => {
    const outdoor = trendForSetup(events, setupKey(events[3]));
    expect(outdoor.map((p) => p.eventId)).toEqual(['spirit', 'noreaster']);
    // 235/72 then 203/36: fewer arrows but a much higher average.
    expect(outdoor.map((p) => p.personalBest)).toEqual([true, true]);

    const indoor = trendForSetup(events, setupKey(events[1]));
    expect(indoor.map((p) => [p.eventId, p.total, p.personalBest])).toEqual([
      ['cup', 207, true],
      ['aces', 269, true],
    ]);
  });

  it('breaks arrows down by target color', () => {
    const [cup] = trendForSetup(events, setupKey(events[1]));
    const sum = Object.values(cup.rings).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
    // Archers Cup: 3 golds (one 10, two 9s) and 21 misses (10 + 11) out of 60.
    expect(cup.rings.gold).toBeCloseTo(3 / 60);
    expect(cup.rings.miss).toBeCloseTo(21 / 60);
    expect(cup.roundTotals).toEqual([103, 104]);
  });

  it('labels unknown setup values', () => {
    expect(
      setupLabel({ bow_style: null, environment: 'outdoor', distance_m: null, face_cm: null }),
    ).toBe('Unknown bow · Outdoor distance? · face?');
  });
});

describe('parseDivision', () => {
  it('decodes USA Archery class codes', () => {
    expect(parseDivision('RU13W')).toEqual({
      code: 'RU13W',
      bowStyle: 'recurve',
      ageClass: 'U13',
      gender: 'W',
    });
    expect(parseDivision('BU13W').bowStyle).toBe('barebow');
    expect(parseDivision('CU18M').bowStyle).toBe('compound');
  });

  it('keeps unknown codes', () => {
    expect(parseDivision('OPEN')).toEqual({
      code: 'OPEN',
      bowStyle: null,
      ageClass: null,
      gender: null,
    });
  });
});

describe('isComparable', () => {
  const end = (n: number, arrows = ['X', '9', '8']) => ({ end_number: n, arrows });
  const event = (rounds: { round_number: number; total: number; ends: ReturnType<typeof end>[] }[], be_arrows?: string) => ({
    arrows_per_end: 3,
    be_arrows,
    rounds,
  });
  const round = (n: number, ends: ReturnType<typeof end>[]) => ({ round_number: n, total: 0, ends });

  it('accepts rounds shot in full', () => {
    expect(isComparable(event([round(1, [end(1), end(2)]), round(2, [end(1), end(2)])]))).toBe(true);
  });
  it('leaves out arrows not stored', () => {
    expect(isComparable(event([round(1, [])]))).toBe(false);
    expect(isComparable(event([]))).toBe(false);
  });
  it('leaves out a short end, a missing end, and a shorter round', () => {
    expect(isComparable(event([round(1, [end(1), end(2, ['X'])])]))).toBe(false);
    expect(isComparable(event([round(1, [end(1), end(3)])]))).toBe(false);
    expect(isComparable(event([round(1, [end(1), end(2)]), round(2, [end(1)])]))).toBe(false);
  });
  it('leaves out a result Between Ends says has arrows not shot', () => {
    expect(isComparable(event([round(1, [end(1)])], 'X98EEE'))).toBe(false);
    expect(isComparable(event([round(1, [end(1)])], 'X98'))).toBe(true);
  });
  it('accepts ends stored out of order', () => {
    expect(isComparable(event([round(1, [end(2), end(1)])]))).toBe(true);
  });
  it("can't let a part-shot round set a personal best once left out", () => {
    const full = { ...fromFixtureShape('a', '2026-01-01', ['8', '8', '8']) };
    const partial = { ...fromFixtureShape('b', '2026-02-01', ['X', 'X', 'X']), rounds: [round(1, [end(1, ['X', 'X', 'X']), end(2, ['X'])])] };
    const fair = [full, partial].filter(isComparable);
    expect(trendForSetup(fair, setupKey(full)).map((p) => p.eventId)).toEqual(['a']);
  });
});

function fromFixtureShape(id: string, date: string, arrows: string[]) {
  return {
    id, name: id, shot_on: date, start_date: date, bow_style: 'recurve', environment: 'indoor',
    distance_m: 18, face_cm: 40, arrows_per_end: 3,
    rounds: [{ round_number: 1, total: 0, ends: [{ end_number: 1, arrows }] }],
  };
}
