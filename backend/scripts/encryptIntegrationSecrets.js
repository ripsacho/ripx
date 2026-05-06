#!/usr/bin/env node

require('dotenv').config();

const { query, closeDatabase } = require('../src/utils/database');
const {
  getIntegrationConfig,
  saveIntegrationConfig,
} = require('../src/services/integrationConfigService');

async function run() {
  if (!process.env.RIPX_SECRET_ENCRYPTION_KEY && !process.env.SECRET_ENCRYPTION_KEY) {
    throw new Error(
      'Set RIPX_SECRET_ENCRYPTION_KEY before re-encrypting stored integration secrets.'
    );
  }

  const result = await query(`
    SELECT shop_domain
    FROM shop_settings
    WHERE ga4_api_secret IS NOT NULL
       OR bigquery_credentials IS NOT NULL
    ORDER BY shop_domain
  `);

  let updated = 0;
  for (const row of result.rows || []) {
    const config = await getIntegrationConfig(row.shop_domain);
    if (!config) {
      continue;
    }
    await saveIntegrationConfig(row.shop_domain, config);
    updated += 1;
    console.log(`Re-encrypted integration secrets for ${row.shop_domain}`);
  }

  console.log(`Done. Re-encrypted integration secrets for ${updated} shop(s).`);
}

run()
  .catch(error => {
    console.error('Failed to re-encrypt integration secrets:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
