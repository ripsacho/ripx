/**
 * Response utility unit tests
 *
 * Verifies sendSuccess, sendError, sendValidationError, sendNotFound, sendUnauthorized
 * produce the expected response shape and status.
 */

const {
  sendSuccess,
  sendError,
  sendValidationError,
  sendNotFound,
  sendUnauthorized,
} = require('../utils/response');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../constants');

function mockRes() {
  const out = { statusCode: null, body: null };
  const res = {
    status(code) {
      out.statusCode = code;
      return res;
    },
    json(body) {
      out.body = body;
      return res;
    },
  };
  res._out = out;
  return res;
}

describe('response utils', () => {
  describe('sendSuccess', () => {
    it('returns 200 and success: true with data', () => {
      const res = mockRes();
      sendSuccess(res, HTTP_STATUS.OK, { id: '123' });
      expect(res._out.statusCode).toBe(200);
      expect(res._out.body).toEqual({ success: true, id: '123' });
    });

    it('includes message when provided', () => {
      const res = mockRes();
      sendSuccess(res, HTTP_STATUS.CREATED, { id: '1' }, 'Created');
      expect(res._out.body.message).toBe('Created');
      expect(res._out.body.success).toBe(true);
    });
  });

  describe('sendError', () => {
    it('returns given status and success: false with error message', () => {
      const res = mockRes();
      sendError(res, HTTP_STATUS.BAD_REQUEST, 'Invalid input');
      expect(res._out.statusCode).toBe(400);
      expect(res._out.body.success).toBe(false);
      expect(res._out.body.error).toBe('Invalid input');
    });

    it('includes details when provided', () => {
      const res = mockRes();
      sendError(res, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.VALIDATION_FAILED, ['Name required']);
      expect(res._out.body.details).toEqual(['Name required']);
    });
  });

  describe('sendValidationError', () => {
    it('returns 400 and validation failed message', () => {
      const res = mockRes();
      sendValidationError(res, ['err1']);
      expect(res._out.statusCode).toBe(400);
      expect(res._out.body.error).toBe(ERROR_MESSAGES.VALIDATION_FAILED);
      expect(res._out.body.details).toEqual(['err1']);
    });
  });

  describe('sendNotFound', () => {
    it('returns 404 and resource not found message', () => {
      const res = mockRes();
      sendNotFound(res, 'Test');
      expect(res._out.statusCode).toBe(404);
      expect(res._out.body.error).toBe('Test not found');
    });
  });

  describe('sendUnauthorized', () => {
    it('returns 401 and unauthorized message', () => {
      const res = mockRes();
      sendUnauthorized(res);
      expect(res._out.statusCode).toBe(401);
      expect(res._out.body.error).toBe(ERROR_MESSAGES.UNAUTHORIZED);
    });
  });
});
