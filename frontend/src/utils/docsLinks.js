/**
 * Shared documentation URL helpers for global docs links.
 * Docs are intentionally outside `/app/:domain` so merchants, support, and public
 * readers can open the same canonical URL.
 */

import {
  buildDocsUrl,
  findDocModeForSection,
  normalizeDocMode,
} from '../components/Documentation/documentationCatalog';

/**
 * @param {{ domain?: string|null, mode?: string, sectionId?: string }} options
 * @returns {string} Root docs path with optional query + hash
 */
export function buildDocsPath({ domain, mode, sectionId } = {}) {
  void domain;
  return buildDocsUrl({ mode, sectionId });
}

/**
 * Split an in-app path into pathname, query string (without ?), and hash.
 */
export function parseAppNavigationTarget(rawPath) {
  const raw = String(rawPath || '');
  const hashIndex = raw.indexOf('#');
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const beforeHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const qIndex = beforeHash.indexOf('?');
  const pathname = qIndex >= 0 ? beforeHash.slice(0, qIndex) : beforeHash;
  const query = qIndex >= 0 ? beforeHash.slice(qIndex + 1) : '';
  return { pathname, query, hash };
}

/**
 * Best-mode deep link for a section id (feature-guides, setup, developer, or plain hash).
 * @param {string} sectionId
 * @param {{ domain?: string|null }} [options]
 */
export function getDocsLinkForSection(sectionId, { domain } = {}) {
  const mode = findDocModeForSection(sectionId);
  return buildDocsPath({
    domain,
    mode: mode === 'all' ? undefined : mode,
    sectionId,
  });
}

export { buildDocsUrl, findDocModeForSection, normalizeDocMode };
