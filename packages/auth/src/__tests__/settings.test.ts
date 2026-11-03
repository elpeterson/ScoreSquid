import { describe, it, expect } from 'vitest';
import { parseSettingUpdate } from '../settings';

const GYMNAST = { theme: 'system', show_start_values: false, show_placements: true };
const ARCHER = { theme: 'system' };

describe('parseSettingUpdate', () => {
  it('accepts known themes', () => {
    expect(parseSettingUpdate('theme', 'dark', GYMNAST)).toEqual({ theme: 'dark' });
    expect(parseSettingUpdate('theme', 'system', ARCHER)).toEqual({ theme: 'system' });
  });

  it('rejects unknown themes and wrong types', () => {
    expect(parseSettingUpdate('theme', 'neon', GYMNAST)).toBeNull();
    expect(parseSettingUpdate('theme', true, GYMNAST)).toBeNull();
    expect(parseSettingUpdate('show_placements', 'true', GYMNAST)).toBeNull();
  });

  it('accepts boolean toggles the app declares', () => {
    expect(parseSettingUpdate('show_start_values', true, GYMNAST)).toEqual({ show_start_values: true });
    expect(parseSettingUpdate('show_placements', false, GYMNAST)).toEqual({ show_placements: false });
  });

  it('accepts the archery arrow-color toggle only as a boolean', () => {
    const toggles = { detailed_arrow_colors: false };
    expect(parseSettingUpdate('detailed_arrow_colors', true, toggles)).toEqual({ detailed_arrow_colors: true });
    expect(parseSettingUpdate('detailed_arrow_colors', 'true', toggles)).toBeNull();
    expect(parseSettingUpdate('detailed_arrow_colors', 1, toggles)).toBeNull();
    expect(parseSettingUpdate('theme', 'dark', toggles)).toBeNull();
  });

  it("rejects another app's toggles", () => {
    expect(parseSettingUpdate('show_placements', true, ARCHER)).toBeNull();
  });

  it('rejects columns outside the whitelist', () => {
    for (const defaults of [GYMNAST, ARCHER]) {
      expect(parseSettingUpdate('user_id', 'someone-else', defaults)).toBeNull();
      expect(parseSettingUpdate('id', 'x', defaults)).toBeNull();
      expect(parseSettingUpdate('__proto__', {}, defaults)).toBeNull();
      expect(parseSettingUpdate('constructor', true, defaults)).toBeNull();
      expect(parseSettingUpdate(['theme'], 'dark', defaults)).toBeNull();
    }
  });
});
