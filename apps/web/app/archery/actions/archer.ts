'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { deleteProfileWithFiles } from '@scoresquid/auth/profile';
import { createClient } from '@scoresquid/auth/server';
import { revalidatePath } from 'next/cache';

const COOKIE_NAME = 'scoresquid_active_archer';

export async function setActiveArcher(archerId: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, archerId);
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

  if (currentId) {
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

export async function createArcher(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Name is required' };

  const { data: newId, error } = await supabase.rpc('create_archer', { p_name: name });

  if (error) return { error: error.message };

  await setActiveArcher(newId as string);

  revalidatePath('/archery');
  return { success: true };
}

export async function updateArcher(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: 'Name is required' };

  const { error } = await supabase
    .from('athletes')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('sport', 'archery');

  if (error) return { error: error.message };

  revalidatePath('/archery/account');
  revalidatePath('/archery');
  return { success: true };
}

export async function deleteArcher(id: string) {
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
  revalidatePath('/archery');
  return { success: true };
}
