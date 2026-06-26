const {
  buildOAuthRedirectAlignment,
  isDynamicTunnelBase,
  resolveShopifyAppEnvironment,
} = require('../shopifyAppEnvironment');
const { EXAMPLE_TUNNEL_URL } = require('../../../../scripts/lib/devTunnelEnv');

describe('shopifyAppEnvironment', () => {
  it('detects dynamic tunnel hosts', () => {
    expect(isDynamicTunnelBase('https://foo.trycloudflare.com')).toBe(true);
    expect(isDynamicTunnelBase('https://splitter.echologyx.com')).toBe(false);
  });

  it('does not warn on home for local app + tunnel', () => {
    const alignment = buildOAuthRedirectAlignment({
      base: EXAMPLE_TUNNEL_URL,
      appEnvironment: 'local',
    });
    expect(alignment.showOAuthAlignmentWarning).toBe(false);
    expect(alignment.tunnelDevHint).toBeNull();
  });

  it('warns when production app uses a tunnel', () => {
    const alignment = buildOAuthRedirectAlignment({
      base: EXAMPLE_TUNNEL_URL,
      appEnvironment: 'production',
    });
    expect(alignment.showOAuthAlignmentWarning).toBe(true);
    expect(alignment.mismatchWarning).toMatch(/Production app credentials/i);
  });

  it('resolves local app environment from repo toml files', () => {
    const env = resolveShopifyAppEnvironment();
    expect(['local', 'production', 'unknown']).toContain(env);
  });
});
