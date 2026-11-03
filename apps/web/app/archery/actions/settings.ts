'use server';

import { readUserSettings, writeUserSetting } from '@scoresquid/auth/actions';

export type UserSettings = {
  theme: string;
  /** SQ-037: shade each ring so a 10 and a 9 look different. */
  detailed_arrow_colors: boolean;
};

// Also the whitelists of what updateSetting may write: see parseSettingUpdate.
// Read apart, so a missing column can't cost the user their theme.
const THEME_DEFAULTS = { theme: 'system' };
const TOGGLE_DEFAULTS = { detailed_arrow_colors: false };

export async function getUserSettings(): Promise<UserSettings> {
  const [theme, toggles] = await Promise.all([
    readUserSettings(THEME_DEFAULTS),
    readUserSettings(TOGGLE_DEFAULTS),
  ]);
  return { ...theme, ...toggles };
}

export async function updateSetting(
  key: keyof UserSettings,
  value: string | boolean,
) {
  return key === 'theme'
    ? writeUserSetting(key, value, THEME_DEFAULTS)
    : writeUserSetting(key, value, TOGGLE_DEFAULTS);
}
