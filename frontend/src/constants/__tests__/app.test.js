/**
 * App constants tests
 *
 * Ensures INTERVALS, STORAGE_KEYS, BREAKPOINTS, and APP_META stay consistent
 * and are documented by tests (useSessionCheck, theme, etc. depend on these).
 */

import {
  BREAKPOINTS,
  STORAGE_KEYS,
  INTERVALS,
  APP_META,
  RIPX_STOREFRONT_SCRIPT_VERSION,
} from '../app';

describe('app constants', () => {
  describe('BREAKPOINTS', () => {
    it('has MOBILE, TABLET, DESKTOP as numbers', () => {
      expect(BREAKPOINTS).toHaveProperty('MOBILE');
      expect(BREAKPOINTS).toHaveProperty('TABLET');
      expect(BREAKPOINTS).toHaveProperty('DESKTOP');
      expect(typeof BREAKPOINTS.MOBILE).toBe('number');
      expect(typeof BREAKPOINTS.TABLET).toBe('number');
      expect(typeof BREAKPOINTS.DESKTOP).toBe('number');
    });

    it('values are positive and MOBILE < TABLET < DESKTOP', () => {
      expect(BREAKPOINTS.MOBILE).toBeGreaterThan(0);
      expect(BREAKPOINTS.TABLET).toBeGreaterThan(BREAKPOINTS.MOBILE);
      expect(BREAKPOINTS.DESKTOP).toBeGreaterThan(BREAKPOINTS.TABLET);
    });
  });

  describe('STORAGE_KEYS', () => {
    it('has expected keys used by auth and app', () => {
      expect(STORAGE_KEYS).toHaveProperty('API_KEY');
      expect(STORAGE_KEYS).toHaveProperty('EMAIL_TOKEN');
      expect(STORAGE_KEYS).toHaveProperty('SHOP_DOMAIN');
      expect(STORAGE_KEYS).toHaveProperty('CURRENT_STORE');
      expect(STORAGE_KEYS).toHaveProperty('PREFERENCES');
      expect(STORAGE_KEYS).toHaveProperty('ANNOUNCEMENT_DISMISSED');
    });

    it('all values are non-empty strings', () => {
      Object.values(STORAGE_KEYS).forEach(val => {
        expect(typeof val).toBe('string');
        expect(val.length).toBeGreaterThan(0);
      });
    });
  });

  describe('INTERVALS', () => {
    it('has SESSION_CHECK and related session-check values', () => {
      expect(INTERVALS).toHaveProperty('SESSION_CHECK');
      expect(INTERVALS).toHaveProperty('SESSION_CHECK_INITIAL_DELAY');
      expect(INTERVALS).toHaveProperty('SESSION_CHECK_VISIBILITY_DEBOUNCE');
      expect(INTERVALS).toHaveProperty('THEME_CHECK');
    });

    it('all interval values are positive numbers', () => {
      Object.entries(INTERVALS).forEach(([_key, val]) => {
        expect(typeof val).toBe('number');
        expect(val).toBeGreaterThan(0);
      });
    });

    it('SESSION_CHECK is 5 minutes', () => {
      expect(INTERVALS.SESSION_CHECK).toBe(5 * 60 * 1000);
    });

    it('SESSION_CHECK_INITIAL_DELAY is 25 seconds', () => {
      expect(INTERVALS.SESSION_CHECK_INITIAL_DELAY).toBe(25 * 1000);
    });
  });

  describe('RIPX_STOREFRONT_SCRIPT_VERSION', () => {
    it('is a non-empty string (sync with backend storefrontScriptRuntime SCRIPT_VERSION)', () => {
      expect(typeof RIPX_STOREFRONT_SCRIPT_VERSION).toBe('string');
      expect(RIPX_STOREFRONT_SCRIPT_VERSION.length).toBeGreaterThan(0);
      expect(RIPX_STOREFRONT_SCRIPT_VERSION).toMatch(/^\d+$/);
    });
  });

  describe('APP_META', () => {
    it('has VERSION, NAME, DESCRIPTION, MIN_API_VERSION', () => {
      expect(APP_META).toHaveProperty('VERSION');
      expect(APP_META).toHaveProperty('NAME');
      expect(APP_META).toHaveProperty('DESCRIPTION');
      expect(APP_META).toHaveProperty('MIN_API_VERSION');
    });

    it('VERSION is semver-like string', () => {
      expect(typeof APP_META.VERSION).toBe('string');
      expect(APP_META.VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('NAME is RipX', () => {
      expect(APP_META.NAME).toBe('RipX');
    });
  });
});
