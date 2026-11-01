'use server';

import { readUserSettings, writeUserSetting } from '@scoresquid/auth/actions';

export type UserSettings = {
  theme: string;
  show_start_values: boolean;
  show_placements: boolean;
};

// Also the whitelists of what updateSetting may write: see parseSettingUpdate.
const THEME_DEFAULTS = { theme: 'system' };
const TOGGLE_DEFAULTS = { show_start_values: false, show_placements: true };

export async function getUserSettings(): Promise<UserSettings> {
  const [theme, toggles] = await Promise.all([
    readUserSettings(THEME_DEFAULTS),
    readUserSettings(TOGGLE_DEFAULTS, 'gym_settings'),
  ]);
  return { ...theme, ...toggles };
}

export async function updateSetting(
  key: keyof UserSettings,
  value: string | boolean,
) {
  return key === 'theme'
    ? writeUserSetting(key, value, THEME_DEFAULTS)
    : writeUserSetting(key, value, TOGGLE_DEFAULTS, 'gym_settings');
}
