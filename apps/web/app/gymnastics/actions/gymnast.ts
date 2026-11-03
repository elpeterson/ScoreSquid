'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@scoresquid/auth/server';
import { revalidatePath } from 'next/cache';
import { isDiscipline, isMsoAthleteId, parseGymnastName } from '@/features/gymnastics/lib/meet-form';
import { formText, isUuid } from '@/lib/validation';

type ActionResult = { error?: string; success?: boolean };

const COOKIE_NAME = 'scoresquid_active_gymnast';

export async function setActiveGymnast(gymnastId: string) {
  const cookieStore = await cookies();
  if (isUuid(gymnastId)) cookieStore.set(COOKIE_NAME, gymnastId);
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

  if (isUuid(currentId)) {
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

export async function createGymnast(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const parsed = parseGymnastName(formData.get('name'));
  if ('error' in parsed) return parsed;
  const discipline = formData.get('discipline');
  if (discipline && !isDiscipline(discipline)) return { error: 'That discipline is not valid' };

  const { data: newId, error } = await supabase.rpc('create_gymnast', {
    p_name: parsed.name,
    p_discipline: discipline || 'MAG',
  });

  if (error) {
    return { error: error.message };
  }

  await setActiveGymnast(newId as string);

  revalidatePath('/gymnastics');
  return { success: true };
}

export async function updateGymnast(id: string, formData: FormData): Promise<ActionResult> {
  if (!isUuid(id)) return { error: 'Gymnast not found' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const parsed = parseGymnastName(formData.get('name'));
  if ('error' in parsed) return parsed;
  const mso_id = formText(formData.get('mso_id'));
  if (mso_id && !isMsoAthleteId(mso_id)) return { error: 'That MSO ID should be numbers only' };
  const discipline = formData.get('discipline');
  if (discipline && !isDiscipline(discipline)) return { error: 'That discipline is not valid' };

  const { error } = await supabase.rpc('update_gymnast', {
    p_id: id,
    p_name: parsed.name,
    p_mso_id: mso_id || null,
    p_discipline: discipline || null,
  });

  if (error) return { error: error.message };

  revalidatePath('/gymnastics/account');
  revalidatePath('/gymnastics');
  return { success: true };
}

export async function deleteGymnast(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { error: 'Gymnast not found' };
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
