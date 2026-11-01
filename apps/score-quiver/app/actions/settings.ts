'use server';

import { readUserSettings, writeUserSetting } from '@scoresquid/auth/actions';

export type UserSettings = {
  theme: string;
};

// Also the whitelist of what updateSetting may write: see parseSettingUpdate.
const DEFAULT_SETTINGS: UserSettings = { theme: 'system' };

export async function getUserSettings() {
  return readUserSettings(DEFAULT_SETTINGS);
}

export async function updateSetting(
  key: keyof UserSettings,
  value: string | boolean,
) {
  return writeUserSetting(key, value, DEFAULT_SETTINGS);
}
