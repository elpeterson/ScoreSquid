import { ALL_APPARATUS } from './constants';

type Score = { apparatus: string; value: number | null; place: number | null };

/** A saved competition, as the parent has it now. */
export type SavedCompetition = {
  name: string;
  level: string | null;
  division: string | null;
  start_date: string | null;
  end_date: string | null;
  all_around_place: number | null;
  scores: Score[];
};

/** The same meet as MSO reports it. Null means MSO didn't supply that value. */
export type MsoMeetData = {
  name: string;
  level: string | null;
  division: string | null;
  startDate: string | null;
  endDate: string | null;
  allAroundPlace: number | null;
  scores: Score[];
};

export type MeetChange = {
  key: string;
  label: string;
  mine: string;
  mso: string;
};

export type MeetUpdate = {
  fields: Record<string, string | number>;
  scores: ({ apparatus: string } & Partial<Record<'value' | 'place', number>>)[];
};

const FIELD_LABELS = {
  name: 'Name',
  level: 'Level',
  division: 'Division',
  start_date: 'Start date',
  end_date: 'End date',
  all_around_place: 'All-around place',
} as const;

const show = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? 'Not set' : String(value);

const apparatusLabel = (id: string) =>
  ALL_APPARATUS.find((a) => a.id === id)?.label ?? id;

const dateOnly = (value: string | null) => value?.slice(0, 10) ?? null;

/** Every value MSO supplies, keyed the way a parent's choice is sent back. */
function msoValues(mso: MsoMeetData): Map<string, string | number> {
  const values = new Map<string, string | number>();
  const add = (key: string, value: string | number | null) => {
    if (value !== null && value !== '') values.set(key, value);
  };
  add('name', mso.name.trim());
  add('level', mso.level);
  add('division', mso.division);
  add('start_date', dateOnly(mso.startDate));
  add('end_date', dateOnly(mso.endDate));
  add('all_around_place', mso.allAroundPlace);
  for (const s of mso.scores) {
    add(`score:${s.apparatus}:value`, s.value);
    add(`score:${s.apparatus}:place`, s.place);
  }
  return values;
}

function savedValue(saved: SavedCompetition, key: string): string | number | null {
  const [kind, apparatus, part] = key.split(':');
  if (kind === 'score') {
    const score = saved.scores.find((s) => s.apparatus === apparatus);
    return score?.[part as 'value' | 'place'] ?? null;
  }
  return saved[key as keyof typeof FIELD_LABELS];
}

function labelFor(key: string): string {
  const [kind, apparatus, part] = key.split(':');
  if (kind === 'score') return `${apparatusLabel(apparatus)} ${part === 'value' ? 'score' : 'place'}`;
  return FIELD_LABELS[key as keyof typeof FIELD_LABELS];
}

/**
 * What differs between a saved meet and MSO. Anything MSO leaves out is not a
 * change, so it can never blank out what the parent entered.
 */
export function diffMeet(saved: SavedCompetition, mso: MsoMeetData): MeetChange[] {
  const changes: MeetChange[] = [];
  for (const [key, theirs] of msoValues(mso)) {
    const mine = savedValue(saved, key);
    const same =
      typeof theirs === 'number' ? mine !== null && Number(mine) === theirs : mine === theirs;
    if (!same) changes.push({ key, label: labelFor(key), mine: show(mine), mso: show(theirs) });
  }
  return changes;
}

/**
 * The update for the changes a parent chose. Values come from MSO, never from
 * the request, and a key that isn't a current change is ignored.
 */
export function buildMeetUpdate(
  saved: SavedCompetition,
  mso: MsoMeetData,
  chosenKeys: readonly unknown[],
): MeetUpdate {
  const chosen = new Set(chosenKeys);
  const values = msoValues(mso);
  const update: MeetUpdate = { fields: {}, scores: [] };

  for (const { key } of diffMeet(saved, mso)) {
    if (!chosen.has(key)) continue;
    const value = values.get(key)!;
    const [kind, apparatus, part] = key.split(':');
    if (kind !== 'score') {
      update.fields[key] = value;
      continue;
    }
    let score = update.scores.find((s) => s.apparatus === apparatus);
    if (!score) {
      score = { apparatus };
      update.scores.push(score);
    }
    score[part as 'value' | 'place'] = value as number;
  }
  return update;
}
