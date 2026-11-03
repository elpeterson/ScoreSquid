'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@scoresquid/auth/server';
import { fetchArcherEvents } from '@/features/archery/lib/events';
import { repeatedScorecards } from '@/features/archery/lib/repeats';

/**
 * Removes the other copies of the result the parent chose to keep. The copies are worked
 * out here from the user's own scorecards, so the browser can only name the one to keep.
 */
export async function keepOneScorecard(keepId: string): Promise<{ error?: string }> {
  if (!z.string().uuid().safeParse(keepId).success) return { error: 'That scorecard was not found.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in' };

  const { data: kept } = await supabase
    .from('arch_events')
    .select('athlete_id')
    .eq('id', keepId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!kept) return { error: 'That scorecard was not found.' };

  const { events, error } = await fetchArcherEvents(supabase, kept.athlete_id as string);
  if (error) return { error: 'Those scorecards could not be removed.' };
  const group = repeatedScorecards(events).find((g) => g.some((e) => e.id === keepId));
  if (!group) return { error: 'These scorecards are no longer repeats.' };
  const others = group.filter((e) => e.id !== keepId);

  const { error: deleteError } = await supabase
    .from('arch_events')
    .delete()
    .in('id', others.map((e) => e.id))
    .eq('user_id', user.id);
  if (deleteError) return { error: 'Those scorecards could not be removed.' };

  const files = others.map((e) => e.source_path).filter((path): path is string => !!path);
  if (files.length > 0) await supabase.storage.from('scorecards').remove(files);

  revalidatePath('/archery/dashboard');
  revalidatePath('/archery/insights');
  return {};
}
