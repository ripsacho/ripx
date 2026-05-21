#!/usr/bin/env node
/**
 * Seed Dummy Data for RipX
 *
 * Inserts random visitors (test_assignments) and conversion events
 * for existing tests to populate analytics reports.
 *
 * Usage:
 *   SHOP_DOMAIN=your-store.myshopify.com node backend/scripts/seed-dummy-data.js
 *   node backend/scripts/seed-dummy-data.js your-store.myshopify.com
 *   npm run seed:dummy
 *
 * Options (env vars):
 *   SHOP_DOMAIN - Shop domain (required)
 *   SEED_TEST_STATUS - Test status filter, e.g. running for live tests (default: all)
 *   SEED_VISITORS_MIN - Min visitors per test (default: 80)
 *   SEED_VISITORS_MAX - Max visitors per test (default: 400)
 *   SEED_CONVERSION_RATE - Conversion rate 0-1 (default: 0.03-0.07 random per test)
 *   SEED_REVENUE_MIN - Min order value USD (default: 15)
 *   SEED_REVENUE_MAX - Max order value USD (default: 250)
 *   SEED_HEATMAP_SCREENSHOTS - Store real screenshot URLs for heatmap pages (default: true)
 *   SEED_SCREENSHOT_SERVICE - Screenshot URL template. Use {url} for encoded page URL.
 *   SEED_SCREENSHOT_USE_PREVIEW_PROXY - Use /api/track/preview-document when password is set (default: true)
 *   SEED_ONLY_SCREENSHOTS - Only repair/store heatmap screenshot URLs, no analytics rows.
 */
/* eslint-disable no-console */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { getClient, closeDatabase } = require('../src/utils/database');
const { getTestsByShop } = require('../src/models/test');
const {
  insertHeatmapEventsBatch,
  normalizeHeatmapPageKey,
  setHeatmapScreenshotUrl,
} = require('../src/models/heatmap');

