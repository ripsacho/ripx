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
    id: 'my-domains',
    title: 'My Domains & Store Access',
    icon: StoreIcon,
    group: 'start',
    keywords: 'domains stores shopify oauth account access install link',
  },
  {
    id: 'local-dev',
    title: 'Local Shopify Dev',
    icon: CodeIcon,
    group: 'start',
    keywords: 'shopify cli local tunnel cloudflare ngrok otp smtp',
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
    id: 'test-decision-guide',
    title: 'Test Decision Guide',
    icon: CompassIcon,
    group: 'core',
    keywords: 'choose price offer shipping checkout combination test type decision',
  },
  {
    id: 'launch-preflight',
    title: 'Launch Preflight',
    icon: CompassIcon,
    group: 'core',
    keywords: 'preflight readiness launch canary visual qa guardrails checkout theme',
  },
  {
    id: 'price-testing',
    title: 'Price testing (Shopify)',
    icon: TargetIcon,
    group: 'core',
    keywords: 'price checkout catalog discount display pdp catalog alignment',
  },
  {
    id: 'offer-testing',
    title: 'Offer Testing',
    icon: LinkIcon,
    group: 'core',
    keywords: 'offer discount promotion campaign coupon free shipping',
  },
  {
    id: 'checkout-studio',
    title: 'Checkout Studio',
    icon: SettingsIcon,
    group: 'core',
    keywords: 'checkout ui payment delivery shipping functions studio readiness',
  },
  {
    id: 'shipping-tests',
    title: 'Shipping Tests',
    icon: StoreIcon,
    group: 'core',
    keywords: 'shipping rates carrier service delivery customization free shipping diagnostics',
  },
  {
    id: 'onsite-split-url',
    title: 'Onsite Edit & Split URL',
    icon: CodeIcon,
    group: 'core',
    keywords: 'onsite edit visual editor split url content css javascript landing page',
  },
  {
    id: 'theme-template-tests',
    title: 'Theme & Template Tests',
    icon: StoreIcon,
    group: 'core',
    keywords: 'theme template selector preflight visual qa app embed',
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
    id: 'profile-notifications',
    title: 'Profile & Notifications',
    icon: PersonIcon,
    group: 'advanced',
    keywords: 'account profile appearance preferences notifications alerts email',
  },
  {
    id: 'support-agent',
    title: 'Support & RipX Agent',
    icon: NotificationIcon,
    group: 'advanced',
    keywords: 'support tickets supportai ripx agent chat confirmed actions',
  },
  {
    id: 'admin-ops',
    title: 'Admin Operations',
    icon: SettingsIcon,
    group: 'advanced',
    keywords: 'admin users domains jobs health feature flags audit support tickets mail processes',
  },
  {
    id: 'automation-guardrails',
    title: 'Automation & Guardrails',
    icon: SettingsIcon,
    group: 'advanced',
    keywords:
      'auto stop scheduled tests archive guardrails jobs significance alerts personalization',
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

    case 'my-domains':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            My Domains is the account-level store picker. It lists every Shopify store and
            standalone domain your signed-in email can access, and it keeps stale store context from
            leaking into the app while you switch accounts.
          </Text>
          <Text variant="headingMd" as="h4">
            Add a store or site
          </Text>
          <DocTable
            headers={['Flow', 'When to use it', 'What happens']}
            rows={[
              [
                'Connect Shopify store',
                'For *.myshopify.com stores',
                'Starts Shopify OAuth, links the store to your account, then refreshes My Domains.',
              ],
              [
                'Add standalone domain',
                'For non-Shopify sites',
                'Registers the domain and stores an account API key for that site.',
              ],
              [
                'Use existing key',
                'For a domain already registered outside your account',
                'Stores the key locally and opens the app for that domain.',
              ],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Shopify connection states
          </Text>
          <ul className={styles.bulletList}>
            <li>
              <strong>Connected:</strong> The app is installed and your account can open the store.
            </li>
            <li>
              <strong>Installed but not linked:</strong> OAuth must be completed by the account that
              should manage the store.
            </li>
            <li>
              <strong>Restricted:</strong> The store exists, but the account role or access status
              blocks entry.
            </li>
            <li>
              <strong>Wrong store:</strong> Use the generated incognito/install link to complete
              OAuth with the intended Shopify account.
            </li>
          </ul>
          <DocCallout type="info" title="Account safety">
            If you are changing Shopify accounts locally, sign out of Shopify CLI/browser admin,
            reconnect from My Domains, and confirm the store shown in the OAuth screen before
            approving access.
          </DocCallout>
        </BlockStack>
      );

    case 'local-dev':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            Local development uses the local Shopify app configuration and a public tunnel only when
            Shopify needs to reach your machine. Keep the Shopify CLI account, app config, and
            environment variables aligned.
          </Text>
          <Text variant="headingMd" as="h4">
            Recommended startup
          </Text>
          <CodeBlock
            code={`# Backend + frontend
npm run dev

# Shopify CLI with the local-safe config
npm run shopify:dev`}
            language="bash"
          />
          <Text variant="headingMd" as="h4">
            Local checklist
          </Text>
          <StepList
            steps={[
              'Copy .env.example to .env and set DATABASE_URL, JWT_SECRET, APP_URL, SHOPIFY_API_KEY, SHOPIFY_API_SECRET, and VITE_SHOPIFY_API_KEY.',
              'Use local Shopify credentials that match shopify.app.local.toml.',
              'Run migrations before opening the app.',
              'If OTP or magic links should send real email, set RIPX_EMAIL_VERIFICATION_STUB=false and configure SMTP_HOST, SMTP_PORT=587, SMTP_USER, SMTP_PASS, and SMTP_FROM.',
              'If a tunnel URL changes, update APP_URL and the Shopify Partner Dashboard application URL and redirect URL.',
            ]}
          />
          <Text variant="headingMd" as="h4">
            Tunnel guidance
          </Text>
          <DocTable
            headers={['Symptom', 'Fix']}
            rows={[
              [
                'Shopify OAuth redirects to the wrong URL',
                'Sync APP_URL, FRONTEND_URL if used, and Partner Dashboard redirect URLs.',
              ],
              [
                'Old tunnel shows bandwidth or unavailable errors',
                'Stop stale Shopify CLI/tunnel processes and restart the local-safe Shopify dev command.',
              ],
              [
                'Changing Shopify login account',
                'Run Shopify CLI logout/login, then reconnect the target store from My Domains.',
              ],
            ]}
          />
          <DocCallout type="warning" title="Secrets">
            Do not paste tunnel auth tokens, SMTP passwords, Shopify secrets, or API keys into chat
            or committed files. If a token is exposed in terminal history, rotate it in the provider
            dashboard.
          </DocCallout>
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

    case 'test-decision-guide':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            Use this guide before creating a test. Pick the smallest test type that changes the
            thing you want to learn, then add checkout or shipping support only when the customer
            experience must continue past the storefront.
          </Text>
          <Text variant="headingMd" as="h4">
            Choose the right test type
          </Text>
          <DocTable
            headers={['Goal', 'Use this test', 'Avoid this when']}
            rows={[
              [
                'Find the best final product price',
                'Price test',
                'You only need a promotion or discount campaign; use Offer instead.',
              ],
              [
                'Run promo, coupon, or free-shipping style campaigns',
                'Offer test',
                'You need the catalog-equivalent price level to change everywhere.',
              ],
              [
                'Compare shipping rates, thresholds, or delivery names',
                'Shipping test',
                'The change is only marketing copy; use Onsite Edit or Checkout Studio.',
              ],
              [
                'Change checkout reassurance, payment, or delivery presentation',
                'Checkout test / Checkout Studio',
                'The main learning is PDP content or price; keep it in storefront tests.',
              ],
              [
                'Compare landing pages or templates',
                'Split URL, Template, or Theme test',
                'The variant needs precise DOM edits only; use Onsite Edit.',
              ],
              [
                'Test price plus shipping or price plus content together',
                'Combination test',
                'You do not have enough traffic to estimate interaction effects.',
              ],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Capability matrix
          </Text>
          <DocTable
            headers={['Capability', 'Storefront', 'Cart', 'Checkout', 'Notes']}
            rows={[
              [
                'Price',
                'Yes',
                'Yes',
                'Yes with Cart Transform',
                'Best for final price-level learning.',
              ],
              [
                'Offer',
                'Optional',
                'Optional',
                'Yes with Discount Function',
                'Best for promo mechanics and campaign messaging.',
              ],
              [
                'Shipping',
                'Assignment only',
                'Assignment metadata',
                'Yes with shipping resolver/functions',
                'Always run diagnostics and checkout QA.',
              ],
              [
                'Checkout content',
                'No',
                'No',
                'Yes with Checkout UI extension',
                'Requires checkout extension setup and network access where applicable.',
              ],
            ]}
          />
          <DocCallout type="info" title="Keep the first test simple">
            If two test types could answer the same question, start with the one that changes fewer
            systems. Add checkout, shipping, or combination behavior after the storefront-only
            version proves the idea is worth deeper rollout.
          </DocCallout>
        </BlockStack>
      );

    case 'launch-preflight':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            Launch preflight runs before a test starts. It turns technical checks into a short
            merchant-facing summary, then keeps the detailed checklist available for developers and
            support teams.
          </Text>
          <Text variant="headingMd" as="h4">
            What preflight checks
          </Text>
          <DocTable
            headers={['Area', 'What it verifies', 'Typical owner']}
            rows={[
              [
                'Storefront runtime',
                'RipX script/app embed loads and can assign variants on the target surface.',
                'Merchant or theme developer',
              ],
              [
                'Shopify OAuth',
                'The store has a valid app connection and Admin API access.',
                'Store admin',
              ],
              [
                'Theme selectors',
                'Price, product, and variant markers are available for PDP/listing edits.',
                'Theme developer',
              ],
              [
                'Checkout readiness',
                'Cart Transform, discount, payment, delivery, and checkout UI pieces are attached when required.',
                'Shopify admin or developer',
              ],
              [
                'Guardrails and QA',
                'Required guardrails, visual QA metadata, canary settings, and manual launch checklist are present.',
                'Experiment owner',
              ],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Launch decisions
          </Text>
          <ul className={styles.bulletList}>
            <li>
              <strong>Blocking errors:</strong> Fix before launch unless an admin intentionally uses
              force start for a known, contained issue.
            </li>
            <li>
              <strong>Warnings:</strong> Review the recommendation. Many warnings are safe for
              non-checkout or non-price tests but should be documented.
            </li>
            <li>
              <strong>Canary rollout:</strong> Use a small starting percentage when risk is elevated
              or when the theme/checkout surface changed recently.
            </li>
            <li>
              <strong>Visual QA required:</strong> Add a baseline ID and latest verification date
              before starting.
            </li>
          </ul>
          <DocCallout type="info" title="Merchant-friendly summary">
            The launch dialog shows the top actionable items first and hides routine passed checks
            inside Technical details. Use that detailed section when opening a support ticket.
          </DocCallout>
        </BlockStack>
      );

    case 'price-testing':
      return (
        <BlockStack gap="400">
          <DocCallout type="warning" title="Key takeaway">
            Price tests now use <strong>Direct Price Override</strong> as the default path: target
            prices can apply across storefront surfaces and checkout when Cart Transform is
            installed. Use <strong>Offer tests</strong> for promo/discount campaigns.
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
                'Primary surface; variant changes are re-evaluated automatically.',
              ],
              [
                'Collection / PLP grids',
                'Yes',
                'Applies on targeted cards when product markers/selectors are available in theme markup.',
              ],
              [
                'Cart drawer / mini-cart',
                'Yes',
                'Charged line price is sourced from Cart Transform; cart DOM paint fallback is intentionally disabled.',
              ],
              [
                'Checkout',
                'Yes (with Cart Transform attached)',
                'Checkout reads transformed line prices; verify function attachment in Setup/Settings.',
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
                'Price test + Direct Price Override (Cart Transform)',
                'Yes',
                'Plus/dev stores with RipX Cart Transform attached',
              ],
              [
                'Offer test + Discount Function',
                'Yes (for promotions)',
                'Any supported store with discount function/network access configured',
              ],
              [
                'Legacy compatibility methods',
                'Depends on old test config',
                'Readable for older tests; new Price tests are saved as Direct Price Override',
              ],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Align checkout in 3 steps
          </Text>
          <StepList
            steps={[
              'Deploy and attach the RipX Cart Transform function in Shopify so Direct Price Override is active.',
              'Configure product/variant matrix values in your Price test and verify cart + checkout match target unit prices.',
              'Use Offer tests when the intent is campaign-style discounts (percent/amount/free-shipping) instead of final price-level testing.',
            ]}
          />
          <Text variant="headingMd" as="h4">
            Checkout phases
          </Text>
          <DocTable
            headers={['Phase', 'What it changes', 'Current readiness signal']}
            rows={[
              [
                'Experience block',
                'Trust, reassurance, offer copy, CTA label, and layout inside checkout',
                'Checkout UI extension sync + per-test checkout readiness',
              ],
              [
                'Payment methods',
                'Hide, rename, or reorder checkout payment options',
                'Payment customization function must be deployed on the shop',
              ],
              [
                'Delivery methods',
                'Hide, rename, or reorder checkout delivery options',
                'Delivery customization function must be deployed on the shop',
              ],
              [
                'Shipping rate tests',
                'Rate/threshold/discount behavior for shipping tests',
                'Shipping diagnostics now classify variants as automatic, discount-only, or manual',
              ],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Checkout tracking events
          </Text>
          <p>
            RipX checkout reporting uses phase-aware events so launch reports and troubleshooting
            stay consistent across checkout surfaces. The primary events are{' '}
            <code>checkout_phase_impression</code>, <code>checkout_phase_cta_click</code>,{' '}
            <code>checkout_phase_offer_apply</code>, and <code>checkout_phase_conversion</code>.
            Multi-section checkout experiences also emit <code>checkout_section_impression</code>,{' '}
            <code>checkout_section_cta_click</code>, and <code>checkout_section_offer_apply</code>{' '}
            with section metadata so you can analyze which section actually drove the interaction.
          </p>
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
              verify Cart Transform is attached and Price &amp; Offer readiness is green in
              Settings.
            </li>
            <li>
              <strong>Feeds &amp; ads:</strong> Catalog feeds still come from Shopify catalog
              values. Keep merchandising/feed strategy separate from experiment overrides.
            </li>
            <li>
              <strong>Bundles:</strong> If you use a bundle app with Cart Transform, only one
              transform runs per store — coordinate ownership or use Offer tests where appropriate.
            </li>
            <li>
              <strong>Subscriptions:</strong> Selling plans block Cart Transform price overrides;
              validate subscription products separately before launch.
            </li>
            <li>
              <strong>Product targeting:</strong> RipX applies pricing to targeted products across
              PDP, listing, and cart surfaces when theme selectors/markers are present.
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
              Check cart and checkout: confirm charged unit price matches the target unit and Cart
              Transform is attached for the store.
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
            supports it) so catalog and merchandising match the winner. (3) Remove temporary test
            overrides/offer rules that are no longer needed. (4) Document the outcome and any
            segment learnings for future tests.
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
                'Confirm Cart Transform is attached, cart lines include RipX properties, and Price & Offer readiness diagnostics are green.',
              ],
            ]}
          />
          <DocCallout type="info" title="Best practice">
            Run price tests 2-4 weeks with 200+ conversions per variant. Track both revenue and
            margin, and verify the same variant behavior on PDP, cart, and checkout before launch.
          </DocCallout>
        </BlockStack>
      );

    case 'offer-testing':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            Offer tests are for promotion mechanics: percentage or amount discounts, campaign
            messaging, no-code promo links, and free-shipping style incentives. Use Price tests when
            the learning is the final product price level.
          </Text>
          <Text variant="headingMd" as="h4">
            Offer vs price
          </Text>
          <DocTable
            headers={['Question', 'Use Offer', 'Use Price']}
            rows={[
              [
                'What are you changing?',
                'Promotion, incentive, discount, or campaign framing.',
                'The actual product price level.',
              ],
              [
                'Checkout path',
                'Discount Function or promo-link attribution.',
                'Cart Transform / Direct Price Override.',
              ],
              [
                'After the test',
                'Keep, pause, or retire the campaign.',
                'Publish winning prices to Shopify catalog if appropriate.',
              ],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Launch checklist
          </Text>
          <StepList
            steps={[
              'Confirm the offer applies only to the intended products, segments, or cart conditions.',
              'Verify the checkout discount function or promo link path is configured for the shop.',
              'Preview attribution so conversions are tied back to the test and variant.',
              'Run launch preflight and perform an incognito checkout QA pass.',
            ]}
          />
          <DocCallout type="info" title="Promo links">
            Use Promo Links when the variant should be shared in campaigns or emails. Use the
            checkout discount path when the offer should follow normal variant assignment.
          </DocCallout>
        </BlockStack>
      );

    case 'checkout-studio':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            Checkout Studio centralizes checkout experience testing: content blocks, offer
            messaging, payment and delivery customizations, shipping behavior, and checkout
            reporting. It is most useful when checkout must match a storefront assignment.
          </Text>
          <Text variant="headingMd" as="h4">
            Checkout surfaces
          </Text>
          <DocTable
            headers={['Surface', 'Use it for', 'Readiness requirement']}
            rows={[
              [
                'Checkout UI extension',
                'Trust copy, reassurance, offer sections, CTA labels, and layout experiments.',
                'Sync generated checkout UI config and verify checkout experience diagnostics.',
              ],
              [
                'Cart Transform',
                'Direct Price Override so checkout charged price matches the test price.',
                'Attach the RipX Cart Transform function and verify price diagnostics.',
              ],
              [
                'Discount Function',
                'Offer tests and promotion-style discounts.',
                'Network access/config must point to the price/offer resolver endpoints.',
              ],
              [
                'Payment customization',
                'Hide, rename, or reorder payment methods.',
                'Shopify payment customization function deployed and enabled.',
              ],
              [
                'Delivery customization',
                'Hide, rename, or reorder delivery methods.',
                'Shopify delivery customization function deployed and enabled.',
              ],
              [
                'Shipping resolver',
                'Flat-rate, threshold, carrier quote, and free-shipping tests.',
                'Shipping diagnostics green or variant classified as manual/discount-only by design.',
              ],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Setup flow
          </Text>
          <StepList
            steps={[
              'Open Settings -> Installation for the store.',
              'Refresh Shopify function inventory and checkout diagnostics.',
              'Use Ensure/Verify actions for Cart Transform and discount function configuration.',
              'Create or edit a test in the wizard and configure the checkout surface mode.',
              'Run launch preflight and verify checkout/cart behavior in an incognito checkout.',
            ]}
          />
          <DocCallout type="warning" title="Checkout limits">
            Checkout behavior depends on Shopify plan, function attachment, network access, and
            theme/cart metadata. If checkout price or shipping cannot be changed automatically,
            document the limitation and use an Offer or manual QA path instead.
          </DocCallout>
        </BlockStack>
      );

    case 'shipping-tests':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            Shipping tests compare rates, thresholds, method names, and delivery-option behavior.
            RipX can plan and apply some Shopify resources automatically, but every shipping test
            should still be verified in a live checkout before full rollout.
          </Text>
          <Text variant="headingMd" as="h4">
            What RipX can apply
          </Text>
          <DocTable
            headers={['Strategy', 'Automatic path', 'What to verify']}
            rows={[
              [
                'Flat rate',
                'CarrierService adapter when the shop supports carrier-calculated shipping.',
                'The expected title and amount appear for assigned checkout lines.',
              ],
              [
                'Free shipping / threshold',
                'Discount function or shipping resolver depending on the variant design.',
                'The threshold, currency, and cart qualification match the test design.',
              ],
              [
                'Carrier quote',
                'CarrierService callback with a configured quote provider.',
                'The provider returns stable rates for the target country/cart combinations.',
              ],
              [
                'Delivery customization',
                'Delivery customization function for hide, rename, or reorder behavior.',
                'Existing Shopify delivery methods are present and match the configured names.',
              ],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Rollout workflow
          </Text>
          <StepList
            steps={[
              'Create a Shipping test and configure each variant with rate, threshold, carrier quote, or delivery-method behavior.',
              'Run shipping diagnostics from the test review or detail screen.',
              'Review the execution split: automatic, discount-only, or manual.',
              'Run a dry run before apply so resource changes and callback needs are visible.',
              'Apply only when diagnostics are ready, then place a checkout QA order path for control and treatment.',
            ]}
          />
          <Text variant="headingMd" as="h4">
            Diagnostic outcomes
          </Text>
          <ul className={styles.bulletList}>
            <li>
              <strong>Automatic:</strong> RipX can provision the needed CarrierService, delivery
              customization, or discount behavior.
            </li>
            <li>
              <strong>Discount-only:</strong> No Shopify resource provisioning is needed, but the
              checkout discount path must be configured.
            </li>
            <li>
              <strong>Manual:</strong> A merchant/developer step is still required, usually because
              a callback URL, provider, Shopify plan capability, or delivery method name is missing.
            </li>
          </ul>
          <DocCallout type="warning" title="Before enabling on a real shop">
            Confirm <code>read_shipping</code> and <code>write_shipping</code> scopes, a reachable
            carrier callback URL, and a successful checkout QA pass. Treat diagnostics as the source
            of truth when the wizard and Shopify settings disagree.
          </DocCallout>
        </BlockStack>
      );

    case 'onsite-split-url':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            Onsite Edit tests change content on the current page. Split URL tests send visitors to
            alternate landing pages. Both are good first tests because they avoid checkout and
            catalog complexity.
          </Text>
          <Text variant="headingMd" as="h4">
            When to use each
          </Text>
          <DocTable
            headers={['Test type', 'Best for', 'QA focus']}
            rows={[
              [
                'Onsite Edit',
                'Headlines, CTA text, image swaps, hiding/showing sections, lightweight CSS/JS.',
                'Selector stability, mobile layout, and flicker.',
              ],
              [
                'Visual editor',
                'Merchant-friendly DOM edits without writing code.',
                'Confirm selectors still match after theme updates.',
              ],
              [
                'Split URL',
                'Landing page, collection, or PDP variants hosted at different URLs.',
                'Redirect loops, query parameters, canonical/SEO expectations, and page speed.',
              ],
            ]}
          />
          <Text variant="headingMd" as="h4">
            QA checklist
          </Text>
          <ul className={styles.bulletList}>
            <li>Preview every variant in desktop and mobile viewport sizes.</li>
            <li>Confirm the RipX script loads before the target content needs to change.</li>
            <li>
              For Split URL, keep destination pages live and reachable for the full test window.
            </li>
            <li>Use launch preflight and document any selector or visual QA exceptions.</li>
          </ul>
        </BlockStack>
      );

    case 'theme-template-tests':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            Theme and Template tests are for larger storefront experiences: alternate templates,
            section layouts, native theme snippets, and redesign experiments. They need stronger QA
            because theme markup can change selector and price-detection behavior.
          </Text>
          <Text variant="headingMd" as="h4">
            Readiness checks
          </Text>
          <DocTable
            headers={['Area', 'What to confirm']}
            rows={[
              ['App embed', 'RipX App Embed is enabled and serving the expected script version.'],
              [
                'Selectors',
                'Product, variant, price, and CTA selectors are stable on target pages.',
              ],
              ['Visual QA', 'Baseline metadata exists when visual QA is required by policy.'],
              [
                'Checkout impact',
                'Any price, offer, or shipping behavior still passes checkout QA.',
              ],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Troubleshooting
          </Text>
          <ul className={styles.bulletList}>
            <li>
              If a variant does not render, check the theme app embed, App Proxy signature, and
              storefront script health.
            </li>
            <li>
              If price selectors fail, add or adjust price surface mappings before launching price
              or theme tests.
            </li>
            <li>
              If a theme update lands during a test, rerun preflight and refresh visual QA before
              scaling traffic.
            </li>
          </ul>
          <DocCallout type="warning" title="Theme changes have broad blast radius">
            Prefer canary rollout for theme and template tests. Keep a rollback plan and avoid
            launching major theme experiments at the same time as checkout or shipping changes.
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
            sidebar). Account, API, and appearance preferences are now inside Profile.
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
              'Create tables from backend/docs/bigquery_schema.sql or inspect GET /api/analytics/export/schema',
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
              [
                'heatmap_events',
                'Incremental',
                'Click, scroll, full-page coordinates, and capture diagnostics',
              ],
              ['tests', 'Full only', 'Test snapshots'],
              ['assignments', 'Full only', 'Assignment snapshots with device/country segments'],
              [
                'analytics_daily_segments',
                'Full only',
                'Daily visitors, conversions, and revenue by segment',
              ],
              [
                'heatmap_daily_rollups',
                'Full only',
                'Daily heatmap counts by page, event type, and segment',
              ],
              ['event_health', 'Full only', 'Event volume and freshness diagnostics'],
              ['funnels', 'Full only', 'Derived funnel step reach metrics'],
              ['guardrails', 'Full only', 'Experiment guardrail summaries'],
              [
                'checkout_diagnostics',
                'Reserved',
                'Checkout diagnostic events when this export is enabled',
              ],
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

    case 'profile-notifications':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            Profile holds account-level preferences that are not tied to a single store. Use it for
            account identity, app appearance, and personal notification preferences.
          </Text>
          <Text variant="headingMd" as="h4">
            Profile areas
          </Text>
          <DocTable
            headers={['Area', 'Purpose']}
            rows={[
              [
                'Account',
                'Email/session details, connected account context, and API documentation link.',
              ],
              ['Appearance', 'Light, dark, or automatic theme preference.'],
              [
                'Preferences',
                'Default UI preferences that follow your account rather than one store.',
              ],
              [
                'Notifications',
                'Experiment alerts, admin notices, support updates, and read/unread state.',
              ],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Notification guidance
          </Text>
          <ul className={styles.bulletList}>
            <li>Review unread notifications after launches, test stops, and support replies.</li>
            <li>
              Use significance alerts for test-level decisions instead of watching dashboards
              manually.
            </li>
            <li>Keep email delivery configured if production alerts must leave the app.</li>
          </ul>
        </BlockStack>
      );

    case 'support-agent':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            Support combines human tickets, ticket threads, SupportAI, and the store-aware RipX
            Agent. Use the lightweight SupportAI chat for documentation questions and RipX Agent
            when the answer depends on the current store, test, or diagnostics.
          </Text>
          <Text variant="headingMd" as="h4">
            Support channels
          </Text>
          <DocTable
            headers={['Channel', 'Best for', 'Notes']}
            rows={[
              [
                'Contact us',
                'Human support requests',
                'Creates a ticket and emails the configured support inbox.',
              ],
              [
                'My requests',
                'Following up on open or closed tickets',
                'Thread replies stay attached to the original support request.',
              ],
              [
                'SupportAI',
                'General docs and setup answers',
                'Uses the support knowledge base when AI is configured; otherwise shows a setup notice.',
              ],
              [
                'RipX Agent',
                'Store-aware diagnostics and safe actions',
                'Can inspect readiness and propose actions; write actions are confirmation-gated.',
              ],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Production setup
          </Text>
          <ul className={styles.bulletList}>
            <li>
              Configure <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>,{' '}
              <code>SMTP_PASS</code>, and <code>SMTP_FROM</code> for ticket and OTP delivery.
            </li>
            <li>
              Set <code>SUPPORT_EMAIL_TO</code> when support tickets should go to a team inbox
              instead of the sender address.
            </li>
            <li>
              Add <code>OPENAI_API_KEY</code> only when SupportAI should generate real answers.
            </li>
            <li>
              Keep <code>SUPPORT_AGENT_ACTIONS_ENABLED</code> off until confirmed actions are ready
              for the environment.
            </li>
          </ul>
        </BlockStack>
      );

    case 'admin-ops':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            The Admin area is for operators and super admins. It centralizes account control, safety
            switches, operational monitoring, support workflows, and data maintenance.
          </Text>
          <Text variant="headingMd" as="h4">
            Admin map
          </Text>
          <DocTable
            headers={['Group', 'Pages', 'Use for']}
            rows={[
              [
                'Core',
                'Users, Domains, Tests, Test types, Accounts',
                'Access control, account ownership, and feature availability.',
              ],
              [
                'System & data',
                'Audit log, KV, Jobs, Feature flags, Aggregation',
                'Operational debugging, queues, rollups, and controlled rollout.',
              ],
              [
                'Shops & limits',
                'Shop sessions, settings overrides, rate limits, block list, conflicts',
                'Per-shop exceptions, throttling, and abuse protection.',
              ],
              [
                'Integrations',
                'Webhook events, targeting presets, webhooks',
                'Integration health and reusable targeting data.',
              ],
              [
                'Monitoring & support',
                'System health, test health, notifications, support tickets, alerts, event catalog, client errors',
                'Production health, merchant issues, and event quality.',
              ],
              [
                'Product & policy',
                'Consent/script, legal, maintenance, announcement banner, landing clients, email delivery, usage export',
                'Policy controls, customer messaging, and compliance operations.',
              ],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Operational checklist
          </Text>
          <StepList
            steps={[
              'Check System health before and after deployments.',
              'Use Test health and Event catalog when analytics or assignment data looks stale.',
              'Review Jobs and Aggregation after queue or Redis changes.',
              'Use Feature flags and Test type controls to stage risky functionality.',
              'Check Email delivery before debugging OTP, magic-link, or support-ticket failures.',
            ]}
          />
          <DocCallout type="warning" title="Admin safety">
            Restrict admin access with database roles, <code>ADMIN_API_KEY</code> only for scripts,
            and <code>ADMIN_IP_ALLOWLIST</code> for production networks when possible.
          </DocCallout>
        </BlockStack>
      );

    case 'automation-guardrails':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            RipX can continue working after a test is launched: scheduled starts/stops, significance
            alerts, guardrail checks, auto-stop, archival jobs, BigQuery exports, and
            personalization rollout all depend on background workers and feature flags.
          </Text>
          <Text variant="headingMd" as="h4">
            Merchant-visible automation
          </Text>
          <DocTable
            headers={['Automation', 'What it does', 'Where to check']}
            rows={[
              [
                'Scheduled tests',
                'Starts or stops tests at configured times.',
                'Test detail, Admin -> Jobs, and notifications.',
              ],
              [
                'Auto-stop',
                'Stops a test when significance or configured stop conditions are met.',
                'App settings defaults, test result status, and outbound webhooks.',
              ],
              [
                'Significance alerts',
                'Notifies users or admins when a test crosses the configured threshold.',
                'Notifications, Admin -> Significance alerts.',
              ],
              [
                'Guardrails',
                'Watches risk metrics and can recommend rollback or personalization changes.',
                'Launch preflight, Admin -> Jobs, and test health.',
              ],
              [
                'Archive',
                'Moves old stopped tests out of active views after the retention window.',
                'Admin -> Jobs and archive settings.',
              ],
              [
                'Warehouse export',
                'Pushes events, tests, heatmaps, and rollups to BigQuery.',
                'Settings -> Integrations and Admin -> Aggregation.',
              ],
            ]}
          />
          <Text variant="headingMd" as="h4">
            Operator checklist
          </Text>
          <StepList
            steps={[
              'Set REDIS_URL in environments that should run background jobs.',
              'Confirm feature flags for scheduled tests, guardrails, significance alerts, and warehouse export.',
              'Check Admin -> Jobs after deploys and after Redis/network incidents.',
              'Use Admin -> Test health and Event catalog when metrics are stale or missing.',
              'Document any manual override in Admin audit log before forcing launch or rollback.',
            ]}
          />
          <DocCallout type="warning" title="Do not assume automation is active">
            If Redis is not configured, many jobs fall back to manual operation. Production
            environments should treat job health as part of launch readiness, especially for
            scheduled tests, guardrails, auto-stop, and exports.
          </DocCallout>
        </BlockStack>
      );

    case 'api':
      return (
        <BlockStack gap="400">
          <DocCallout type="warning" title="API documentation status">
            Swagger UI is available at <strong>/api-docs</strong>, but several newer route groups
            are still documented in runbooks instead of full OpenAPI annotations. Treat the tables
            below as a route map and use authenticated app flows for merchant operations whenever
            possible.
          </DocCallout>
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
          <Text variant="headingMd" as="h4">
            Newer route groups to know
          </Text>
          <DocTable
            headers={['Group', 'Examples', 'Use']}
            rows={[
              [
                'Checkout price',
                '/api/track/price-resolve-batch, /api/settings/checkout-price-diagnostics',
                'Discount/Cart Transform resolver and checkout price health.',
              ],
              [
                'Shipping',
                '/api/track/shipping-resolve-batch, /api/track/shipping-carrier-rates',
                'Shipping resolver, CarrierService callback, and checkout rate behavior.',
              ],
              [
                'Launch readiness',
                '/api/tests/:id/preflight, /api/tests/:id/checkout/readiness',
                'Preflight and checkout readiness checks before launch.',
              ],
              [
                'Settings diagnostics',
                '/api/settings/installation, /api/settings/shopify-functions-inventory',
                'Script, App Proxy, Shopify function, and store setup health.',
              ],
              [
                'Support and agent',
                '/api/support/*, /api/support-agent/*',
                'Tickets, SupportAI, and store-aware confirmed actions.',
              ],
              [
                'Admin operations',
                '/api/admin/jobs, /api/admin/system-health, /api/admin/mail-processes',
                'Operator health, background jobs, mail delivery, and support triage.',
              ],
            ]}
          />
          <DocCallout type="info" title="Full API Docs">
            Open <strong>/api-docs</strong> in your app for interactive Swagger UI. For route groups
            not yet covered there, use the linked runbooks in the repository docs index.
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

const READING_TIME_MIN = 30;

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
            <Link to={ROUTES.PROFILE_APPEARANCE} className={styles.docsResourcesLink}>
              <SettingsIcon /> Profile appearance
            </Link>
            <a href="#settings" className={styles.docsResourcesLink}>
              <SettingsIcon /> App settings
            </a>
            <a href="#setup-wizard" className={styles.docsResourcesLink}>
              <CompassIcon /> Setup Wizard
            </a>
            <a href="#launch-preflight" className={styles.docsResourcesLink}>
              <CompassIcon /> Launch Preflight
            </a>
            <a href="#offer-testing" className={styles.docsResourcesLink}>
              <LinkIcon /> Offer Testing
            </a>
            <a href="#shipping-tests" className={styles.docsResourcesLink}>
              <StoreIcon /> Shipping Tests
            </a>
            <a href="#theme-template-tests" className={styles.docsResourcesLink}>
              <StoreIcon /> Theme Tests
            </a>
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
