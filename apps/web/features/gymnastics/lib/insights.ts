// Individual Consistency analytics.
//
// Pure, dependency-free transforms that turn a gymnast's competitions into the
// row shape a multi-series line chart consumes.
//
// The load-bearing rule from the product plan: scores are not comparable across
// competitive groups, so the chart only ever shows ONE group at a time. The
// group is defined by (Level, Division): Level always partitions (a Level 3
// score is not comparable to a Level 6 score), and Division sub-partitions
// within a level when a gym uses divisions (4D1 vs 5D2). A level with no
// divisions is graphed whole.

export type ScoreItem = {
  apparatus: string;
  value: number | null;
};

export type CompetitionRow = {
  id: string;
  name: string;
  start_date: string | null;
  level: string | null;
  division: string | null;
  scores: ScoreItem[];
};

/** One point in time on the chart: a date plus each apparatus's score. */
export type ChartRow = {
  competitionId: string;
  competitionName: string;
  date: string | null;
  /** Apparatus id -> score for this meet (null when not contested/entered). */
  [apparatusId: string]: string | number | null;
};

export type GroupOption = {
  value: string;
  count: number;
  /** Latest competition date in this group, for most-recent-first ordering. */
  latest: string | null;
};

/** Label for competitions with no level recorded. */
export const UNSPECIFIED_LEVEL = 'Unspecified';
/** Label for competitions within a level that have no division. */
export const NO_DIVISION = 'No division';

/** The level bucket a competition belongs to, normalizing blanks. */
export function levelKey(comp: Pick<CompetitionRow, 'level'>): string {
  const l = comp.level?.trim();
  return l ? l : UNSPECIFIED_LEVEL;
}

/** The division bucket a competition belongs to, normalizing blanks. */
export function divisionKey(comp: Pick<CompetitionRow, 'division'>): string {
  const d = comp.division?.trim();
  return d ? d : NO_DIVISION;
}

/**
 * Compare two date strings ascending; nulls sort last. Dates are ISO
 * (`YYYY-MM-DD`) so lexical comparison is chronological.
 */
function compareDateAsc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function tally(
  competitions: CompetitionRow[],
  keyOf: (c: CompetitionRow) => string
): GroupOption[] {
  const map = new Map<string, GroupOption>();
  for (const comp of competitions) {
    const value = keyOf(comp);
    const existing = map.get(value);
    if (existing) {
      existing.count += 1;
      if (compareDateAsc(existing.latest, comp.start_date) < 0) {
        existing.latest = comp.start_date;
      }
    } else {
      map.set(value, { value, count: 1, latest: comp.start_date });
    }
  }
  // Most recent first, so the filter defaults to the current group.
  return [...map.values()].sort((a, b) => {
    const byDate = compareDateAsc(b.latest, a.latest);
    if (byDate !== 0) return byDate;
    return a.value.localeCompare(b.value, undefined, { numeric: true });
  });
}

/** Distinct levels present, most-recent first. */
export function listLevels(competitions: CompetitionRow[]): GroupOption[] {
  return tally(competitions, levelKey);
}

/** Distinct division buckets within one level, most-recent first. */
export function listDivisions(
  competitions: CompetitionRow[],
  level: string
): GroupOption[] {
  return tally(
    competitions.filter((c) => levelKey(c) === level),
    divisionKey
  );
}

/**
 * Whether a level actually uses divisions — i.e. any bucket other than the
 * synthetic "No division". Drives whether the UI shows a Division filter.
 */
export function levelHasDivisions(divisions: GroupOption[]): boolean {
  return divisions.some((d) => d.value !== NO_DIVISION);
}

/**
 * Rows for the line chart within one competitive group, oldest to newest. Pass
 * `division = null` to include the whole level (used when the level has no
 * divisions); pass a division bucket to restrict to it. Two divisions are never
 * combined.
 */
export function buildSeries(
  competitions: CompetitionRow[],
  level: string,
  division: string | null,
  apparatusIds: string[]
): ChartRow[] {
  const inGroup = competitions.filter(
    (c) =>
      levelKey(c) === level &&
      (division === null || divisionKey(c) === division)
  );
  const sorted = [...inGroup].sort((a, b) =>
    compareDateAsc(a.start_date, b.start_date)
  );

  return sorted.map((comp) => {
    const row: ChartRow = {
      competitionId: comp.id,
      competitionName: comp.name,
      date: comp.start_date,
    };
    const byApparatus = new Map(
      (comp.scores ?? []).map((s) => [s.apparatus, s.value])
    );
    for (const id of apparatusIds) {
      const v = byApparatus.get(id);
      row[id] = v !== undefined && v !== null && Number.isFinite(v) ? v : null;
    }
    return row;
  });
}

/**
 * Of the requested apparatus, which actually have at least one score in the
 * given rows. Lets the chart draw only lines that carry data.
 */
export function apparatusWithData(
  rows: ChartRow[],
  apparatusIds: string[]
): string[] {
  return apparatusIds.filter((id) =>
    rows.some((r) => typeof r[id] === 'number')
  );
}

