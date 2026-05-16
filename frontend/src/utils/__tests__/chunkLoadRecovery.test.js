import {
  attemptChunkLoadRecovery,
  clearChunkReloadAttemptFlag,
  isChunkLoadError,
} from '../chunkLoadRecovery';

describe('chunkLoadRecovery', () => {
  it('detects dynamic import failures', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('something else'))).toBe(false);
  });

  it('reloads once per session on chunk failure', () => {
    const reload = jest.fn();
    const previousWindow = global.window;
    const store = new Map();
    global.window = { location: { reload } };
    global.sessionStorage = {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => {
        store.set(key, value);
      },
      removeItem: key => {
        store.delete(key);
      },
    };
    try {
      clearChunkReloadAttemptFlag();
      expect(
        attemptChunkLoadRecovery(new Error('Failed to fetch dynamically imported module'))
      ).toBe(true);
      expect(reload).toHaveBeenCalledTimes(1);
      expect(
        attemptChunkLoadRecovery(new Error('Failed to fetch dynamically imported module'))
      ).toBe(false);
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      global.window = previousWindow;
    }
  });
});
