import { cn } from '@scoresquid/ui/lib/utils';
import { arrowSwatchStyle } from '@/features/archery/lib/arrow-colors';

/**
 * One arrow's score as a round chip. Its colors come from the `--arrow-*` variables
 * the archery layout sets for the user's arrow-color setting (see arrow-colors.ts):
 * standard matches the target face, detailed shades each ring and dots the X.
 */
export function ArrowChip({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const style = arrowSwatchStyle(value);
  return (
    <span
      className={cn(
        'relative inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
        !style && 'bg-muted',
        className,
      )}
      style={style ?? undefined}
    >
      {value}
      {value === 'X' && (
        <span
          aria-hidden="true"
          className="absolute -right-px -top-px h-2 w-2 rounded-full bg-foreground ring-[1.5px] ring-card"
          style={{ display: 'var(--arrow-x-dot, none)' }}
        />
      )}
    </span>
  );
}
