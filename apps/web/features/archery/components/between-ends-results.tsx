'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@scoresquid/ui/components/button';
import {
  importBeResults,
  resolveBeChange,
  type BeResult,
  type ImportOutcome,
} from '@/app/archery/actions/between-ends';
import { defaultSetup, type Setup, type SetupDefaults } from '@/features/archery/lib/betweenends/import-plan';
import { formatDate } from '@/lib/dates';
import { ScorecardSetupFields } from './scorecard-setup-fields';

/** Only a result that is certainly the archer's, and new, starts ticked. */
const startsTicked = (r: BeResult) => r.match_kind === 'number' && r.relation.kind === 'new' && !r.problem;
const canTick = (r: BeResult) => !r.problem && (r.relation.kind === 'new' || r.relation.kind === 'maybe-imported');

export function BetweenEndsResults({
  athleteId,
  archerName,
  results,
  setupDefaults,
  onChanged,
}: {
  athleteId: string;
  archerName: string;
  results: BeResult[];
  setupDefaults: SetupDefaults;
  onChanged: () => Promise<void>;
}) {
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [setups, setSetups] = useState<Record<string, Setup>>({});
  const [outcomes, setOutcomes] = useState<Record<string, ImportOutcome>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ticked = (r: BeResult) => canTick(r) && (ticks[r.key] ?? startsTicked(r));
  const setupFor = (r: BeResult) =>
    setups[r.key] ?? defaultSetup(r.arrows_per_end, r.division_code, setupDefaults);
  const chosen = results.filter(ticked);

  const numberResults = results.filter((r) => r.match_kind === 'number');
  const possible = results.filter((r) => r.match_kind === 'name');

  const importChosen = () =>
    startTransition(async () => {
      setError(null);
      const { error: failed, outcomes: done } = await importBeResults({
        athleteId,
        items: chosen.map((r) => {
          const s = setupFor(r);
          const distance = Number(s.distance);
          const face = Number(s.face);
          return {
            event_id: r.event_id,
            aid: r.aid,
            confirmed: true,
            setup: {
              environment: s.environment,
              bow_style: s.bowStyle || null,
              distance_m: distance > 0 ? distance : null,
              face_cm: Number.isInteger(face) && face > 0 ? face : null,
            },
          };
        }),
      });
      if (failed) setError(failed);
      setOutcomes(Object.fromEntries((done ?? []).map((o) => [o.key, o])));
      setTicks({});
      await onChanged();
    });

  const resolve = (r: BeResult, choice: 'accept' | 'keep') =>
    startTransition(async () => {
      setError(null);
      const result = await resolveBeChange({ athleteId, event_id: r.event_id, aid: r.aid, choice });
      if (result.error) setError(result.error);
      await onChanged();
    });

  const row = (r: BeResult) => (
    <ResultRow
      key={r.key}
      result={r}
      archerName={archerName}
      ticked={ticked(r)}
      setup={setupFor(r)}
      outcome={outcomes[r.key]}
      pending={pending}
      onTick={(on) => setTicks({ ...ticks, [r.key]: on })}
      onSetup={(s) => setSetups({ ...setups, [r.key]: s })}
      onResolve={(choice) => resolve(r, choice)}
    />
  );

  if (results.length === 0) return null;

  return (
    <div className="space-y-4">
      {numberResults.length > 0 && (
        <section aria-label="Tournaments found" className="space-y-2">
          <h3 className="text-sm font-semibold">Tournaments found</h3>
          <ul className="divide-y rounded-md border">{numberResults.map(row)}</ul>
        </section>
      )}
      {possible.length > 0 && (
        <section aria-label="Possible matches" className="space-y-2">
          <h3 className="text-sm font-semibold">Possible matches</h3>
          <p className="text-xs text-muted-foreground">
            The organiser left the membership number blank for these, so they only match by name and
            may be someone else. Tick one only if it is {archerName}.
          </p>
          <ul className="divide-y rounded-md border">{possible.map(row)}</ul>
        </section>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {results.some(canTick) && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={importChosen} disabled={pending || chosen.length === 0 || chosen.length > 25}>
            {pending ? 'Importing…' : `Import ${chosen.length} selected`}
          </Button>
          <p className="text-xs text-muted-foreground">
            {chosen.length > 25
              ? 'Import up to 25 at a time.'
              : `Each becomes a scorecard for ${archerName}, with every arrow.`}
          </p>
        </div>
      )}
    </div>
  );
}

function ResultRow({
  result: r,
  archerName,
  ticked,
  setup,
  outcome,
  pending,
  onTick,
  onSetup,
  onResolve,
}: {
  result: BeResult;
  archerName: string;
  ticked: boolean;
  setup: Setup;
  outcome?: ImportOutcome;
  pending: boolean;
  onTick: (on: boolean) => void;
  onSetup: (setup: Setup) => void;
  onResolve: (choice: 'accept' | 'keep') => void;
}) {
  const { relation } = r;
  const tickable = canTick(r);
  const inputId = `be-result-${r.key}`;

  return (
    <li className="space-y-3 p-3 text-sm">
      <div className="flex items-start gap-3">
        {tickable && (
          <input
            id={inputId}
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 accent-primary"
            checked={ticked}
            onChange={(e) => onTick(e.target.checked)}
            aria-label={
              r.match_kind === 'name'
                ? `${r.tournament_name} is ${archerName}`
                : `Import ${r.tournament_name}`
            }
          />
        )}
        <label htmlFor={tickable ? inputId : undefined} className="min-w-0 flex-1">
          <span className="block font-medium break-words">{r.tournament_name}</span>
          <span className="block text-muted-foreground">
            {formatDate(r.tournament_date)}
            {r.division ? ` · ${r.division}` : ''}
          </span>
        </label>
        <span className="shrink-0 font-semibold tabular-nums">{r.total ?? '—'}</span>
      </div>

      {(relation.kind === 'imported' || relation.kind === 'imported-pdf') && (
        <p className="text-xs text-muted-foreground">
          Already imported{relation.kind === 'imported-pdf' ? ' from a PDF' : ''}.{' '}
          <Link href={`/events/${relation.eventId}`} className="underline">
            View scorecard
          </Link>
        </p>
      )}

      {relation.kind === 'maybe-imported' && !r.problem && (
        <p className="text-xs text-muted-foreground">
          You may already have this: a{' '}
          <Link href={`/events/${relation.eventId}`} className="underline">
            scorecard from the same tournament
          </Link>{' '}
          has different details. Tick it only if this is a separate result.
        </p>
      )}

      {relation.kind === 'changed' && (
        <div className="space-y-2">
          <p className="text-xs">
            Between Ends has changed this result since you imported it: it now shows {relation.theirs}, and{' '}
            <Link href={`/events/${relation.eventId}`} className="underline">
              your scorecard
            </Link>{' '}
            shows {relation.yours}. Nothing changes unless you choose. Your setup is kept either way.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => onResolve('accept')}>
              Use Between Ends&apos; result
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => onResolve('keep')}>
              Keep mine
            </Button>
          </div>
        </div>
      )}

      {r.problem && <p className="text-xs text-muted-foreground">{r.problem}</p>}

      {ticked && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Confirm the setup. Between Ends doesn&apos;t record it.</p>
          <ScorecardSetupFields setup={setup} onChange={onSetup} />
        </div>
      )}

      {outcome?.status === 'failed' && (
        <p role="alert" className="text-xs text-destructive">
          {outcome.message}
        </p>
      )}
      {outcome?.status === 'skipped' && <p className="text-xs text-muted-foreground">{outcome.message}</p>}
    </li>
  );
}
