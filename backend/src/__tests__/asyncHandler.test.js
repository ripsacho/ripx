/**
 * asyncHandler middleware – unit tests
 *
 * Ensures async route handlers have rejections forwarded to next().
 */

const { asyncHandler } = require('../middleware/asyncHandler');

describe('asyncHandler', () => {
  it('calls handler with req, res, next and passes sync return through', () => {
    const req = {};
    const res = {};
    const next = jest.fn();
    const handler = jest.fn().mockReturnValue(undefined);
    const mw = asyncHandler(handler);
    mw(req, res, next);
    expect(handler).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards async rejection to next', async () => {
    const err = new Error('async fail');
    const next = jest.fn();
    const handler = async () => {
      await Promise.resolve();
      throw err;
    };
    const mw = asyncHandler(handler);
    mw({}, {}, next);
    await new Promise(r => setImmediate(r));
    expect(next).toHaveBeenCalledWith(err);
  });

  it('forwards Promise rejection to next', async () => {
    const err = new Error('rejected');
    const next = jest.fn();
    const handler = () => Promise.reject(err);
    const mw = asyncHandler(handler);
    mw({}, {}, next);
    await new Promise(r => setImmediate(r));
    expect(next).toHaveBeenCalledWith(err);
  });

  it('does not call next when handler resolves', async () => {
    const next = jest.fn();
    const handler = async () => {
      await Promise.resolve();
      return { ok: true };
    };
    const mw = asyncHandler(handler);
    mw({}, {}, next);
    await new Promise(r => setImmediate(r));
    expect(next).not.toHaveBeenCalled();
  });
});
