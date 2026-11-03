'use server';

import { createClient } from '@scoresquid/auth/server';
import { COMPETITIONS_PAGE_SIZE } from '@/features/gymnastics/lib/constants';
import { isUuid } from '@/lib/validation';

export async function loadMoreCompetitions(gymnastId: string, offset: number) {
  if (!isUuid(gymnastId) || !Number.isInteger(offset) || offset < 0) return { error: 'Failed to load competitions' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('gym_competitions_with_scores')
    .select('*')
    .eq('athlete_id', gymnastId)
    .eq('user_id', user.id)
    .order('start_date', { ascending: false, nullsFirst: true })
    .order('created_at', { ascending: false })
    .range(offset, offset + COMPETITIONS_PAGE_SIZE - 1);

  if (error) return { error: 'Failed to load competitions' };
  return { data };
}
