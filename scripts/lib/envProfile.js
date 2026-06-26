/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { TRACK_URL_KEYS, updateEnvTunnelUrls, deriveEnvUrlsFromAppUrl } = require('./devTunnelEnv');

const PRODUCTION_APP_BASE = 'https://splitter.echologyx.com';

const URL_KEYS = [
  'APP_URL',
  'SHOPIFY_APP_URL',
  'RIPX_OAUTH_REDIRECT_BASE',
  ...Object.keys(TRACK_URL_KEYS),
];

function readEnvLines(envPath) {
  if (!fs.existsSync(envPath)) {
    return [];
  }
  return fs.readFileSync(envPath, 'utf8').split('\n');
}

function writeEnvLines(envPath, lines) {
  const hasTrailingNewline = lines.length > 0 && lines[lines.length - 1] === '';
  const output = `${lines.filter((line, index, arr) => line.length > 0 || index < arr.length - 1).join('\n')}${hasTrailingNewline || lines.length === 0 ? '\n' : ''}`;
  fs.writeFileSync(envPath, output, 'utf8');
}

function parseEnvMap(envPath) {
  const map = {};
  readEnvLines(envPath).forEach(line => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) {
      map[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  });
  return map;
}

function snapshotUrlKeys(envPath, snapshotPath) {
  const map = parseEnvMap(envPath);
  const appUrl = map.APP_URL || '';
  const snapshot = appUrl ? deriveEnvUrlsFromAppUrl(appUrl) : {};
  if (map.ALLOWED_ORIGINS) {
    snapshot.ALLOWED_ORIGINS = map.ALLOWED_ORIGINS;
  }
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return snapshot;
}

function loadSnapshot(snapshotPath) {
  if (!fs.existsSync(snapshotPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  } catch {
    return null;
  }
}

function upsertAllowedOrigin(lines, origin) {
  const prefix = 'ALLOWED_ORIGINS=';
  let replaced = false;
  const next = lines.map(line => {
    if (!line.startsWith(prefix)) {
      return line;
    }
    replaced = true;
    const current = line.slice(prefix.length).trim();
    const parts = current
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
    if (parts.includes(origin)) {
      return line;
    }
    return `${prefix}${[...parts, origin].join(',')}`;
  });
  if (!replaced) {
    next.push(`${prefix}${origin}`);
  }
  return next;
}

function applyUrlSnapshot(envPath, snapshot) {
  if (!snapshot?.APP_URL) {
    throw new Error('Snapshot is missing APP_URL');
  }
  updateEnvTunnelUrls(envPath, snapshot.APP_URL);
  let lines = readEnvLines(envPath);
  if (snapshot.ALLOWED_ORIGINS) {
    lines = lines.map(line =>
      line.startsWith('ALLOWED_ORIGINS=') ? `ALLOWED_ORIGINS=${snapshot.ALLOWED_ORIGINS}` : line
    );
  } else if (snapshot.APP_URL) {
    lines = upsertAllowedOrigin(lines, snapshot.APP_URL);
  }
  writeEnvLines(envPath, lines);
}

function applyProductionProfile(envPath) {
  updateEnvTunnelUrls(envPath, PRODUCTION_APP_BASE);
  let lines = readEnvLines(envPath);
  lines = upsertAllowedOrigin(lines, PRODUCTION_APP_BASE);
  writeEnvLines(envPath, lines);
  return PRODUCTION_APP_BASE;
}

function applyLocalTunnelProfile(envPath, snapshotPath) {
  const snapshot = loadSnapshot(snapshotPath);
  if (!snapshot) {
    throw new Error(
      `Missing tunnel snapshot at ${snapshotPath}. Run: npm run env:profile -- save-tunnel`
    );
  }
  applyUrlSnapshot(envPath, snapshot);
  return snapshot.APP_URL;
}

module.exports = {
  PRODUCTION_APP_BASE,
  URL_KEYS,
  snapshotUrlKeys,
  loadSnapshot,
  applyProductionProfile,
  applyLocalTunnelProfile,
  parseEnvMap,
  deriveEnvUrlsFromAppUrl,
};
