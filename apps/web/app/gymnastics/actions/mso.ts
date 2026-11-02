'use server';

import * as cheerio from 'cheerio';
import { createClient } from '@scoresquid/auth/server';
import { revalidatePath } from 'next/cache';
import { ensureActiveGymnast } from './gymnast';
import { parseScoreRow, parseMeetDates, msoResultsUrl } from '@/features/gymnastics/lib/mso-parser';
import { insertCompetitionWithScores } from '@/features/gymnastics/lib/competitions';
import {
  isMsoMeetId,
  matchImportedMeets,
  msoMeetIdFromUrl,
  type MsoMeetRef,
  type SavedMeet,
} from '@/features/gymnastics/lib/meet-match';
import {
  buildMeetUpdate,
  diffMeet,
  type MeetChange,
  type MsoMeetData,
  type SavedCompetition,
} from '@/features/gymnastics/lib/meet-diff';
import {
  msoQuery,
  parseGymnastMeets,
  parseMeetResult,
} from '@/features/gymnastics/lib/mso-api';

export type MsoMeetSummary = {
  id: string;
  name: string;
  dateStr: string;
  level: string;
  detailsUrl: string;
  isImported?: boolean;
  // The saved competition this meet was imported as, when it was.
  savedId?: string;
  // Present when the summary came from the JSON API (enables the JSON import
  // path, which also carries division). Absent for scraped summaries.
  meetId?: string;
  division?: string | null;
  // The MSO gymnastid used to fetch this meet list. Threaded through so the
  // import picks the same athlete's row, independent of what's stored on the
  // gymnast record (which may differ or be unset).
  athleteMsoId?: string;
};

type FetchMeetsResult =
  | { error: string; success?: undefined; meets?: undefined }
  | { success: true; meets: MsoMeetSummary[]; error?: undefined };

type ImportResult =
  | { error: string; success?: undefined; warning?: undefined; savedId?: undefined }
  | { success: true; warning?: string; savedId?: string; error?: undefined };

const ALREADY_IMPORTED = 'This meet is already imported.';

/**
 * The saved competition each meet was imported as, or null. An older import with
 * no MSO ID gets one here, so it stays recognised if it's renamed later.
 */
async function importedMeetIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  athleteId: string,
  meets: MsoMeetRef[],
): Promise<(string | null)[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return meets.map(() => null);

  const { data } = await supabase
    .from('gym_competitions')
    .select('id, name, start_date, mso_meet_id')
    .eq('athlete_id', athleteId)
    .eq('user_id', user.id);

  const matches = matchImportedMeets(meets, (data ?? []) as SavedMeet[]);

  await Promise.all(
    matches.map(async ({ saved, linkMeetId }) => {
      if (!saved || !isMsoMeetId(linkMeetId)) return;
      await supabase
        .from('gym_competitions')
        .update({ mso_meet_id: linkMeetId })
        .eq('id', saved.id)
        .eq('user_id', user.id)
        .is('mso_meet_id', null);
    }),
  );

  return matches.map((m) => m.saved?.id ?? null);
}

async function fetchMsoMeetsScrape(msoId: string): Promise<FetchMeetsResult> {
  const supabase = await createClient();
  const activeGymnastId = await ensureActiveGymnast();

  if (!msoId) return { error: 'No MSO ID provided' };

  try {
    const response = await fetch(
      `https://www.meetscoresonline.com/Athlete.MyScores/${encodeURIComponent(msoId)}`,
      {
        next: { revalidate: 300 }, // cache meet list for 5 minutes
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      }
    );

    if (!response.ok)
      return { error: `Failed to reach MSO (Status: ${response.status})` };

    const html = await response.text();
    const $ = cheerio.load(html);
    const meets: MsoMeetSummary[] = [];

    $('a[href^="/results/"]').each((i, el) => {
      const link = $(el);
      const href = link.attr('href');
      const row = link.closest('tr');
      if (row.length === 0) return;

      const cols = row.find('td');

      let name = $(cols[0]).text().trim();
      if (!name) name = link.text().trim();

      const level = $(cols[2]).text().trim();

      let dateStr = 'Date TBD';
      if (cols.length > 4) {
        const val = $(cols[4]).text().trim();
        if (val) dateStr = val;
      }

      if (name === level && name.length < 5) return;

      if (name && href && !meets.find((m) => m.id === href)) {
        meets.push({
          id: href,
          name,
          dateStr,
          level,
          detailsUrl: `https://www.meetscoresonline.com${href}`,
        });
      }
    });

    if (meets.length === 0) {
      return { error: 'No meets found. Double check the Athlete ID.' };
    }

    if (!activeGymnastId) return { error: 'Authentication required' };

    const savedIds = await importedMeetIds(
      supabase,
      activeGymnastId,
      meets.map((m) => ({
        meetId: msoMeetIdFromUrl(m.detailsUrl),
        name: m.name,
        dateHint: m.dateStr,
      })),
    );

    const processedMeets = meets.map((m, i) => ({
      ...m,
      isImported: savedIds[i] !== null,
      savedId: savedIds[i] ?? undefined,
    }));

    return { success: true, meets: processedMeets };
  } catch {
    return { error: 'Error parsing MSO data' };
  }
}

