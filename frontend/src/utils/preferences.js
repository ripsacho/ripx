/**
 * Preferences utility - read user preferences from localStorage
 * Used by Analytics, Export, and other components for defaults
 */

import { STORAGE_KEYS } from '../constants';

/**
 * Get saved preferences (sync read from localStorage)
 */
export function getPreferences() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

/**
 * Get default analytics date range (7, 30, 90, or 'all')
 */
export function getDefaultAnalyticsDateRange() {
  const prefs = getPreferences();
  return prefs.defaultAnalyticsDateRange || '30';
}

/**
 * Get default export format ('csv' or 'json')
 */
export function getDefaultExportFormat() {
  const prefs = getPreferences();
  return prefs.defaultExportFormat || 'csv';
}

/**
 * Celebration animation preference ('auto' | 'full' | 'subtle' | 'off')
 */
export function getCelebrationAnimationPreference() {
  const prefs = getPreferences();
  const raw = String(prefs.celebrationAnimation || '')
    .toLowerCase()
    .trim();
  return ['auto', 'full', 'subtle', 'off'].includes(raw) ? raw : 'auto';
}

/**
 * Celebration color theme preference ('rainbow' | 'brand')
 */
export function getCelebrationColorThemePreference() {
  const prefs = getPreferences();
  const raw = String(prefs.celebrationColorTheme || '')
    .toLowerCase()
    .trim();
  return raw === 'brand' ? 'brand' : 'rainbow';
}

/**
 * Celebration motion style preference ('dynamic' | 'cinematic')
 */
export function getCelebrationStylePreference() {
  const prefs = getPreferences();
  const raw = String(prefs.celebrationStyle || '')
    .toLowerCase()
    .trim();
  return raw === 'cinematic' ? 'cinematic' : 'dynamic';
}

/**
 * Returns true exactly once per browser profile.
 * Used to trigger an ultra celebration for the first successful test start.
 */
export function consumeFirstStartUltraCelebrationFlag() {
  try {
    if (localStorage.getItem(STORAGE_KEYS.CELEBRATION_ULTRA_SHOWN) === '1') return false;
    localStorage.setItem(STORAGE_KEYS.CELEBRATION_ULTRA_SHOWN, '1');
    return true;
  } catch {
    return false;
  }
}
