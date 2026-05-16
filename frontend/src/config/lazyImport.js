import { lazy } from 'react';
import { attemptChunkLoadRecovery, isChunkLoadError } from '../utils/chunkLoadRecovery';

export { isChunkLoadError };

function wait(ms) {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}

export function lazyWithRetry(importFn, options = {}) {
  const defaultRetries = import.meta.env.PROD ? 3 : 1;
  const retries = Number.isFinite(options.retries) ? options.retries : defaultRetries;
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
          attemptChunkLoadRecovery(error);
          throw error;
        }
        attempt += 1;
        await wait(delayMs * attempt);
      }
    }
  });
}
