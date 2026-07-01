const fs = require('fs');
const path = require('path');

function parseClientIdFromToml(configPath) {
  if (!configPath || !fs.existsSync(configPath)) {
    return '';
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  const match = raw.match(/^\s*client_id\s*=\s*"([^"]+)"/m);
  return match ? match[1].trim() : '';
}

function resolveShopifyAppEnvironment(options = {}) {
  const repoRoot = options.repoRoot || path.join(__dirname, '..', '..');
  const envKey = String(process.env.SHOPIFY_API_KEY || '').trim();
  const localId = parseClientIdFromToml(path.join(repoRoot, 'shopify.app.local.toml'));
  const productionId = parseClientIdFromToml(path.join(repoRoot, 'shopify.app.production.toml'));

  if (envKey && localId && envKey === localId) {
    return 'local';
  }
  if (envKey && productionId && envKey === productionId) {
    return 'production';
  }
  return 'unknown';
}

function isDynamicTunnelBase(base) {
  const value = String(base || '').trim();
  if (!value) {
    return false;
  }
  return (
    /\.trycloudflare\.com$/i.test(value) ||
    /\.ngrok-free\.app$/i.test(value) ||
    /\.ngrok\.(io|app)$/i.test(value)
  );
}

function buildOAuthRedirectAlignment({ base, appEnvironment = resolveShopifyAppEnvironment() }) {
  const isDynamicTunnel = isDynamicTunnelBase(base);
  if (!isDynamicTunnel) {
    return {
      isDynamicTunnel: false,
      showOAuthAlignmentWarning: false,
      mismatchWarning: null,
      tunnelDevHint: null,
    };
  }

  if (appEnvironment === 'local') {
    return {
      isDynamicTunnel: true,
      showOAuthAlignmentWarning: false,
      mismatchWarning: null,
      tunnelDevHint: null,
    };
  }

  if (appEnvironment === 'production') {
    return {
      isDynamicTunnel: true,
      showOAuthAlignmentWarning: true,
      mismatchWarning:
        'Production app credentials are using a tunnel URL. Set APP_URL and RIPX_OAUTH_REDIRECT_BASE to your stable production domain and align Partner Dashboard URLs.',
      tunnelDevHint: null,
    };
  }

  return {
    isDynamicTunnel: true,
    showOAuthAlignmentWarning: true,
    mismatchWarning:
      'Tunnel host changes on restart. Add redirectUri below to Partner Dashboard Allowed redirection URL(s) and matching Application URL host, or use RIPX_OAUTH_REDIRECT_BASE with a stable domain.',
    tunnelDevHint: null,
  };
}

module.exports = {
  parseClientIdFromToml,
  resolveShopifyAppEnvironment,
  isDynamicTunnelBase,
  buildOAuthRedirectAlignment,
};
