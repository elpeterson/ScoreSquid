import { redirect } from 'next/navigation';
import { createClient } from '@scoresquid/auth/server';
import { ensureActiveArcher } from '@/app/archery/actions/archer';
import { getLatestBeSearch } from '@/app/archery/actions/between-ends';
import { BetweenEndsSearch } from '@/features/archery/components/between-ends-search';
import { ScorecardImport, type SetupDefaults } from '@/features/archery/components/scorecard-import';

export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const activeArcherId = await ensureActiveArcher();
  if (!activeArcherId) redirect('/dashboard');

  const [{ data: archer }, { data: events }, latestSearch] = await Promise.all([
    supabase
      .from('archer_athletes')
      .select('id, name, membership_number, competition_start_date')
      .eq('id', activeArcherId)
      .single(),
    supabase
      .from('arch_events')
      .select('environment, bow_style, distance_m, face_cm, source_hash, shot_on')
      .eq('athlete_id', activeArcherId)
      .order('shot_on', { ascending: false, nullsFirst: false }),
    getLatestBeSearch(activeArcherId),
  ]);

  // Prefill distance/face from the most recent event with the same
  // indoor/outdoor + bow style, since the scorecard doesn't say.
  const setupDefaults: SetupDefaults = {};
  for (const e of events ?? []) {
    const key = `${e.environment}|${e.bow_style}`;
    if (!setupDefaults[key]) {
      setupDefaults[key] = {
        distance_m: e.distance_m != null ? Number(e.distance_m) : null,
        face_cm: e.face_cm,
      };
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Import scorecards</h2>
        <p className="text-muted-foreground mt-1">
          Search Between Ends for{' '}
          <span className="font-medium text-foreground">{archer?.name}</span>, or add
          scorecard PDFs. PDFs are read in your browser, checked end by end, and the
          original is kept with the score.
        </p>
      </div>
      <BetweenEndsSearch
        key={archer!.id}
        archer={archer!}
        initial={latestSearch.view}
        lastFinishedTo={latestSearch.lastFinishedTo}
      />
      <ScorecardImport
        archer={archer!}
        userId={user.id}
        setupDefaults={setupDefaults}
        existingHashes={(events ?? [])
          .map((e) => e.source_hash)
          .filter((h): h is string => !!h)}
      />
    </div>
  );
}
