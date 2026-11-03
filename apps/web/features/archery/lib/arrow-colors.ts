import { ARROW_ORDER, type Arrow } from '@/features/archery/lib/stats';

/**
 * Colors for arrow chips and distribution bars (SQ-037).
 *
 * Standard matches the target face: one color per ring, as the `--face-*` tokens in
 * the archery globals.css. Detailed keeps each ring's color but gives the higher score
 * the darker shade and the lower score the lighter one; X shares the 10's shade and
 * adds a dot. Every number meets WCAG AA (4.5:1) on its chip in both themes.
 *
 * The page gets these as CSS variables (`arrowPaletteCss`), so chips follow the setting
 * without knowing it. "Where the arrows landed" uses the `--face-*` tokens instead and
 * always groups by target color.
 */

export type ArrowColorMode = 'standard' | 'detailed';
export type ColorTheme = 'light' | 'dark';

export type Swatch = {
  bg: string;
  fg: string;
  /** A 1px inset outline that keeps light shades visible on the page. */
  outline?: string;
};

export type Palette = Record<Arrow, Swatch>;

const BLACK = '#000000';
const WHITE = '#FFFFFF';
// The standard white ring is outlined in the theme's border color, as before.
const BORDER = 'hsl(var(--border))';

function pairs(entries: [Arrow[], Swatch][]): Palette {
  const out = {} as Palette;
  for (const [values, swatch] of entries) for (const v of values) out[v] = swatch;
  return out;
}

export const ARROW_PALETTES: Record<ArrowColorMode, Record<ColorTheme, Palette>> = {
  standard: {
    light: pairs([
      [['X', '10', '9'], { bg: '#FACC14', fg: BLACK }],
      [['8', '7'], { bg: '#E42525', fg: WHITE }],
      // Black numbers on blue: white was 3.6:1, under AA.
      [['6', '5'], { bg: '#128CE2', fg: BLACK }],
      [['4', '3'], { bg: '#24272E', fg: WHITE }],
      [['2', '1'], { bg: '#FFFFFF', fg: BLACK, outline: BORDER }],
      [['M'], { bg: '#AEB6C2', fg: '#1F2A26' }],
    ]),
    dark: pairs([
      [['X', '10', '9'], { bg: '#FBCF23', fg: BLACK }],
      // Black numbers on red and blue: white was 3.8:1 and 2.6:1.
      [['8', '7'], { bg: '#EB4747', fg: BLACK }],
      [['6', '5'], { bg: '#3DA8F5', fg: BLACK }],
      [['4', '3'], { bg: '#454A54', fg: WHITE }],
      [['2', '1'], { bg: '#EBEBEB', fg: BLACK }],
      [['M'], { bg: '#5C6470', fg: WHITE }],
    ]),
  },
  detailed: {
    light: pairs([
      [['X', '10'], { bg: '#EAB308', fg: BLACK }],
      [['9'], { bg: '#FDE68A', fg: BLACK, outline: '#EAB308' }],
      [['8'], { bg: '#B91C1C', fg: WHITE }],
      [['7'], { bg: '#FCA5A5', fg: BLACK, outline: '#B91C1C' }],
      [['6'], { bg: '#0B5C9E', fg: WHITE }],
      [['5'], { bg: '#93C5FD', fg: BLACK, outline: '#0B5C9E' }],
      [['4'], { bg: '#1F2430', fg: WHITE }],
      [['3'], { bg: '#566070', fg: WHITE }],
      [['2'], { bg: '#D9DDE3', fg: BLACK, outline: '#9CA3AF' }],
      [['1'], { bg: '#FFFFFF', fg: BLACK, outline: BORDER }],
      [['M'], { bg: '#AEB6C2', fg: '#1F2A26' }],
    ]),
    dark: pairs([
      [['X', '10'], { bg: '#EAB308', fg: BLACK }],
      [['9'], { bg: '#FDE68A', fg: BLACK }],
      [['8'], { bg: '#C81E1E', fg: WHITE }],
      [['7'], { bg: '#FCA5A5', fg: BLACK }],
      [['6'], { bg: '#1769B0', fg: WHITE }],
      [['5'], { bg: '#93C5FD', fg: BLACK }],
      [['4'], { bg: '#262B35', fg: WHITE, outline: '#6B7280' }],
      [['3'], { bg: '#5B6473', fg: WHITE }],
      [['2'], { bg: '#C3C9D2', fg: BLACK }],
      [['1'], { bg: '#F3F4F6', fg: BLACK }],
      [['M'], { bg: '#5C6470', fg: WHITE }],
    ]),
  },
};

/** The stored setting as a mode: only an explicit `true` turns detailed colors on. */
export function arrowColorMode(detailed: unknown): ArrowColorMode {
  return detailed === true ? 'detailed' : 'standard';
}

/** The CSS-variable name stem for a value: `x`, `10` … `1`, `m`; null if unknown. */
export function arrowVarKey(value: string): string | null {
  return (ARROW_ORDER as string[]).includes(value) ? value.toLowerCase() : null;
}

function declarations(mode: ArrowColorMode, theme: ColorTheme): string {
  const palette = ARROW_PALETTES[mode][theme];
  const decls = ARROW_ORDER.map((v) => {
    const k = arrowVarKey(v)!;
    const s = palette[v];
    return `--arrow-${k}-bg:${s.bg};--arrow-${k}-fg:${s.fg};--arrow-${k}-outline:${s.outline ?? 'transparent'};`;
  });
  decls.push(`--arrow-x-dot:${mode === 'detailed' ? 'block' : 'none'};`);
  return decls.join('');
}

/**
 * The CSS that sets the arrow variables for `mode`, light under `:root` and dark under
 * `.dark` (next-themes puts the class on <html>). With `scope`, the rules apply only
 * inside elements matching it, as for a preview of the other mode.
 */
export function arrowPaletteCss(mode: ArrowColorMode, scope?: string): string {
  const light = scope ? `:root ${scope}` : ':root';
  const dark = scope ? `.dark ${scope}` : '.dark';
  return `${light}{${declarations(mode, 'light')}}${dark}{${declarations(mode, 'dark')}}`;
}

/** Inline style for a chip or bar of `value`, read from the variables; null if unknown. */
export function arrowSwatchStyle(
  value: string,
): { backgroundColor: string; color: string; boxShadow: string } | null {
  const k = arrowVarKey(value);
  if (!k) return null;
  return {
    backgroundColor: `var(--arrow-${k}-bg)`,
    color: `var(--arrow-${k}-fg)`,
    boxShadow: `inset 0 0 0 1px var(--arrow-${k}-outline)`,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio between two `#RRGGBB` colors, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
