// The archery settings actions hand each key to the shared helpers with the right
// whitelist (SQ-037). The helpers' own validation is tested in packages/auth.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  reads: [] as object[],
  writes: [] as { key: unknown; value: unknown; defaults: object }[],
  rows: {} as Record<string, unknown>,
}));
vi.mock('@scoresquid/auth/actions', () => ({
  readUserSettings: async (defaults: object) => {
    h.reads.push(defaults);
    return Object.fromEntries(
      Object.entries(defaults).map(([k, v]) => [k, k in h.rows ? h.rows[k] : v]),
    );
  },
  writeUserSetting: async (key: unknown, value: unknown, defaults: object) => {
    h.writes.push({ key, value, defaults });
    return { success: true };
  },
}));

import { getUserSettings, updateSetting } from '@/app/archery/actions/settings';

beforeEach(() => {
  h.reads = [];
  h.writes = [];
  h.rows = {};
});

describe('getUserSettings', () => {
  it('defaults to the system theme and standard arrow colors', async () => {
    expect(await getUserSettings()).toEqual({ theme: 'system', detailed_arrow_colors: false });
  });

  it('reads the theme apart from the arrow colors', async () => {
    h.rows = { theme: 'dark', detailed_arrow_colors: true };
    expect(await getUserSettings()).toEqual({ theme: 'dark', detailed_arrow_colors: true });
    expect(h.reads).toEqual([{ theme: 'system' }, { detailed_arrow_colors: false }]);
  });
});

describe('updateSetting', () => {
  it('writes the theme against the theme whitelist only', async () => {
    await updateSetting('theme', 'dark');
    expect(h.writes).toEqual([{ key: 'theme', value: 'dark', defaults: { theme: 'system' } }]);
  });

  it('writes the arrow colors against the toggle whitelist only', async () => {
    await updateSetting('detailed_arrow_colors', true);
    expect(h.writes).toEqual([
      { key: 'detailed_arrow_colors', value: true, defaults: { detailed_arrow_colors: false } },
    ]);
  });
});
