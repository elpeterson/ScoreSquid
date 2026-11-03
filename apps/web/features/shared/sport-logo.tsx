import Image from 'next/image';
import mark from '@scoresquid/ui/brand/scoresquid-mark.svg';
import markWhite from '@scoresquid/ui/brand/scoresquid-mark-white.svg';
import { cn } from '@scoresquid/ui/lib/utils';

// In features/ because Tailwind only generates classes it finds in features/ and app/.

/** Which mark suits the background: `auto` follows the theme. */
type Tone = 'dark' | 'white' | 'auto';

const WIDTH = 120;
const HEIGHT = 194;

/**
 * The ScoreSquid mark and the sport's name. The image's alt supplies "ScoreSquid", so
 * a screen reader hears "ScoreSquid Archery". With `compact`, phones show only the
 * mark, and the sport's name is still read out.
 */
export function SportLogo({
  sport,
  tone = 'auto',
  compact = false,
  className,
  markClassName = 'h-8 w-auto',
}: {
  sport: 'Archery' | 'Gymnastics';
  tone?: Tone;
  compact?: boolean;
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 align-middle', className)}>
      {tone !== 'white' && (
        <Image
          src={mark}
          alt="ScoreSquid"
          width={WIDTH}
          height={HEIGHT}
          className={cn(markClassName, tone === 'auto' && 'dark:hidden')}
        />
      )}
      {tone !== 'dark' && (
        <Image
          src={markWhite}
          alt="ScoreSquid"
          width={WIDTH}
          height={HEIGHT}
          className={cn(markClassName, tone === 'auto' && 'hidden dark:block')}
        />
      )}
      <span className={compact ? 'sr-only md:not-sr-only' : undefined}>{sport}</span>
    </span>
  );
}