const DEVICES = ['desktop', 'mobile', 'tablet'];
const COUNTRIES = ['US', 'CA', 'GB', 'DE', 'AU', 'FR', 'IN', 'JP', 'BR', 'MX'];
const DEFAULT_HEATMAP_PATHS = [
  '/',
  '/collections/all',
  '/products/ripperx-demo-product',
  '/cart',
  '/pages/about',
];
const HEATMAP_CLICK_HOTSPOTS = [
  { name: 'hero_primary_cta', x: 48, y: 42, weight: 0.28, spreadX: 10, spreadY: 7 },
  { name: 'product_image', x: 30, y: 48, weight: 0.18, spreadX: 12, spreadY: 10 },
  { name: 'add_to_cart', x: 70, y: 58, weight: 0.3, spreadX: 8, spreadY: 6 },
  { name: 'cart_checkout', x: 76, y: 72, weight: 0.14, spreadX: 7, spreadY: 5 },
  { name: 'nav_search', x: 84, y: 12, weight: 0.1, spreadX: 9, spreadY: 4 },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomFloat(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function weightedChoice(items) {
  const total = items.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
  let cursor = Math.random() * total;
  for (const item of items) {
    cursor -= Number(item.weight) || 0;
    if (cursor <= 0) {
      return item;
    }
  }
  return items[items.length - 1];
}

function getSeedBaseUrl(shopDomain) {
  const raw =
    process.env.SEED_BASE_URL ||
    process.env.STOREFRONT_URL ||
    (shopDomain ? `https://${String(shopDomain).trim().toLowerCase()}` : '');
  return String(raw || '').replace(/\/+$/, '');
}

function getSeedAppUrl() {
  return String(
    process.env.SEED_APP_URL ||
      process.env.APP_URL ||
      process.env.FRONTEND_URL ||
      'https://splitter.echologyx.com'
  ).replace(/\/+$/, '');
}

function buildHeatmapPages(shopDomain) {
  const configured = String(process.env.SEED_HEATMAP_PAGES || '')
    .split(',')
    .map(page => page.trim())
    .filter(Boolean);
  const pages = configured.length > 0 ? configured : DEFAULT_HEATMAP_PATHS;
  const baseUrl = getSeedBaseUrl(shopDomain);
  return pages.map(page => {
    if (/^https?:\/\//i.test(page)) {
      return page;
    }
    const path = page.startsWith('/') ? page : `/${page}`;
    return baseUrl ? `${baseUrl}${path}` : path;
  });
}

function buildPasswordPreviewDocumentUrl(pageUrl, storefrontPassword) {
  const password = String(storefrontPassword || '').trim();
  const useProxy = process.env.SEED_SCREENSHOT_USE_PREVIEW_PROXY !== 'false';
  if (!password || !useProxy) {
    return pageUrl;
  }
  const appUrl = getSeedAppUrl();
  const params = new URLSearchParams();
  params.set('url', pageUrl);
  params.set('storefront_password', password);
  return `${appUrl}/api/track/preview-document?${params.toString()}`;
}

function buildSeedScreenshotUrl(pageUrl, storefrontPassword) {
  const explicitTemplate = String(process.env.SEED_SCREENSHOT_SERVICE || '').trim();
  const template =
    explicitTemplate || 'https://image.thum.io/get/width/1440/crop/5000/noanimate/{url}';
  const captureUrl = buildPasswordPreviewDocumentUrl(pageUrl, storefrontPassword);
  return template
    .replace('{encodedUrl}', encodeURIComponent(captureUrl))
    .replace('{url}', captureUrl);
}

async function seedHeatmapScreenshots(shopDomain, pages, storefrontPassword = '') {
  if (process.env.SEED_HEATMAP_SCREENSHOTS === 'false') {
    return 0;
  }
  let saved = 0;
  for (const pageUrl of pages) {
    const screenshotUrl = buildSeedScreenshotUrl(pageUrl, storefrontPassword);
    const pageKey = normalizeHeatmapPageKey(pageUrl);
    const aliases = [...new Set([pageUrl, pageKey].filter(Boolean))];
    for (const alias of aliases) {
      const result = await setHeatmapScreenshotUrl(shopDomain, alias, screenshotUrl);
      if (result && result.ok) {
        saved += 1;
      }
    }
  }
  return saved;
}

function generateRealisticClick() {
  const hotspot = weightedChoice(HEATMAP_CLICK_HOTSPOTS);
  return {
    x: randomFloat(
      Math.max(0, hotspot.x - hotspot.spreadX),
      Math.min(99, hotspot.x + hotspot.spreadX)
    ),
    y: randomFloat(
      Math.max(0, hotspot.y - hotspot.spreadY),
      Math.min(99, hotspot.y + hotspot.spreadY)
    ),
    hotspot: hotspot.name,
  };
}

function getSeedHeatmapPageDimensions(pageUrl) {
  const path = (() => {
    try {
      return new URL(pageUrl, 'https://ripx.local').pathname;
    } catch {
      return String(pageUrl || '');
    }
  })();
  if (path.includes('/products/')) {
    return { width: 1440, height: randomInt(3600, 5200) };
  }
  if (path.includes('/collections/')) {
    return { width: 1440, height: randomInt(3200, 4800) };
  }
  if (path.includes('/cart')) {
    return { width: 1440, height: randomInt(1700, 2600) };
  }
  if (path.includes('/pages/')) {
    return { width: 1440, height: randomInt(2600, 4200) };
  }
  return { width: 1440, height: randomInt(3000, 5000) };
}

function generateScrollDepth() {
  const roll = Math.random();
  if (roll < 0.18) {
    return randomInt(15, 35);
  }
  if (roll < 0.52) {
    return randomInt(40, 70);
  }
  if (roll < 0.82) {
    return randomInt(75, 95);
  }
  return 100;
}

function generateUserId() {
  return `visitor_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

async function seedDummyData(shopDomain, options = {}) {
  const {
    visitorsMin = 80,
    visitorsMax = 400,
    conversionRateMin = 0.02,
    conversionRateMax = 0.08,
    revenueMin = 15,
    revenueMax = 250,
    includeSegments = true,
    testStatus = null,
    onlyScreenshots = false,
    storefrontPassword = process.env.STOREFRONT_PASSWORD ||
      process.env.SEED_STOREFRONT_PASSWORD ||
      '',
  } = options;

  const tests = await getTestsByShop(shopDomain, testStatus);
  const testsWithVariants = tests.filter(t => t.variants && t.variants.length > 0);
  const heatmapPages = buildHeatmapPages(shopDomain);
  const screenshotCount = await seedHeatmapScreenshots(
    shopDomain,
    heatmapPages,
    storefrontPassword
  );

  if (onlyScreenshots) {
    console.log(
      `Stored ${screenshotCount} heatmap screenshot URL(s) for ${heatmapPages.length} page(s).`
    );
    return {
      tests: testsWithVariants.length,
      assignments: 0,
      events: 0,
      heatmap: 0,
      screenshots: screenshotCount,
    };
  }

  if (testsWithVariants.length === 0) {
    console.log(
      testStatus
        ? `No ${testStatus} tests with variants found. Start a test or clear SEED_TEST_STATUS.`
        : 'No tests with variants found. Create and run some tests first.'
    );
    return { tests: 0, assignments: 0, events: 0, heatmap: 0, screenshots: screenshotCount };
  }

  console.log(
    `Seeding ${testsWithVariants.length}${testStatus ? ` ${testStatus}` : ''} test(s) for shop: ${shopDomain}`
  );
  if (screenshotCount > 0) {
    console.log(`Stored ${screenshotCount} heatmap screenshot URL(s) for real storefront pages.`);
  }

  let totalAssignments = 0;
  let totalEvents = 0;
  let totalHeatmapEvents = 0;

  for (const test of testsWithVariants) {
    const variants = test.variants.filter(v => v && (v.id || v.name));
    if (variants.length === 0) {
      continue;
    }

    const visitorCount = randomInt(visitorsMin, visitorsMax);
    const conversionRate = randomFloat(conversionRateMin, conversionRateMax);
    const expectedConversions = Math.max(1, Math.floor(visitorCount * conversionRate));

    // Distribute visitors across variants (roughly equal, with some variance)
    const variantWeights = variants.map(() => 0.8 + Math.random() * 0.4);
    const weightSum = variantWeights.reduce((s, w) => s + w, 0);
    const variantCounts = variants.map((_, i) =>
      Math.max(1, Math.floor((visitorCount * variantWeights[i]) / weightSum))
    );
    const diff = visitorCount - variantCounts.reduce((s, c) => s + c, 0);
    if (diff !== 0) {
      variantCounts[0] += diff;
    }

    const client = await getClient();

    try {
      const allUserIds = [];
      const usersByVariant = [];

      for (let vIdx = 0; vIdx < variants.length; vIdx++) {
        const variant = variants[vIdx];
        const variantId = String(variant.id ?? variant.name ?? vIdx);
        const variantName = String(variant.name ?? variantId);
        const count = variantCounts[vIdx];
        const userIds = [];

        for (let i = 0; i < count; i++) {
          const uid = generateUserId();
          userIds.push(uid);
          allUserIds.push({ uid, variantId, variantName });
        }
        usersByVariant.push({ variantId, variantName, userIds });
      }

      // Insert test_assignments (visitors) - try with device/country first, fallback without
      const assignSqlWithSegment = `
        INSERT INTO test_assignments (test_id, user_id, shop_domain, variant_id, variant_name, assigned_at, device, country)
        VALUES ($1, $2, $3, $4, $5, NOW() - (random() * interval '14 days'), $6, $7)
        ON CONFLICT (test_id, user_id, shop_domain) DO NOTHING
      `;
      const assignSqlPlain = `
        INSERT INTO test_assignments (test_id, user_id, shop_domain, variant_id, variant_name, assigned_at)
        VALUES ($1, $2, $3, $4, $5, NOW() - (random() * interval '14 days'))
        ON CONFLICT (test_id, user_id, shop_domain) DO NOTHING
      `;

      let useSegmentColumns = includeSegments;
      let testAssignments = 0;
      for (const { variantId, variantName, userIds } of usersByVariant) {
        for (const uid of userIds) {
          try {
            if (useSegmentColumns) {
              const device = randomChoice(DEVICES);
              const country = randomChoice(COUNTRIES);
              await client.query(assignSqlWithSegment, [
                test.id,
                uid,
                shopDomain,
                variantId,
                variantName,
                device,
                country,
              ]);
            } else {
              await client.query(assignSqlPlain, [
                test.id,
                uid,
                shopDomain,
                variantId,
                variantName,
              ]);
            }
          } catch (err) {
            if (
              useSegmentColumns &&
              (err.message?.includes('device') || err.message?.includes('country'))
            ) {
              useSegmentColumns = false;
              await client.query(assignSqlPlain, [
                test.id,
                uid,
                shopDomain,
                variantId,
                variantName,
              ]);
            } else {
              throw err;
            }
          }
          testAssignments += 1;
          totalAssignments += 1;
        }
      }

      // Pick random users to convert (must be from our assignments)
      const converters = [];
      const shuffled = [...allUserIds].sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(expectedConversions, shuffled.length); i++) {
        converters.push(shuffled[i]);
      }

      // Insert conversion events
      const eventSql = `
        INSERT INTO events (test_id, variant_id, user_id, shop_domain, event_type, event_value, metadata, created_at)
        VALUES ($1, $2, $3, $4, 'conversion', $5, $6, NOW() - (random() * interval '10 days'))
      `;

      for (const { uid, variantId } of converters) {
        const revenue = randomFloat(revenueMin, revenueMax);
        const metadata = JSON.stringify({
          order_id: `seed_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          source: 'seed_dummy_data',
          conversion_url: `${getSeedBaseUrl(shopDomain)}/checkout/thank-you`,
          storefront_password_protected: Boolean(storefrontPassword),
        });
        await client.query(eventSql, [test.id, variantId, uid, shopDomain, revenue, metadata]);
        totalEvents += 1;
      }

      // Optionally add some custom events (add_to_cart) for event explorer
      const customEventSql = `
        INSERT INTO events (test_id, variant_id, user_id, shop_domain, event_type, event_name, event_value, metadata, created_at)
        VALUES ($1, $2, $3, $4, 'custom', $5, 0, $6, NOW() - (random() * interval '7 days'))
      `;
      const addToCartCount = Math.min(randomInt(20, 50), shuffled.length);
      const addToCartUsers = shuffled.slice(0, addToCartCount);
      for (const { uid, variantId } of addToCartUsers) {
        await client.query(customEventSql, [
          test.id,
          variantId,
          uid,
          shopDomain,
          'add_to_cart',
          JSON.stringify({
            source: 'seed_dummy_data',
            page_url: randomChoice(heatmapPages),
            storefront_password_protected: Boolean(storefrontPassword),
          }),
        ]);
        totalEvents += 1;
      }

      // Seed heatmap events (clicks + scroll) for heatmap view
      // Heatmap uses FLOOR(x/10), FLOOR(y/10) for 10x10 grid - use x,y in 0-95
      let testHeatmapCount = 0;
      try {
        const heatmapEvents = [];
        const viewportProfiles = [
          { width: 1440, height: 900 },
          { width: 1366, height: 768 },
          { width: 390, height: 844 },
          { width: 430, height: 932 },
        ];
        for (const variant of variants) {
          const variantId = String(variant.id ?? variant.name ?? '');
          for (const pageUrl of heatmapPages) {
            const pageDimensions = getSeedHeatmapPageDimensions(pageUrl);
            // Click events with realistic hotspots across hero, product, and cart CTAs.
            const clickCount = randomInt(45, 130);
            for (let i = 0; i < clickCount; i++) {
              const click = generateRealisticClick();
              const viewport = randomChoice(viewportProfiles);
              heatmapEvents.push({
                test_id: test.id,
                variant_id: variantId,
                shop_domain: shopDomain,
                page_url: pageUrl,
                event_type: 'click',
                x: click.x,
                y: click.y,
                scroll_depth: null,
                viewport_width: viewport.width,
                viewport_height: viewport.height,
                page_x: Math.round((click.x / 100) * pageDimensions.width),
                page_y: Math.round((click.y / 100) * pageDimensions.height),
                page_width: pageDimensions.width,
                page_height: pageDimensions.height,
              });
            }
            // Scroll events biased toward mid/deep scroll, with some bounce behavior.
            const scrollCount = randomInt(35, 90);
            for (let i = 0; i < scrollCount; i++) {
              const viewport = randomChoice(viewportProfiles);
              heatmapEvents.push({
                test_id: test.id,
                variant_id: variantId,
                shop_domain: shopDomain,
                page_url: pageUrl,
                event_type: 'scroll',
                x: null,
                y: null,
                scroll_depth: generateScrollDepth(),
                viewport_width: viewport.width,
                viewport_height: viewport.height,
              });
            }
          }
        }
        if (heatmapEvents.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < heatmapEvents.length; i += batchSize) {
            const batch = heatmapEvents.slice(i, i + batchSize);
            const { inserted } = await insertHeatmapEventsBatch(batch);
            testHeatmapCount += inserted;
            totalHeatmapEvents += inserted;
          }
        }
      } catch (heatmapErr) {
        if (
          heatmapErr.message?.includes('heatmap_events') ||
          heatmapErr.message?.includes('does not exist')
        ) {
          console.log('  (heatmap_events table not found - run migrations)');
        } else {
          throw heatmapErr;
        }
      }

      console.log(
        `  ${test.name}: ${testAssignments} visitors, ${converters.length} conversions, ${addToCartCount} add_to_cart${testHeatmapCount > 0 ? `, ${testHeatmapCount} heatmap` : ''}`
      );
    } finally {
      client.release();
    }
  }

  return {
    tests: testsWithVariants.length,
    assignments: totalAssignments,
    events: totalEvents,
    heatmap: totalHeatmapEvents,
    screenshots: screenshotCount,
  };
}

