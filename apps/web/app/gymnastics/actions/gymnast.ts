'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@scoresquid/auth/server';
import { revalidatePath } from 'next/cache';

const COOKIE_NAME = 'gymnast_shoebox_active_gymnast';

export async function setActiveGymnast(gymnastId: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, gymnastId);
  redirect('/dashboard');
}

export async function getActiveGymnastId() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  return cookie?.value;
}

export async function ensureActiveGymnast() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const currentId = await getActiveGymnastId();

  if (currentId) {
    const { data: valid } = await supabase
      .from('gymnast_athletes')
      .select('id')
      .eq('id', currentId)
      .eq('user_id', user.id)
      .single();

    if (valid) return currentId;
  }

  const { data: firstGymnast } = await supabase
    .from('gymnast_athletes')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (firstGymnast) {
    return firstGymnast.id;
  }

  return null;
}

export async function createGymnast(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const name = formData.get('name') as string;
  const discipline = formData.get('discipline') as string;

  if (!name) return { error: 'Name is required' };

  const { data: newId, error } = await supabase.rpc('create_gymnast', {
    p_name: name,
    p_discipline: discipline || 'MAG',
  });

  if (error) {
    return { error: error.message };
  }

  await setActiveGymnast(newId as string);

  revalidatePath('/gymnastics');
  return { success: true };
}

export async function updateGymnast(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const name = formData.get('name') as string;
  const mso_id = formData.get('mso_id') as string;
  const discipline = formData.get('discipline') as string;

  if (!name) return { error: 'Name is required' };

  const { error } = await supabase.rpc('update_gymnast', {
    p_id: id,
    p_name: name,
    p_mso_id: mso_id || null,
    p_discipline: discipline || null,
  });

  if (error) return { error: error.message };

  revalidatePath('/gymnastics/account');
  revalidatePath('/gymnastics');
  return { success: true };
}

export async function deleteGymnast(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { count } = await supabase
    .from('gymnast_athletes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (count && count <= 1) {
    return { error: 'You cannot delete your only gymnast profile.' };
  }

  const { error } = await supabase
    .from('athletes')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('sport', 'gymnastics');

  if (error) return { error: error.message };

  revalidatePath('/gymnastics/account');
  revalidatePath('/gymnastics');
  return { success: true };
}
