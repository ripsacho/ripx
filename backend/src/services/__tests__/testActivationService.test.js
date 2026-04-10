jest.mock('../../models/test', () => ({
  getTestsByShop: jest.fn(),
}));

jest.mock('../conflictDetectionService', () => ({
  findConflicts: jest.fn(),
}));

const { getTestsByShop } = require('../../models/test');
const conflictDetectionService = require('../conflictDetectionService');
const {
  parseActivationStartOptions,
  applyActivationStartOptionsToTest,
  runActivationPreflight,
} = require('../testActivationService');

describe('testActivationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getTestsByShop.mockResolvedValue([]);
    conflictDetectionService.findConflicts.mockResolvedValue([]);
  });

  describe('parseActivationStartOptions', () => {
    it('parses canary overrides with defaults', () => {
      const result = parseActivationStartOptions({ canary_percent: 15 });
      expect(result.errors).toHaveLength(0);
      expect(result.hasCanaryOverrides).toBe(true);
      expect(result.rampPercent).toBe(15);
      expect(result.rampDays).toBe(7);
    });

    it('returns validation errors for invalid canary values', () => {
      const result = parseActivationStartOptions({ canary_percent: 110, canary_days: 50 });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(item => item.includes('canary_percent'))).toBe(true);
      expect(result.errors.some(item => item.includes('canary_days'))).toBe(true);
    });

    it('requires force_reason when force start is enabled', () => {
      const result = parseActivationStartOptions({ force: true });
      expect(result.errors.some(item => item.includes('force_reason'))).toBe(true);
    });

    it('accepts force start with a valid force_reason', () => {
      const result = parseActivationStartOptions({
        force: true,
        force_reason: 'Emergency recovery for checkout campaign',
      });
      expect(result.errors).toHaveLength(0);
      expect(result.force).toBe(true);
      expect(result.forceReason).toContain('Emergency recovery');
    });

    it('parses visual QA launch metadata', () => {
      const result = parseActivationStartOptions({
        visual_qa_baseline_id: 'home-v2-desktop',
        visual_qa_checked_at: '2026-04-05',
        visual_qa_required: true,
      });
      expect(result.errors).toHaveLength(0);
      expect(result.visualQa?.hasOverrides).toBe(true);
      expect(result.visualQa?.baselineId).toBe('home-v2-desktop');
      expect(result.visualQa?.required).toBe(true);
      expect(result.visualQa?.checkedAtIso).toBeTruthy();
    });
  });

  describe('applyActivationStartOptionsToTest', () => {
    it('applies canary ramp settings to segments', () => {
      const test = {
        id: 't1',
        segments: { device: 'all' },
      };
      const next = applyActivationStartOptionsToTest(test, {
        hasCanaryOverrides: true,
        rampPercent: 20,
        rampDays: 5,
      });
      expect(next.segments.traffic_ramp_percent).toBe(20);
      expect(next.segments.traffic_ramp_days).toBe(5);
    });

    it('applies visual QA metadata to goal and segments', () => {
      const test = {
        id: 't2',
        goal: {},
        segments: { device: 'all' },
      };
      const next = applyActivationStartOptionsToTest(test, {
        hasCanaryOverrides: false,
        visualQa: {
          hasOverrides: true,
          baselineId: 'home-v3-mobile',
          checkedAtIso: '2026-04-05T00:00:00.000Z',
          required: true,
        },
      });
      expect(next.goal.visual_qa.baseline_id).toBe('home-v3-mobile');
      expect(next.goal.visual_qa.checked_at).toBe('2026-04-05T00:00:00.000Z');
      expect(next.goal.visual_qa.required).toBe(true);
      expect(next.segments.visual_qa_required).toBe(true);
    });
  });

  describe('runActivationPreflight', () => {
    it('fails theme preflight when non-control template switch variant has no template handle', async () => {
      const preflight = await runActivationPreflight(
        {
          id: 't-theme',
          status: 'draft',
          type: 'theme',
          goal: { template_key: 'template' },
          target_type: 'homepage',
          guardrail_config: { enabled: true },
          variants: [
            {
              name: 'Control',
              allocation: 50,
              config: { themeMode: 'template_switch', template: '' },
            },
            {
              name: 'Variant A',
              allocation: 50,
              config: { themeMode: 'template_switch', template: '' },
            },
          ],
          segments: { traffic_ramp_percent: 10, traffic_ramp_days: 7 },
        },
        'shop.test'
      );
      expect(preflight.ok).toBe(false);
      expect(preflight.errors.some(item => item.message.includes('template handle required'))).toBe(
        true
      );
    });

    it('passes preflight for valid theme canary setup', async () => {
      const preflight = await runActivationPreflight(
        {
          id: 't-theme-ok',
          status: 'draft',
          type: 'theme',
          goal: { template_key: 'theme', experiment_group: 'theme-redesign' },
          target_type: 'homepage',
          guardrail_config: { enabled: true },
          variants: [
            { name: 'Control', allocation: 50, config: { themeMode: 'asset_flag', bodyClass: '' } },
            {
              name: 'Variant A',
              allocation: 50,
              config: { themeMode: 'asset_flag', bodyClass: 'ripx-theme-v2' },
            },
          ],
          segments: { traffic_ramp_percent: 10, traffic_ramp_days: 7 },
        },
        'shop.test'
      );
      expect(preflight.ok).toBe(true);
      expect(preflight.errors).toHaveLength(0);
    });

    it('accepts template handles with dot notation', async () => {
      const preflight = await runActivationPreflight(
        {
          id: 't-theme-template-dot',
          status: 'draft',
          type: 'theme',
          goal: { template_key: 'template' },
          target_type: 'product',
          guardrail_config: { enabled: true },
          variants: [
            {
              name: 'Control',
              allocation: 50,
              config: { themeMode: 'template_switch', template: '' },
            },
            {
              name: 'Variant A',
              allocation: 50,
              config: { themeMode: 'template_switch', template: 'product.alternate' },
            },
          ],
          segments: { traffic_ramp_percent: 10, traffic_ramp_days: 7 },
        },
        'shop.test'
      );
      expect(preflight.errors.some(item => item.id.includes('theme_template_format'))).toBe(false);
    });

    it('fails preflight when section variant has invalid section id format', async () => {
      const preflight = await runActivationPreflight(
        {
          id: 't-theme-bad-section',
          status: 'draft',
          type: 'theme',
          goal: { template_key: 'theme' },
          target_type: 'homepage',
          guardrail_config: { enabled: true },
          variants: [
            {
              name: 'Control',
              allocation: 50,
              config: { themeMode: 'section_variant', sectionId: '' },
            },
            {
              name: 'Variant A',
              allocation: 50,
              config: { themeMode: 'section_variant', sectionId: 'bad section id' },
            },
          ],
          segments: { traffic_ramp_percent: 20, traffic_ramp_days: 7 },
        },
        'shop.test'
      );
      expect(preflight.ok).toBe(false);
      expect(preflight.errors.some(item => item.id.includes('theme_section_format'))).toBe(true);
    });

    it('fails preflight when theme_redirect variant misses redirect URL', async () => {
      const preflight = await runActivationPreflight(
        {
          id: 't-theme-redirect',
          status: 'draft',
          type: 'theme',
          goal: { template_key: 'theme' },
          target_type: 'homepage',
          guardrail_config: { enabled: true },
          variants: [
            { name: 'Control', allocation: 50, config: { themeMode: 'theme_redirect', url: '' } },
            { name: 'Variant A', allocation: 50, config: { themeMode: 'theme_redirect', url: '' } },
          ],
          segments: { traffic_ramp_percent: 20, traffic_ramp_days: 7 },
        },
        'shop.test'
      );
      expect(preflight.ok).toBe(false);
      expect(preflight.errors.some(item => item.id.includes('theme_redirect_'))).toBe(true);
    });

    it('fails preflight parity when non-control theme variant matches control exactly', async () => {
      const preflight = await runActivationPreflight(
        {
          id: 't-theme-parity',
          status: 'draft',
          type: 'theme',
          goal: { template_key: 'theme' },
          target_type: 'homepage',
          guardrail_config: { enabled: true },
          variants: [
            {
              name: 'Control',
              allocation: 50,
              config: { themeMode: 'asset_flag', bodyClass: 'same-class' },
            },
            {
              name: 'Variant A',
              allocation: 50,
              config: { themeMode: 'asset_flag', bodyClass: 'same-class' },
            },
          ],
          segments: { traffic_ramp_percent: 20, traffic_ramp_days: 7 },
        },
        'shop.test'
      );
      expect(preflight.ok).toBe(false);
      expect(preflight.errors.some(item => item.id === 'theme_control_parity')).toBe(true);
    });

    it('warns for cross-origin theme_redirect URLs', async () => {
      const preflight = await runActivationPreflight(
        {
          id: 't-theme-redirect-origin',
          status: 'draft',
          type: 'theme',
          goal: { template_key: 'theme' },
          target_type: 'homepage',
          guardrail_config: { enabled: true },
          variants: [
            { name: 'Control', allocation: 50, config: { themeMode: 'theme_redirect', url: '' } },
            {
              name: 'Variant A',
              allocation: 50,
              config: { themeMode: 'theme_redirect', url: 'https://external.example.com/v2' },
            },
          ],
          segments: { traffic_ramp_percent: 20, traffic_ramp_days: 7 },
        },
        'shop.test'
      );
      expect(preflight.warnings.some(item => item.id === 'theme_redirect_origin_parity')).toBe(
        true
      );
    });

    it('fails when visual QA baseline is required but baseline_id is missing', async () => {
      const preflight = await runActivationPreflight(
        {
          id: 't-theme-visual-qa-required',
          status: 'draft',
          type: 'theme',
          goal: {
            template_key: 'theme',
            visual_qa: { required: true },
          },
          target_type: 'homepage',
          guardrail_config: { enabled: true },
          variants: [
            { name: 'Control', allocation: 50, config: { themeMode: 'asset_flag', bodyClass: '' } },
            {
              name: 'Variant A',
              allocation: 50,
              config: { themeMode: 'asset_flag', bodyClass: 'ripx-theme-v2' },
            },
          ],
          segments: { traffic_ramp_percent: 20, traffic_ramp_days: 7 },
        },
        'shop.test'
      );
      expect(preflight.ok).toBe(false);
      expect(preflight.errors.some(item => item.id === 'theme_visual_qa_baseline_required')).toBe(
        true
      );
    });

    it('warns when visual QA check is stale', async () => {
      const staleDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
      const preflight = await runActivationPreflight(
        {
          id: 't-theme-visual-qa-stale',
          status: 'draft',
          type: 'theme',
          goal: {
            template_key: 'theme',
            visual_qa: { baseline_id: 'home-v2-desktop', checked_at: staleDate },
          },
          target_type: 'homepage',
          guardrail_config: { enabled: true },
          variants: [
            { name: 'Control', allocation: 50, config: { themeMode: 'asset_flag', bodyClass: '' } },
            {
              name: 'Variant A',
              allocation: 50,
              config: { themeMode: 'asset_flag', bodyClass: 'ripx-theme-v2' },
            },
          ],
          segments: { traffic_ramp_percent: 20, traffic_ramp_days: 7 },
        },
        'shop.test'
      );
      expect(preflight.warnings.some(item => item.id === 'theme_visual_qa_recency')).toBe(true);
    });

    it('warns when template-switch variants use identical template handles', async () => {
      const preflight = await runActivationPreflight(
        {
          id: 't-theme-template-diversity',
          status: 'draft',
          type: 'theme',
          goal: { template_key: 'template' },
          target_type: 'homepage',
          guardrail_config: { enabled: true },
          variants: [
            {
              name: 'Control',
              allocation: 34,
              config: { themeMode: 'template_switch', template: '' },
            },
            {
              name: 'Variant A',
              allocation: 33,
              config: { themeMode: 'template_switch', template: 'product.alt' },
            },
            {
              name: 'Variant B',
              allocation: 33,
              config: { themeMode: 'template_switch', template: 'product.alt' },
            },
          ],
        },
        'shop.test'
      );
      expect(preflight.warnings.some(item => item.id === 'theme_template_handle_diversity')).toBe(
        true
      );
    });

    it('warns when template handle may not align with target type', async () => {
      const preflight = await runActivationPreflight(
        {
          id: 't-theme-template-alignment',
          status: 'draft',
          type: 'theme',
          goal: { template_key: 'template' },
          target_type: 'homepage',
          guardrail_config: { enabled: true },
          variants: [
            {
              name: 'Control',
              allocation: 50,
              config: { themeMode: 'template_switch', template: '' },
            },
            {
              name: 'Variant A',
              allocation: 50,
              config: { themeMode: 'template_switch', template: 'product.alternate' },
            },
          ],
        },
        'shop.test'
      );
      expect(
        preflight.warnings.some(item => item.id.includes('theme_template_target_alignment'))
      ).toBe(true);
    });
  });
});
