const {
  batchResolveJsonUtf8Bytes,
  batchResolveResponseTooLarge,
  shapePriceResolveBatchLinesForCheckout,
} = require('../priceResolveBatchResponse');
const { PRICE_RESOLVE_BATCH_RESPONSE_MAX_BYTES } = require('../../constants');

describe('priceResolveBatchResponse', () => {
  it('measures UTF-8 bytes of JSON payload', () => {
    const n = batchResolveJsonUtf8Bytes({ success: true, lines: [{ line_id: 'é', reason: null }] });
    expect(n).toBeGreaterThan(Buffer.byteLength('{"success":true}', 'utf8'));
  });

  it('flags payload over default max', () => {
    const big = 'x'.repeat(PRICE_RESOLVE_BATCH_RESPONSE_MAX_BYTES + 1);
    expect(
      batchResolveResponseTooLarge({
        success: true,
        lines: [
          {
            line_id: big,
            applies: false,
            discountDecimal: null,
            targetLineDecimal: null,
            reason: null,
          },
        ],
      })
    ).toBe(true);
  });

  it('allows small payloads', () => {
    expect(
      batchResolveResponseTooLarge({
        success: true,
        lines: [
          {
            line_id: '1',
            applies: true,
            discountDecimal: '1.00',
            targetLineDecimal: '9.99',
            reason: null,
          },
        ],
      })
    ).toBe(false);
  });

  describe('shapePriceResolveBatchLinesForCheckout', () => {
    const savedFull = process.env.RIPX_PRICE_BATCH_FULL_RESPONSE;
    afterEach(() => {
      if (savedFull === undefined) {
        delete process.env.RIPX_PRICE_BATCH_FULL_RESPONSE;
      } else {
        process.env.RIPX_PRICE_BATCH_FULL_RESPONSE = savedFull;
      }
    });

    it('drops reason/targetLineDecimal by default', () => {
      delete process.env.RIPX_PRICE_BATCH_FULL_RESPONSE;
      const out = shapePriceResolveBatchLinesForCheckout([
        {
          line_id: 'L1',
          applies: false,
          discountDecimal: null,
          targetLineDecimal: null,
          reason: 'control_variant',
        },
        {
          line_id: 'L2',
          applies: true,
          discountDecimal: '5.00',
          targetLineDecimal: '24.99',
          reason: null,
        },
      ]);
      expect(out[0]).toEqual({ line_id: 'L1', applies: false, discountDecimal: null });
      expect(out[1]).toEqual({ line_id: 'L2', applies: true, discountDecimal: '5.00' });
      expect(out[0].reason).toBeUndefined();
    });

    it('preserves all fields when RIPX_PRICE_BATCH_FULL_RESPONSE=true', () => {
      process.env.RIPX_PRICE_BATCH_FULL_RESPONSE = 'true';
      const row = {
        line_id: 'L1',
        applies: false,
        discountDecimal: null,
        targetLineDecimal: null,
        reason: 'x',
      };
      expect(shapePriceResolveBatchLinesForCheckout([row])).toEqual([row]);
    });

    it('preserves all fields when fullResponse option is set', () => {
      delete process.env.RIPX_PRICE_BATCH_FULL_RESPONSE;
      const row = {
        line_id: 'L1',
        applies: false,
        discountDecimal: null,
        targetLineDecimal: null,
        reason: 'x',
        debug: { resultReason: 'x' },
      };
      expect(shapePriceResolveBatchLinesForCheckout([row], { fullResponse: true })).toEqual([row]);
    });
  });
});
