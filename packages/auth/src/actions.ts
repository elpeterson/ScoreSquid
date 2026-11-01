// No 'use server' here on purpose: these become public endpoints only when an
// app wraps them in its own 'use server' file. See the README.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from './server';
import { parseSettingUpdate } from './settings';

export type ActionResult = { error?: string; success?: boolean };

const MIN_PASSWORD_LENGTH = 6;

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
};

export async function signIn(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: field(formData, 'email'),
    password: field(formData, 'password'),
  });
  if (error) return { error: error.message };

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function signUp(
  formData: FormData,
  origin: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: field(formData, 'email'),
    password: field(formData, 'password'),
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/account`,
    },
  });
  return error ? { error: error.message } : { success: true };
}

export async function requestPasswordReset(
  formData: FormData,
  origin: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    field(formData, 'email'),
    {
      redirectTo: `${origin}/auth/callback?next=/account&type=recovery`,
    },
  );
  return error ? { error: error.message } : { success: true };
}

export async function changePassword(formData: FormData): Promise<ActionResult> {
  const password = field(formData, 'password');
  if (password !== field(formData, 'confirm_password')) {
    return { error: 'Passwords do not match' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  revalidatePath('/account');
  return { success: true };
}

/** The signed-in user's settings, or `defaults`. `defaults` names the columns to read. */
export async function readUserSettings<T extends object>(
  defaults: T,
  table = 'user_settings',
): Promise<T> {
  // Public pages render without Supabase configured (Score Quiver's local POC).
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return defaults;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return defaults;

  const { data } = await supabase
    .from(table)
    .select(Object.keys(defaults).join(', '))
    .eq('user_id', user.id)
    .single();

  return data ? (data as unknown as T) : defaults;
}

export async function writeUserSetting<T extends object>(
  key: unknown,
  value: unknown,
  defaults: T,
  table = 'user_settings',
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const update = parseSettingUpdate(key, value, defaults);
  if (!update) return { error: 'Invalid setting' };

  const { error } = await supabase.from(table).upsert(
    { ...update, user_id: user.id, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) return { error: error.message };

  revalidatePath('/', 'layout');
  return { success: true };
}
