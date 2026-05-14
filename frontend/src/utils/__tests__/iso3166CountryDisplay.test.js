import {
  normalizeCountryCode,
  getCountryDisplayLabel,
  formatCountryCodesSummary,
} from '../iso3166CountryDisplay';

describe('iso3166CountryDisplay', () => {
  it('normalizes country codes to uppercase alpha-2', () => {
    expect(normalizeCountryCode(' us ')).toBe('US');
    expect(normalizeCountryCode('gb')).toBe('GB');
    expect(normalizeCountryCode('USA')).toBe('');
  });

  it('formats display label with name and bracketed code', () => {
    expect(getCountryDisplayLabel('US')).toContain('United States');
    expect(getCountryDisplayLabel('US')).toMatch(/\(US\)$/);
  });

  it('summarizes long lists with overflow', () => {
    const codes = ['US', 'CA', 'GB', 'DE'];
    expect(formatCountryCodesSummary(codes, 2)).toMatch(/\+ 2 more$/);
  });
});
