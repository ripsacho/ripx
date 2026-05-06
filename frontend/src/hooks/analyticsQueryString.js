export function buildAnalyticsQueryString(segmentDevice = 'all', segmentCountry = 'all') {
  const params = new URLSearchParams();
  if (segmentDevice && segmentDevice !== 'all') params.set('device', segmentDevice);
  if (segmentCountry && segmentCountry !== 'all') params.set('country', segmentCountry);
  return params.toString();
}

export function coerceAnalyticsTab(tab, tabs = []) {
  return tabs.includes(tab) ? tab : 'overview';
}

export function coerceAnalyticsSegment(value, availableValues = []) {
  if (!value || value === 'all') return 'all';
  return availableValues.includes(value) ? value : 'all';
}

export function coerceReportPage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function getReportParam(searchParams, key, fallback = 'all') {
  const value = searchParams?.get?.(key);
  return value === null || value === undefined || value === '' ? fallback : value;
}
