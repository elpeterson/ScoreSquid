'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { deleteProfileWithFiles } from '@scoresquid/auth/profile';
import { createClient } from '@scoresquid/auth/server';
import { revalidatePath } from 'next/cache';
import { latestStartDate, parseArcherDetails } from '@/features/archery/lib/archer-profile';
import { isUuid } from '@/lib/validation';

const COOKIE_NAME = 'scoresquid_active_archer';

export async function setActiveArcher(archerId: string) {
  const cookieStore = await cookies();
  if (isUuid(archerId)) cookieStore.set(COOKIE_NAME, archerId);
  redirect('/dashboard');
}

export async function getActiveArcherId() {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value;
}

export async function ensureActiveArcher() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const currentId = await getActiveArcherId();

  if (isUuid(currentId)) {
    const { data: valid } = await supabase
      .from('archer_athletes')
      .select('id')
      .eq('id', currentId)
      .eq('user_id', user.id)
      .single();

    if (valid) return currentId;
  }

  const { data: firstArcher } = await supabase
    .from('archer_athletes')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  return firstArcher?.id ?? null;
}

const detailsFrom = (formData: FormData) =>
  parseArcherDetails(
    {
      name: formData.get('name'),
      membershipNumber: formData.get('membership_number'),
      competitionStartDate: formData.get('competition_start_date'),
    },
    latestStartDate(),
  );

type SaveResult = { error?: string; existingArcherId?: string; success?: boolean };

/** The result when a membership number is already on another of the user's archers. */
async function numberTaken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  membershipNumber: string | null,
): Promise<SaveResult> {
  const { data } = await supabase
    .from('archer_athletes')
    .select('id, name')
    .eq('user_id', userId)
    .eq('membership_number', membershipNumber)
    .limit(1)
    .maybeSingle();
  return {
    error: data ? `${data.name} already has this membership number.` : 'An archer already has this membership number.',
    existingArcherId: data?.id,
  };
}

export async function createArcher(formData: FormData): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const parsed = detailsFrom(formData);
  if ('error' in parsed) return parsed;
  const { name, membershipNumber, competitionStartDate } = parsed.details;

  const { data: newId, error } = await supabase.rpc('create_archer', {
    p_name: name,
    p_membership_number: membershipNumber,
    p_competition_start_date: competitionStartDate,
  });

  if (error?.code === '23505') return numberTaken(supabase, user.id, membershipNumber);
  if (error) return { error: 'Failed to create this archer.' };

  await setActiveArcher(newId as string);

  revalidatePath('/archery');
  return { success: true };
}

export async function updateArcher(id: string, formData: FormData): Promise<SaveResult> {
  if (!isUuid(id)) return { error: 'Failed to update this archer.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const parsed = detailsFrom(formData);
  if ('error' in parsed) return parsed;
  const { name, membershipNumber, competitionStartDate } = parsed.details;

  const { error } = await supabase.rpc('update_archer', {
    p_id: id,
    p_name: name,
    p_membership_number: membershipNumber,
    p_competition_start_date: competitionStartDate,
  });

  if (error?.code === '23505') return numberTaken(supabase, user.id, membershipNumber);
  if (error) return { error: 'Failed to update this archer.' };

  revalidatePath('/archery/account');
  revalidatePath('/archery/import');
  revalidatePath('/archery');
  return { success: true };
}

export async function deleteArcher(id: string) {
  if (!isUuid(id)) return { error: 'Archer not found' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { count } = await supabase
    .from('archer_athletes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (count && count <= 1) {
    return { error: 'You cannot delete your only archer profile.' };
  }

  const { error } = await deleteProfileWithFiles({
    // The archer's scorecard PDFs: their rows cascade away with the archer.
    listFiles: async () => {
      const { data, error } = await supabase
        .from('arch_events')
        .select('source_path')
        .eq('athlete_id', id)
        .eq('user_id', user.id)
        .not('source_path', 'is', null);
      if (error) throw new Error(error.message);
      return (data ?? []).map((e) => e.source_path as string);
    },
    deleteRow: async () => {
      const { error } = await supabase
        .from('athletes')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
        .eq('sport', 'archery');
      if (error) throw new Error(error.message);
    },
    removeFiles: async (paths) => {
      const { error } = await supabase.storage.from('scorecards').remove(paths);
      if (error) throw new Error(error.message);
    },
  });

  if (error) return { error };

  revalidatePath('/archery/account');
  revalidatePath('/archery/import');
  revalidatePath('/archery');
  return { success: true };
}
