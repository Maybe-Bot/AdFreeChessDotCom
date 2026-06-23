import { useState } from 'react';

export interface BoardTheme {
  name: string;
  light: string;
  dark: string;
}

export const BOARD_THEMES: Record<string, BoardTheme> = {
  forest:   { name: 'Forest',   light: '#f0d9b5', dark: '#4a7c59' },
  classic:  { name: 'Classic',  light: '#f0d9b5', dark: '#b58863' },
  ocean:    { name: 'Ocean',    light: '#cee7f5', dark: '#2c6e8a' },
  midnight: { name: 'Midnight', light: '#c4ccd6', dark: '#3b4a6b' },
  coral:    { name: 'Coral',    light: '#fde8d8', dark: '#c05a3d' },
  walnut:   { name: 'Walnut',   light: '#f2d4aa', dark: '#7c5136' },
};

const STORAGE_KEY = 'boardTheme';

export function useBoardTheme() {
  const [themeKey, setThemeKey] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? 'forest'
  );

  function setTheme(key: string) {
    localStorage.setItem(STORAGE_KEY, key);
    setThemeKey(key);
  }

  const theme = BOARD_THEMES[themeKey] ?? BOARD_THEMES.forest;
  return { theme, themeKey, setTheme, themes: BOARD_THEMES };
}
