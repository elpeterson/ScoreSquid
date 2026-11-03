import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@scoresquid/auth/server';
import { ensureActiveArcher } from '@/app/archery/actions/archer';
import { fetchArcherEvents } from '@/features/archery/lib/events';
import { isComparable } from '@/features/archery/lib/stats';
import { setupGroups, trendForSetup } from '@/features/archery/lib/stats';
import { Button } from '@scoresquid/ui/components/button';
import { Card, CardContent } from '@scoresquid/ui/components/card';
import { InsightsView } from '@/features/archery/components/insights-view';

export default async function InsightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const activeArcherId = await ensureActiveArcher();
  if (!activeArcherId) redirect('/dashboard');

  const { events: allEvents, error } = await fetchArcherEvents(supabase, activeArcherId);
  const events = allEvents.filter(isComparable);
  const leftOut = allEvents.length - events.length;
  if (error) {
    return <div className="p-8 text-red-500">Error loading scorecards.</div>;
  }

  const groups = setupGroups(events);
  const trends = Object.fromEntries(
    groups.map((g) => [g.key, trendForSetup(events, g.key)]),
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Insights</h2>
        <p className="text-muted-foreground mt-1">
          Scores are only compared within one setup: the same bow, indoor or
          outdoor, distance and face. Between Ends doesn&apos;t record distance or face, so a
          label says so when they&apos;re missing, and rounds shot at different distances, such
          as U13 and U15, can share a chart until you fill them in.
        </p>
        {leftOut > 0 && (
          <p className="text-sm text-muted-foreground mt-2">
            {leftOut === 1 ? '1 scorecard is' : `${leftOut} scorecards are`} left out because a
            round wasn&apos;t shot in full or its arrows aren&apos;t available. You can still see
            them on the dashboard.
          </p>
        )}
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <p className="text-muted-foreground">
              Import a few scorecards to see trends.
            </p>
            <Button asChild>
              <Link href="/import">Import scorecards</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <InsightsView groups={groups} trends={trends} />
      )}
    </div>
  );
}