/** Read a meet's results page. Throws if the page can't be fetched. */
async function scrapeMeetDetails(
  detailsUrl: string,
  meet: MsoMeetSummary,
): Promise<Omit<MsoMeetData, 'scores'> & { scores: { apparatus: string; value: number; place: number | null }[] }> {
  const response = await fetch(detailsUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) throw new Error(`MSO results page: HTTP ${response.status}`);

  const html = await response.text();
  const $ = cheerio.load(html);

  const name = $('h1.event-title').text().trim() || meet.name;
  const realDateStr = $('#MeetDetails h5 strong').first().text().trim() || meet.dateStr;

  const scores: { apparatus: string; value: number; place: number | null }[] = [];
  let allAroundPlace: number | null = null;

  $('#athlete table tbody tr').each((i, row) => {
    const $row = $(row);
    const eventLabel = $row.find('th').text().trim();
    const scoreText = $row.find('span.score').text().trim();
    const placeText = $row.find('span.place').text().trim();

    if (eventLabel === 'AA') {
      const place = parseInt(placeText.replace('T', ''));
      if (!isNaN(place)) allAroundPlace = place;
    } else {
      const parsed = parseScoreRow(eventLabel, scoreText, placeText);
      if (parsed) scores.push(parsed);
    }
  });

  const { startDate, endDate } = parseMeetDates(realDateStr);
  return {
    name,
    level: meet.level || null,
    division: null,
    startDate,
    endDate,
    allAroundPlace,
    scores,
  };
}

async function importMsoMeetScrape(meet: MsoMeetSummary): Promise<ImportResult> {
  const supabase = await createClient();
  const gymnastId = await ensureActiveGymnast();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !gymnastId) return { error: 'Authentication required' };

  const detailsUrl = msoResultsUrl(meet.detailsUrl);
  if (!detailsUrl) return { error: 'Invalid meet link' };

  try {
    const {
      name: realName,
      level,
      startDate,
      endDate,
      allAroundPlace,
      scores: scoresToInsert,
    } = await scrapeMeetDetails(detailsUrl, meet);

    const inserted = await insertCompetitionWithScores(
      supabase,
      {
        user_id: user.id,
        athlete_id: gymnastId,
        mso_meet_id: msoMeetIdFromUrl(detailsUrl),
        name: realName,
        level,
        start_date: startDate,
        end_date: endDate,
        all_around_place: allAroundPlace,
      },
      scoresToInsert,
    );

    if (inserted.error === 'duplicate') return { error: ALREADY_IMPORTED };
    if (inserted.error === 'competition') return { error: 'Failed to create meet.' };
    if (inserted.error === 'scores') return { error: 'Scores failed to save; the meet was not imported.' };

    revalidatePath('/gymnastics/dashboard');
    if (scoresToInsert.length === 0) {
      return {
        success: true,
        savedId: inserted.competitionId,
        warning: "Meet created, but score table format didn't match.",
      };
    }

    revalidatePath('/gymnastics/dashboard');
    return { success: true, savedId: inserted.competitionId };
  } catch {
    return { error: 'Failed to import meet' };
  }
}

// ---------------------------------------------------------------------------
// JSON API path (preferred). Captures level + division, which the scrape drops.
// ---------------------------------------------------------------------------

async function activeGymnastContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const gymnastId = await ensureActiveGymnast();
  if (!user || !gymnastId) return null;
  const { data: gymnast } = await supabase
    .from('gymnast_athletes')
    .select('discipline, mso_id')
    .eq('id', gymnastId)
    .single();
  return {
    supabase,
    user,
    gymnastId,
    discipline: gymnast?.discipline ?? 'MAG',
    msoId: gymnast?.mso_id as string | null | undefined,
  };
}

