'use server';

import { createClient } from '@scoresquid/auth/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ensureActiveGymnast } from '@/app/gymnastics/actions/gymnast';
import { insertCompetitionWithScores } from '@/features/gymnastics/lib/competitions';
import { apparatusFor, parseMeetForm } from '@/features/gymnastics/lib/meet-form';
import { isUuid } from '@/lib/validation';

type ActionResult = { error?: string; success?: boolean };

export async function createScore(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const gymnastId = await ensureActiveGymnast();
  if (!gymnastId) {
    return { error: 'No gymnast profile found. Please create one first.' };
  }

  const { data: gymnast } = await supabase
    .from('gymnast_athletes')
    .select('discipline')
    .eq('id', gymnastId)
    .eq('user_id', user.id)
    .single();
  if (!gymnast) return { error: 'No gymnast profile found. Please create one first.' };

  const parsed = parseMeetForm(formData, apparatusFor(gymnast.discipline));
  if ('error' in parsed) return parsed;

  const inserted = await insertCompetitionWithScores(
    supabase,
    {
      user_id: user.id,
      athlete_id: gymnastId,
      ...parsed.meet,
    },
    parsed.scores,
  );

  if (inserted.error === 'competition') return { error: 'Failed to create competition record.' };
  if (inserted.error === 'scores') return { error: 'Failed to save apparatus scores.' };

  revalidatePath('/gymnastics/dashboard');
  return { success: true };
}

export async function deleteCompetition(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { error: 'Failed to delete competition.' };
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await supabase
    .from('gym_competitions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return { error: 'Failed to delete competition.' };
  }

  revalidatePath('/gymnastics/dashboard');
  return { success: true };
}

export async function updateCompetition(id: string, formData: FormData): Promise<ActionResult> {
  if (!isUuid(id)) return { error: 'Failed to update competition details.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: competition } = await supabase
    .from('gym_competitions')
    .select('athlete_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!competition) return { error: 'Failed to update competition details.' };

  const { data: gymnast } = await supabase
    .from('gymnast_athletes')
    .select('discipline')
    .eq('id', competition.athlete_id)
    .eq('user_id', user.id)
    .single();
  if (!gymnast) return { error: 'Failed to update competition details.' };

  const parsed = parseMeetForm(formData, apparatusFor(gymnast.discipline));
  if ('error' in parsed) return parsed;

  const updatedAt = new Date().toISOString();
  const { error: compError } = await supabase
    .from('gym_competitions')
    .update({ ...parsed.meet, updated_at: updatedAt })
    .eq('id', id)
    .eq('user_id', user.id);

  if (compError) return { error: 'Failed to update competition details.' };

  const scoreUpserts = parsed.scores.map((score) => ({
    ...score,
    competition_id: id,
    updated_at: updatedAt,
  }));

  const { error: scoresError } = await supabase
    .from('gym_scores')
    .upsert(scoreUpserts, { onConflict: 'competition_id,apparatus' });

  if (scoresError) return { error: 'Failed to update scores.' };

  revalidatePath('/gymnastics/dashboard');
  return { success: true };
}
