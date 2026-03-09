/**
 * Unit tests for getNotFoundHome (NotFound 404 home link helper).
 */

import { getNotFoundHome } from '../notFoundHome';

describe('getNotFoundHome', () => {
  it('returns user panel when pathname is not app-scoped', () => {
    expect(getNotFoundHome('store.com', '/')).toEqual({
      homePath: '/',
      homeLabel: 'Go to home',
    });
    expect(getNotFoundHome('store.com', '/domains')).toEqual({
      homePath: '/',
      homeLabel: 'Go to home',
    });
  });

  it('returns app dashboard when domain and pathname are app-scoped', () => {
    expect(getNotFoundHome('store.com', '/app/store.com')).toEqual({
      homePath: '/app/store.com',
      homeLabel: 'Back to dashboard',
    });
    expect(getNotFoundHome('my-store.myshopify.com', '/app/my-store.myshopify.com')).toEqual({
      homePath: '/app/my-store.myshopify.com',
      homeLabel: 'Back to dashboard',
    });
  });

  it('derives domain from pathname when on app path (404 inside app)', () => {
    expect(getNotFoundHome(null, '/app/foo')).toEqual({
      homePath: '/app/foo',
      homeLabel: 'Back to dashboard',
    });
    expect(getNotFoundHome(undefined, '/app/foo')).toEqual({
      homePath: '/app/foo',
      homeLabel: 'Back to dashboard',
    });
    expect(getNotFoundHome('', '/app/foo')).toEqual({
      homePath: '/app/foo',
      homeLabel: 'Back to dashboard',
    });
  });

  it('returns user panel when pathname is not app-scoped and domain is missing', () => {
    expect(getNotFoundHome(null, '/profile')).toEqual({
      homePath: '/',
      homeLabel: 'Go to home',
    });
  });

  it('encodes domain in app dashboard path', () => {
    const { homePath } = getNotFoundHome('store.com', '/app/store.com');
    expect(homePath).toBe('/app/store.com');
    const special = getNotFoundHome('foo+bar.com', '/app/foo+bar.com');
    expect(special.homePath).toContain('foo');
  });
});
