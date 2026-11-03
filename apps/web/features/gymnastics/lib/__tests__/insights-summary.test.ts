import { describe, it, expect } from 'vitest';
import {
  buildSeries,
  spreadOf,
  formatScore,
  formatChange,
  summarizeGroup,
  MIN_STEADY_SCORES,
  type CompetitionRow,
} from '../insights';

const WAG = ['vault', 'uneven_bars', 'balance_beam', 'floor_exercise'];

function meet(
  id: string,
  date: string | null,
  scores: Record<string, number | null>,
  level = '4',
  division: string | null = '1'
): CompetitionRow {
  return {
    id,
    name: `Harbor Invitational ${id}`,
    start_date: date,
    level,
    division,
    scores: Object.entries(scores).map(([apparatus, value]) => ({ apparatus, value })),
  };
}

function full(v: number, ub: number, bb: number, fx: number) {
  return { vault: v, uneven_bars: ub, balance_beam: bb, floor_exercise: fx };
}

function summary(meets: CompetitionRow[], ids = WAG, level = '4', division: string | null = '1') {
  return summarizeGroup(buildSeries(meets, level, division, ids), ids);
}

const by = (s: ReturnType<typeof summary>, id: string) =>
  s.apparatus.find((a) => a.apparatus === id)!;

describe('summarizeGroup: personal bests', () => {
  it('gives each apparatus its best score with the meet and date', () => {
    const s = summary([
      meet('a', '2026-01-10', full(8.9, 8.5, 9.1, 9.0)),
      meet('b', '2026-02-14', full(9.2, 8.4, 8.95, 9.3)),
    ]);
    expect(by(s, 'vault').best).toEqual({
      value: 9.2,
      competitionId: 'b',
      competitionName: 'Harbor Invitational b',
      date: '2026-02-14',
    });
    expect(by(s, 'balance_beam').best?.competitionId).toBe('a');
  });

  it('lets the earlier meet keep a tie', () => {
    const s = summary([
      meet('a', '2026-01-10', { vault: 9.1 }),
      meet('b', '2026-02-14', { vault: 9.1 }),
    ]);
    expect(by(s, 'vault').best?.competitionId).toBe('a');
  });

  it('works out the all-around only from meets with every apparatus scored', () => {
    const s = summary([
      meet('a', '2026-01-10', full(9, 9, 9, 9)), // 36
      // Scratched beam: three high scores, but no all-around.
      meet('b', '2026-02-14', { vault: 9.8, uneven_bars: 9.8, balance_beam: null, floor_exercise: 9.8 }),
      meet('c', '2026-03-07', full(8.5, 8.5, 8.5, 8.6)), // 34.1
    ]);
    expect(s.allAround.meets).toBe(2);
    expect(s.allAround.best).toMatchObject({ value: 36, competitionId: 'a' });
    expect(s.allAround.high).toBe(36);
    expect(s.allAround.average).toBe(35.05);
    expect(s.allAround.change).toBe(-1.9);
  });

  it('keeps the all-around sum free of floating-point noise', () => {
    const s = summary([meet('a', '2026-01-10', full(8.1, 8.2, 8.3, 8.45))]);
    expect(s.allAround.best?.value).toBe(33.05);
  });
});

describe('summarizeGroup: summary', () => {
  const meets = [
    meet('a', '2026-01-10', full(8.9, 8.5, 9.1, 9.0)),
    meet('b', '2026-02-14', full(9.2, 8.4, 8.95, 9.3)),
    meet('c', '2026-03-07', { vault: 9.0, uneven_bars: null, balance_beam: 9.55, floor_exercise: 9.1 }),
  ];
  const s = summary(meets);

  it('counts meets, average and high per apparatus, skipping unscored', () => {
    expect(s.scoredMeets).toBe(3);
    expect(by(s, 'uneven_bars')).toMatchObject({ meets: 2, average: 8.45, high: 8.5 });
    expect(by(s, 'vault')).toMatchObject({ meets: 3, average: 9.033, high: 9.2 });
  });

  it('gives the change from first to latest in points, rounded', () => {
    expect(by(s, 'balance_beam').change).toBe(0.45);
    expect(by(s, 'uneven_bars').change).toBe(-0.1);
  });

  it('ignores apparatus that are not the discipline’s', () => {
    const withMen = [meet('a', '2026-01-10', { ...full(9, 9, 9, 9), pommel_horse: 12 })];
    const one = summary(withMen);
    expect(one.apparatus.map((a) => a.apparatus)).toEqual(WAG);
    expect(one.allAround.best?.value).toBe(36);
  });

  it('never combines divisions of a level', () => {
    const mixed = [
      meet('a', '2026-01-10', full(9, 9, 9, 9), '4', '1'),
      meet('b', '2026-02-14', full(7, 7, 7, 7), '4', '2'),
      meet('c', '2026-03-07', full(8, 8, 8, 8), '5', null),
    ];
    const d1 = summary(mixed, WAG, '4', '1');
    expect(d1.scoredMeets).toBe(1);
    expect(by(d1, 'vault').high).toBe(9);
    expect(by(summary(mixed, WAG, '4', '2'), 'vault').high).toBe(7);
  });
});

