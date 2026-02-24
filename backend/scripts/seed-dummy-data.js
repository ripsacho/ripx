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
 *   SEED_VISITORS_MIN - Min visitors per test (default: 80)
 *   SEED_VISITORS_MAX - Max visitors per test (default: 400)
 *   SEED_CONVERSION_RATE - Conversion rate 0-1 (default: 0.03-0.07 random per test)
 *   SEED_REVENUE_MIN - Min order value USD (default: 15)
 *   SEED_REVENUE_MAX - Max order value USD (default: 250)
 */
/* eslint-disable no-console */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { getClient } = require('../src/utils/database');
const { getTestsByShop } = require('../src/models/test');
const { insertHeatmapEventsBatch } = require('../src/models/heatmap');

const DEVICES = ['desktop', 'mobile', 'tablet'];
const COUNTRIES = ['US', 'CA', 'GB', 'DE', 'AU', 'FR', 'IN', 'JP', 'BR', 'MX'];
const HEATMAP_PAGES = ['/', '/products', '/collections/all', '/cart', '/pages/about'];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomFloat(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
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
  } = options;

  const tests = await getTestsByShop(shopDomain, null);
  const testsWithVariants = tests.filter(t => t.variants && t.variants.length > 0);

  if (testsWithVariants.length === 0) {
    console.log('No tests with variants found. Create and run some tests first.');
    return { tests: 0, assignments: 0, events: 0, heatmap: 0 };
  }

  console.log(`Seeding ${testsWithVariants.length} test(s) for shop: ${shopDomain}`);

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
        });
        await client.query(eventSql, [test.id, variantId, uid, shopDomain, revenue, metadata]);
        totalEvents += 1;
      }

      // Optionally add some custom events (add_to_cart) for event explorer
      const customEventSql = `
        INSERT INTO events (test_id, variant_id, user_id, shop_domain, event_type, event_name, event_value, metadata, created_at)
        VALUES ($1, $2, $3, $4, 'custom', $5, 0, '{}', NOW() - (random() * interval '7 days'))
      `;
      const addToCartCount = Math.min(randomInt(20, 50), shuffled.length);
      const addToCartUsers = shuffled.slice(0, addToCartCount);
      for (const { uid, variantId } of addToCartUsers) {
        await client.query(customEventSql, [test.id, variantId, uid, shopDomain, 'add_to_cart']);
        totalEvents += 1;
      }

      // Seed heatmap events (clicks + scroll) for heatmap view
      // Heatmap uses FLOOR(x/10), FLOOR(y/10) for 10x10 grid - use x,y in 0-95
      let testHeatmapCount = 0;
      try {
        const heatmapEvents = [];
        const viewportW = 100;
        const viewportH = 100;
        for (const variant of variants) {
          const variantId = String(variant.id ?? variant.name ?? '');
          const pageUrl = randomChoice(HEATMAP_PAGES);
          // Click events - spread across 10x10 grid (x,y 0-95 -> buckets 0-9)
          const clickCount = randomInt(80, 200);
          for (let i = 0; i < clickCount; i++) {
            const x = randomInt(0, 95);
            const y = randomInt(0, 95);
            heatmapEvents.push({
              test_id: test.id,
              variant_id: variantId,
              shop_domain: shopDomain,
              page_url: pageUrl,
              event_type: 'click',
              x,
              y,
              scroll_depth: null,
              viewport_width: viewportW,
              viewport_height: viewportH,
            });
          }
          // Scroll events - distribution across depth buckets
          const scrollCount = randomInt(60, 150);
          for (let i = 0; i < scrollCount; i++) {
            const depth = randomInt(0, 100);
            heatmapEvents.push({
              test_id: test.id,
              variant_id: variantId,
              shop_domain: shopDomain,
              page_url: pageUrl,
              event_type: 'scroll',
              x: null,
              y: null,
              scroll_depth: depth,
              viewport_width: viewportW,
              viewport_height: viewportH,
            });
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
  };
}

async function main() {
  const shopDomain = process.env.SHOP_DOMAIN || process.env.VITE_SHOP_DOMAIN || process.argv[2];

  if (!shopDomain) {
    console.error('Usage: SHOP_DOMAIN=store.myshopify.com node seed-dummy-data.js');
    console.error('   or: node seed-dummy-data.js store.myshopify.com');
    process.exit(1);
  }

  const options = {
    visitorsMin: parseInt(process.env.SEED_VISITORS_MIN, 10) || 80,
    visitorsMax: parseInt(process.env.SEED_VISITORS_MAX, 10) || 400,
    conversionRateMin: parseFloat(process.env.SEED_CONVERSION_RATE_MIN) || 0.02,
    conversionRateMax: parseFloat(process.env.SEED_CONVERSION_RATE_MAX) || 0.08,
    revenueMin: parseFloat(process.env.SEED_REVENUE_MIN) || 15,
    revenueMax: parseFloat(process.env.SEED_REVENUE_MAX) || 250,
    includeSegments: process.env.SEED_INCLUDE_SEGMENTS !== 'false',
  };

  try {
    const result = await seedDummyData(shopDomain, options);
    console.log(
      `\nDone! Seeded ${result.assignments} visitors, ${result.events} events${result.heatmap ? `, ${result.heatmap} heatmap events` : ''} across ${result.tests} tests.`
    );
    console.log('Refresh your dashboard and analytics to see the data.');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    const { closeDatabase } = require('../src/utils/database');
    await closeDatabase();
  }
}

main();
