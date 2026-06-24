const {
  buildShippingPreviewDebugChecklist,
  isLocalOrPrivateUrl,
} = require('../shippingPreviewDebugService');

describe('shippingPreviewDebugService', () => {
  describe('isLocalOrPrivateUrl', () => {
    it('flags localhost and private hosts', () => {
      expect(isLocalOrPrivateUrl('https://localhost:3000/api/track/shipping-carrier-rates')).toBe(
        true
      );
      expect(isLocalOrPrivateUrl('https://127.0.0.1:3458/foo')).toBe(true);
      expect(isLocalOrPrivateUrl('https://pickup-spy-being-london.trycloudflare.com/foo')).toBe(
        false
      );
    });
  });

  describe('buildShippingPreviewDebugChecklist', () => {
    it('marks localhost carrier callback as the primary blocker', () => {
      const checklist = buildShippingPreviewDebugChecklist({
        testId: 'test-1',
        urls: {
          carrier_callback_url: 'https://localhost:3000/api/track/shipping-carrier-rates',
          shipping_resolve_batch_url: 'https://localhost:3458/api/track/shipping-resolve-batch',
        },
        readiness: {
          live_carrier_services_found: 1,
          latest_carrier_callback_seen: false,
        },
      });

      expect(checklist.overall_status).toBe('blocked');
      expect(checklist.primary_blocker?.id).toBe('callback_url_public');
      expect(checklist.steps.find(step => step.id === 'track_urls_consistent')?.status).toBe(
        'fail'
      );
    });

    it('surfaces assignment mismatch when callback trace shows no match', () => {
      const checklist = buildShippingPreviewDebugChecklist({
        testId: 'test-2',
        urls: {
          carrier_callback_url:
            'https://pickup-spy-being-london.trycloudflare.com/api/track/shipping-carrier-rates',
          shipping_resolve_batch_url:
            'https://pickup-spy-being-london.trycloudflare.com/api/track/shipping-resolve-batch',
        },
        readiness: {
          live_carrier_services_found: 1,
          latest_carrier_callback_seen: true,
        },
        carrierCallbackTrace: [
          {
            at: '2026-06-18T08:00:00.000Z',
            assignment_matches: false,
            assignment_diagnostics: {
              expected_test_id: 'test-2',
              ripx_test_values: [],
            },
            rates_count: 0,
            rates: [],
          },
        ],
      });

      expect(checklist.primary_blocker?.id).toBe('assignment_matched');
      expect(checklist.steps.find(step => step.id === 'rates_returned')?.status).toBe('fail');
    });

    it('warns for stale stored callback hosts when live callback is aligned', () => {
      const checklist = buildShippingPreviewDebugChecklist({
        testId: 'test-3',
        testStatus: 'stopped',
        urls: {
          carrier_callback_url:
            'https://theater-her-years-nikon.trycloudflare.com/api/track/shipping-carrier-rates',
          shipping_resolve_batch_url:
            'https://theater-her-years-nikon.trycloudflare.com/api/track/shipping-resolve-batch',
        },
        readiness: {
          live_carrier_services_found: 1,
          stale_carrier_callbacks: 0,
        },
        storedShippingResources: [
          {
            resource_type: 'carrier_service',
            callback_url:
              'https://old-tunnel.trycloudflare.com/api/track/shipping-carrier-rates?test_id=test-3',
          },
          {
            resource_type: 'carrier_service',
            callback_url:
              'https://theater-her-years-nikon.trycloudflare.com/api/track/shipping-carrier-rates?test_id=test-3',
          },
        ],
      });

      expect(checklist.steps.find(step => step.id === 'carrier_callback_synced')?.status).toBe(
        'warn'
      );
    });
  });
});