async function fetchMsoMeetsApi(msoId: string): Promise<FetchMeetsResult> {
  const ctx = await activeGymnastContext();
  if (!ctx) return { error: 'Authentication required' };

  // The JSON slot mapping is men's-artistic only; women's stays on the scrape.
  if (ctx.discipline === 'WAG') return fetchMsoMeetsScrape(msoId);

  const rows = await msoQuery('msoGymnast', 'lookup_gymnast', {
    LookupIndex: 1,
    p_gymnastid: msoId,
  });
  const history = parseGymnastMeets(rows);
  if (history.length === 0) {
    return { error: 'No meets found. Double check the Athlete ID.' };
  }

  const savedIds = await importedMeetIds(
    ctx.supabase,
    ctx.gymnastId,
    history.map((m) => ({ meetId: m.meetId, name: m.meetName, dateHint: m.monthYear })),
  );

  const meets: MsoMeetSummary[] = history.map((m, i) => ({
    id: m.meetId,
    meetId: m.meetId,
    athleteMsoId: msoId,
    name: m.meetName,
    dateStr: m.monthYear ?? 'Date TBD',
    level: m.level ?? '',
    division: m.division,
    detailsUrl: `https://www.meetscoresonline.com/results/${m.meetId}`,
    isImported: savedIds[i] !== null,
    savedId: savedIds[i] ?? undefined,
  }));

  return { success: true, meets };
}

async function importMsoMeetApi(meet: MsoMeetSummary): Promise<ImportResult> {
  const ctx = await activeGymnastContext();
  if (!ctx) return { error: 'Authentication required' };
  if (!isMsoMeetId(meet.meetId)) return { error: 'Missing meet id' };

  // Use the id that fetched the meet list; fall back to the stored one.
  const athleteId = meet.athleteMsoId || ctx.msoId;
  if (!athleteId) return { error: 'This gymnast has no MSO Athlete ID set' };

  const rows = await msoQuery('msoMeet', 'lookup_scores2', {
    LookupIndex: 1,
    p_meetid: meet.meetId,
  });
  // mso_id (the Athlete ID) is the JSON API's gymnastid — verified in the spike.
  const result = parseMeetResult(rows, athleteId);
  if (!result) return { error: 'Gymnast not found in this meet' };

  const inserted = await insertCompetitionWithScores(
    ctx.supabase,
    {
      user_id: ctx.user.id,
      athlete_id: ctx.gymnastId,
      mso_meet_id: meet.meetId,
      name: result.meetName || meet.name,
      level: result.level,
      division: result.division,
      start_date: result.date,
      end_date: result.date,
      all_around_place: result.allAroundPlace,
    },
    result.scores.map((s) => ({
      apparatus: s.apparatus,
      value: s.value,
      place: s.place,
    })),
  );

  if (inserted.error === 'duplicate') return { error: ALREADY_IMPORTED };
  if (inserted.error === 'competition') return { error: 'Failed to create meet.' };
  if (inserted.error === 'scores') {
    return { error: 'Scores failed to save; the meet was not imported.' };
  }

  revalidatePath('/gymnastics/dashboard');
  if (result.scores.length === 0) {
    return {
      success: true,
      savedId: inserted.competitionId,
      warning: 'Meet created, but no scores were recorded for it yet.',
    };
  }
  return { success: true, savedId: inserted.competitionId };
}

/**
 * Public entry points: try the JSON API first (richer, more robust), and fall
 * back to the legacy HTML scrape on any failure so imports never hard-break.
 */
export async function fetchMsoMeets(msoId: string): Promise<FetchMeetsResult> {
  if (!msoId) return { error: 'No MSO ID provided' };
  try {
    const viaApi = await fetchMsoMeetsApi(msoId);
    if ('success' in viaApi) return viaApi;
    // API returned a handled error (e.g. no meets) — trust it, don't scrape.
    return viaApi;
  } catch {
    // Transport/shape failure — fall back to scraping.
    return fetchMsoMeetsScrape(msoId);
  }
}

export async function importMsoMeet(meet: MsoMeetSummary): Promise<ImportResult> {
  // Scraped summaries have no meetId; use the scrape importer for those.
  if (!meet.meetId) return importMsoMeetScrape(meet);
  // JSON-sourced meet: use the API importer and surface its result. We do NOT
  // silently fall back to the scrape here — the scrape targets a different page
  // for a meetId URL and would create an empty competition, hiding the failure.
  try {
    return await importMsoMeetApi(meet);
  } catch {
    return { error: 'Failed to import meet from MSO. Please try again.' };
  }
}

