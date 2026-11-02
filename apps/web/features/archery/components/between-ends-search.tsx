'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@scoresquid/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@scoresquid/ui/components/card';
import { cancelBeSearch, getBeSearch, startBeSearch, type BeSearchView } from '@/app/archery/actions/between-ends';
import { updateArcher } from '@/app/archery/actions/archer';
import {
  canGoBackToStart,
  defaultSearchFrom,
  isActive,
  progressPercent,
  splitMatches,
  type SearchMatch,
} from '@/features/archery/lib/betweenends/search-view';
import { formatDate } from '@/lib/dates';
import { ArcherDetailsFields, ArcherSaveError } from './archer-details-fields';

const POLL_MS = 5000;

type Archer = {
  id: string;
  name: string;
  membership_number: string | null;
  competition_start_date: string | null;
};

export function BetweenEndsSearch({
  archer,
  initial,
  lastFinishedTo,
}: {
  archer: Archer;
  initial: BeSearchView | null;
  lastFinishedTo: string | null;
}) {
  const hasDetails = !!archer.membership_number && !!archer.competition_start_date;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" aria-hidden="true" />
          Search Between Ends
        </CardTitle>
        <CardDescription>
          Find the tournaments where {archer.name}&apos;s membership number appears. Nothing is
          added to your account by searching.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasDetails ? (
          <SearchPanel archer={archer} initial={initial} lastFinishedTo={lastFinishedTo} />
        ) : (
          <DetailsForm archer={archer} />
        )}
      </CardContent>
    </Card>
  );
}

/** Asks for what a search needs, and saves it to the archer's profile. */
function DetailsForm({ archer }: { archer: Archer }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [existingArcherId, setExistingArcherId] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      action={(formData) =>
        startTransition(async () => {
          const result = await updateArcher(archer.id, formData);
          setError(result.error ?? null);
          setExistingArcherId(result.existingArcherId);
          if (!result.error) router.refresh();
        })
      }
    >
      <p className="text-sm text-muted-foreground">
        A search needs {archer.name}&apos;s membership number and the date they began competing.
        These are saved to their profile.
      </p>
      <input type="hidden" name="name" value={archer.name} />
      <ArcherDetailsFields
        required
        membershipNumber={archer.membership_number}
        competitionStartDate={archer.competition_start_date}
      />
      <ArcherSaveError error={error} existingArcherId={existingArcherId} />
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save and continue'}
      </Button>
    </form>
  );
}

function SearchPanel({
  archer,
  initial,
  lastFinishedTo,
}: {
  archer: Archer;
  initial: BeSearchView | null;
  lastFinishedTo: string | null;
}) {
  const [view, setView] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const search = view?.search ?? null;
  const active = !!search && isActive(search.status);
  const searchId = search?.id;

  // Keeps going without this page: returning to it picks the search up again.
  useEffect(() => {
    if (!active || !searchId) return;
    const timer = setInterval(async () => {
      const next = await getBeSearch(searchId).catch(() => null);
      if (next) setView(next);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, searchId]);

  const lastTo = search?.status === 'finished' ? search.to_date : lastFinishedTo;
  const from = defaultSearchFrom(archer.competition_start_date, lastTo);

  const begin = (fromDate: string) =>
    startTransition(async () => {
      setError(null);
      const started = await startBeSearch(archer.id, fromDate);
      if (started.error || !started.searchId) {
        setError(started.error ?? 'Could not start the search');
        return;
      }
      setView(await getBeSearch(started.searchId));
    });

  const cancel = () =>
    startTransition(async () => {
      if (!searchId) return;
      const result = await cancelBeSearch(searchId);
      if (result.error) setError(result.error);
      setView(await getBeSearch(searchId));
    });

  return (
    <div className="space-y-4">
      {view && search && <SearchStatusLine view={view} onCancel={cancel} pending={pending} />}

      {!active && from && (
        <div className="flex flex-wrap items-center gap-2">
          {search?.status === 'failed' ? (
            <Button onClick={() => begin(search.from_date)} disabled={pending}>
              Try again
            </Button>
          ) : (
            <Button onClick={() => begin(from)} disabled={pending}>
              Search from {formatDate(from)}
            </Button>
          )}
          {search?.status !== 'failed' && canGoBackToStart(archer.competition_start_date, from) && (
            <Button
              variant="outline"
              onClick={() => begin(archer.competition_start_date!)}
              disabled={pending}
            >
              Go back to {formatDate(archer.competition_start_date!)}
            </Button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {view && <MatchLists matches={view.matches} />}
    </div>
  );
}

function SearchStatusLine({
  view,
  onCancel,
  pending,
}: {
  view: BeSearchView;
  onCancel: () => void;
  pending: boolean;
}) {
  const { search, matches } = view;

  if (isActive(search.status)) {
    const percent = progressPercent(search.tournaments_done, search.tournaments_total);
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">
          {search.status === 'queued'
            ? 'Waiting for other searches to finish…'
            : percent === null
              ? 'Starting…'
              : `Read ${search.tournaments_done} of ${search.tournaments_total} tournaments`}
        </p>
        {search.status === 'running' && percent !== null && (
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Search progress"
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          This can take a while. You can leave this page: the search keeps going, and you can come
          back to it here.
        </p>
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          Cancel search
        </Button>
      </div>
    );
  }

  if (search.status === 'failed') {
    return (
      <p role="alert" className="text-sm text-destructive">
        Between Ends isn&apos;t answering, so this search stopped. Your saved scorecards are
        unaffected, and trying again picks up what was already read.
      </p>
    );
  }

  if (search.status === 'cancelled') {
    return <p className="text-sm text-muted-foreground">You cancelled this search.</p>;
  }

  if (matches.length === 0) {
    return (
      <p className="text-sm">
        Nothing found between {formatDate(search.from_date)} and {formatDate(search.to_date)}. If
        you have a scorecard PDF from a tournament, you can import it below.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Searched {formatDate(search.from_date)} to {formatDate(search.to_date)}.
    </p>
  );
}

function MatchLists({ matches }: { matches: SearchMatch[] }) {
  const { confirmed, possible } = splitMatches(matches);
  return (
    <>
      {confirmed.length > 0 && (
        <section aria-label="Tournaments found" className="space-y-2">
          <h3 className="text-sm font-semibold">Tournaments found</h3>
          <MatchList matches={confirmed} />
        </section>
      )}
      {possible.length > 0 && (
        <section aria-label="Possible matches" className="space-y-2">
          <h3 className="text-sm font-semibold">Possible matches</h3>
          <p className="text-xs text-muted-foreground">
            The organiser left the membership number blank for these, so they only match by name
            and may be someone else.
          </p>
          <MatchList matches={possible} />
        </section>
      )}
    </>
  );
}

function MatchList({ matches }: { matches: SearchMatch[] }) {
  return (
    <ul className="divide-y rounded-md border">
      {matches.map((m) => (
        <li key={`${m.event_id}-${m.aid}`} className="flex items-center justify-between gap-4 p-3 text-sm">
          <div className="min-w-0">
            <p className="font-medium break-words">{m.tournament_name}</p>
            <p className="text-muted-foreground">
              {formatDate(m.tournament_date)}
              {m.division ? ` · ${m.division}` : ''}
            </p>
          </div>
          <span className="shrink-0 font-semibold tabular-nums">{m.total ?? '—'}</span>
        </li>
      ))}
    </ul>
  );
}
