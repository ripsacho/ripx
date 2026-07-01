const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  EXAMPLE_TUNNEL_URL,
  buildExampleTunnelUrl,
  buildTrackUrl,
  deriveEnvUrlsFromAppUrl,
  updateEnvTunnelUrls,
} = require('../lib/devTunnelEnv');

function parseEnvMapFromFile(envPath) {
  const map = {};
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach(line => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match) {
        map[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    });
  return map;
}

describe('devTunnelEnv', () => {
  it('builds track URLs from APP_URL', () => {
    expect(buildTrackUrl(EXAMPLE_TUNNEL_URL, '/api/track/price-resolve-batch')).toBe(
      `${EXAMPLE_TUNNEL_URL}/api/track/price-resolve-batch`
    );
  });

  it('derives OAuth and track URLs from APP_URL', () => {
    const derived = deriveEnvUrlsFromAppUrl(EXAMPLE_TUNNEL_URL);
    expect(derived.SHOPIFY_APP_URL).toBe(EXAMPLE_TUNNEL_URL);
    expect(derived.RIPX_PRICE_RESOLVE_BATCH_URL).toBe(
      `${EXAMPLE_TUNNEL_URL}/api/track/price-resolve-batch`
    );
  });

  it('builds unique example tunnel URLs for tests', () => {
    expect(buildExampleTunnelUrl('alpha')).toBe('https://alpha.trycloudflare.com');
    expect(buildExampleTunnelUrl('alpha')).not.toBe(buildExampleTunnelUrl('beta'));
  });

  it('stores only APP_URL in .env when switching tunnels', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ripx-dev-tunnel-env-'));
    const envPath = path.join(dir, '.env');
    fs.writeFileSync(
      envPath,
      [
        'JWT_SECRET=keep-me',
        `APP_URL=${EXAMPLE_TUNNEL_URL}`,
        `RIPX_OAUTH_REDIRECT_BASE=${EXAMPLE_TUNNEL_URL}`,
        `RIPX_PRICE_RESOLVE_BATCH_URL=${EXAMPLE_TUNNEL_URL}/api/track/price-resolve-batch`,
      ].join('\n'),
      'utf8'
    );

    const nextUrl = buildExampleTunnelUrl('next-tunnel');
    updateEnvTunnelUrls(envPath, nextUrl);
    const map = parseEnvMapFromFile(envPath);

    expect(map.APP_URL).toBe(nextUrl);
    expect(map.JWT_SECRET).toBe('keep-me');
    expect(map.RIPX_OAUTH_REDIRECT_BASE).toBeUndefined();
    expect(map.RIPX_PRICE_RESOLVE_BATCH_URL).toBeUndefined();
    expect(deriveEnvUrlsFromAppUrl(map.APP_URL).RIPX_OAUTH_REDIRECT_BASE).toBe(nextUrl);
  });
});
