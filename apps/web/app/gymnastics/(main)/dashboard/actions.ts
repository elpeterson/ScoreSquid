'use server';

import { createClient } from '@scoresquid/auth/server';
import { COMPETITIONS_PAGE_SIZE } from '@/features/gymnastics/lib/constants';

export async function loadMoreCompetitions(gymnastId: string, offset: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('gym_competitions_with_scores')
    .select('*')
    .eq('athlete_id', gymnastId)
    .order('start_date', { ascending: false, nullsFirst: true })
    .order('created_at', { ascending: false })
    .range(offset, offset + COMPETITIONS_PAGE_SIZE - 1);

  if (error) return { error: 'Failed to load competitions' };
  return { data };
}
