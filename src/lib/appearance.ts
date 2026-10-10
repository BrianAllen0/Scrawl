import Storage from 'expo-sqlite/kv-store';
import { Appearance } from 'react-native';

/** 'unspecified' follows the system theme. */
export type ThemePreference = 'unspecified' | 'light' | 'dark';

const KEY = 'appearance.theme';

export function getThemePreference(): ThemePreference {
  const value = Storage.getItemSync(KEY);
  return value === 'light' || value === 'dark' ? value : 'unspecified';
}

/** Saves the choice and applies it; useColorScheme everywhere updates to match. */
export function setThemePreference(preference: ThemePreference) {
  Storage.setItemSync(KEY, preference);
  Appearance.setColorScheme(preference);
}
