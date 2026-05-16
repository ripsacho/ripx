/**
 * Detect failed Vite/Rollup lazy chunks (common after deploy when index.html is fresh but
 * cached chunks 404). One automatic reload per session usually fixes the mismatch.
 */

const CHUNK_RELOAD_SESSION_KEY = 'ripx-chunk-reload-attempted';

export function isChunkLoadError(error) {
  const message = String(error?.message || error || '');
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('Loading chunk') ||
    message.includes('ChunkLoadError') ||
    message.includes('error loading dynamically imported module')
  );
}

export function clearChunkReloadAttemptFlag() {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_SESSION_KEY);
  } catch {
    // ignore
  }
}

/**
 * @param {unknown} error
 * @returns {boolean} true when a reload was triggered
 */
export function attemptChunkLoadRecovery(error) {
  if (typeof window === 'undefined' || !isChunkLoadError(error)) {
    return false;
  }
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY) === '1') {
      return false;
    }
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, '1');
  } catch {
    window.location.reload();
    return true;
  }
  window.location.reload();
  return true;
}

export function installChunkLoadRecovery() {
  if (typeof window === 'undefined') return;

  window.addEventListener('load', () => {
    clearChunkReloadAttemptFlag();
  });

  window.addEventListener('unhandledrejection', event => {
    if (!isChunkLoadError(event?.reason)) return;
    if (attemptChunkLoadRecovery(event.reason)) {
      event.preventDefault();
    }
  });
}
