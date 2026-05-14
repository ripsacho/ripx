import { lazy } from 'react';

function isChunkLoadError(error) {
  const message = String(error?.message || error || '');
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('Loading chunk') ||
    message.includes('ChunkLoadError')
  );
}

function wait(ms) {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}

export function lazyWithRetry(importFn, options = {}) {
  const retries = Number.isFinite(options.retries) ? options.retries : 1;
  const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 300;

  return lazy(async () => {
    let attempt = 0;
    let loaded = false;
    while (!loaded) {
      try {
        const module = await importFn();
        loaded = true;
        return module;
      } catch (error) {
        if (!isChunkLoadError(error) || attempt >= retries) {
          throw error;
        }
        attempt += 1;
        await wait(delayMs * attempt);
      }
    }
  });
}
