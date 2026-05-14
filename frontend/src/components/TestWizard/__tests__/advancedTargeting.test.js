import {
  advancedSectionHasActivity,
  buildAdvancedSummary,
  getAdvancedStudioSectionMeta,
} from '../advancedTargeting';

describe('advancedTargeting helpers', () => {
  it('counts advanced controls in the summary', () => {
    const summary = buildAdvancedSummary({
      guardrail_config: { enabled: true },
      segments: {
        exclude_bots: true,
        anti_flicker_mode: 'strict',
        js_targeting: { enabled: true },
        min_sessions: 2,
      },
    });

    expect(summary).toBe('5 controls active');
  });

  it('marks advanced activity for overrides and strict anti-flicker', () => {
    const active = advancedSectionHasActivity({
      segments: {
        url_pattern: '/products/.*',
        anti_flicker_mode: 'strict',
      },
    });

    expect(active).toBe(true);
  });

  it('describes override sections as inherited when unset', () => {
    const meta = getAdvancedStudioSectionMeta({ segments: {} }, 'overrides');
    expect(meta).toMatchObject({
      configured: false,
      state: 'Inherited',
    });
  });
});
