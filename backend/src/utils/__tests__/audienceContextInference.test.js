const {
  parseOperatingSystemFromUserAgent,
  inferTrafficSourceFromAttribution,
} = require('../audienceContextInference');

describe('parseOperatingSystemFromUserAgent', () => {
  it('detects iOS', () => {
    expect(
      parseOperatingSystemFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    ).toBe('ios');
  });

  it('detects Android', () => {
    expect(parseOperatingSystemFromUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 7)')).toBe(
      'android'
    );
  });

  it('returns null for empty input', () => {
    expect(parseOperatingSystemFromUserAgent('')).toBe(null);
    expect(parseOperatingSystemFromUserAgent(null)).toBe(null);
  });
});

describe('inferTrafficSourceFromAttribution', () => {
  it('classifies paid search from utm_medium', () => {
    expect(
      inferTrafficSourceFromAttribution({ utm_source: 'google', utm_medium: 'cpc', referrer: '' })
    ).toBe('paid_search');
  });

  it('reads utm params from empty referrer as direct when appropriate', () => {
    expect(
      inferTrafficSourceFromAttribution({ utm_source: '', utm_medium: '', referrer: '' })
    ).toBe('direct');
  });

  it('classifies organic search from search-engine referrer host', () => {
    expect(
      inferTrafficSourceFromAttribution({
        utm_source: '',
        utm_medium: '',
        referrer: 'https://www.bing.com/search?q=shoes',
      })
    ).toBe('organic_search');
  });
});
