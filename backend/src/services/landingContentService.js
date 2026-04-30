const { query } = require('../utils/database');

const LANDING_CLIENTS_KV_KEY = 'landing.clients.v1';
const CLIENTS_MAX = 24;

const FALLBACK_CLIENTS = [
  {
    name: 'Northstar Goods',
    icon: 'NG',
    industry: 'Shopify Plus',
    quote: 'Pricing and checkout tests in one launch checklist.',
  },
  {
    name: 'Luma Home',
    icon: 'LH',
    industry: 'Home decor',
    quote: 'Offer tests moved from guesswork to measurable revenue.',
  },
  {
    name: 'Pixel Pantry',
    icon: 'PP',
    industry: 'Food & beverage',
    quote: 'Preview links made experiments easier for the whole team.',
  },
  {
    name: 'EverFit Studio',
    icon: 'EF',
    industry: 'Wellness',
    quote: 'Guardrails helped us scale tests without noisy rollouts.',
  },
  {
    name: 'Craft Lane',
    icon: 'CL',
    industry: 'DTC retail',
    quote: 'One dashboard for offers, content, and product pricing.',
  },
  {
    name: 'Orbit Supply',
    icon: 'OS',
    industry: 'B2B commerce',
    quote: 'Cleaner setup checks before sending traffic live.',
  },
];

function cleanText(value, maxLength) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

function normalizeClient(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const name = cleanText(raw.name, 80);
  if (!name) {
    return null;
  }
  const icon = cleanText(raw.icon || name.slice(0, 2).toUpperCase(), 8).toUpperCase();
  return {
    name,
    icon,
    industry: cleanText(raw.industry, 80),
    quote: cleanText(raw.quote, 160),
  };
}

function normalizeClients(input) {
  const source = Array.isArray(input) ? input : [];
  return source.map(normalizeClient).filter(Boolean).slice(0, CLIENTS_MAX);
}

async function getConfiguredLandingClients() {
  const result = await query('SELECT value FROM key_value_store WHERE key = $1', [
    LANDING_CLIENTS_KV_KEY,
  ]);
  const raw = result.rows?.[0]?.value;
  if (!raw) {
    return [];
  }
  try {
    return normalizeClients(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function getLandingClients({ includeFallback = true } = {}) {
  const configured = await getConfiguredLandingClients();
  if (configured.length > 0 || !includeFallback) {
    return {
      clients: configured,
      source: configured.length > 0 ? 'configured' : 'empty',
      fallback: FALLBACK_CLIENTS,
    };
  }
  return { clients: FALLBACK_CLIENTS, source: 'fallback', fallback: FALLBACK_CLIENTS };
}

async function saveLandingClients(clients) {
  const normalized = normalizeClients(clients);
  await query(
    `INSERT INTO key_value_store (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [LANDING_CLIENTS_KV_KEY, JSON.stringify(normalized)]
  );
  return normalized;
}

module.exports = {
  LANDING_CLIENTS_KV_KEY,
  FALLBACK_CLIENTS,
  normalizeClients,
  getLandingClients,
  saveLandingClients,
};