// ---------------------------------------------------------------------------
// Summary cards (SQ-041): personal bests, the group's summary, and the strongest
// and steadiest apparatus. Everything is worked out from one group's rows, as
// `buildSeries` returns them (oldest first, unscored apparatus as null), so two
// levels or divisions are never combined and a "not scored" value never counts.

/** The best score on one apparatus (or the all-around), and where it came from. */
export type BestScore = {
  value: number;
  competitionId: string;
  competitionName: string;
  date: string | null;
};

/** One line of the summary: an apparatus, or the all-around. */
export type ScoreSummary = {
  /** Meets with a score here. */
  meets: number;
  average: number | null;
  high: number | null;
  /** Current best; on a tie the earlier meet keeps it (as in SQ-033). */
  best: BestScore | null;
  /** Latest score minus the first, in points; null with fewer than two scores. */
  change: number | null;
};

export type ApparatusSummary = ScoreSummary & {
  apparatus: string;
  /** Standard deviation of the scores; null with fewer than `MIN_STEADY_SCORES`. */
  spread: number | null;
};

export type GroupSummary = {
  /** Meets in the group with at least one apparatus scored. */
  scoredMeets: number;
  /** One entry per requested apparatus, in the order given. */
  apparatus: ApparatusSummary[];
  /** Built only from meets where every requested apparatus was scored. */
  allAround: ScoreSummary;
  /** Highest average; null with fewer than two scored meets. */
  strongest: ApparatusSummary | null;
  /** Lowest spread among apparatus with at least `MIN_STEADY_SCORES`; null if none. */
  steadiest: ApparatusSummary | null;
};

/** Scores an apparatus needs before it can be called the steadiest. */
export const MIN_STEADY_SCORES = 3;

/** Round to the thousandth, the precision gymnastics scores are given in. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

type Point = { value: number; row: ChartRow };

function summarize(points: Point[]): ScoreSummary {
  if (points.length === 0) {
    return { meets: 0, average: null, high: null, best: null, change: null };
  }
  let best = points[0];
  let total = 0;
  for (const p of points) {
    total += p.value;
    if (p.value > best.value) best = p; // strictly greater: the earlier meet keeps a tie
  }
  const first = points[0];
  const latest = points[points.length - 1];
  return {
    meets: points.length,
    average: round3(total / points.length),
    high: best.value,
    best: {
      value: best.value,
      competitionId: best.row.competitionId,
      competitionName: best.row.competitionName,
      date: best.row.date,
    },
    change: points.length >= 2 ? round3(latest.value - first.value) : null,
  };
}

/** Population standard deviation, or null with fewer than `MIN_STEADY_SCORES` values. */
export function spreadOf(values: number[]): number | null {
  if (values.length < MIN_STEADY_SCORES) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return round3(Math.sqrt(variance));
}

function scoreAt(row: ChartRow, id: string): number | null {
  const v = row[id];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * The summary cards for one group's rows. Pass the rows from `buildSeries` (so
 * they are one level and division, oldest first) and the discipline's apparatus;
 * any other apparatus in the data is ignored.
 */
export function summarizeGroup(rows: ChartRow[], apparatusIds: string[]): GroupSummary {
  const apparatus: ApparatusSummary[] = apparatusIds.map((id) => {
    const points: Point[] = [];
    for (const row of rows) {
      const value = scoreAt(row, id);
      if (value !== null) points.push({ value, row });
    }
    return {
      apparatus: id,
      ...summarize(points),
      spread: spreadOf(points.map((p) => p.value)),
    };
  });

  const scoredMeets = rows.filter((row) =>
    apparatusIds.some((id) => scoreAt(row, id) !== null)
  ).length;

  // Only a meet with every apparatus scored has an all-around, so a partial meet
  // can neither set nor lower the best.
  const allAroundPoints: Point[] = [];
  if (apparatusIds.length > 0) {
    for (const row of rows) {
      const values = apparatusIds.map((id) => scoreAt(row, id));
      if (values.every((v) => v !== null)) {
        allAroundPoints.push({
          value: round3((values as number[]).reduce((a, b) => a + b, 0)),
          row,
        });
      }
    }
  }

  const withScores = apparatus.filter((a) => a.average !== null);
  let strongest: ApparatusSummary | null = null;
  if (scoredMeets >= 2) {
    for (const a of withScores) {
      if (!strongest || (a.average as number) > (strongest.average as number)) strongest = a;
    }
  }
  let steadiest: ApparatusSummary | null = null;
  for (const a of withScores) {
    if (a.spread === null) continue;
    if (!steadiest || a.spread < (steadiest.spread as number)) steadiest = a;
  }

  return {
    scoredMeets,
    apparatus,
    allAround: summarize(allAroundPoints),
    strongest,
    steadiest,
  };
}

/** A score as gymnastics shows it, to the thousandth: `9.150`. */
export function formatScore(value: number | null): string {
  return value === null ? '—' : value.toFixed(3);
}

/**
 * A change in points with its sign: `+0.45`, `-0.125`, `0.00`. Two decimals,
 * or three when the thousandth matters.
 */
export function formatChange(value: number | null): string {
  if (value === null) return '—';
  const rounded = round3(value);
  if (rounded === 0) return '0.00';
  const digits = Math.round(Math.abs(rounded) * 1000) % 10 === 0 ? 2 : 3;
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toFixed(digits)}`;
}
