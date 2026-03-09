/**
 * Pure credential helpers for auth checks.
 * Used by services/api.js hasCredentials(); testable without localStorage.
 *
 * @param {string|null|undefined} shopDomain
 * @param {string|null|undefined} apiKey
 * @param {string|null|undefined} emailToken
 * @returns {boolean}
 */
export function hasCredentialsFromSources(shopDomain, apiKey, emailToken) {
  return (
    !!(shopDomain && String(shopDomain).trim()) ||
    !!(apiKey && String(apiKey).trim()) ||
    !!(emailToken && String(emailToken).trim())
  );
}
