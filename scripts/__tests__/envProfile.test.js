const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  PRODUCTION_APP_BASE,
  applyProductionProfile,
  snapshotUrlKeys,
  parseEnvMap,
  deriveEnvUrlsFromAppUrl,
} = require('../lib/envProfile');
const { EXAMPLE_TUNNEL_URL, updateEnvTunnelUrls } = require('../lib/devTunnelEnv');

describe('envProfile', () => {
  it('snapshots and applies production URL profile', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ripx-env-profile-'));
    const envPath = path.join(dir, '.env');
    const snapshotPath = path.join(dir, '.env.tunnel.snapshot.json');
    fs.writeFileSync(envPath, 'JWT_SECRET=test-secret\n', 'utf8');
    updateEnvTunnelUrls(envPath, EXAMPLE_TUNNEL_URL);
    fs.appendFileSync(envPath, 'RIPX_ALLOW_EPHEMERAL_CHECKOUT_CONFIG=true\n', 'utf8');

    const snapshot = snapshotUrlKeys(envPath, snapshotPath);
    expect(snapshot.APP_URL).toBe(EXAMPLE_TUNNEL_URL);
    expect(snapshot.RIPX_OAUTH_REDIRECT_BASE).toBe(EXAMPLE_TUNNEL_URL);

    applyProductionProfile(envPath);
    const productionMap = parseEnvMap(envPath);
    expect(productionMap.APP_URL).toBe(PRODUCTION_APP_BASE);
    expect(deriveEnvUrlsFromAppUrl(productionMap.APP_URL).RIPX_OAUTH_REDIRECT_BASE).toBe(
      PRODUCTION_APP_BASE
    );
    expect(productionMap.JWT_SECRET).toBe('test-secret');
    expect(productionMap.RIPX_OAUTH_REDIRECT_BASE).toBeUndefined();
  });
});
