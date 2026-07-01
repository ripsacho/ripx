const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  isEphemeralTunnelUrl,
  isLocalhostAppUrl,
  setLocalTomlApplicationUrl,
  sanitizeShopifyLocalToml,
  evaluateOAuthUrlAlignment,
} = require('../shopify-local-config-utils');
const { EXAMPLE_TUNNEL_URL } = require('../lib/devTunnelEnv');

describe('shopify-local-config-utils', () => {
  it('detects ephemeral tunnel hosts', () => {
    expect(isEphemeralTunnelUrl('https://foo.trycloudflare.com/')).toBe(true);
    expect(isEphemeralTunnelUrl('https://splitter.echologyx.com/home')).toBe(false);
    expect(isEphemeralTunnelUrl('https://127.0.0.1/')).toBe(false);
  });

  it('detects localhost app urls', () => {
    expect(isLocalhostAppUrl('https://127.0.0.1/')).toBe(true);
    expect(isLocalhostAppUrl('https://tunnel.trycloudflare.com')).toBe(false);
  });

  it('sets public application_url for deploy', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ripx-deploy-'));
    const configPath = path.join(dir, 'shopify.app.local.toml');
    fs.writeFileSync(configPath, 'application_url = "https://127.0.0.1/"\n', 'utf8');
    const applied = setLocalTomlApplicationUrl(configPath, 'https://live.example.com');
    expect(applied.next).toBe('https://live.example.com/');
    expect(fs.readFileSync(configPath, 'utf8')).toContain(
      'application_url = "https://live.example.com/"'
    );
  });

  it('resets stale application_url in a temp toml file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ripx-toml-'));
    const configPath = path.join(dir, 'shopify.app.local.toml');
    fs.writeFileSync(
      configPath,
      [
        'application_url = "https://stale-host.trycloudflare.com/"',
        '',
        '[app_proxy]',
        'url = "/api/proxy/script.js"',
      ].join('\n'),
      'utf8'
    );

    const result = sanitizeShopifyLocalToml(configPath);
    expect(result.changed).toBe(true);
    expect(result.fixes.some(line => line.includes('application_url'))).toBe(true);
    const updated = fs.readFileSync(configPath, 'utf8');
    expect(updated).toContain('application_url = "https://127.0.0.1/"');
    expect(updated).not.toContain('trycloudflare.com');
  });

  it('flags env host mismatches against production toml', () => {
    const tomlRaw = [
      'application_url = "https://splitter.echologyx.com/home"',
      '[auth]',
      'redirect_urls = [ "https://splitter.echologyx.com/api/auth/callback" ]',
    ].join('\n');
    const result = evaluateOAuthUrlAlignment({
      env: {
        APP_URL: EXAMPLE_TUNNEL_URL,
        RIPX_OAUTH_REDIRECT_BASE: EXAMPLE_TUNNEL_URL,
      },
      tomlRaw,
      configLabel: 'shopify.app.production.toml',
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