describe('summarizeGroup: strongest and steadiest', () => {
  it('names the highest average as strongest once two meets are scored', () => {
    const s = summary([
      meet('a', '2026-01-10', full(8.9, 8.5, 9.1, 9.0)),
      meet('b', '2026-02-14', full(9.2, 8.4, 8.95, 9.3)),
    ]);
    expect(s.strongest?.apparatus).toBe('floor_exercise');
  });

  it('names no strongest with only one scored meet', () => {
    const s = summary([
      meet('a', '2026-01-10', full(8.9, 8.5, 9.1, 9.0)),
      meet('b', '2026-02-14', { vault: null }),
    ]);
    expect(s.scoredMeets).toBe(1);
    expect(s.strongest).toBeNull();
  });

  it(`needs ${MIN_STEADY_SCORES} scores on an apparatus to call it steadiest`, () => {
    const two = summary([
      meet('a', '2026-01-10', full(9, 9, 9, 9)),
      meet('b', '2026-02-14', full(9, 9, 9, 9)),
    ]);
    expect(two.steadiest).toBeNull();
    expect(by(two, 'vault').spread).toBeNull();
  });

  it('picks the lowest standard deviation as steadiest', () => {
    const s = summary([
      meet('a', '2026-01-10', full(9.0, 8.0, 9.0, 9.5)),
      meet('b', '2026-02-14', full(9.3, 9.0, 8.0, 9.5)),
      meet('c', '2026-03-07', full(8.9, 8.5, 9.4, 9.4)),
    ]);
    expect(s.steadiest?.apparatus).toBe('floor_exercise');
    expect(by(s, 'floor_exercise').spread).toBe(0.047);
  });

  it('breaks a tie in apparatus order', () => {
    const s = summary([
      meet('a', '2026-01-10', full(9.0, 8.0, 9.0, 9.5)),
      meet('b', '2026-02-14', full(9.1, 9.0, 8.0, 9.6)),
      meet('c', '2026-03-07', full(9.0, 8.5, 9.4, 9.5)),
    ]);
    expect(s.steadiest?.apparatus).toBe('vault');
  });

  it('only counts apparatus with enough scores toward steadiest', () => {
    const s = summary([
      meet('a', '2026-01-10', { vault: 9.0, balance_beam: 8.0 }),
      meet('b', '2026-02-14', { vault: 9.0, balance_beam: 9.5 }),
      meet('c', '2026-03-07', { balance_beam: 8.9 }),
    ]);
    expect(s.steadiest?.apparatus).toBe('balance_beam');
  });
});

describe('summarizeGroup: little or no data', () => {
  it('shows a lone meet’s scores with no change or comparisons', () => {
    const s = summary([meet('a', '2026-01-10', full(8.9, 8.5, 9.1, 9.0))]);
    expect(s.scoredMeets).toBe(1);
    expect(by(s, 'vault')).toMatchObject({ meets: 1, high: 8.9, change: null });
    expect(s.allAround.change).toBeNull();
    expect(s.strongest).toBeNull();
    expect(s.steadiest).toBeNull();
  });

  it('handles an empty group', () => {
    const s = summary([]);
    expect(s.scoredMeets).toBe(0);
    expect(s.allAround).toEqual({ meets: 0, average: null, high: null, best: null, change: null });
    expect(s.apparatus.every((a) => a.best === null)).toBe(true);
  });

  it('gives no all-around without apparatus to sum', () => {
    expect(summarizeGroup(buildSeries([meet('a', '2026-01-10', full(9, 9, 9, 9))], '4', '1', []), []).allAround.meets).toBe(0);
  });
});

describe('spreadOf', () => {
  it('is the population standard deviation, rounded', () => {
    expect(spreadOf([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(spreadOf([9, 9, 9])).toBe(0);
    expect(spreadOf([9, 9])).toBeNull();
  });
});

describe('formatScore and formatChange', () => {
  it('shows scores to the thousandth', () => {
    expect(formatScore(9.15)).toBe('9.150');
    expect(formatScore(null)).toBe('—');
  });

  it('shows a change in points with its sign', () => {
    expect(formatChange(0.45)).toBe('+0.45');
    expect(formatChange(-0.125)).toBe('-0.125');
    expect(formatChange(1)).toBe('+1.00');
    expect(formatChange(0)).toBe('0.00');
    expect(formatChange(0.0001)).toBe('0.00');
    expect(formatChange(null)).toBe('—');
  });
});
