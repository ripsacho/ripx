/**
 * Server-side audience context helpers.
 * Traffic rules mirror `shopify/storefront-script.js#getTrafficSource` (keep in sync when changing detection).
 * OS rules mirror `getOperatingSystem` in the same file.
 */

function parseOperatingSystemFromUserAgent(ua) {
  if (!ua || typeof ua !== 'string') {
    return null;
  }
  const s = ua.toLowerCase();
  if (/iphone|ipad|ipod/.test(s)) {
    return 'ios';
  }
  if (/android/.test(s)) {
    return 'android';
  }
  if (/macintosh|mac os x/.test(s)) {
    return 'macos';
  }
  if (/windows/.test(s)) {
    return 'windows';
  }
  if (/linux/.test(s)) {
    return 'linux';
  }
  return 'other';
}

/**
 * @param {{ utm_source?: string, utm_medium?: string, referrer?: string }} input
 * @returns {string|null}
 */
function inferTrafficSourceFromAttribution(input = {}) {
  const utmSource = String(input.utm_source || '').toLowerCase();
  const utmMedium = String(input.utm_medium || '').toLowerCase();
  const referrer = String(input.referrer || '').toLowerCase();

  if (utmMedium === 'sms') {
    return 'sms';
  }
  if (utmMedium === 'email') {
    return 'email';
  }
  if (utmMedium === 'shopping') {
    return 'paid_shopping';
  }
  if (utmMedium.includes('social') && /(cpc|ppc|paid|cpv|cpm)/.test(utmMedium)) {
    return 'paid_social';
  }
  if (utmMedium.includes('social')) {
    return 'organic_social';
  }
  if (['cpc', 'ppc', 'paid', 'cpv', 'cpm'].some(m => utmMedium.includes(m))) {
    return 'paid_search';
  }
  if (utmSource.includes('google') || referrer.includes('google.')) {
    return 'google';
  }
  if (utmSource.includes('facebook') || referrer.includes('facebook.')) {
    return 'facebook';
  }
  if (utmSource.includes('instagram') || referrer.includes('instagram.')) {
    return 'instagram';
  }
  if (utmSource.includes('tiktok') || referrer.includes('tiktok.')) {
    return 'tiktok';
  }
  if (
    utmSource.includes('twitter') ||
    referrer.includes('twitter.') ||
    referrer.includes('x.com')
  ) {
    return 'twitter';
  }
  if (utmSource.includes('youtube') || referrer.includes('youtube.')) {
    return 'youtube';
  }
  if (
    [
      'facebook',
      'twitter',
      'instagram',
      'linkedin',
      'pinterest',
      'tiktok',
      'youtube',
      'reddit',
    ].some(platform => utmSource.includes(platform) || referrer.includes(platform))
  ) {
    return 'organic_social';
  }

  if (!referrer) {
    return 'direct';
  }
  try {
    const refHost = new URL(referrer).hostname.toLowerCase();
    const searchEngines = ['google', 'bing', 'yahoo', 'duckduckgo', 'baidu', 'yandex'];
    if (searchEngines.some(e => refHost.includes(e))) {
      return 'organic_search';
    }
  } catch {
    // ignore invalid referrer URL
  }
  return 'referral';
}

module.exports = {
  parseOperatingSystemFromUserAgent,
  inferTrafficSourceFromAttribution,
};
