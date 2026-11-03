'use server';

import { createClient } from '@scoresquid/auth/server';
import { revalidatePath } from 'next/cache';
import { ensureActiveGymnast } from './gymnast';
import { isMsoAthleteId, isValidMsoSummary } from '@/features/gymnastics/lib/meet-form';
import { isUuid } from '@/lib/validation';
import { MSO_ORIGIN, outboundOrigin } from '@/lib/outbound';
import { msoListLevel, parseMeetDates, msoResultsUrl } from '@/features/gymnastics/lib/mso-parser';
import { parseMeetListHtml, parseResultsHtml } from '@/features/gymnastics/lib/mso-scrape';
import { insertCompetitionWithScores } from '@/features/gymnastics/lib/competitions';
import {
  isMsoMeetId,
  matchImportedMeets,
  msoMeetIdFromUrl,
  suggestSavedMeets,
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
  historyEntry,
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
  // Hand-entered meets this might be, likeliest first. Only ever suggestions.
  suggestedIds?: string[];
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
  | { success: true; meets: MsoMeetSummary[]; linkable: LinkableMeet[]; error?: undefined };

/** A saved meet with no MSO ID, which a parent can link to an MSO meet. */
export type LinkableMeet = { id: string; name: string; start_date: string | null };

type ImportResult =
  | { error: string; success?: undefined; warning?: undefined; savedId?: undefined }
  | { success: true; warning?: string; savedId?: string; error?: undefined };

const ALREADY_IMPORTED = 'This meet is already imported.';

/**
 * How each meet relates to the gymnast's saved meets: which it was imported as,
 * which it might be, and which saved meets are free to link. An older import with
 * the same name and date gets the MSO ID here, so it stays recognised if renamed.
 */
async function matchSavedMeets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  athleteId: string,
  meets: MsoMeetRef[],
): Promise<{ results: { savedId?: string; suggestedIds: string[] }[]; linkable: LinkableMeet[] }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { results: meets.map(() => ({ suggestedIds: [] })), linkable: [] };

  const { data } = await supabase
    .from('gym_competitions')
    .select('id, name, start_date, mso_meet_id, rejected_mso_meet_ids')
    .eq('athlete_id', athleteId)
    .eq('user_id', user.id);

  const saved = (data ?? []) as SavedMeet[];
  const matches = matchImportedMeets(meets, saved);

  await Promise.all(
    matches.map(async ({ saved: match, linkMeetId }) => {
      if (!match || !isMsoMeetId(linkMeetId)) return;
      await supabase
        .from('gym_competitions')
        .update({ mso_meet_id: linkMeetId })
        .eq('id', match.id)
        .eq('user_id', user.id)
        .is('mso_meet_id', null);
    }),
  );

  const claimed = new Set(matches.flatMap((m) => (m.saved ? [m.saved.id] : [])));
  return {
    results: matches.map((m, i) => ({
      savedId: m.saved?.id,
      suggestedIds: m.saved ? [] : suggestSavedMeets(meets[i], saved, claimed).map((s) => s.id),
    })),
    linkable: saved
      .filter((s) => s.mso_meet_id === null && !claimed.has(s.id))
      .map(({ id, name, start_date }) => ({ id, name, start_date })),
  };
}

