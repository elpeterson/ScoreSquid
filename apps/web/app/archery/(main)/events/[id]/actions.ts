'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@scoresquid/auth/server';

const EventId = z.string().uuid();

const SetupSchema = z.object({
  environment: z.enum(['indoor', 'outdoor']),
  bow_style: z.string().min(1).max(50).nullable(),
  distance_m: z.number().positive().nullable(),
  face_cm: z.number().int().positive().nullable(),
});

export async function updateEventSetup(
  id: string,
  setup: z.infer<typeof SetupSchema>,
) {
  const parsed = SetupSchema.safeParse(setup);
  if (!parsed.success || !EventId.safeParse(id).success) return { error: 'Invalid setup' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('arch_events')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { error: error.message };

  revalidatePath(`/archery/events/${id}`);
  revalidatePath('/archery/dashboard');
  revalidatePath('/archery/insights');
  return { success: true };
}

export async function deleteEvent(id: string) {
  if (!EventId.safeParse(id).success) return { error: 'Invalid event' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: event } = await supabase
    .from('arch_events')
    .select('source_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  const { error } = await supabase
    .from('arch_events')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return { error: error.message };

  if (event?.source_path) {
    await supabase.storage.from('scorecards').remove([event.source_path]);
  }

  revalidatePath('/archery/dashboard');
  revalidatePath('/archery/insights');
  redirect('/dashboard');
}
