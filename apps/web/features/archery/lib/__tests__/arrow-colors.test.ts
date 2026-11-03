import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  ARROW_PALETTES,
  arrowColorMode,
  arrowPaletteCss,
  arrowSwatchStyle,
  arrowVarKey,
  contrastRatio,
  type ArrowColorMode,
  type ColorTheme,
} from '../arrow-colors';
import { ARROW_ORDER, RING_OF, RINGS } from '../stats';

const MODES: ArrowColorMode[] = ['standard', 'detailed'];
const THEMES: ColorTheme[] = ['light', 'dark'];

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (
    '#' +
    [f(0), f(8), f(4)]
      .map((v) => Math.round(v * 255).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function hexToHsl(hex: string): { h: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, l: ((max + min) / 2) * 100 };
}

/** The `--face-*` tokens in the archery theme, as hex, for each theme. */
function faceTokens(): Record<ColorTheme, Record<string, string>> {
  const css = readFileSync(join(__dirname, '../../../../app/archery/globals.css'), 'utf8');
  const darkAt = css.indexOf('.dark');
  const read = (block: string) =>
    Object.fromEntries(
      [...block.matchAll(/--face-(\w+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)].map((m) => [
        m[1],
        hslToHex(Number(m[2]), Number(m[3]), Number(m[4])),
      ]),
    );
  return { light: read(css.slice(0, darkAt)), dark: read(css.slice(darkAt)) };
}

const isHex = (c: string) => /^#[0-9A-F]{6}$/i.test(c);

describe('ARROW_PALETTES', () => {
  it('colors every value in every mode and theme', () => {
    for (const mode of MODES)
      for (const theme of THEMES)
        for (const v of ARROW_ORDER) {
          const s = ARROW_PALETTES[mode][theme][v];
          expect(isHex(s.bg) && isHex(s.fg), `${mode} ${theme} ${v}`).toBe(true);
        }
  });

  it('meets WCAG AA for every number, in both views and themes', () => {
    for (const mode of MODES)
      for (const theme of THEMES)
        for (const v of ARROW_ORDER) {
          const { bg, fg } = ARROW_PALETTES[mode][theme][v];
          expect(contrastRatio(bg, fg), `${mode} ${theme} ${v}`).toBeGreaterThanOrEqual(4.5);
        }
  });

  it('keeps Standard on the target-face colors', () => {
    const face = faceTokens();
    for (const theme of THEMES)
      for (const v of ARROW_ORDER) {
        const ring = RING_OF[v]!;
        expect(ARROW_PALETTES.standard[theme][v].bg, `${theme} ${v}`).toBe(face[theme][ring]);
      }
  });

  it('gives each value in a ring its own shade in Detailed, X apart', () => {
    for (const theme of THEMES) {
      const p = ARROW_PALETTES.detailed[theme];
      for (const ring of RINGS) {
        const shades = ARROW_ORDER.filter((v) => v !== 'X' && RING_OF[v] === ring).map(
          (v) => p[v].bg,
        );
        expect(new Set(shades).size, `${theme} ${ring}`).toBe(shades.length);
      }
      // X shares the 10's shade and is told apart by its dot.
      expect(p.X).toEqual(p['10']);
      expect(arrowPaletteCss('detailed')).toContain('--arrow-x-dot:block');
    }
  });

  it('keeps Detailed shades recognisably in their ring color', () => {
    const hue: Record<string, number> = { gold: 48, red: 0, blue: 205 };
    for (const theme of THEMES)
      for (const v of ARROW_ORDER) {
        const ring = RING_OF[v]!;
        const { h, l } = hexToHsl(ARROW_PALETTES.detailed[theme][v].bg);
        if (ring in hue) {
          const off = Math.min(Math.abs(h - hue[ring]!), 360 - Math.abs(h - hue[ring]!));
          expect(off, `${theme} ${v} hue`).toBeLessThanOrEqual(10);
        }
        if (ring === 'black') expect(l, `${theme} ${v}`).toBeLessThan(45);
        if (ring === 'white') expect(l, `${theme} ${v}`).toBeGreaterThan(78);
      }
  });

  it('gives the higher score the darker shade in Detailed', () => {
    const pairs = [['10', '9'], ['8', '7'], ['6', '5'], ['4', '3'], ['2', '1']] as const;
    for (const theme of THEMES)
      for (const [hi, lo] of pairs) {
        const p = ARROW_PALETTES.detailed[theme];
        expect(hexToHsl(p[hi].bg).l, `${theme} ${hi} vs ${lo}`).toBeLessThan(hexToHsl(p[lo].bg).l);
      }
  });
});

describe('arrowColorMode', () => {
  it('is detailed only for an explicit true', () => {
    expect(arrowColorMode(true)).toBe('detailed');
    for (const v of [false, undefined, null, 'true', 1]) expect(arrowColorMode(v)).toBe('standard');
  });
});

describe('arrowVarKey', () => {
  it('names known values and rejects the rest', () => {
    expect(arrowVarKey('X')).toBe('x');
    expect(arrowVarKey('10')).toBe('10');
    expect(arrowVarKey('M')).toBe('m');
    expect(arrowVarKey('11')).toBeNull();
    expect(arrowVarKey('')).toBeNull();
  });
});

describe('arrowPaletteCss', () => {
  it('sets light under :root and dark under .dark', () => {
    const css = arrowPaletteCss('standard');
    expect(css.startsWith(':root{')).toBe(true);
    expect(css).toContain('}.dark{');
    expect(css).toContain('--arrow-6-fg:#000000');
    expect(css).toContain('--arrow-x-dot:none');
    expect(css).toContain('--arrow-1-outline:hsl(var(--border))');
    expect(css).toContain('--arrow-10-outline:transparent');
  });

  it('scopes the rules when asked', () => {
    const css = arrowPaletteCss('detailed', '[data-arrow-colors="detailed"]');
    expect(css.startsWith(':root [data-arrow-colors="detailed"]{')).toBe(true);
    expect(css).toContain('.dark [data-arrow-colors="detailed"]{');
  });
});

describe('arrowSwatchStyle', () => {
  it('reads the variables for a value', () => {
    expect(arrowSwatchStyle('9')).toEqual({
      backgroundColor: 'var(--arrow-9-bg)',
      color: 'var(--arrow-9-fg)',
      boxShadow: 'inset 0 0 0 1px var(--arrow-9-outline)',
    });
    expect(arrowSwatchStyle('?')).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('matches WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });
});
