import { formatPreflightCheckMessage } from '../preflightHints';

describe('preflightHints', () => {
  it('appends action_path when not already in message', () => {
    const text = formatPreflightCheckMessage({
      message: 'Cart transform is not ready.',
      meta: { action_path: 'Store settings → Store setup → Direct price override → Install' },
    });
    expect(text).toContain('Cart transform is not ready.');
    expect(text).toContain('Direct price override');
  });
});
