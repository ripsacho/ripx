import { buildDocsPath, getDocsLinkForSection, parseAppNavigationTarget } from '../docsLinks';

describe('docsLinks', () => {
  it('builds root docs paths without domain', () => {
    expect(buildDocsPath({ mode: 'feature-guides', sectionId: 'price-testing' })).toBe(
      '/docs?mode=feature-guides#price-testing'
    );
  });

  it('keeps docs global even when a domain is provided', () => {
    expect(
      buildDocsPath({
        domain: 'demo.myshopify.com',
        mode: 'setup',
        sectionId: 'installation',
      })
    ).toBe('/docs?mode=setup#installation');
  });

  it('picks the best mode for section deep links', () => {
    expect(getDocsLinkForSection('installation')).toBe('/docs?mode=setup#installation');
    expect(getDocsLinkForSection('price-testing', { domain: 'demo.myshopify.com' })).toBe(
      '/docs?mode=feature-guides#price-testing'
    );
    expect(getDocsLinkForSection('api')).toBe('/docs?mode=developer#api');
  });

  it('parses pathname, query, and hash for navigation', () => {
    expect(parseAppNavigationTarget('/docs?mode=feature-guides#goals-metrics')).toEqual({
      pathname: '/docs',
      query: 'mode=feature-guides',
      hash: '#goals-metrics',
    });
  });
});
