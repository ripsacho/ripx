/**
 * Theme Management Utility
 *
 * Handles theme switching, auto mode (7am-7pm light, 7pm-7am dark),
 * and persistence
 */

import { STORAGE_KEYS } from '../constants';

export const THEME_CHANGE_EVENT = 'ripx:theme-change';

const VALID_THEME_MODES = new Set(['light', 'dark', 'auto', 'custom']);

const readThemePreferences = () => {
  const saved = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
  return saved ? JSON.parse(saved) : {};
};

const emitThemeChange = ({ theme, resolvedTheme, customTimes = null }) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(THEME_CHANGE_EVENT, {
      detail: {
        theme,
        resolvedTheme,
        customTimes,
      },
    })
  );
};

/**
 * Get current time-based theme (for auto mode)
 * Light: 7am - 7pm (07:00 - 19:00)
 * Dark: 7pm - 7am (19:00 - 07:00)
 *
 * @param {Object} customTimes - Optional custom times { start: number, end: number }
 */
export const getTimeBasedTheme = (customTimes = null) => {
  const now = new Date();
  const hour = now.getHours();

  let lightStart, lightEnd;

  if (customTimes) {
    lightStart = customTimes.start;
    lightEnd = customTimes.end;
  } else {
    // Default: 7am (7) to 7pm (19)
    lightStart = 7;
    lightEnd = 19;
  }

  // Handle case where light theme spans midnight
  if (lightStart < lightEnd) {
    // Normal case: lightStart to lightEnd = light theme
    if (hour >= lightStart && hour < lightEnd) {
      return 'light';
    }
    return 'dark';
  } else {
    // Spans midnight: lightStart to 24, then 0 to lightEnd = light theme
    if (hour >= lightStart || hour < lightEnd) {
      return 'light';
    }
    return 'dark';
  }
};

export const getResolvedTheme = () => {
  if (typeof document !== 'undefined') {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    if (currentTheme === 'dark' || currentTheme === 'light') {
      return currentTheme;
    }
  }

  try {
    const preferences = readThemePreferences();
    const theme = VALID_THEME_MODES.has(preferences.theme) ? preferences.theme : 'light';
    if (theme === 'auto') return getTimeBasedTheme();
    if (
      theme === 'custom' &&
      preferences.customThemeStart !== undefined &&
      preferences.customThemeEnd !== undefined
    ) {
      return getTimeBasedTheme({
        start: preferences.customThemeStart,
        end: preferences.customThemeEnd,
      });
    }
    return theme === 'dark' ? 'dark' : 'light';
  } catch (err) {
    console.error('Error resolving theme preference:', err);
    return 'light';
  }
};

/**
 * Apply theme to document
 *
 * @param {string} theme - Theme mode: 'light', 'dark', 'auto', or 'custom'
 * @param {Object} customTimes - Optional custom times for 'custom' mode { start: number, end: number }
 */
export const applyTheme = (theme, customTimes = null) => {
  if (typeof document === 'undefined') return 'light';
  const root = document.documentElement;
  let resolvedTheme = theme === 'dark' ? 'dark' : 'light';

  if (theme === 'auto') {
    const timeBasedTheme = getTimeBasedTheme();
    resolvedTheme = timeBasedTheme;
    root.setAttribute('data-theme', timeBasedTheme);
    root.setAttribute('data-theme-mode', 'auto');
  } else if (theme === 'custom') {
    const timeBasedTheme = getTimeBasedTheme(customTimes);
    resolvedTheme = timeBasedTheme;
    root.setAttribute('data-theme', timeBasedTheme);
    root.setAttribute('data-theme-mode', 'custom');
    if (customTimes) {
      root.setAttribute('data-theme-start', customTimes.start.toString());
      root.setAttribute('data-theme-end', customTimes.end.toString());
    }
  } else {
    root.setAttribute('data-theme', theme);
    root.removeAttribute('data-theme-mode');
    root.removeAttribute('data-theme-start');
    root.removeAttribute('data-theme-end');
  }

  root.style.colorScheme = resolvedTheme;

  return resolvedTheme;
};

/**
 * Get saved theme preference from localStorage
 */
export const getSavedTheme = () => {
  try {
    const preferences = readThemePreferences();
    return VALID_THEME_MODES.has(preferences.theme) ? preferences.theme : 'light';
  } catch (err) {
    console.error('Error loading theme preference:', err);
  }
  return 'light';
};

/**
 * Initialize theme on app load
 */
export const initializeTheme = () => {
  try {
    const preferences = readThemePreferences();
    const theme = VALID_THEME_MODES.has(preferences.theme) ? preferences.theme : 'light';
    let resolvedTheme;
    let customTimes = null;

    if (
      theme === 'custom' &&
      preferences.customThemeStart !== undefined &&
      preferences.customThemeEnd !== undefined
    ) {
      customTimes = {
        start: preferences.customThemeStart,
        end: preferences.customThemeEnd,
      };
      resolvedTheme = applyTheme('custom', customTimes);
    } else {
      resolvedTheme = applyTheme(theme);
    }
    emitThemeChange({ theme, resolvedTheme, customTimes });

    // App.jsx owns the interval that re-runs initialization for auto/custom modes.
  } catch (err) {
    console.error('Error initializing theme:', err);
    applyTheme('light');
  }
};

/**
 * Update theme preference
 *
 * @param {string} theme - Theme mode: 'light', 'dark', 'auto', or 'custom'
 * @param {Object} customTimes - Optional custom times for 'custom' mode { start: number, end: number }
 */
export const updateTheme = (theme, customTimes = null) => {
  try {
    const preferences = readThemePreferences();
    const nextTheme = VALID_THEME_MODES.has(theme) ? theme : 'light';
    preferences.theme = nextTheme;

    if (customTimes) {
      preferences.customThemeStart = customTimes.start;
      preferences.customThemeEnd = customTimes.end;
    }

    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(preferences));

    let resolvedTheme;
    if (nextTheme === 'custom' && customTimes) {
      resolvedTheme = applyTheme('custom', customTimes);
    } else {
      resolvedTheme = applyTheme(nextTheme);
    }
    emitThemeChange({ theme: nextTheme, resolvedTheme, customTimes });
    return { theme: nextTheme, resolvedTheme, customTimes };
  } catch (err) {
    console.error('Error updating theme:', err);
    return null;
  }
};
