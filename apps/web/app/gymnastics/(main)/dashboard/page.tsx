import { createClient } from '@scoresquid/auth/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@scoresquid/ui/components/button';
import { ensureActiveGymnast } from '@/app/gymnastics/actions/gymnast';
import { CloudDownload, LineChart } from 'lucide-react';
import { CompetitionList } from '@/features/gymnastics/components/competition-list';
import { COMPETITIONS_PAGE_SIZE } from '@/features/gymnastics/lib/constants';

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const activeGymnastId = await ensureActiveGymnast();

  if (!activeGymnastId) {
    return (
      <div className="max-w-xl mx-auto text-center py-16 space-y-3">
        <h2 className="text-2xl font-bold">Welcome to ScoreSquid Gymnastics</h2>
        <p className="text-muted-foreground">
          Start by adding a gymnast with the switcher in the header, then add
          or import their scores.
        </p>
      </div>
    );
  }

  const { data: gymnast } = await supabase
    .from('gymnast_athletes')
    .select('discipline')
    .eq('id', activeGymnastId)
    .single();

  const { data: competitions, error, count } = await supabase
    .from('gym_competitions_with_scores')
    .select('*', { count: 'exact' })
    .eq('athlete_id', activeGymnastId)
    .order('start_date', { ascending: false, nullsFirst: true })
    .order('created_at', { ascending: false })
    .range(0, COMPETITIONS_PAGE_SIZE - 1);

  if (error) {
    return <div className="p-8 text-red-500">Error loading scores.</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl font-bold tracking-tight">Score History</h2>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/insights">
              <LineChart className="mr-2 h-4 w-4" />
              Insights
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/import">
              <CloudDownload className="mr-2 h-4 w-4" />
              Import
            </Link>
          </Button>
          <Button asChild>
            <Link href="/scores/new">Add Score</Link>
          </Button>
        </div>
      </div>

      <CompetitionList
        competitions={competitions || []}
        discipline={gymnast?.discipline || 'MAG'}
        gymnastId={activeGymnastId!}
        hasMore={(count ?? 0) > COMPETITIONS_PAGE_SIZE}
      />
    </div>
  );
}