async function main() {
  try {
    const shopDomain = process.env.SHOP_DOMAIN || process.env.VITE_SHOP_DOMAIN || process.argv[2];

    if (!shopDomain) {
      console.error('Usage: SHOP_DOMAIN=store.myshopify.com node seed-dummy-data.js');
      console.error('   or: node seed-dummy-data.js store.myshopify.com');
      process.exitCode = 1;
      return;
    }

    const options = {
      visitorsMin: parseInt(process.env.SEED_VISITORS_MIN, 10) || 80,
      visitorsMax: parseInt(process.env.SEED_VISITORS_MAX, 10) || 400,
      conversionRateMin: parseFloat(process.env.SEED_CONVERSION_RATE_MIN) || 0.02,
      conversionRateMax: parseFloat(process.env.SEED_CONVERSION_RATE_MAX) || 0.08,
      revenueMin: parseFloat(process.env.SEED_REVENUE_MIN) || 15,
      revenueMax: parseFloat(process.env.SEED_REVENUE_MAX) || 250,
      includeSegments: process.env.SEED_INCLUDE_SEGMENTS !== 'false',
      testStatus:
        process.env.SEED_TEST_STATUS || (process.env.SEED_LIVE_ONLY === 'true' ? 'running' : null),
      onlyScreenshots: process.env.SEED_ONLY_SCREENSHOTS === 'true',
      storefrontPassword:
        process.env.STOREFRONT_PASSWORD || process.env.SEED_STOREFRONT_PASSWORD || '',
    };

    const result = await seedDummyData(shopDomain, options);
    console.log(
      `\nDone! Seeded ${result.assignments} visitors, ${result.events} events${result.heatmap ? `, ${result.heatmap} heatmap events` : ''}${result.screenshots ? `, ${result.screenshots} heatmap screenshots` : ''} across ${result.tests} tests.`
    );
    console.log('Refresh your dashboard and analytics to see the data.');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await closeDatabase().catch(() => {});
    process.exit(process.exitCode ?? 0);
  }
}

main().catch(err => {
  console.error('seed-dummy-data crashed:', err.message);
  process.exit(1);
});
