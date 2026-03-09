/**
 * Unit tests for credentials util (hasCredentialsFromSources).
 */

import { hasCredentialsFromSources } from '../credentials';

describe('hasCredentialsFromSources', () => {
  it('returns false when all sources are empty', () => {
    expect(hasCredentialsFromSources(null, null, null)).toBe(false);
    expect(hasCredentialsFromSources(undefined, undefined, undefined)).toBe(false);
    expect(hasCredentialsFromSources('', '', '')).toBe(false);
    expect(hasCredentialsFromSources('  ', '', null)).toBe(false);
  });

  it('returns true when shopDomain is non-empty', () => {
    expect(hasCredentialsFromSources('store.myshopify.com', null, null)).toBe(true);
    expect(hasCredentialsFromSources('example.com', '', '')).toBe(true);
  });

  it('returns true when apiKey is non-empty', () => {
    expect(hasCredentialsFromSources(null, 'sk_live_abc', null)).toBe(true);
    expect(hasCredentialsFromSources('', 'sk_xxx', '')).toBe(true);
  });

  it('returns true when emailToken is non-empty', () => {
    expect(hasCredentialsFromSources(null, null, 'jwt.xxx.yyy')).toBe(true);
    expect(hasCredentialsFromSources('', '', 'token')).toBe(true);
  });

  it('returns true when any two or all three are set', () => {
    expect(hasCredentialsFromSources('shop.com', 'sk_abc', null)).toBe(true);
    expect(hasCredentialsFromSources('shop.com', null, 'token')).toBe(true);
    expect(hasCredentialsFromSources(null, 'sk_abc', 'token')).toBe(true);
    expect(hasCredentialsFromSources('shop.com', 'sk_abc', 'token')).toBe(true);
  });

  it('treats whitespace-only strings as empty', () => {
    expect(hasCredentialsFromSources('  ', null, null)).toBe(false);
    expect(hasCredentialsFromSources(null, '  ', null)).toBe(false);
    expect(hasCredentialsFromSources(null, null, '  ')).toBe(false);
  });
});
