import {
  buildAnalyticsQueryString,
  coerceAnalyticsSegment,
  coerceAnalyticsTab,
  coerceReportPage,
  getReportParam,
} from '../analyticsQueryString';

describe('useAnalytics helpers', () => {
  it('builds a shared segment query string for analytics endpoints', () => {
    expect(buildAnalyticsQueryString('mobile', 'us')).toBe('device=mobile&country=us');
  });

  it('omits all-segment values from analytics query strings', () => {
    expect(buildAnalyticsQueryString('all', 'all')).toBe('');
    expect(buildAnalyticsQueryString('desktop', 'all')).toBe('device=desktop');
    expect(buildAnalyticsQueryString('all', 'ca')).toBe('country=ca');
  });

  it('keeps overview-specific params outside shared segment query strings', () => {
    expect(buildAnalyticsQueryString('all', 'all')).not.toContain('status=');
    expect(buildAnalyticsQueryString('mobile', 'all')).toBe('device=mobile');
  });

  it('coerces invalid analytics tab params to overview', () => {
    expect(coerceAnalyticsTab('heatmap', ['overview', 'heatmap'])).toBe('heatmap');
    expect(coerceAnalyticsTab('unknown', ['overview', 'heatmap'])).toBe('overview');
    expect(coerceAnalyticsTab(null, ['overview', 'heatmap'])).toBe('overview');
  });

  it('coerces unavailable analytics segment params back to all', () => {
    expect(coerceAnalyticsSegment('mobile', ['desktop', 'mobile'])).toBe('mobile');
    expect(coerceAnalyticsSegment('tablet', ['desktop', 'mobile'])).toBe('all');
    expect(coerceAnalyticsSegment('', ['desktop', 'mobile'])).toBe('all');
  });

  it('coerces namespaced report page params safely', () => {
    expect(coerceReportPage('3')).toBe(3);
    expect(coerceReportPage('-1')).toBe(1);
    expect(coerceReportPage('bad')).toBe(1);
  });

  it('reads namespaced report params with fallbacks', () => {
    const params = new URLSearchParams('events_name=checkout_started&heatmap_page=/products/a');
    expect(getReportParam(params, 'events_name')).toBe('checkout_started');
    expect(getReportParam(params, 'heatmap_page')).toBe('/products/a');
    expect(getReportParam(params, 'funnel_range', '30')).toBe('30');
  });
});
