import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react';
import { createClient } from '@scoresquid/auth/server';
import { EVENT_SELECT, type EventDetail } from '@/features/archery/lib/events';
import { beResultUrl } from '@/features/archery/lib/betweenends/links';
import { computeEventStats, eventDate, setupLabel } from '@/features/archery/lib/stats';
import { formatDate, formatNumber, formatPercent } from '@/features/archery/lib/format';
import { Button } from '@scoresquid/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@scoresquid/ui/components/card';
import { ScorecardGrid } from '@/features/archery/components/scorecard-grid';
import { ArrowDistribution } from '@/features/archery/components/arrow-distribution';
import { EventActions } from '@/features/archery/components/event-actions';

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from('arch_events')
    .select(EVENT_SELECT)
    .eq('id', id)
    .single();
  if (!data) notFound();

  const event = data as unknown as EventDetail;
  const stats = computeEventStats(event);
  const rounds = [...event.rounds].sort((a, b) => a.round_number - b.round_number);

  let pdfUrl: string | null = null;
  if (event.source_path) {
    const { data: signed } = await supabase.storage
      .from('scorecards')
      .createSignedUrl(event.source_path, 60 * 10);
    pdfUrl = signed?.signedUrl ?? null;
  }

  // A ranking event has its own page on Between Ends; the event type is kept with the
  // user's search matches, which only they can read.
  let beUrl: string | null = null;
  if (event.be_event_id !== null && event.be_tournament_id !== null) {
    const { data: found } = await supabase
      .from('arch_be_search_matches')
      .select('event_type')
      .eq('event_id', event.be_event_id)
      .eq('aid', event.be_aid!)
      .limit(1);
    beUrl = beResultUrl({
      tournamentId: event.be_tournament_id,
      eventId: event.be_event_id,
      eventType: (found?.[0]?.event_type as string | undefined) ?? null,
    });
  }

  const tiles = [
    { label: 'Score', value: `${stats.total}`, sub: `of ${stats.maxScore}` },
    { label: 'Arrow average', value: formatNumber(stats.arrowAverage), sub: `${stats.arrowCount} arrows` },
    { label: 'Hit rate', value: formatPercent(stats.hitRate), sub: `${stats.misses} misses` },
    { label: 'Golds', value: `${stats.tens + stats.nines}`, sub: `${stats.tens} tens · ${stats.nines} nines` },
    { label: 'End average', value: formatNumber(stats.endAverage, 1), sub: `best ${stats.bestEnd} · worst ${stats.worstEnd}` },
    { label: 'Consistency', value: `±${formatNumber(stats.endStdDev, 1)}`, sub: 'spread of end scores' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/dashboard">
          <ArrowLeft className="mr-2 h-4 w-4" /> Scorecards
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">{event.name}</h2>
          <p className="text-sm text-muted-foreground">
            {formatDate(eventDate(event))}
            {event.venue && ` · ${event.venue}`}
          </p>
          <p className="text-sm text-muted-foreground">
            {[event.division, event.target && `Target ${event.target}`, event.session]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="text-sm font-medium">{setupLabel(event)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {beUrl && (
            <Button asChild variant="outline" size="sm">
              <a href={beUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> View on Between Ends
              </a>
            </Button>
          )}
          {pdfUrl && (
            <Button asChild variant="outline" size="sm">
              <a href={pdfUrl} target="_blank" rel="noreferrer">
                <FileText className="mr-2 h-4 w-4" /> Original PDF
              </a>
            </Button>
          )}
          <EventActions
            eventId={event.id}
            setup={{
              environment: (event.environment as 'indoor' | 'outdoor') ?? 'indoor',
              bow_style: event.bow_style,
              distance_m: event.distance_m != null ? Number(event.distance_m) : null,
              face_cm: event.face_cm,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t.label}</p>
              <p className="text-2xl font-bold tabular-nums">{t.value}</p>
              <p className="text-xs text-muted-foreground">{t.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Where the arrows landed</CardTitle>
        </CardHeader>
        <CardContent>
          <ArrowDistribution distribution={stats.distribution} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {rounds.map((round) => (
          <Card key={round.round_number}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Round {round.round_number}</CardTitle>
            </CardHeader>
            <CardContent>
              {round.ends.length > 0 ? (
                <ScorecardGrid round={round} bonusLabels={event.bonus_labels} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Total {round.total}. Between Ends has no arrows for this round.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {event.name_on_card && (
        <p className="text-xs text-muted-foreground">
          Imported from Between Ends · card issued to {event.name_on_card}
        </p>
      )}
    </div>
  );
}
