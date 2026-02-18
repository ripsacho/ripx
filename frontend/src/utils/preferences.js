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