// ---------------------------------------------------------------------------
// Re-import: compare a saved meet with MSO, then apply what the parent chose.
// ---------------------------------------------------------------------------

type ReimportContext = NonNullable<Awaited<ReturnType<typeof activeGymnastContext>>>;

/** What MSO says now. Reads from MSO on the server, never from the request. */
async function loadMsoMeet(
  ctx: ReimportContext,
  meet: MsoMeetSummary,
): Promise<MsoMeetData | { error: string }> {
  if (meet.meetId) {
    if (!isMsoMeetId(meet.meetId)) return { error: 'Missing meet id' };
    const athleteId = meet.athleteMsoId || ctx.msoId;
    if (!athleteId) return { error: 'This gymnast has no MSO Athlete ID set' };
    const rows = await msoQuery('msoMeet', 'lookup_scores2', {
      LookupIndex: 1,
      p_meetid: meet.meetId,
    });
    const result = parseMeetResult(rows, athleteId);
    if (!result) return { error: 'Gymnast not found in this meet' };
    return {
      name: result.meetName || meet.name,
      level: result.level,
      division: result.division,
      startDate: result.date,
      endDate: result.date,
      allAroundPlace: result.allAroundPlace,
      scores: result.scores,
    };
  }
  const detailsUrl = msoResultsUrl(meet.detailsUrl);
  if (!detailsUrl) return { error: 'Invalid meet link' };
  return scrapeMeetDetails(detailsUrl, meet);
}

/** The parent's saved meet, if it's theirs and linked to this MSO meet. */
async function loadLinkedCompetition(
  ctx: ReimportContext,
  savedId: string,
  meet: MsoMeetSummary,
): Promise<SavedCompetition | null> {
  const { data } = await ctx.supabase
    .from('gym_competitions')
    .select(
      'name, level, division, start_date, end_date, all_around_place, mso_meet_id, scores:gym_scores(apparatus, value, place)',
    )
    .eq('id', savedId)
    .eq('athlete_id', ctx.gymnastId)
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  const meetId = meet.meetId ?? msoMeetIdFromUrl(meet.detailsUrl);
  if (!data || !meetId || data.mso_meet_id !== meetId) return null;
  return data as SavedCompetition;
}

type ReimportPreview =
  | { error: string; changes?: undefined }
  | { changes: MeetChange[]; error?: undefined };

export async function previewMsoReimport(
  savedId: string,
  meet: MsoMeetSummary,
): Promise<ReimportPreview> {
  const ctx = await activeGymnastContext();
  if (!ctx) return { error: 'Authentication required' };

  try {
    const saved = await loadLinkedCompetition(ctx, savedId, meet);
    if (!saved) return { error: 'This meet is not linked to MSO. Sync and try again.' };
    const mso = await loadMsoMeet(ctx, meet);
    if ('error' in mso) return { error: mso.error };
    return { changes: diffMeet(saved, mso) };
  } catch {
    return { error: 'Failed to read this meet from MSO. Please try again.' };
  }
}

export async function applyMsoReimport(
  savedId: string,
  meet: MsoMeetSummary,
  chosenKeys: string[],
): Promise<ImportResult> {
  const ctx = await activeGymnastContext();
  if (!ctx) return { error: 'Authentication required' };
  if (!Array.isArray(chosenKeys)) return { error: 'Nothing was chosen' };

  try {
    const saved = await loadLinkedCompetition(ctx, savedId, meet);
    if (!saved) return { error: 'This meet is not linked to MSO. Sync and try again.' };
    const mso = await loadMsoMeet(ctx, meet);
    if ('error' in mso) return { error: mso.error };

    const update = buildMeetUpdate(saved, mso, chosenKeys);
    if (Object.keys(update.fields).length === 0 && update.scores.length === 0) {
      return { error: 'Nothing to update. Sync and try again.' };
    }

    const { error } = await ctx.supabase.rpc('update_competition_from_mso', {
      p_id: savedId,
      p_fields: update.fields,
      p_scores: update.scores,
    });
    if (error) return { error: 'Failed to update this meet.' };
  } catch {
    return { error: 'Failed to read this meet from MSO. Please try again.' };
  }

  revalidatePath('/gymnastics/dashboard');
  revalidatePath('/gymnastics/insights');
  return { success: true };
}
