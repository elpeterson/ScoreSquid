import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@scoresquid/ui/components/card';
import { formatDate } from '@/lib/dates';
import {
  formatChange,
  formatScore,
  MIN_STEADY_SCORES,
  type BestScore,
  type GroupSummary,
  type ScoreSummary,
} from '@/features/gymnastics/lib/insights';

interface InsightsSummaryProps {
  summary: GroupSummary;
  /** The discipline's apparatus, in display order. */
  apparatus: { id: string; label: string }[];
}

// Literal class names, so Tailwind sees them: one column per tile on a desktop.
const DESKTOP_COLUMNS: Record<number, string> = {
  5: 'lg:grid-cols-5',
  7: 'lg:grid-cols-7',
};

/** Personal bests, the summary table, and strongest and steadiest (SQ-041). */
export function InsightsSummary({ summary, apparatus }: InsightsSummaryProps) {
  if (summary.scoredMeets === 0) return null;

  const labelOf = (id: string) => apparatus.find((a) => a.id === id)?.label ?? id;
  const lone = summary.scoredMeets === 1;
  const rows: { key: string; label: string; data: ScoreSummary }[] = [
    ...summary.apparatus
      .filter((a) => a.meets > 0)
      .map((a) => ({ key: a.apparatus, label: labelOf(a.apparatus), data: a })),
    { key: 'all_around', label: 'All-around', data: summary.allAround },
  ];

  return (
    <div className="space-y-6">
      {lone && (
        <p className="rounded-md border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          Here are this meet&rsquo;s scores. Comparisons need a second meet at this
          level and division.
        </p>
      )}

      <section aria-labelledby="personal-bests" className="space-y-3">
        <h3 id="personal-bests" className="text-lg font-semibold">
          {lone ? 'Scores' : 'Personal bests'}
        </h3>
        <div
          className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${
            DESKTOP_COLUMNS[apparatus.length + 1] ?? 'lg:grid-cols-4'
          }`}
        >
          {apparatus.map((a) => (
            <BestTile
              key={a.id}
              label={a.label}
              best={summary.apparatus.find((s) => s.apparatus === a.id)?.best ?? null}
              lone={lone}
            />
          ))}
          <BestTile
            label="All-around"
            best={summary.allAround.best}
            lone={lone}
            empty="Needs a meet with every event scored"
          />
        </div>
      </section>

      {!lone && (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>
              Every scored meet at this level and division. The all-around counts
              only meets with every event scored.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] tabular-nums sm:text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-2 sm:pr-3 font-medium">Apparatus</th>
                    <th scope="col" className="py-2 pl-2 sm:pl-3 text-right font-medium">Meets</th>
                    <th scope="col" className="py-2 pl-2 sm:pl-3 text-right font-medium">
                      <span className="sm:hidden">Avg</span>
                      <span className="hidden sm:inline">Average</span>
                    </th>
                    <th scope="col" className="py-2 pl-2 sm:pl-3 text-right font-medium">High</th>
                    <th scope="col" className="py-2 pl-2 sm:pl-3 text-right font-medium">
                      <abbr title="Latest score minus the first, in points" className="no-underline">
                        Change
                      </abbr>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ key, label, data }) => (
                    <tr
                      key={key}
                      className={
                        key === 'all_around' ? 'border-t font-semibold' : 'border-b last:border-b-0'
                      }
                    >
                      <th scope="row" className="whitespace-nowrap py-2 pr-2 sm:pr-3 text-left font-medium">
                        {label}
                      </th>
                      <td className="whitespace-nowrap py-2 pl-2 sm:pl-3 text-right">{data.meets}</td>
                      <td className="whitespace-nowrap py-2 pl-2 sm:pl-3 text-right">
                        {formatScore(data.average)}
                      </td>
                      <td className="whitespace-nowrap py-2 pl-2 sm:pl-3 text-right">
                        {formatScore(data.high)}
                      </td>
                      <td className="whitespace-nowrap py-2 pl-2 sm:pl-3 text-right">
                        {formatChange(data.change)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Tile
                label="Strongest"
                value={summary.strongest ? labelOf(summary.strongest.apparatus) : '—'}
                sub={
                  summary.strongest
                    ? `Highest average, ${formatScore(summary.strongest.average)}`
                    : undefined
                }
              />
              <Tile
                label="Most consistent"
                value={summary.steadiest ? labelOf(summary.steadiest.apparatus) : '—'}
                sub={
                  summary.steadiest
                    ? `Scores vary by ${formatScore(summary.steadiest.spread)} (standard deviation)`
                    : `Needs ${MIN_STEADY_SCORES} meets with a score on one apparatus`
                }
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BestTile({
  label,
  best,
  lone,
  empty = 'No score yet',
}: {
  label: string;
  best: BestScore | null;
  lone: boolean;
  empty?: string;
}) {
  if (!best) return <Tile label={label} value="—" sub={empty} />;
  // With one meet every tile is from the same meet, so its name says nothing new.
  const sub = lone
    ? undefined
    : `${best.competitionName} · ${formatDate(best.date)}`;
  return <Tile label={label} value={formatScore(best.value)} sub={sub} />;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {sub && (
          <p className="truncate text-xs text-muted-foreground" title={sub}>
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
