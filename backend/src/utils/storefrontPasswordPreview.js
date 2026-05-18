/**
 * Dev/staging helpers for password-protected Shopify storefront previews.
 * Live merchant stores are typically public; defaults are disabled in production unless configured.
 */

const DEV_STOREFRONT_PASSWORD_FALLBACK = 'sp';

function isInternalPreviewHost(requestHost = '') {
  const host = String(requestHost || '')
    .trim()
    .toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.localhost') ||
    host.endsWith('echologyx.com')
  ) {
    return true;
  }
  const appUrl = String(
    process.env.APP_URL || process.env.RIPX_OAUTH_REDIRECT_BASE || ''
  ).toLowerCase();
  return (
    appUrl.includes('echologyx.com') || appUrl.includes('localhost') || appUrl.includes('127.0.0.1')
  );
}

/**
 * @param {string} [requestHost]
 * @returns {string}
 */
function getDevStorefrontPasswordDefault(requestHost = '') {
  const fromEnv = String(process.env.RIPX_DEV_STOREFRONT_PASSWORD || '').trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (process.env.NODE_ENV !== 'production') {
    return DEV_STOREFRONT_PASSWORD_FALLBACK;
  }
  if (isInternalPreviewHost(requestHost)) {
    return DEV_STOREFRONT_PASSWORD_FALLBACK;
  }
  return '';
}

/**
 * @param {string} queryPassword
 * @param {string} [requestHost]
 * @returns {string}
 */
function resolveStorefrontPasswordForPreviewRequest(queryPassword, requestHost = '') {
  const explicit =
    queryPassword !== null && queryPassword !== undefined ? String(queryPassword).trim() : '';
  if (explicit) {
    return explicit;
  }
  return getDevStorefrontPasswordDefault(requestHost);
}

/**
 * Submit Shopify storefront password and return a Cookie header for follow-up fetches.
 *
 * @param {URL} parsedUrl - Store URL (must be *.myshopify.com)
 * @param {string} password
 * @param {AbortSignal} signal
 * @returns {Promise<string>}
 */
async function getShopifyStorefrontPasswordCookie(parsedUrl, password, signal) {
  const rawPassword = typeof password === 'string' ? password.trim() : '';
  if (!rawPassword || !/\.myshopify\.com$/i.test(parsedUrl.hostname || '')) {
    return '';
  }

  const passwordUrl = new URL('/password', parsedUrl.origin);
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const baseHeaders = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent': userAgent,
  };

  const collectFromResponse = (response, jar) => {
    const setCookies =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : response.headers.get('set-cookie')
          ? [response.headers.get('set-cookie')]
          : [];
    for (const value of setCookies) {
      const crumb = String(value || '')
        .split(';')[0]
        .trim();
      if (crumb) {
        jar.push(crumb);
      }
    }
  };

  try {
    const cookieJar = [];
    const body = new URLSearchParams();
    body.set('form_type', 'storefront_password');
    body.set('utf8', '✓');
    body.set('password', rawPassword);

    const postRes = await fetch(passwordUrl.toString(), {
      method: 'POST',
      redirect: 'manual',
      signal,
      headers: {
        ...baseHeaders,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    collectFromResponse(postRes, cookieJar);

    if (postRes.status >= 300 && postRes.status < 400) {
      const location = postRes.headers.get('location');
      if (location) {
        const redirectUrl = new URL(location, passwordUrl);
        const followRes = await fetch(redirectUrl.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal,
          headers: {
            ...baseHeaders,
            ...(cookieJar.length ? { Cookie: cookieJar.join('; ') } : {}),
          },
        });
        collectFromResponse(followRes, cookieJar);
      }
    }

    return cookieJar.join('; ');
  } catch {
    return '';
  }
}

module.exports = {
  DEV_STOREFRONT_PASSWORD_FALLBACK,
  getDevStorefrontPasswordDefault,
  resolveStorefrontPasswordForPreviewRequest,
  getShopifyStorefrontPasswordCookie,
};
