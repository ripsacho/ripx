/**
 * Advanced Documentation Component
 *
 * Visual, comprehensive docs with sidebar nav, search, code blocks,
 * flow diagrams, tables, and step-by-step guides
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Page,
  BlockStack,
  Text,
  Box,
  Divider,
  TextField,
  Icon,
  Button,
  Tooltip,
} from '@shopify/polaris';
import {
  BookIcon,
  ChartVerticalIcon,
  PlayCircleIcon,
  TargetIcon,
  ChartLineIcon,
  SettingsIcon,
  DataTableIcon,
  LinkIcon,
  ExportIcon,
  CodeIcon,
  StoreIcon,
  GlobeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronRightIcon,
  CompassIcon,
  ConnectIcon,
  SearchIcon,
  ArrowUpIcon,
  ClipboardIcon,
  HomeIcon,
  ListBulletedIcon,
  PersonIcon,
  NotificationIcon,
} from '@shopify/polaris-icons';
import pageShell from '../Shared/PageShell.module.css';
import styles from './Documentation.module.css';
import { ROUTES } from '../../constants';
import { RIPX_STOREFRONT_SCRIPT_VERSION } from '../../constants/app';
import {
  CodeBlock,
  StepList,
  DocTable,
  DocCallout,
  FlowDiagram,
  DocCard,
  DocGrid,
} from './DocComponents';

const SECTIONS = [
  {
    id: 'overview',
    title: 'Overview',
    icon: BookIcon,
    group: 'start',
    keywords: 'intro platform capabilities',
  },
  {
    id: 'installation',
    title: 'Installation & Snippets',
    icon: CodeIcon,
    group: 'start',
    keywords: 'script embed proxy shopify standalone',
  },
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: PlayCircleIcon,
    group: 'start',
    keywords: 'clone env migrate node postgresql',
  },
  {
    id: 'setup-wizard',
    title: 'Setup Wizard',
    icon: CompassIcon,
    group: 'start',
    keywords: 'first-time configure defaults',
  },
  {
    id: 'connect',
    title: 'Connect & API Key',
    icon: ConnectIcon,
    group: 'start',
    keywords: 'standalone api key register domain',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: ChartVerticalIcon,
    group: 'core',
    keywords: 'home stats quick start recent',
  },
  {
    id: 'tests',
    title: 'Tests',
    icon: TargetIcon,
    group: 'core',
    keywords: 'lifecycle types traffic allocation variants',
  },
  {
    id: 'price-testing',
    title: 'Price testing (Shopify)',
    icon: TargetIcon,
    group: 'core',
    keywords: 'price checkout catalog discount display pdp catalog alignment',
  },
  {
    id: 'data-flow',
    title: 'Data Flow & Variants',
    icon: ChartLineIcon,
    group: 'core',
    keywords: 'cache placeholder variant_count navigation',
  },
  {
    id: 'test-wizard',
    title: 'Test Wizard',
    icon: TargetIcon,
    group: 'core',
    keywords: 'create steps goal metrics targeting',
  },
  {
    id: 'targeting',
    title: 'Targeting',
    icon: TargetIcon,
    group: 'core',
    keywords: 'device country segment presets rules',
  },
  {
    id: 'analytics',
    title: 'Analytics',
    icon: ChartLineIcon,
    group: 'core',
    keywords: 'metrics significance p-value funnel heatmap events',
  },
  {
    id: 'heatmap-funnel',
    title: 'Heatmap & Funnel',
    icon: ChartVerticalIcon,
    group: 'core',
    keywords: 'click scroll conversion steps',
  },
  {
    id: 'settings',
    title: 'App settings',
    icon: SettingsIcon,
    group: 'integrations',
    keywords: 'sample size confidence webhook theme',
  },
  {
    id: 'integrations',
    title: 'Integrations',
    icon: DataTableIcon,
    group: 'integrations',
    keywords: 'GA4 BigQuery export',
  },
  {
    id: 'webhooks',
    title: 'Webhooks',
    icon: LinkIcon,
    group: 'integrations',
    keywords: 'outbound POST test_complete significance',
  },
  {
    id: 'promo-links',
    title: 'Promo Links',
    icon: LinkIcon,
    group: 'integrations',
    keywords: 'discount shareable link',
  },
  {
    id: 'export',
    title: 'Export',
    icon: ExportIcon,
    group: 'integrations',
    keywords: 'CSV JSON BigQuery report',
  },
  {
    id: 'api',
    title: 'API Reference',
    icon: CodeIcon,
    group: 'advanced',
    keywords: 'endpoints auth swagger',
  },
  {
    id: 'storefront',
    title: 'Storefront',
    icon: StoreIcon,
    group: 'advanced',
    keywords: 'track conversion script',
  },
  {
    id: 'multi-platform',
    title: 'Multi-Platform',
    icon: GlobeIcon,
    group: 'advanced',
    keywords: 'shopify standalone tenants',
  },
];

const SECTION_GROUPS = [
  { key: 'start', label: 'Getting Started' },
  { key: 'core', label: 'Core Features' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'advanced', label: 'Advanced' },
];

function SectionNav({ section, scrollToSection }) {
  const idx = SECTIONS.findIndex(s => s.id === section.id);
  const prev = idx > 0 ? SECTIONS[idx - 1] : null;
  const next = idx >= 0 && idx < SECTIONS.length - 1 ? SECTIONS[idx + 1] : null;
  if (!prev && !next) return null;
  return (
    <nav className={styles.sectionNav} aria-label="Section navigation">
      {prev ? (
        <button
          type="button"
          className={styles.sectionNavLink}
          onClick={() => scrollToSection(prev.id)}
          aria-label={`Previous section: ${prev.title}`}
        >
          <span className={styles.sectionNavIconPrev}>
            <Icon source={ChevronRightIcon} />
          </span>
          <span>
            <span className={styles.sectionNavLabel}>Previous</span>
            {prev.title}
          </span>
        </button>
      ) : (
        <div />
      )}
      {next ? (
        <button
          type="button"
          className={`${styles.sectionNavLink} ${styles.sectionNavLinkNext}`}
          onClick={() => scrollToSection(next.id)}
          aria-label={`Next section: ${next.title}`}
        >
          <span>
            <span className={styles.sectionNavLabel}>Next</span>
            {next.title}
          </span>
          <Icon source={ChevronRightIcon} />
        </button>
      ) : (
        <div />
      )}
    </nav>
  );
}

function CopySectionLink({ sectionId }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}#${sectionId}`;
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [sectionId]);
  return (
    <Tooltip content="Copy link to this section" preferredPosition="above">
      <span className={styles.copySectionLinkWrap}>
        <Button
          variant="plain"
          size="slim"
          icon={ClipboardIcon}
          onClick={handleCopy}
          accessibilityLabel="Copy section link"
          className={styles.copySectionLink}
        >
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
      </span>
    </Tooltip>
  );
}

function DocSectionContent({ sectionId }) {
  switch (sectionId) {
    case 'overview':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            RipX is an enterprise-grade A/B testing platform for Shopify and standalone e-commerce
            sites. Run price tests, content experiments, shipping tests, and promotional offers with
            statistical rigor.
          </Text>
          <FlowDiagram
            steps={['Create Test', 'Assign Variants', 'Track Events', 'Analyze Results']}
          />
          <Text variant="headingMd" as="h4">
            Key Capabilities
          </Text>
          <DocGrid columns={2}>
            <DocCard icon={<TargetIcon />} title="8 Test Types">
              Price, Onsite Edit, Split URL, Template, Theme, Shipping, Offer, Checkout
            </DocCard>
            <DocCard icon={<ChartVerticalIcon />} title="Multi-Variant">
              A/B, A/B/C, multivariate with custom traffic allocation
            </DocCard>
            <DocCard icon={<ChartLineIcon />} title="Statistical Engine">
              Z-test, p-value, confidence intervals, sample size calculator
            </DocCard>
            <DocCard icon={<DataTableIcon />} title="Integrations">
              GA4, BigQuery, outbound webhooks
            </DocCard>
            <DocCard icon={<ChartLineIcon />} title="Reliable Variant Display">
              variant_count from API; correct display across list, detail, wizard
            </DocCard>
            <DocCard icon={<LinkIcon />} title="Targeting & Presets">
              Device, country, customer segment; save presets for reuse
            </DocCard>
          </DocGrid>
        </BlockStack>
      );

    case 'installation':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            RipX works with both Shopify and non-Shopify sites. Get your snippet from{' '}
            <strong>App settings → Installation</strong> (in the app: open a store, then Settings in
            the sidebar).
          </Text>
          <Text variant="headingMd" as="h4">
            Shopify
          </Text>
          <p>
            Use App Proxy + App Embed (recommended) or direct script. Configure App Proxy in Partner
            Dashboard: subpath <code>apps/ripx</code>. Enable <strong>RipX App Embed</strong> in the
            theme editor (it injects in <code>&lt;head&gt;</code> with <code>defer</code> and{' '}
            <code>fetchpriority=&quot;high&quot;</code> to reduce flicker). Settings → Installation
            shows the exact snippet for your store (including <code>?v=</code> cache bust).
          </p>
          <CodeBlock
            code={`<!-- App Proxy (recommended) — <head>, defer; v matches RipX runtime embed -->
<script src="https://your-shop.myshopify.com/apps/ripx/script.js?v=${RIPX_STOREFRONT_SCRIPT_VERSION}" defer crossorigin="anonymous" fetchpriority="high"></script>

<!-- Or direct API -->
<script src="https://your-app.com/api/track/script.js?shop=your-shop.myshopify.com" defer crossorigin="anonymous" fetchpriority="low"></script>`}
            language="html"
          />
          <Text variant="headingMd" as="h4">
            Standalone (non-Shopify)
          </Text>
          <StepList
            steps={[
              'Register at /connect (Register new site tab) with your domain',
              'Copy API key and connect',
              'Add snippet from App settings → Installation',
            ]}
          />
          <CodeBlock
            code='<script src="https://your-app.com/api/track/script.js?site=example.com"></script>'
            language="html"
          />
          <DocCallout type="info" title="Platform detection">
            App settings → Installation shows the correct snippet for your platform (Shopify or
            Standalone) with copy buttons.
          </DocCallout>
        </BlockStack>
      );

    case 'getting-started':
      return (
        <BlockStack gap="400">
          <Text variant="headingMd" as="h4">
            Prerequisites
          </Text>
          <ul className={styles.bulletList}>
            <li>Node.js 18+</li>
            <li>PostgreSQL</li>
            <li>Shopify Partner account (Shopify) or API key (standalone)</li>
          </ul>
          <Text variant="headingMd" as="h4">
            Installation
          </Text>
          <StepList
            steps={[
              'Clone the repository and run npm install',
              'Copy .env.example to .env and configure credentials',
              'Run npm run migrate to set up the database',
              'Start with npm run dev (backend + frontend)',
            ]}
          />
          <CodeBlock
            code={`git clone <repo>
cd RipX
npm install
cp .env.example .env
# Edit .env with your credentials
npm run migrate
npm run dev`}
            language="bash"
          />
          <Text variant="headingMd" as="h4">
            Environment Variables
          </Text>
          <DocTable
            headers={['Variable', 'Required', 'Description']}
            rows={[
              ['DATABASE_URL', 'Yes', 'PostgreSQL connection string'],
              ['JWT_SECRET', 'Yes', 'Secret for JWT tokens'],
              ['APP_URL', 'Yes', 'Base URL (e.g. https://your-app.com)'],
              ['SHOPIFY_API_KEY', 'Shopify', 'From Partner Dashboard'],
              ['SHOPIFY_API_SECRET', 'Shopify', 'From Partner Dashboard'],
              ['GA4_MEASUREMENT_ID', 'Optional', 'For GA4 event forwarding'],
              ['GCP_PROJECT_ID', 'Optional', 'For BigQuery export'],
            ]}
          />
        </BlockStack>
      );

    case 'setup-wizard':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            The Setup Wizard guides you through initial configuration: storefront snippet, test
            defaults, and optional integrations.
          </Text>
          <Text variant="headingMd" as="h4">
            Steps
          </Text>
          <StepList
            steps={[
              { title: 'Installation', desc: 'Copy snippet for Shopify or standalone' },
              { title: 'Configuration', desc: 'Sample size, confidence, webhooks' },
              { title: 'Review', desc: 'Summary and launch' },
            ]}
          />
          <DocCallout type="info" title="First-time setup">
            Access via <strong>/setup</strong> or from the sidebar. Completing the wizard applies
            recommended defaults.
          </DocCallout>
        </BlockStack>
      );

    case 'connect':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            For standalone (non-Shopify) sites — WordPress, Webflow, custom HTML, etc. — connect
            using an API key. Register your domain once and receive a key to authenticate all
            requests.
          </Text>
          <Text variant="headingMd" as="h4">
            Quick start
          </Text>
          <StepList
            steps={[
              'Go to Connect → Register new site',
              'Enter your domain (e.g. example.com or www.example.com)',
              'Copy the API key — it is shown only once',
              'Click "Use this key & connect" or paste in the "I have an API key" tab',
            ]}
          />
          <Text variant="headingMd" as="h4">
            Install the script
          </Text>
          <p>
            After connecting, go to Setup Wizard or App settings → Installation. Copy the script URL
            and add it to your site&apos;s <code>&lt;head&gt;</code> or before{' '}
            <code>&lt;/body&gt;</code>.
          </p>
          <Text variant="headingMd" as="h4">
            API authentication
          </Text>
          <p>
            Use <code>X-RipX-API-Key: your_key</code> or <code>Authorization: Bearer your_key</code>{' '}
            on API requests.
          </p>
        </BlockStack>
      );

    case 'dashboard':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            The Dashboard provides an overview of all tests and key metrics at a glance.
          </Text>
          <Text variant="headingMd" as="h4">
            Features
          </Text>
          <DocGrid columns={2}>
            <DocCard title="Quick Stats">Total, running, and completed test counts</DocCard>
            <DocCard title="Progress Ring">Visual indicator of active test health</DocCard>
            <DocCard title="Quick Start">One-click: Price, Content, Shipping, Offer tests</DocCard>
            <DocCard title="Recent Tests">Latest tests with status badges</DocCard>
          </DocGrid>
          <Text variant="headingMd" as="h4">
            Navigation
          </Text>
          <DocTable
            headers={['Route', 'Description']}
            rows={[
              ['/', 'Dashboard home'],
              [ROUTES.TESTS, 'All tests with filters'],
              [ROUTES.CREATE_TEST, 'Create test wizard'],
              ['/analytics', 'Cross-test analytics'],
            ]}
          />
        </BlockStack>
      );

    case 'tests':
      return (
        <BlockStack gap="400">
          <Text variant="headingMd" as="h4">
            Test Lifecycle
          </Text>
          <FlowDiagram steps={['Draft', 'Running', 'Stopped / Completed']} />
          <Text variant="headingMd" as="h4">
            Test Types
          </Text>
          <DocTable
            headers={['Type', 'Description', 'Use Case']}
            rows={[
              ['Price', 'Product/collection prices', 'Find optimal pricing'],
              ['Onsite Edit', 'Edit/hide DOM elements', 'CTA text, images'],
              ['Split URL', 'Alternate URLs', 'Landing pages'],
              ['Template', 'Theme sections', 'Section layouts'],
              ['Theme', 'Full theme', 'Redesigns'],
              ['Shipping', 'Rates & thresholds', 'Free shipping tests'],
              ['Offer', 'Discounts, promos', 'Conversion boosts'],
              ['Checkout', 'Checkout UI', 'Friction reduction'],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Traffic Allocation
          </Text>
          <ul className={styles.bulletList}>
            <li>Drag sliders to set variant percentages</li>
            <li>Holdout group: exclude % of traffic from test</li>
            <li>Equal split button for instant 50/50</li>
            <li>Minimum 1% per variant</li>
            <li>Add or remove variants dynamically; changes persist on save</li>
            <li>
              <strong>Personalization</strong>: Show winning variant to all visitors after test ends
            </li>
            <li>
              <strong>Combination tests</strong>: Test multiple factors (e.g. price + shipping)
              together
            </li>
          </ul>
        </BlockStack>
      );

    case 'price-testing':
      return (
        <BlockStack gap="400">
          <DocCallout type="warning" title="Key takeaway">
            Price tests change only the <strong>visible price on the product page (PDP)</strong>.
            Checkout uses your <strong>Shopify catalog price</strong> unless you align it (catalog =
            highest test price + discounts or Functions).
          </DocCallout>
          <Text variant="headingMd" as="h4">
            Where the test price appears
          </Text>
          <DocTable
            headers={['Location', 'Test price applied?', 'Notes']}
            rows={[
              [
                'Product page (PDP) — main block',
                'Yes',
                'Only place RipX reliably paints the test price',
              ],
              [
                'Collection / PLP grids',
                'No',
                'Script does not change prices on collection or search result cards',
              ],
              [
                'Cart drawer / mini-cart',
                'Best-effort',
                'Theme-dependent; script may not find line-item elements',
              ],
              [
                'Checkout',
                'No (unless you add alignment)',
                'Customer pays catalog price unless you use options below',
              ],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Checkout alignment options
          </Text>
          <DocTable
            headers={['Approach', 'Checkout matches test?', 'Who can use it']}
            rows={[
              [
                'Catalog = highest + automatic discount',
                'Yes (if discount applies the right amount per segment)',
                'Any plan; you or an app create the discount',
              ],
              [
                'Shopify Plus + Cart Transform',
                'Yes; Function overrides line price at checkout',
                'Plus only; one Cart Transform per store',
              ],
              [
                'Discount Function + cart attribute',
                'Yes; Function reads attributes and applies discount',
                'Any plan; build/deploy a Discount Function (up to 25 per store)',
              ],
              [
                'Display-only (RipX today, no Function)',
                'No',
                'Use for perception tests or combine with above',
              ],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Align checkout in 3 steps
          </Text>
          <StepList
            steps={[
              'Set your product catalog price to the highest price in the test (e.g. the highest variant).',
              'Use automatic discounts (manual or app) to give $ or % off for lower arms, or use Shopify Plus Cart Transform or a Discount Function that reads cart attributes.',
              'RipX injects attributes[_ripx_price_test] and attributes[_ripx_variant] into the cart — a Discount Function can read these at checkout and apply the correct discount so charged price matches the displayed price.',
            ]}
          />
          <Text variant="headingMd" as="h4">
            Discounts vs price increases
          </Text>
          <DocTable
            headers={['Mode', 'Discount (lower price)', 'Increase (higher price)']}
            rows={[
              ['Fixed price', 'Set price < catalog', 'Set price > catalog'],
              ['$ off/on (amount)', 'Negative delta (e.g. −5)', 'Positive delta (e.g. +5)'],
              ['% off/on', 'Positive % (e.g. 10 = 10% off)', 'Negative % (e.g. −10 = 10% on)'],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Variant configuration (wizard)
          </Text>
          <p>
            In the Test Wizard Traffic step, configure each variant: <strong>Fixed price</strong>,{' '}
            <strong>$ off/on</strong> (amount), or <strong>% off/on</strong> (percent). Control =
            leave empty for catalog price. Use <strong>Product scope</strong> to run on all products
            or selected products only. Optional <strong>per-product overrides</strong> let you set
            different prices or rules per product in one test (e.g. 10% off on premium SKUs, $5 off
            on economy). When using selected products, you can add{' '}
            <strong>per-variant (per-SKU) overrides</strong>: for each product, add variant
            overrides with the Shopify variant ID (from Admin or API) and a price or rule for that
            SKU so different sizes/options can have different test prices.
          </p>
          <Text variant="headingMd" as="h4">
            Before you run
          </Text>
          <ul className={styles.bulletList}>
            <li>
              <strong>Checkout alignment:</strong> If charged price should match displayed price,
              set catalog to the highest test price and use discounts or a Discount Function for
              lower arms.
            </li>
            <li>
              <strong>Feeds &amp; ads:</strong> Google Shopping, Meta, etc. use catalog price;
              raising catalog to max test price affects what appears in feeds.
            </li>
            <li>
              <strong>Bundles:</strong> If you use a bundle app with Cart Transform, only one
              transform runs per store — prefer a Discount Function or display-only for price tests.
            </li>
            <li>
              <strong>Subscriptions:</strong> Selling plans block Cart Transform price overrides;
              use display-only with caution on subscription products.
            </li>
            <li>
              <strong>Product targeting:</strong> RipX applies the test price only on product pages
              for targeted products; collection-only targeting does not change PDP price.
            </li>
          </ul>
          <Text variant="headingMd" as="h4">
            Primary metric for price tests
          </Text>
          <p>
            Use <strong>Revenue</strong> (or <strong>Profit</strong> if you track COGS) as the
            primary success metric for price tests. Conversion rate alone tends to favor lower
            prices; revenue and profit reflect the trade-off between price and volume and lead to
            better long-term decisions.
          </p>
          <Text variant="headingMd" as="h4">
            Sample size &amp; minimum detectable effect (MDE)
          </Text>
          <p>
            <strong>MDE</strong> is the smallest change in a metric your test can reliably detect.
            Lower MDE needs more conversions and a longer run. A common target:{' '}
            <strong>~300 conversions per variant</strong> to detect a <strong>10%</strong> relative
            change at <strong>90%</strong> confidence (and ~80% power). For a 5% effect you
            typically need 4× or more. Avoid stopping early without a sequential design to prevent
            inflated false positives.
          </p>
          <p>
            Use a sample size calculator to plan: baseline conversion rate, desired MDE, confidence
            level, and power → required conversions or days. Example:{' '}
            <a
              href="https://www.evanmiller.org/ab-testing/sample-size.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Evan Miller’s sample size calculator
            </a>{' '}
            (opens in new tab).
          </p>
          <Text variant="headingMd" as="h4">
            Price test QA checklist
          </Text>
          <p>Before starting a price test, confirm:</p>
          <ul className={styles.bulletList}>
            <li>RipX script is live in your theme (App Proxy or embed with correct shop/site).</li>
            <li>
              Preview each variant on the product page and confirm the displayed price matches the
              test design.
            </li>
            <li>
              Check cart and checkout: if you want charged price = displayed price, set catalog to
              the highest test price and use a Discount Function or automatic discounts.
            </li>
            <li>Product scope is correct (all products vs selected products).</li>
            <li>
              <strong>Incognito / private window:</strong> Test as a first-time visitor; verify
              variant assignment and price on PDP, then add to cart and complete checkout (including
              tax) for at least one variant.
            </li>
            <li>
              <strong>Cross-device (optional):</strong> Spot-check on mobile and tablet.
            </li>
            <li>Optional: have another team member verify both variants independently.</li>
          </ul>
          <Text variant="headingMd" as="h4">
            Interpreting test results
          </Text>
          <p>
            RipX shows significance (e.g. p-value, confidence, lift). Use these guidelines when
            reading results:
          </p>
          <ul className={styles.bulletList}>
            <li>
              <strong>Confidence level (e.g. 95%):</strong> Means a 5% risk of a false positive —
              not “95% chance the winner is better.” Report the observed lift with context: “In our
              sample, variant B had a 10% lift” rather than “This will increase revenue by 10%.”
            </li>
            <li>
              <strong>Statistical vs practical significance:</strong> A result can be statistically
              significant but have small real-world impact. Consider both the number (lift %) and
              whether the change is worth implementing (e.g. 2% lift on a low-margin product).
            </li>
            <li>
              <strong>Full picture:</strong> When sharing results, include lift, confidence level,
              sample size (conversions per variant), and run duration so others can assess
              reliability.
            </li>
            <li>
              <strong>Multiple tests:</strong> If you run many tests, be aware that more tests
              increase the chance of at least one false positive; interpret borderline results with
              extra caution.
            </li>
          </ul>
          <Text variant="headingMd" as="h4">
            After the test / When you stop
          </Text>
          <p>
            When you stop the test: document which variant won and why; note the primary metric and
            any segment breakdown (e.g. by traffic source or device) if you have it. This helps
            future tests and keeps decisions traceable. Use the test description or your own notes
            to record your hypothesis (e.g. “If we show 10% off, then revenue per visitor will
            increase because…”).
          </p>
          <p>
            <strong>When you stop a price test:</strong> (1) Decide which variant’s prices to keep.
            (2) Update your Shopify catalog to the winning prices (or use a CSV export if RipX
            supports it) so checkout and feeds reflect the winner. (3) If you had set catalog to the
            highest for checkout alignment, adjust discounts or catalog so the winning price is the
            new baseline. (4) Document the outcome and any segment learnings for future tests.
          </p>
          <Text variant="headingMd" as="h4">
            Price presentation (optional)
          </Text>
          <p>
            Besides testing price <em>level</em>, you can run separate tests for{' '}
            <strong>presentation</strong>: charm pricing ($19.99 vs $20), showing compare-at vs sale
            price (anchoring), or formatting (decimals, currency). Isolate one variable per test for
            clear results.
          </p>
          <Text variant="headingMd" as="h4">
            Troubleshooting
          </Text>
          <DocTable
            headers={['Symptom', 'What to check']}
            rows={[
              [
                'Price doesn’t update on PDP',
                'Test must target products (not collection-only). Confirm you’re on a product page for a targeted product and the RipX script loads (App Proxy or embed).',
              ],
              [
                'Wrong price after variant change',
                'Theme must expose variant in product JSON or input; RipX listens for variant:change and repaints. If catalog is missing for the new variant, the theme’s price stays visible.',
              ],
              [
                'Amount/percent mode shows nothing',
                'Catalog price is read from product JSON or Shopify meta. If the theme doesn’t expose it, use fixed price. Check script load and product scope.',
              ],
              [
                'Checkout shows different price',
                'Display-only tests don’t change checkout. Set catalog to the highest test price and use automatic discounts or a Discount Function so checkout matches.',
              ],
            ]}
          />
          <DocCallout type="info" title="Best practice">
            Run price tests 2–4 weeks with 200+ conversions per variant. Set catalog to the highest
            test price when using discounts or Functions so checkout matches the displayed price.
          </DocCallout>
        </BlockStack>
      );

    case 'data-flow':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            RipX ensures variant counts and test data display correctly across list, detail, and
            wizard. Data flows from API to UI with smart caching and placeholder data for instant
            display.
          </Text>
          <Text variant="headingMd" as="h4">
            How Data Flows
          </Text>
          <FlowDiagram
            steps={['List / Dashboard', 'Detail (placeholder)', 'Refetch', 'Wizard Sync']}
          />
          <Text variant="headingMd" as="h4">
            View Behavior
          </Text>
          <DocTable
            headers={['View', 'Source', 'Behavior']}
            rows={[
              [
                'List',
                'GET /api/tests',
                'Each test includes variant_count; display uses it for accuracy',
              ],
              [
                'Detail',
                'GET /api/tests/:id or placeholder',
                'Shows listTest/createdTest immediately; refetches on mount',
              ],
              [
                'Wizard',
                'initialData from parent',
                'Syncs from server when variant count differs; remounts on change',
              ],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Navigation Flow
          </Text>
          <ul className={styles.bulletList}>
            <li>
              <strong>List → Detail</strong>: Passes listTest in state; shows immediately while
              refetch runs
            </li>
            <li>
              <strong>Create/Clone → Detail</strong>: Pre-populates cache; no loading flash
            </li>
            <li>
              <strong>Save</strong>: Updates cache from response; invalidates; wizard remounts with
              new key
            </li>
          </ul>
          <DocCallout type="info" title="Test type display">
            Uses goal.template_key when config is empty — e.g. onsite-edit tests show &quot;Onsite
            Edit&quot; not &quot;Theme&quot;.
          </DocCallout>
        </BlockStack>
      );

    case 'test-wizard':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            The Test Wizard guides you through creating a test in 5–6 steps (depending on template
            selection). In edit mode, the wizard syncs variants from the server when the count
            differs.
          </Text>
          <Text variant="headingMd" as="h4">
            Wizard Steps
          </Text>
          <StepList
            steps={[
              {
                title: 'Select Test Type',
                desc: 'Choose a test template (Price, Content, Shipping, etc.)',
              },
              { title: 'Traffic Allocation', desc: 'Set traffic distribution across variants' },
              { title: 'Targeting & Segmentation', desc: 'Scope, device, audience, holdout' },
              {
                title: 'Goal & Metrics',
                desc: 'Primary goal (conversion, revenue, AOV), conversion window',
              },
              {
                title: 'Variant Configuration',
                desc: 'Configure each variant (code, URLs, prices)',
              },
              { title: 'Review & Create', desc: 'Summary and launch' },
            ]}
          />
          <Text variant="headingMd" as="h4">
            Goal Types
          </Text>
          <DocTable
            headers={['Type', 'Description']}
            rows={[
              ['Revenue', 'Total sales with optional COGS for profit tracking'],
              ['Conversion', 'Purchase rate / count of goal events'],
              ['AOV', 'Average order value'],
              ['Secondary events', 'Add to cart, newsletter signup, custom events'],
            ]}
          />
          <DocCallout type="info" title="Variant sync">
            When editing a test, the wizard remounts when variant count changes. Server data with
            more variants is always accepted after save.
          </DocCallout>
          <Text variant="headingMd" as="h4">
            Advanced Options
          </Text>
          <p>
            Guardrails (min/max metrics), bot exclusion, and scheduling are available in the
            Targeting &amp; Segmentation advanced options.
          </p>
        </BlockStack>
      );

    case 'analytics':
      return (
        <BlockStack gap="400">
          <Text variant="headingMd" as="h4">
            Per-Test Analytics
          </Text>
          <ul className={styles.bulletList}>
            <li>
              <strong>Variant metrics</strong>: Visitors, conversions, rate, revenue, AOV
            </li>
            <li>
              <strong>Statistical significance</strong>: p-value, confidence, lift, winner
            </li>
            <li>
              <strong>Time series</strong>: Performance over time
            </li>
            <li>
              <strong>Segmentation</strong>: Filter by device, country
            </li>
          </ul>
          <Text variant="headingMd" as="h4">
            Tabs
          </Text>
          <DocTable
            headers={['Tab', 'Content']}
            rows={[
              ['Overview', 'Key metrics and charts'],
              ['Funnel', 'Conversion funnel by step'],
              ['Heatmap', 'Click and scroll heatmaps'],
              ['Events', 'Event explorer and custom events'],
            ]}
          />
          <DocCallout type="info" title="Metrics Explained">
            <p>
              <strong>p-value</strong> &lt; 0.05 = statistically significant.{' '}
              <strong>Confidence</strong> 95%+ = strong evidence. <strong>Lift</strong> = %
              improvement of winner over control.
            </p>
          </DocCallout>
        </BlockStack>
      );

    case 'heatmap-funnel':
      return (
        <BlockStack gap="400">
          <Text variant="headingMd" as="h4">
            Heatmap
          </Text>
          <ul className={styles.bulletList}>
            <li>
              <strong>Click</strong>: 10×10 grid of click density per page/variant
            </li>
            <li>
              <strong>Scroll</strong>: Depth distribution 0–100%
            </li>
            <li>
              <strong>Filters</strong>: Page URL, variant, date range
            </li>
            <li>Auto-captured by storefront script</li>
          </ul>
          <Text variant="headingMd" as="h4">
            Funnel
          </Text>
          <ul className={styles.bulletList}>
            <li>Default: Visitors → Add to Cart → Purchase</li>
            <li>Custom steps defined in test goal</li>
            <li>Segmentation: device, country</li>
            <li>Compare mode: single vs compare variants</li>
          </ul>
        </BlockStack>
      );

    case 'settings':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            These tabs are in <strong>App settings</strong> (open a store, then Settings in the
            sidebar). Account settings (theme only) are under your profile menu.
          </Text>
          <Text variant="headingMd" as="h4">
            General Tab
          </Text>
          <DocTable
            headers={['Setting', 'Range', 'Description']}
            rows={[
              ['Min Sample Size', '10–10,000', 'Visitors before showing results'],
              ['Confidence Level', '0.8–1', 'Statistical threshold (0.95 = 95%)'],
              ['Auto-stop', 'On/Off', 'Stop when significance reached'],
              ['Webhook URL', '—', 'POST events on test_complete, significance'],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Integrations Tab
          </Text>
          <p>
            GA4 and BigQuery status, config hints, export buttons. Use{' '}
            <strong>Refresh status</strong> to reload.
          </p>
          <Text variant="headingMd" as="h4">
            Appearance Tab
          </Text>
          <p>Theme selector: Light, Dark, or Auto (by time of day). Changes apply immediately.</p>
          <Text variant="headingMd" as="h4">
            Targeting Presets
          </Text>
          <p>Save and reuse targeting configs. Create in Test Wizard, manage in App settings.</p>
        </BlockStack>
      );

    case 'targeting':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            Target tests by device, country, customer segment, and custom rules. Save presets for
            reuse.
          </Text>
          <Text variant="headingMd" as="h4">
            Options
          </Text>
          <DocTable
            headers={['Option', 'Description']}
            rows={[
              ['Device', 'All, desktop, mobile, tablet'],
              ['Country', 'Include/exclude countries'],
              ['Customer', 'All, new, returning, logged-in'],
              ['Custom rules', 'JSON rules for advanced targeting'],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Presets
          </Text>
          <p>
            Create presets in the Test Wizard targeting step. Manage them in{' '}
            <strong>App settings → Targeting Presets</strong>.
          </p>
        </BlockStack>
      );

    case 'integrations':
      return (
        <BlockStack gap="400">
          <Text variant="headingMd" as="h4">
            GA4 Setup
          </Text>
          <StepList
            steps={[
              'GA4 Admin → Data Streams → Measurement Protocol API secrets',
              'Create secret, copy value',
              'Add GA4_MEASUREMENT_ID and GA4_API_SECRET to .env',
            ]}
          />
          <DocCallout type="info" title="GA4 Features">
            Events forwarded automatically. Conversion currency from <code>metadata.currency</code>{' '}
            (default USD). User properties: ab_test_id, ab_variant_id, ab_shop.
          </DocCallout>
          <Text variant="headingMd" as="h4">
            BigQuery Setup
          </Text>
          <StepList
            steps={[
              'Create GCP project, enable BigQuery',
              'Service account with BigQuery Data Editor',
              'Add GCP_PROJECT_ID, GCP_DATASET, GOOGLE_APPLICATION_CREDENTIALS to .env',
              'Create tables from backend/docs/bigquery_schema.sql',
            ]}
          />
          <Text variant="headingMd" as="h4">
            Export
          </Text>
          <p>
            Trigger from <strong>App settings → Integrations</strong>. Incremental (new events) or
            full (events + tests). Last export time shown in the UI.
          </p>
          <Text variant="headingMd" as="h4">
            Export Tables
          </Text>
          <DocTable
            headers={['Table', 'Type', 'Description']}
            rows={[
              ['events', 'Incremental', 'Conversion, view, click, custom events'],
              ['heatmap_events', 'Incremental', 'Click and scroll data'],
              ['tests', 'Full only', 'Test snapshots'],
            ]}
          />
        </BlockStack>
      );

    case 'webhooks':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            Configure outbound webhooks to receive POST notifications when tests complete or reach
            significance.
          </Text>
          <Text variant="headingMd" as="h4">
            Events
          </Text>
          <DocTable
            headers={['Event', 'When']}
            rows={[
              ['test_complete', 'Test reaches end date or is stopped'],
              ['significance', 'Statistical significance reached'],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Setup
          </Text>
          <p>
            Add your webhook URL in <strong>App settings → General</strong>. The payload includes
            test ID, status, winner, and metrics.
          </p>
        </BlockStack>
      );

    case 'promo-links':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            Create shareable links that apply discounts without promo codes.
          </Text>
          <ul className={styles.bulletList}>
            <li>Per-test, per-variant links</li>
            <li>No promo code required</li>
            <li>Optional usage limits</li>
            <li>Conversions tracked via link attribution</li>
          </ul>
        </BlockStack>
      );

    case 'export':
      return (
        <BlockStack gap="400">
          <Text variant="headingMd" as="h4">
            Report Export
          </Text>
          <p>
            CSV or JSON, date range (all, 7/30/90 days). Contents: test info, variant metrics,
            significance, funnel.
          </p>
          <CodeBlock
            code="GET /api/analytics/tests/:id/export?format=csv&start_date=2024-01-01&end_date=2024-01-31"
            language="http"
          />
          <Text variant="headingMd" as="h4">
            BigQuery Export
          </Text>
          <p>
            Incremental (new events) or full (events + tests). Trigger from App settings →
            Integrations or API.
          </p>
        </BlockStack>
      );

    case 'api':
      return (
        <BlockStack gap="400">
          <Text variant="headingMd" as="h4">
            Authentication
          </Text>
          <ul className={styles.bulletList}>
            <li>
              <strong>Shopify</strong>: ?shop=xxx.myshopify.com or X-Shopify-Shop-Domain
            </li>
            <li>
              <strong>Standalone</strong>: X-RipX-API-Key or Authorization: Bearer &lt;api_key&gt;
            </li>
          </ul>
          <Text variant="headingMd" as="h4">
            Key Endpoints
          </Text>
          <DocTable
            headers={['Method', 'Endpoint', 'Description']}
            rows={[
              ['GET', '/api/tests', 'List tests'],
              ['POST', '/api/tests', 'Create test'],
              ['GET', '/api/tests/:id', 'Get test'],
              ['POST', '/api/tests/:id/start', 'Start test'],
              ['POST', '/api/tests/:id/stop', 'Stop test'],
              ['GET', '/api/analytics/tests/:id', 'Test analytics'],
              ['POST', '/api/track', 'Track event'],
              ['GET', '/api/track/script.js', 'Storefront script'],
            ]}
          />
          <DocCallout type="info" title="Full API Docs">
            Open <strong>/api-docs</strong> in your app for interactive Swagger UI.
          </DocCallout>
        </BlockStack>
      );

    case 'storefront':
      return (
        <BlockStack gap="400">
          <Text variant="headingMd" as="h4">
            Script Loading
          </Text>
          <p>
            <strong>Shopify:</strong>
          </p>
          <CodeBlock
            code='<script src="https://your-app.com/api/track/script.js?shop=your-shop.myshopify.com"></script>'
            language="html"
          />
          <p>
            <strong>Standalone:</strong>
          </p>
          <CodeBlock
            code='<script src="https://your-app.com/api/track/script.js?site=example.com"></script>'
            language="html"
          />
          <Text variant="headingMd" as="h4">
            Track Conversion
          </Text>
          <CodeBlock
            code={`fetch('/api/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    test_id: 'uuid',
    user_id: 'user_xxx',
    shop_domain: 'your-shop.myshopify.com',
    event_type: 'conversion',
    event_value: 99.99,
    event_name: 'purchase',
    metadata: {}
  })
});`}
            language="javascript"
          />
          <p>Heatmap events (click, scroll) are captured automatically when the script loads.</p>
        </BlockStack>
      );

    case 'multi-platform':
      return (
        <BlockStack gap="400">
          <Text variant="headingMd" as="h4">
            Shopify
          </Text>
          <p>
            OAuth install, webhooks (orders, products, uninstall), app embed + proxy for storefront
            script.
          </p>
          <Text variant="headingMd" as="h4">
            Standalone
          </Text>
          <StepList
            steps={[
              'POST /api/tenants/standalone with { "domain": "example.com" }',
              'Receive API key in response',
              'Add script with ?site=example.com',
              'Admin: /connect or set VITE_RIPX_API_KEY',
            ]}
          />
        </BlockStack>
      );

    default:
      return <Text as="p">Select a section from the sidebar.</Text>;
  }
}

const READING_TIME_MIN = 18;

const QUICK_JUMP_SECTIONS = SECTIONS.slice(0, 9);

function Documentation() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [hoveredSection, setHoveredSection] = useState(null);
  const [drawerPosition, setDrawerPosition] = useState(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandSelected, setCommandSelected] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const activeNavRef = useRef(null);
  const activeCollapsedRef = useRef(null);
  const commandInputRef = useRef(null);
  const commandResultsRef = useRef(null);
  const quickJumpListRef = useRef(null);
  const quickJumpScrollRef = useRef({ isDragging: false, startX: 0, startScrollLeft: 0 });
  const quickJumpDidDragRef = useRef(false);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return SECTIONS;
    const q = searchQuery.toLowerCase().trim();
    const terms = q.split(/\s+/).filter(Boolean);
    return SECTIONS.filter(s => {
      const title = s.title.toLowerCase();
      const id = s.id.toLowerCase();
      const keywords = (s.keywords || '').toLowerCase();
      const searchable = `${title} ${id} ${keywords}`;
      return terms.every(t => searchable.includes(t));
    });
  }, [searchQuery]);

  const commandPaletteResults = useMemo(() => {
    const q = commandQuery.toLowerCase().trim();
    if (!q) return SECTIONS;
    const terms = q.split(/\s+/).filter(Boolean);
    return SECTIONS.filter(s => {
      const searchable = `${s.title} ${s.id} ${s.keywords || ''}`.toLowerCase();
      return terms.every(t => searchable.includes(t));
    });
  }, [commandQuery]);

  const groupedSections = useMemo(() => {
    const groups = {};
    filteredSections.forEach(s => {
      const g = s.group || 'other';
      if (!groups[g]) groups[g] = [];
      groups[g].push(s);
    });
    return SECTION_GROUPS.filter(g => groups[g.key]?.length).map(g => ({
      ...g,
      items: groups[g.key],
    }));
  }, [filteredSections]);

  const scrollToSection = useCallback(id => {
    setActiveSection(id);
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', `#${id}`);
    }
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setActiveSection('overview');
  }, []);

  const handleQuickJumpMouseDown = useCallback(e => {
    if (!quickJumpListRef.current || e.button !== 0) return;
    quickJumpDidDragRef.current = false;
    quickJumpScrollRef.current = {
      isDragging: true,
      startX: e.clientX,
      startScrollLeft: quickJumpListRef.current.scrollLeft,
    };
  }, []);

  const handleQuickJumpMouseMove = useCallback(e => {
    const ref = quickJumpScrollRef.current;
    if (!ref.isDragging || !quickJumpListRef.current) return;
    quickJumpDidDragRef.current = true;
    const dx = ref.startX - e.clientX;
    quickJumpListRef.current.scrollLeft = ref.startScrollLeft + dx;
  }, []);

  const handleQuickJumpMouseUp = useCallback(() => {
    quickJumpScrollRef.current.isDragging = false;
  }, []);

  const handleQuickJumpClick = useCallback(
    (e, id) => {
      if (quickJumpDidDragRef.current) {
        e.preventDefault();
        quickJumpDidDragRef.current = false;
        return;
      }
      scrollToSection(id);
    },
    [scrollToSection]
  );

  useEffect(() => {
    const onMove = e => {
      if (quickJumpScrollRef.current.isDragging) handleQuickJumpMouseMove(e);
    };
    const onUp = () => {
      if (quickJumpScrollRef.current.isDragging) handleQuickJumpMouseUp();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [handleQuickJumpMouseMove, handleQuickJumpMouseUp]);

  useEffect(() => {
    const el = quickJumpListRef.current;
    if (!el) return;
    const onWheel = e => {
      if (e.deltaY !== 0) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Initial hash on mount
  useEffect(() => {
    const hash =
      typeof window !== 'undefined' ? (window.location.hash || '').replace(/^#/, '') : '';
    if (hash && SECTIONS.some(s => s.id === hash)) {
      setActiveSection(hash);
      setTimeout(() => {
        const el = document.getElementById(hash);
        el?.scrollIntoView({ behavior: 'auto', block: 'start' });
      }, 100);
    }
  }, []);

  // Cmd+K / Ctrl+K command palette
  useEffect(() => {
    const handleKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(o => !o);
        setCommandQuery('');
        setCommandSelected(0);
        setTimeout(() => commandInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') setCommandPaletteOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Clamp commandSelected when results change
  useEffect(() => {
    if (commandSelected >= commandPaletteResults.length) {
      setCommandSelected(Math.max(0, commandPaletteResults.length - 1));
    }
  }, [commandPaletteResults.length, commandSelected]);

  // Scroll selected item into view in command palette
  useEffect(() => {
    if (!commandPaletteOpen || !commandResultsRef.current || commandPaletteResults.length === 0)
      return;
    const options = commandResultsRef.current.querySelectorAll('[role="option"]');
    options[commandSelected]?.scrollIntoView({ block: 'nearest' });
  }, [commandSelected, commandPaletteOpen, commandPaletteResults.length]);

  // Document title when on docs page
  useEffect(() => {
    const prev = document.title;
    document.title = 'Documentation - RipX';
    return () => {
      document.title = prev;
    };
  }, []);

  // Reading progress, back-to-top visibility, and scroll state for sticky sidebar elevation
  useEffect(() => {
    const onScroll = () => {
      const winScroll = document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      setScrollProgress(height > 0 ? Math.min(winScroll / height, 1) : 0);
      setShowBackToTop(winScroll > 400);
      setIsScrolled(winScroll > 30);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // run once for initial state
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll only the sidebar nav so the active item is visible (never scroll the document)
  useEffect(() => {
    const el = sidebarCollapsed ? activeCollapsedRef.current : activeNavRef.current;
    if (!el) return;
    const scrollParent =
      el.closest(`.${styles.sidebarNav}`) || el.closest(`.${styles.sidebarNavCollapsed}`);
    if (!scrollParent || scrollParent.scrollHeight <= scrollParent.clientHeight) return;
    const elRect = el.getBoundingClientRect();
    const parentRect = scrollParent.getBoundingClientRect();
    const relativeTop = elRect.top - parentRect.top + scrollParent.scrollTop;
    const relativeBottom = relativeTop + elRect.height;
    const pad = 8;
    if (relativeTop < scrollParent.scrollTop) {
      scrollParent.scrollTo({ top: Math.max(0, relativeTop - pad), behavior: 'smooth' });
    } else if (relativeBottom > scrollParent.scrollTop + scrollParent.clientHeight) {
      scrollParent.scrollTo({
        top: relativeBottom - scrollParent.clientHeight + pad,
        behavior: 'smooth',
      });
    }
  }, [activeSection, sidebarCollapsed]);

  // Scroll spy: update active section + hash when scrolling (topmost visible wins)
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const intersecting = entries
          .filter(e => e.isIntersecting)
          .map(e => {
            const id = e.target.id || '';
            return { id, boundTop: e.boundingClientRect.top };
          })
          .filter(x => x.id);
        if (intersecting.length > 0) {
          const topmost = intersecting.reduce((a, b) => (a.boundTop < b.boundTop ? a : b));
          setActiveSection(topmost.id);
          if (typeof window !== 'undefined' && window.history?.replaceState) {
            window.history.replaceState(null, '', `#${topmost.id}`);
          }
        }
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 }
    );
    const ids = SECTIONS.map(s => s.id);
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`${pageShell.page} ${styles.docsPage} ${isScrolled ? styles.docsPageScrolled : ''}`}
    >
      <div
        className={styles.docsProgressBar}
        style={{ transform: `scaleX(${scrollProgress})` }}
        role="progressbar"
        aria-label="Reading progress"
        aria-valuenow={Math.round(scrollProgress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
      {commandPaletteOpen && (
        <div
          className={styles.commandPaletteOverlay}
          role="dialog"
          aria-label="Quick search"
          onClick={() => setCommandPaletteOpen(false)}
          onKeyDown={e => {
            if (e.key === 'Escape') setCommandPaletteOpen(false);
          }}
        >
          <div
            className={styles.commandPalette}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Escape') setCommandPaletteOpen(false);
            }}
          >
            <div className={styles.commandPaletteHeader}>
              <Icon source={SearchIcon} />
              <input
                ref={commandInputRef}
                type="text"
                className={styles.commandPaletteInput}
                placeholder="Search sections..."
                value={commandQuery}
                aria-label="Search documentation sections"
                aria-autocomplete="list"
                aria-controls="command-palette-results"
                aria-expanded={commandPaletteResults.length > 0}
                onChange={e => {
                  setCommandQuery(e.target.value);
                  setCommandSelected(0);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const item = commandPaletteResults[commandSelected];
                    if (item) {
                      scrollToSection(item.id);
                      setCommandPaletteOpen(false);
                    }
                    e.preventDefault();
                  } else if (e.key === 'ArrowDown' && commandPaletteResults.length > 0) {
                    setCommandSelected(i => Math.min(i + 1, commandPaletteResults.length - 1));
                    e.preventDefault();
                  } else if (e.key === 'ArrowUp') {
                    setCommandSelected(i => Math.max(i - 1, 0));
                    e.preventDefault();
                  }
                }}
                autoFocus
              />
              <span className={styles.commandPaletteKbd}>↵</span>
            </div>
            <div
              ref={commandResultsRef}
              id="command-palette-results"
              className={styles.commandPaletteResults}
              role="listbox"
              aria-label="Documentation sections"
            >
              {commandPaletteResults.length === 0 ? (
                <div className={styles.commandPaletteEmpty} role="status" aria-live="polite">
                  <Text as="p" tone="subdued">
                    No sections match &quot;{commandQuery}&quot;
                  </Text>
                </div>
              ) : (
                commandPaletteResults.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={i === commandSelected}
                    className={`${styles.commandPaletteItem} ${i === commandSelected ? styles.commandPaletteItemActive : ''}`}
                    onClick={() => {
                      scrollToSection(s.id);
                      setCommandPaletteOpen(false);
                    }}
                  >
                    <Icon source={s.icon} />
                    <span>{s.title}</span>
                    <span className={styles.commandPaletteItemGroup}>
                      {SECTION_GROUPS.find(g => g.key === s.group)?.label}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {showBackToTop && (
        <Tooltip content="Scroll to top" preferredPosition="above">
          <button
            type="button"
            className={styles.backToTopFab}
            onClick={scrollToTop}
            aria-label="Back to top"
          >
            <Icon source={ArrowUpIcon} />
          </button>
        </Tooltip>
      )}
      <Page title="" subtitle="">
        <header className={styles.docsTopBar} aria-label="Documentation header">
          <span className={styles.docsTopBarTitle}>
            <span className={styles.docsTopBarTitleIcon}>
              <Icon source={BookIcon} tone="base" />
            </span>
            Documentation
          </span>
          <Tooltip content="Back to dashboard" preferredPosition="below">
            <button
              type="button"
              onClick={() => navigate(ROUTES.USER_PANEL)}
              className={styles.docsTopBarMainApp}
              aria-label="Go to dashboard"
            >
              <span className={styles.docsTopBarMainAppIcon}>
                <Icon source={HomeIcon} tone="base" />
              </span>
              <span className={styles.docsTopBarMainAppLabel}>Dashboard</span>
            </button>
          </Tooltip>
        </header>
        <div className={styles.docsHero}>
          <div className={styles.docsHeroRow}>
            <div className={styles.docsHeroMain}>
              <h1 className={styles.docsHeroTitle}>RipX Documentation</h1>
              <p className={styles.docsHeroSubtitle}>
                Enterprise-grade A/B testing for Shopify and standalone sites. Setup, run, and
                analyze experiments with statistical rigor.
              </p>
            </div>
            <div className={styles.docsHeroMeta}>
              <span className={styles.docsHeroBadges}>
                <span className={styles.docsHeroBadge}>v1.0.0</span>
                <span className={styles.docsHeroBadge}>8 Test Types</span>
                <span className={styles.docsHeroBadge}>Multi-Variant</span>
                <span className={styles.docsHeroBadge}>GA4 & BigQuery</span>
                <span className={styles.docsHeroBadge}>{READING_TIME_MIN} min read</span>
              </span>
              <span className={styles.docsHeroHint}>
                <kbd className={styles.kbd}>⌘K</kbd> / <kbd className={styles.kbd}>Ctrl+K</kbd> to
                search
              </span>
            </div>
          </div>
        </div>

        <div className={styles.docsQuickJumpWrap}>
          <div className={styles.docsQuickJumpHeader}>
            <span className={styles.docsQuickJumpLabel}>
              <span className={styles.docsQuickJumpLabelIcon} aria-hidden>
                <Icon source={ListBulletedIcon} tone="base" />
              </span>
              Quick jump
            </span>
            <span className={styles.docsQuickJumpHint}>Drag to scroll</span>
          </div>
          <div className={styles.docsQuickJumpListOuter}>
            <ul
              ref={quickJumpListRef}
              className={styles.docsQuickJumpList}
              aria-label="Quick navigation (scroll or drag horizontally)"
              onMouseDown={handleQuickJumpMouseDown}
            >
              {QUICK_JUMP_SECTIONS.map(s => (
                <li key={s.id} className={styles.docsQuickJumpItem}>
                  <button
                    type="button"
                    className={`${styles.docsQuickJumpBtn} ${activeSection === s.id ? styles.docsQuickJumpBtnActive : ''}`}
                    onClick={e => handleQuickJumpClick(e, s.id)}
                    aria-current={activeSection === s.id ? 'true' : undefined}
                  >
                    <span className={styles.docsQuickJumpBtnIcon}>
                      <Icon source={s.icon} tone="base" />
                    </span>
                    <span className={styles.docsQuickJumpBtnText}>{s.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {hoveredSection && drawerPosition && sidebarCollapsed && (
          <div
            className={styles.sidebarHoverDrawer}
            role="tooltip"
            style={{
              position: 'fixed',
              top: drawerPosition.top,
              left: drawerPosition.left,
              transform: 'translateY(-50%)',
            }}
          >
            <span className={styles.sidebarHoverDrawerLabel}>{hoveredSection.title}</span>
            <span className={styles.sidebarHoverDrawerIcon}>
              <Icon source={ChevronRightIcon} />
            </span>
          </div>
        )}
        <div
          className={`${styles.docsLayout} ${sidebarCollapsed ? styles.docsLayoutCollapsed : ''}`}
        >
          <aside
            className={`${styles.docsSidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}
          >
            <div className={styles.sidebarHeader}>
              {!sidebarCollapsed && (
                <div className={styles.sidebarTitleBlock}>
                  <div className={styles.sidebarTitleIcon}>
                    <Icon source={BookIcon} />
                  </div>
                  <h3 className={styles.sidebarTitle}>Contents</h3>
                </div>
              )}
              <Tooltip
                content={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                preferredPosition="right"
              >
                <button
                  type="button"
                  className={styles.sidebarToggle}
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  <Icon source={sidebarCollapsed ? ChevronDownIcon : ChevronUpIcon} />
                </button>
              </Tooltip>
            </div>
            {!sidebarCollapsed ? (
              <>
                <div className={styles.searchWrap}>
                  <div className={styles.searchInputWrapper}>
                    <span className={styles.searchIcon} aria-hidden>
                      <Icon source={SearchIcon} />
                    </span>
                    <TextField
                      label="Search documentation"
                      labelHidden
                      value={searchQuery}
                      onChange={setSearchQuery}
                      placeholder="Search by title or keywords..."
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className={styles.sidebarBody}>
                  <nav className={styles.sidebarNav}>
                    {filteredSections.length === 0 ? (
                      <div className={styles.sidebarSearchEmpty} role="status" aria-live="polite">
                        <Text as="p" tone="subdued">
                          No sections match &quot;{searchQuery}&quot;
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Try different keywords
                        </Text>
                      </div>
                    ) : (
                      groupedSections.map(group => (
                        <div key={group.key} className={styles.navGroup}>
                          <div className={styles.navGroupLabel}>{group.label}</div>
                          {group.items.map(s => (
                            <button
                              key={s.id}
                              ref={activeSection === s.id ? activeNavRef : null}
                              type="button"
                              className={`${styles.navItem} ${activeSection === s.id ? styles.navItemActive : ''}`}
                              onClick={() => scrollToSection(s.id)}
                              aria-current={activeSection === s.id ? 'location' : undefined}
                              onFocus={() => setHoveredSection(null)}
                            >
                              <span className={styles.navItemIcon}>
                                <Icon source={s.icon} />
                              </span>
                              <span className={styles.navItemText}>{s.title}</span>
                            </button>
                          ))}
                        </div>
                      ))
                    )}
                  </nav>
                  <div className={styles.sidebarFooter}>
                    <Tooltip content="Scroll back to top" preferredPosition="right">
                      <button
                        type="button"
                        className={styles.sidebarBackToTop}
                        onClick={scrollToTop}
                        aria-label="Back to top"
                      >
                        <span className={styles.sidebarBackToTopIcon}>
                          <Icon source={ArrowUpIcon} />
                        </span>
                        Back to top
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </>
            ) : (
              <nav className={styles.sidebarNavCollapsed}>
                {filteredSections.map(s => (
                  <div
                    key={s.id}
                    ref={activeSection === s.id ? activeCollapsedRef : null}
                    className={styles.navItemCollapsedWrap}
                    onMouseEnter={e => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setDrawerPosition({ top: rect.top + rect.height / 2, left: rect.right + 10 });
                      setHoveredSection(s);
                    }}
                    onMouseLeave={() => {
                      setHoveredSection(null);
                      setDrawerPosition(null);
                    }}
                  >
                    <button
                      type="button"
                      className={`${styles.navItemCollapsed} ${activeSection === s.id ? styles.navItemCollapsedActive : ''}`}
                      onClick={() => scrollToSection(s.id)}
                      title={s.title}
                      aria-label={s.title}
                    >
                      <Icon source={s.icon} />
                    </button>
                  </div>
                ))}
              </nav>
            )}
          </aside>

          <main className={styles.docsMain}>
            {SECTIONS.map(section => (
              <section
                key={section.id}
                id={section.id}
                className={styles.docSection}
                aria-labelledby={`doc-heading-${section.id}`}
              >
                <div className={styles.docSectionCard}>
                  <Box padding="500">
                    <BlockStack gap="400">
                      <div className={styles.sectionTitleRow}>
                        <div className={styles.sectionIconWrap}>
                          <Icon source={section.icon} />
                        </div>
                        <div className={styles.sectionTitleContent}>
                          <h2 id={`doc-heading-${section.id}`}>{section.title}</h2>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Reference
                          </Text>
                        </div>
                        <CopySectionLink sectionId={section.id} />
                      </div>
                      <Divider />
                      <DocSectionContent sectionId={section.id} />
                      <SectionNav section={section} scrollToSection={scrollToSection} />
                    </BlockStack>
                  </Box>
                </div>
              </section>
            ))}
          </main>
        </div>

        <div className={styles.docsResources} aria-labelledby="docs-resources-heading">
          <Text variant="headingMd" as="h3" id="docs-resources-heading">
            Additional Resources
          </Text>
          <div className={styles.docsResourcesLinks}>
            <a
              href="/api-docs"
              className={styles.docsResourcesLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open API Docs (Swagger) in new tab"
            >
              <CodeIcon /> API Docs (Swagger)
            </a>
            <Link to={ROUTES.USER_PANEL} className={styles.docsResourcesLink}>
              <TargetIcon /> Dashboard (tests, quick start)
            </Link>
            <Link to={ROUTES.CONNECT} className={styles.docsResourcesLink}>
              <ConnectIcon /> Connect / API Key
            </Link>
            <Link to={ROUTES.SETTINGS} className={styles.docsResourcesLink}>
              <SettingsIcon /> Account settings (theme)
            </Link>
            <Link to={ROUTES.USER_PANEL} className={styles.docsResourcesLink}>
              <SettingsIcon /> App settings
            </Link>
            <Link to={ROUTES.USER_PANEL} className={styles.docsResourcesLink}>
              <CompassIcon /> Setup Wizard
            </Link>
            <Link to={ROUTES.PROFILE} className={styles.docsResourcesLink}>
              <PersonIcon /> Profile
            </Link>
            <Link to={ROUTES.NOTIFICATIONS} className={styles.docsResourcesLink}>
              <NotificationIcon /> Notifications
            </Link>
          </div>
        </div>
      </Page>
    </div>
  );
}

export default Documentation;