async function fetchMsoMeetsScrape(msoId: string): Promise<FetchMeetsResult> {
  const supabase = await createClient();
  const activeGymnastId = await ensureActiveGymnast();

  if (!msoId) return { error: 'No MSO ID provided' };

  try {
    const response = await fetch(
      `${outboundOrigin(MSO_ORIGIN)}/Athlete.MyScores/${encodeURIComponent(msoId)}`,
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

    const meets: MsoMeetSummary[] = parseMeetListHtml(await response.text()).map((m) => ({
      id: m.href,
      name: m.name,
      dateStr: m.dateStr,
      level: m.level,
      detailsUrl: `${outboundOrigin(MSO_ORIGIN)}${m.href}`,
      athleteMsoId: msoId,
    }));

    if (meets.length === 0) {
      return { error: 'No meets found. Double check the Athlete ID.' };
    }

    if (!activeGymnastId) return { error: 'Authentication required' };

    const { results, linkable } = await matchSavedMeets(
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
      isImported: results[i].savedId !== undefined,
      ...results[i],
    }));

    return { success: true, meets: processedMeets, linkable };
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

  const page = parseResultsHtml(await response.text());
  const { startDate, endDate } = parseMeetDates(page.dateStr || meet.dateStr);
  const { allAroundPlace, scores } = page;
  return {
    name: page.name || meet.name,
    level: msoListLevel(meet.level),
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

  // Both disciplines list meets from the JSON history, which has dates and clean
  // levels. Women's scores still come from the results page (see historyEntry).
  const rows = await msoQuery('msoGymnast', 'lookup_gymnast', {
    LookupIndex: 1,
    p_gymnastid: msoId,
  });
  const history = parseGymnastMeets(rows);
  if (history.length === 0) {
    return { error: 'No meets found. Double check the Athlete ID.' };
  }

  const { results, linkable } = await matchSavedMeets(
    ctx.supabase,
    ctx.gymnastId,
    history.map((m) => ({ meetId: m.meetId, name: m.meetName, dateHint: m.monthYear })),
  );

  const meets: MsoMeetSummary[] = history.map((m, i) => {
    const { path, ...entry } = historyEntry(m, msoId, ctx.discipline);
    return {
      id: m.meetId,
      ...entry,
      athleteMsoId: msoId,
      detailsUrl: `${outboundOrigin(MSO_ORIGIN)}${path}`,
      isImported: results[i].savedId !== undefined,
      ...results[i],
    };
  });

  return { success: true, meets, linkable };
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
  if (!isMsoAthleteId(msoId)) return { error: 'That MSO ID should be numbers only' };
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
  if (!isValidMsoSummary(meet)) return { error: 'That meet was not found' };
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

/**
 * What MSO says now. Everything comes from MSO on the server: no name, level or
 * date from the request, so a value MSO doesn't supply just isn't offered.
 */
async function loadMsoMeet(
  ctx: ReimportContext,
  meet: MsoMeetSummary,
): Promise<MsoMeetData | { error: string }> {
  if (meet.meetId) {
    if (!isMsoMeetId(meet.meetId)) return { error: 'Missing meet id' };
    // The stored ID wins. The request's only counts for a gymnast with none saved.
    const athleteId = ctx.msoId || meet.athleteMsoId;
    if (!isMsoAthleteId(athleteId)) return { error: 'This gymnast has no MSO Athlete ID set' };
    const rows = await msoQuery('msoMeet', 'lookup_scores2', {
      LookupIndex: 1,
      p_meetid: meet.meetId,
    });
    const result = parseMeetResult(rows, athleteId);
    if (!result) return { error: 'Gymnast not found in this meet' };
    return {
      name: result.meetName,
      level: result.level,
      division: result.division,
      startDate: result.date,
      endDate: result.date,
      allAroundPlace: result.allAroundPlace,
      scores: result.scores,
    };
  }
  const meetId = msoMeetIdFromUrl(meet.detailsUrl);
  if (!meetId) return { error: 'Invalid meet link' };
  // Only the athlete's own results page has their scores. Same rule as above:
  // the stored ID wins, and the request's only counts for a gymnast with none saved.
  const athleteId = ctx.msoId || meet.athleteMsoId;
  if (!isMsoAthleteId(athleteId)) return { error: 'This gymnast has no MSO Athlete ID set' };
  return scrapeMeetDetails(`${outboundOrigin(MSO_ORIGIN)}/results/${meetId}/${athleteId}`, {
    ...meet,
    name: '',
    level: '',
    dateStr: '',
  });
}

/** The parent's saved meet, if it's theirs and linked to this MSO meet. */
async function loadLinkedCompetition(
  ctx: ReimportContext,
  savedId: string,
  meet: MsoMeetSummary,
): Promise<SavedCompetition | null> {
  const row = await loadOwnCompetition(ctx, savedId);
  const meetId = meet.meetId ?? msoMeetIdFromUrl(meet.detailsUrl);
  return row && meetId && row.mso_meet_id === meetId ? row : null;
}

async function loadOwnCompetition(
  ctx: ReimportContext,
  savedId: string,
): Promise<(SavedCompetition & { mso_meet_id: string | null; rejected_mso_meet_ids: string[] }) | null> {
  const { data } = await ctx.supabase
    .from('gym_competitions')
    .select(
      'name, level, division, start_date, end_date, all_around_place, mso_meet_id, rejected_mso_meet_ids, scores:gym_scores(apparatus, value, place)',
    )
    .eq('id', savedId)
    .eq('athlete_id', ctx.gymnastId)
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  return data as (SavedCompetition & { mso_meet_id: string | null; rejected_mso_meet_ids: string[] }) | null;
}

type ReimportPreview =
  | { error: string; changes?: undefined }
  | { changes: MeetChange[]; error?: undefined };

export async function previewMsoReimport(
  savedId: string,
  meet: MsoMeetSummary,
): Promise<ReimportPreview> {
  if (!isUuid(savedId) || !isValidMsoSummary(meet)) return { error: 'That meet was not found' };
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
  if (!isUuid(savedId) || !isValidMsoSummary(meet)) return { error: 'That meet was not found' };
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

// ---------------------------------------------------------------------------
// Link: fill a hand-entered meet from MSO instead of importing a new one.
// ---------------------------------------------------------------------------

/** The saved meet and MSO's data, if the saved meet is theirs and not yet linked. */
async function loadForLink(ctx: ReimportContext, savedId: string, meet: MsoMeetSummary) {
  const saved = await loadOwnCompetition(ctx, savedId);
  if (!saved) return { error: 'That meet could not be found.' };
  if (saved.mso_meet_id !== null) return { error: 'That meet is already linked to MSO.' };
  const mso = await loadMsoMeet(ctx, meet);
  if ('error' in mso) return { error: mso.error };
  return { saved, mso };
}

export async function previewMsoLink(
  savedId: string,
  meet: MsoMeetSummary,
): Promise<ReimportPreview> {
  if (!isUuid(savedId) || !isValidMsoSummary(meet)) return { error: 'That meet was not found' };
  const ctx = await activeGymnastContext();
  if (!ctx) return { error: 'Authentication required' };

  try {
    const loaded = await loadForLink(ctx, savedId, meet);
    if ('error' in loaded) return { error: loaded.error! };
    return { changes: diffMeet(loaded.saved!, loaded.mso!) };
  } catch {
    return { error: 'Failed to read this meet from MSO. Please try again.' };
  }
}

export async function applyMsoLink(
  savedId: string,
  meet: MsoMeetSummary,
  chosenKeys: string[],
): Promise<ImportResult> {
  if (!isUuid(savedId) || !isValidMsoSummary(meet)) return { error: 'That meet was not found' };
  const ctx = await activeGymnastContext();
  if (!ctx) return { error: 'Authentication required' };
  if (!Array.isArray(chosenKeys)) return { error: 'Nothing was chosen' };

  const meetId = meet.meetId ?? msoMeetIdFromUrl(meet.detailsUrl);
  if (!isMsoMeetId(meetId)) return { error: 'Missing meet id' };

  try {
    const loaded = await loadForLink(ctx, savedId, meet);
    if ('error' in loaded) return { error: loaded.error! };

    const update = buildMeetUpdate(loaded.saved!, loaded.mso!, chosenKeys);
    const { error } = await ctx.supabase.rpc('update_competition_from_mso', {
      p_id: savedId,
      p_fields: { ...update.fields, mso_meet_id: meetId },
      p_scores: update.scores,
    });
    if (error?.code === '23505') return { error: ALREADY_IMPORTED };
    if (error) return { error: 'Failed to update this meet.' };
  } catch {
    return { error: 'Failed to read this meet from MSO. Please try again.' };
  }

  revalidatePath('/gymnastics/dashboard');
  revalidatePath('/gymnastics/insights');
  return { success: true, savedId };
}

/** Remember that a saved meet isn't this MSO meet, so it isn't suggested again. */
export async function rejectMsoSuggestion(
  savedId: string,
  meet: MsoMeetSummary,
): Promise<ImportResult> {
  if (!isUuid(savedId) || !isValidMsoSummary(meet)) return { error: 'That meet was not found' };
  const ctx = await activeGymnastContext();
  if (!ctx) return { error: 'Authentication required' };

  const meetId = meet.meetId ?? msoMeetIdFromUrl(meet.detailsUrl);
  if (!isMsoMeetId(meetId)) return { error: 'Missing meet id' };

  const saved = await loadOwnCompetition(ctx, savedId);
  if (!saved) return { error: 'That meet could not be found.' };

  const { error } = await ctx.supabase
    .from('gym_competitions')
    .update({ rejected_mso_meet_ids: [...new Set([...saved.rejected_mso_meet_ids, meetId])] })
    .eq('id', savedId)
    .eq('user_id', ctx.user.id);
  return error ? { error: 'Failed to save that.' } : { success: true };
}
