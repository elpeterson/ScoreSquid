'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@scoresquid/auth/server';
import { findImportedTwin, type ExistingScorecard } from '@/features/archery/lib/betweenends/import-plan';

const arrow = z.enum(['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M']);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

const ImportSchema = z.object({
  event: z.object({
    athlete_id: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    venue: z.string().max(200).nullable(),
    start_date: isoDate,
    end_date: isoDate,
    shot_on: isoDate,
    session: z.string().max(200).nullable(),
    target: z.string().max(50).nullable(),
    division: z.string().max(50).nullable(),
    bow_style: z.string().max(50).nullable(),
    environment: z.enum(['indoor', 'outdoor']),
    distance_m: z.number().positive().max(1000).nullable(),
    face_cm: z.number().int().positive().max(500).nullable(),
    arrows_per_end: z.number().int().min(1).max(12),
    bonus_labels: z.array(z.string().max(20)).max(5),
    source_path: z.string().max(500).nullable(),
    source_hash: z.string().regex(/^[0-9a-f]{64}$/),
    name_on_card: z.string().max(200).nullable(),
  }),
  rounds: z
    .array(
      z.object({
        round_number: z.number().int().positive().max(50),
        total: z.number().int().min(0).max(100000),
        bonus: z.array(z.number().int().min(0).max(10000)).max(5),
        ends: z
          .array(
            z.object({
              end_number: z.number().int().positive().max(1000),
              arrows: z.array(arrow).min(1).max(12),
            }),
          )
          .min(1)
          .max(1000),
      }),
    )
    .min(1)
    .max(50),
});

export type ImportPayload = z.infer<typeof ImportSchema>;

export async function saveScorecard(
  payload: ImportPayload,
): Promise<{ id?: string; duplicate?: boolean; error?: string }> {
  const parsed = ImportSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: 'This scorecard has invalid data and was not saved.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // The browser uploads the PDF and names the path; it must be in the user's folder.
  const { source_path } = parsed.data.event;
  if (source_path && !source_path.startsWith(`${user.id}/`)) {
    return { error: 'This scorecard has invalid data and was not saved.' };
  }

  // The file hash can't catch the same result imported from a Between Ends search.
  const { data: imported } = await supabase
    .from('arch_events')
    .select('id, name, start_date, session, source, be_event_id, be_aid, be_arrows, rounds:arch_rounds ( round_number, total )')
    .eq('athlete_id', parsed.data.event.athlete_id)
    .eq('user_id', user.id)
    .not('be_event_id', 'is', null);
  const twin = findImportedTwin(
    {
      name: parsed.data.event.name,
      start_date: parsed.data.event.start_date,
      session: parsed.data.event.session,
      totals: parsed.data.rounds.map((r) => r.total),
    },
    (imported ?? []) as unknown as ExistingScorecard[],
  );
  if (twin) return { duplicate: true };

  const { data, error } = await supabase.rpc('import_scorecard', {
    payload: parsed.data,
  });

  if (error) {
    if (error.code === '23505') return { duplicate: true };
    return { error: error.message };
  }

  revalidatePath('/archery/dashboard');
  revalidatePath('/archery/insights');
  return { id: data as string };
}
