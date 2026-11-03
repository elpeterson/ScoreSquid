import { ARROW_ORDER } from '@/features/archery/lib/stats';
import { arrowSwatchStyle } from '@/features/archery/lib/arrow-colors';

/** Horizontal bars, one per score value, in the user's arrow colors. */
export function ArrowDistribution({
  distribution,
}: {
  distribution: Record<string, number>;
}) {
  // Hide X unless it was used (indoor cards don't score Xs).
  const values = ARROW_ORDER.filter((v) => v !== 'X' || distribution.X > 0);
  const max = Math.max(1, ...values.map((v) => distribution[v] ?? 0));
  const total = values.reduce((s, v) => s + (distribution[v] ?? 0), 0);

  return (
    <div className="space-y-1">
      {values.map((v) => {
        const count = distribution[v] ?? 0;
        return (
          <div key={v} className="flex items-center gap-2 text-xs">
            <span className="w-5 text-right font-medium tabular-nums">{v}</span>
            <div className="h-4 flex-1 rounded-sm bg-muted/50">
              <div
                className="h-4 rounded-sm"
                style={{ ...arrowSwatchStyle(v), width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="w-14 text-right tabular-nums text-muted-foreground">
              {count}
              {total > 0 && count > 0 && (
                <span className="ml-1 opacity-70">
                  {Math.round((count / total) * 100)}%
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
