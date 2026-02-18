/**
 * Advanced Documentation Component
 *
 * Visual, comprehensive docs with sidebar nav, search, code blocks,
 * flow diagrams, tables, and step-by-step guides
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Page,
  BlockStack,
  Text,
  Box,
  Divider,
  TextField,
  Icon,
  Button,
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
} from '@shopify/polaris-icons';
import pageShell from '../Shared/PageShell.module.css';
import styles from './Documentation.module.css';
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
  { id: 'overview', title: 'Overview', icon: BookIcon, group: 'start', keywords: 'intro platform capabilities' },
  { id: 'installation', title: 'Installation & Snippets', icon: CodeIcon, group: 'start', keywords: 'script embed proxy shopify standalone' },
  { id: 'getting-started', title: 'Getting Started', icon: PlayCircleIcon, group: 'start', keywords: 'clone env migrate node postgresql' },
  { id: 'setup-wizard', title: 'Setup Wizard', icon: CompassIcon, group: 'start', keywords: 'first-time configure defaults' },
  { id: 'connect', title: 'Connect & API Key', icon: ConnectIcon, group: 'start', keywords: 'standalone api key register domain' },
  { id: 'dashboard', title: 'Dashboard', icon: ChartVerticalIcon, group: 'core', keywords: 'home stats quick start recent' },
  { id: 'tests', title: 'Tests', icon: TargetIcon, group: 'core', keywords: 'lifecycle types traffic allocation variants' },
  { id: 'data-flow', title: 'Data Flow & Variants', icon: ChartLineIcon, group: 'core', keywords: 'cache placeholder variant_count navigation' },
  { id: 'test-wizard', title: 'Test Wizard', icon: TargetIcon, group: 'core', keywords: 'create steps goal metrics targeting' },
  { id: 'targeting', title: 'Targeting', icon: TargetIcon, group: 'core', keywords: 'device country segment presets rules' },
  { id: 'analytics', title: 'Analytics', icon: ChartLineIcon, group: 'core', keywords: 'metrics significance p-value funnel heatmap events' },
  { id: 'heatmap-funnel', title: 'Heatmap & Funnel', icon: ChartVerticalIcon, group: 'core', keywords: 'click scroll conversion steps' },
  { id: 'settings', title: 'Settings', icon: SettingsIcon, group: 'integrations', keywords: 'sample size confidence webhook theme' },
  { id: 'integrations', title: 'Integrations', icon: DataTableIcon, group: 'integrations', keywords: 'GA4 BigQuery export' },
  { id: 'webhooks', title: 'Webhooks', icon: LinkIcon, group: 'integrations', keywords: 'outbound POST test_complete significance' },
  { id: 'promo-links', title: 'Promo Links', icon: LinkIcon, group: 'integrations', keywords: 'discount shareable link' },
  { id: 'export', title: 'Export', icon: ExportIcon, group: 'integrations', keywords: 'CSV JSON BigQuery report' },
  { id: 'api', title: 'API Reference', icon: CodeIcon, group: 'advanced', keywords: 'endpoints auth swagger' },
  { id: 'storefront', title: 'Storefront', icon: StoreIcon, group: 'advanced', keywords: 'track conversion script' },
  { id: 'multi-platform', title: 'Multi-Platform', icon: GlobeIcon, group: 'advanced', keywords: 'shopify standalone tenants' },
];

const SECTION_GROUPS = [
  { key: 'start', label: 'Getting Started' },
  { key: 'core', label: 'Core Features' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'advanced', label: 'Advanced' },
];

function SectionNav({ section, scrollToSection }) {
  const idx = SECTIONS.findIndex((s) => s.id === section.id);
  const prev = idx > 0 ? SECTIONS[idx - 1] : null;
  const next = idx >= 0 && idx < SECTIONS.length - 1 ? SECTIONS[idx + 1] : null;
  if (!prev && !next) return null;
  return (
    <div className={styles.sectionNav}>
      {prev ? (
        <button
          type="button"
          className={styles.sectionNavLink}
          onClick={() => scrollToSection(prev.id)}
        >
          <span className={styles.sectionNavIconPrev}>
            <Icon source={ChevronRightIcon} />
          </span>
          <span>
            <span className={styles.sectionNavLabel}>Previous</span>
            {prev.title}
          </span>
        </button>
      ) : <div />}
      {next ? (
        <button
          type="button"
          className={`${styles.sectionNavLink} ${styles.sectionNavLinkNext}`}
          onClick={() => scrollToSection(next.id)}
        >
          <span>
            <span className={styles.sectionNavLabel}>Next</span>
            {next.title}
          </span>
          <Icon source={ChevronRightIcon} />
        </button>
      ) : <div />}
    </div>
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
  );
}

function DocSectionContent({ sectionId }) {
  switch (sectionId) {
    case 'overview':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            RipX is an enterprise-grade A/B testing platform for Shopify and standalone
            e-commerce sites. Run price tests, content experiments, shipping tests, and
            promotional offers with statistical rigor.
          </Text>
          <FlowDiagram steps={['Create Test', 'Assign Variants', 'Track Events', 'Analyze Results']} />
          <Text variant="headingMd" as="h4">Key Capabilities</Text>
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
            <strong>Settings → Installation</strong>.
          </Text>
          <Text variant="headingMd" as="h4">Shopify</Text>
          <p>Use App Proxy + App Embed (recommended) or direct script. Configure App Proxy in Partner Dashboard: subpath <code>apps/ripx</code>. Enable RipX App Embed in theme editor.</p>
          <CodeBlock
            code={`<!-- App Proxy (recommended) -->
<script src="https://your-shop.myshopify.com/apps/ripx/script.js?v=1"></script>

<!-- Or direct -->
<script src="https://your-app.com/api/track/script.js?shop=your-shop.myshopify.com"></script>`}
            language="html"
          />
          <Text variant="headingMd" as="h4">Standalone (non-Shopify)</Text>
          <StepList
            steps={[
              'Register at /connect (Register new site tab) with your domain',
              'Copy API key and connect',
              'Add snippet from Settings → Installation',
            ]}
          />
          <CodeBlock
            code='<script src="https://your-app.com/api/track/script.js?site=example.com"></script>'
            language="html"
          />
          <DocCallout type="info" title="Platform detection">
            Settings → Installation shows the correct snippet for your platform (Shopify or Standalone) with copy buttons.
          </DocCallout>
        </BlockStack>
      );

    case 'getting-started':
      return (
        <BlockStack gap="400">
          <Text variant="headingMd" as="h4">Prerequisites</Text>
          <ul className={styles.bulletList}>
            <li>Node.js 18+</li>
            <li>PostgreSQL</li>
            <li>Shopify Partner account (Shopify) or API key (standalone)</li>
          </ul>
          <Text variant="headingMd" as="h4">Installation</Text>
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
          <Text variant="headingMd" as="h4">Environment Variables</Text>
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
            The Setup Wizard guides you through initial configuration: storefront snippet, test defaults, and optional integrations.
          </Text>
          <Text variant="headingMd" as="h4">Steps</Text>
          <StepList
            steps={[
              { title: 'Installation', desc: 'Copy snippet for Shopify or standalone' },
              { title: 'Configuration', desc: 'Sample size, confidence, webhooks' },
              { title: 'Review', desc: 'Summary and launch' },
            ]}
          />
          <DocCallout type="info" title="First-time setup">
            Access via <strong>/setup</strong> or from the sidebar. Completing the wizard applies recommended defaults.
          </DocCallout>
        </BlockStack>
      );

    case 'connect':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            For standalone (non-Shopify) sites — WordPress, Webflow, custom HTML, etc. — connect using an API key.
            Register your domain once and receive a key to authenticate all requests.
          </Text>
          <Text variant="headingMd" as="h4">Quick start</Text>
          <StepList
            steps={[
              'Go to Connect → Register new site',
              'Enter your domain (e.g. example.com or www.example.com)',
              'Copy the API key — it is shown only once',
              'Click "Use this key & connect" or paste in the "I have an API key" tab',
            ]}
          />
          <Text variant="headingMd" as="h4">Install the script</Text>
          <p>After connecting, go to Setup Wizard or Settings → Installation. Copy the script URL and add it to your site&apos;s <code>&lt;head&gt;</code> or before <code>&lt;/body&gt;</code>.</p>
          <Text variant="headingMd" as="h4">API authentication</Text>
          <p>Use <code>X-RipX-API-Key: your_key</code> or <code>Authorization: Bearer your_key</code> on API requests.</p>
        </BlockStack>
      );

    case 'dashboard':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            The Dashboard provides an overview of all tests and key metrics at a glance.
          </Text>
          <Text variant="headingMd" as="h4">Features</Text>
          <DocGrid columns={2}>
            <DocCard title="Quick Stats">Total, running, and completed test counts</DocCard>
            <DocCard title="Progress Ring">Visual indicator of active test health</DocCard>
            <DocCard title="Quick Start">One-click: Price, Content, Shipping, Offer tests</DocCard>
            <DocCard title="Recent Tests">Latest tests with status badges</DocCard>
          </DocGrid>
          <Text variant="headingMd" as="h4">Navigation</Text>
          <DocTable
            headers={['Route', 'Description']}
            rows={[
              ['/', 'Dashboard home'],
              ['/tests', 'All tests with filters'],
              ['/tests/new', 'Create test wizard'],
              ['/analytics', 'Cross-test analytics'],
            ]}
          />
        </BlockStack>
      );

    case 'tests':
      return (
        <BlockStack gap="400">
          <Text variant="headingMd" as="h4">Test Lifecycle</Text>
          <FlowDiagram steps={['Draft', 'Running', 'Stopped / Completed']} />
          <Text variant="headingMd" as="h4">Test Types</Text>
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
          <Text variant="headingMd" as="h4">Traffic Allocation</Text>
          <ul className={styles.bulletList}>
            <li>Drag sliders to set variant percentages</li>
            <li>Holdout group: exclude % of traffic from test</li>
            <li>Equal split button for instant 50/50</li>
            <li>Minimum 1% per variant</li>
            <li>Add or remove variants dynamically; changes persist on save</li>
            <li><strong>Personalization</strong>: Show winning variant to all visitors after test ends</li>
            <li><strong>Combination tests</strong>: Test multiple factors (e.g. price + shipping) together</li>
          </ul>
        </BlockStack>
      );

    case 'data-flow':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            RipX ensures variant counts and test data display correctly across list, detail, and wizard.
            Data flows from API to UI with smart caching and placeholder data for instant display.
          </Text>
          <Text variant="headingMd" as="h4">How Data Flows</Text>
          <FlowDiagram steps={['List / Dashboard', 'Detail (placeholder)', 'Refetch', 'Wizard Sync']} />
          <Text variant="headingMd" as="h4">View Behavior</Text>
          <DocTable
            headers={['View', 'Source', 'Behavior']}
            rows={[
              ['List', 'GET /api/tests', 'Each test includes variant_count; display uses it for accuracy'],
              ['Detail', 'GET /api/tests/:id or placeholder', 'Shows listTest/createdTest immediately; refetches on mount'],
              ['Wizard', 'initialData from parent', 'Syncs from server when variant count differs; remounts on change'],
            ]}
          />
          <Text variant="headingMd" as="h4">Navigation Flow</Text>
          <ul className={styles.bulletList}>
            <li><strong>List → Detail</strong>: Passes listTest in state; shows immediately while refetch runs</li>
            <li><strong>Create/Clone → Detail</strong>: Pre-populates cache; no loading flash</li>
            <li><strong>Save</strong>: Updates cache from response; invalidates; wizard remounts with new key</li>
          </ul>
          <DocCallout type="info" title="Test type display">
            Uses goal.template_key when config is empty — e.g. onsite-edit tests show &quot;Onsite Edit&quot; not &quot;Theme&quot;.
          </DocCallout>
        </BlockStack>
      );

    case 'test-wizard':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            The Test Wizard guides you through creating a test in 5–6 steps (depending on template selection).
            In edit mode, the wizard syncs variants from the server when the count differs.
          </Text>
          <Text variant="headingMd" as="h4">Wizard Steps</Text>
          <StepList
            steps={[
              { title: 'Select Test Type', desc: 'Choose a test template (Price, Content, Shipping, etc.)' },
              { title: 'Traffic Allocation', desc: 'Set traffic distribution across variants' },
              { title: 'Targeting & Segmentation', desc: 'Scope, device, audience, holdout' },
              { title: 'Goal & Metrics', desc: 'Primary goal (conversion, revenue, AOV), conversion window' },
              { title: 'Variant Configuration', desc: 'Configure each variant (code, URLs, prices)' },
              { title: 'Review & Create', desc: 'Summary and launch' },
            ]}
          />
          <Text variant="headingMd" as="h4">Goal Types</Text>
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
            When editing a test, the wizard remounts when variant count changes. Server data with more variants is always accepted after save.
          </DocCallout>
          <Text variant="headingMd" as="h4">Advanced Options</Text>
          <p>Guardrails (min/max metrics), bot exclusion, and scheduling are available in the Targeting &amp; Segmentation advanced options.</p>
        </BlockStack>
      );

    case 'analytics':
      return (
        <BlockStack gap="400">
          <Text variant="headingMd" as="h4">Per-Test Analytics</Text>
          <ul className={styles.bulletList}>
            <li><strong>Variant metrics</strong>: Visitors, conversions, rate, revenue, AOV</li>
            <li><strong>Statistical significance</strong>: p-value, confidence, lift, winner</li>
            <li><strong>Time series</strong>: Performance over time</li>
            <li><strong>Segmentation</strong>: Filter by device, country</li>
          </ul>
          <Text variant="headingMd" as="h4">Tabs</Text>
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
            <p><strong>p-value</strong> &lt; 0.05 = statistically significant. <strong>Confidence</strong> 95%+ = strong evidence. <strong>Lift</strong> = % improvement of winner over control.</p>
          </DocCallout>
        </BlockStack>
      );

    case 'heatmap-funnel':
      return (
        <BlockStack gap="400">
          <Text variant="headingMd" as="h4">Heatmap</Text>
          <ul className={styles.bulletList}>
            <li><strong>Click</strong>: 10×10 grid of click density per page/variant</li>
            <li><strong>Scroll</strong>: Depth distribution 0–100%</li>
            <li><strong>Filters</strong>: Page URL, variant, date range</li>
            <li>Auto-captured by storefront script</li>
          </ul>
          <Text variant="headingMd" as="h4">Funnel</Text>
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
          <Text variant="headingMd" as="h4">General Tab</Text>
          <DocTable
            headers={['Setting', 'Range', 'Description']}
            rows={[
              ['Min Sample Size', '10–10,000', 'Visitors before showing results'],
              ['Confidence Level', '0.8–1', 'Statistical threshold (0.95 = 95%)'],
              ['Auto-stop', 'On/Off', 'Stop when significance reached'],
              ['Webhook URL', '—', 'POST events on test_complete, significance'],
            ]}
          />
          <Text variant="headingMd" as="h4">Integrations Tab</Text>
          <p>GA4 and BigQuery status, config hints, export buttons. Use <strong>Refresh status</strong> to reload.</p>
          <Text variant="headingMd" as="h4">Appearance Tab</Text>
          <p>Theme selector: Light, Dark, or Auto (by time of day). Changes apply immediately.</p>
          <Text variant="headingMd" as="h4">Targeting Presets</Text>
          <p>Save and reuse targeting configs. Create in Test Wizard, manage in Settings.</p>
        </BlockStack>
      );

    case 'targeting':
      return (
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            Target tests by device, country, customer segment, and custom rules. Save presets for reuse.
          </Text>
          <Text variant="headingMd" as="h4">Options</Text>
          <DocTable
            headers={['Option', 'Description']}
            rows={[
              ['Device', 'All, desktop, mobile, tablet'],
              ['Country', 'Include/exclude countries'],
              ['Customer', 'All, new, returning, logged-in'],
              ['Custom rules', 'JSON rules for advanced targeting'],
            ]}
          />
          <Text variant="headingMd" as="h4">Presets</Text>
          <p>Create presets in the Test Wizard targeting step. Manage them in <strong>Settings → Targeting Presets</strong>.</p>
        </BlockStack>
      );

    case 'integrations':
      return (
        <BlockStack gap="400">
          <Text variant="headingMd" as="h4">GA4 Setup</Text>
          <StepList
            steps={[
              'GA4 Admin → Data Streams → Measurement Protocol API secrets',
              'Create secret, copy value',
              'Add GA4_MEASUREMENT_ID and GA4_API_SECRET to .env',
            ]}
          />
          <DocCallout type="info" title="GA4 Features">
            Events forwarded automatically. Conversion currency from <code>metadata.currency</code> (default USD). User properties: ab_test_id, ab_variant_id, ab_shop.
          </DocCallout>
          <Text variant="headingMd" as="h4">BigQuery Setup</Text>
          <StepList
            steps={[
              'Create GCP project, enable BigQuery',
              'Service account with BigQuery Data Editor',
              'Add GCP_PROJECT_ID, GCP_DATASET, GOOGLE_APPLICATION_CREDENTIALS to .env',
              'Create tables from backend/docs/bigquery_schema.sql',
            ]}
          />
          <Text variant="headingMd" as="h4">Export</Text>
          <p>Trigger from <strong>Settings → Integrations</strong>. Incremental (new events) or full (events + tests). Last export time shown in the UI.</p>
          <Text variant="headingMd" as="h4">Export Tables</Text>
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
            Configure outbound webhooks to receive POST notifications when tests complete or reach significance.
          </Text>
          <Text variant="headingMd" as="h4">Events</Text>
          <DocTable
            headers={['Event', 'When']}
            rows={[
              ['test_complete', 'Test reaches end date or is stopped'],
              ['significance', 'Statistical significance reached'],
            ]}
          />
          <Text variant="headingMd" as="h4">Setup</Text>
          <p>Add your webhook URL in <strong>Settings → General</strong>. The payload includes test ID, status, winner, and metrics.</p>
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
          <Text variant="headingMd" as="h4">Report Export</Text>
          <p>CSV or JSON, date range (all, 7/30/90 days). Contents: test info, variant metrics, significance, funnel.</p>
          <CodeBlock
            code="GET /api/analytics/tests/:id/export?format=csv&start_date=2024-01-01&end_date=2024-01-31"
            language="http"
          />
          <Text variant="headingMd" as="h4">BigQuery Export</Text>
          <p>Incremental (new events) or full (events + tests). Trigger from Settings → Integrations or API.</p>
        </BlockStack>
      );

    case 'api':
      return (
        <BlockStack gap="400">
          <Text variant="headingMd" as="h4">Authentication</Text>
          <ul className={styles.bulletList}>
            <li><strong>Shopify</strong>: ?shop=xxx.myshopify.com or X-Shopify-Shop-Domain</li>
            <li><strong>Standalone</strong>: X-RipX-API-Key or Authorization: Bearer &lt;api_key&gt;</li>
          </ul>
          <Text variant="headingMd" as="h4">Key Endpoints</Text>
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
          <Text variant="headingMd" as="h4">Script Loading</Text>
          <p><strong>Shopify:</strong></p>
          <CodeBlock
            code='<script src="https://your-app.com/api/track/script.js?shop=your-shop.myshopify.com"></script>'
            language="html"
          />
          <p><strong>Standalone:</strong></p>
          <CodeBlock
            code='<script src="https://your-app.com/api/track/script.js?site=example.com"></script>'
            language="html"
          />
          <Text variant="headingMd" as="h4">Track Conversion</Text>
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
          <Text variant="headingMd" as="h4">Shopify</Text>
          <p>OAuth install, webhooks (orders, products, uninstall), app embed + proxy for storefront script.</p>
          <Text variant="headingMd" as="h4">Standalone</Text>
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

function Documentation() {
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
  const activeNavRef = useRef(null);
  const activeCollapsedRef = useRef(null);
  const commandInputRef = useRef(null);
  const commandResultsRef = useRef(null);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return SECTIONS;
    const q = searchQuery.toLowerCase().trim();
    const terms = q.split(/\s+/).filter(Boolean);
    return SECTIONS.filter((s) => {
      const title = s.title.toLowerCase();
      const id = s.id.toLowerCase();
      const keywords = (s.keywords || '').toLowerCase();
      const searchable = `${title} ${id} ${keywords}`;
      return terms.every((t) => searchable.includes(t));
    });
  }, [searchQuery]);

  const commandPaletteResults = useMemo(() => {
    const q = commandQuery.toLowerCase().trim();
    if (!q) return SECTIONS;
    const terms = q.split(/\s+/).filter(Boolean);
    return SECTIONS.filter((s) => {
      const searchable = `${s.title} ${s.id} ${s.keywords || ''}`.toLowerCase();
      return terms.every((t) => searchable.includes(t));
    });
  }, [commandQuery]);

  const groupedSections = useMemo(() => {
    const groups = {};
    filteredSections.forEach((s) => {
      const g = s.group || 'other';
      if (!groups[g]) groups[g] = [];
      groups[g].push(s);
    });
    return SECTION_GROUPS.filter((g) => groups[g.key]?.length).map((g) => ({
      ...g,
      items: groups[g.key],
    }));
  }, [filteredSections]);

  const scrollToSection = useCallback((id) => {
    setActiveSection(id);
    const el = document.getElementById(`doc-section-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', `#${id}`);
    }
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setActiveSection('overview');
  }, []);

  // Initial hash on mount
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? (window.location.hash || '').replace(/^#/, '') : '';
    if (hash && SECTIONS.some((s) => s.id === hash)) {
      setActiveSection(hash);
      setTimeout(() => {
        const el = document.getElementById(`doc-section-${hash}`);
        el?.scrollIntoView({ behavior: 'auto', block: 'start' });
      }, 100);
    }
  }, []);

  // Cmd+K / Ctrl+K command palette
  useEffect(() => {
    const handleKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((o) => !o);
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
    if (!commandPaletteOpen || !commandResultsRef.current) return;
    const items = commandResultsRef.current.querySelectorAll(`button.${styles.commandPaletteItem}`);
    items[commandSelected]?.scrollIntoView({ block: 'nearest' });
  }, [commandSelected, commandPaletteOpen, commandPaletteResults.length]);

  // Document title when on docs page
  useEffect(() => {
    const prev = document.title;
    document.title = 'Documentation - RipX';
    return () => { document.title = prev; };
  }, []);

  // Reading progress + back-to-top visibility
  useEffect(() => {
    const onScroll = () => {
      const winScroll = document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      setScrollProgress(height > 0 ? Math.min(winScroll / height, 1) : 0);
      setShowBackToTop(winScroll > 400);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll active nav item into view when activeSection changes (from scroll spy)
  useEffect(() => {
    const el = sidebarCollapsed ? activeCollapsedRef.current : activeNavRef.current;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [activeSection, sidebarCollapsed]);

  // Scroll spy: update active section + hash when scrolling (topmost visible wins)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries
          .filter((e) => e.isIntersecting)
          .map((e) => ({ id: e.target.id?.replace('doc-section-', ''), boundTop: e.boundingClientRect.top }))
          .filter((x) => x.id);
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
    const ids = SECTIONS.map((s) => `doc-section-${s.id}`);
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`${pageShell.page} ${styles.docsPage}`}>
      <div
        className={styles.docsProgressBar}
        style={{ transform: `scaleX(${scrollProgress})` }}
        role="progressbar"
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
          onKeyDown={(e) => { if (e.key === 'Escape') setCommandPaletteOpen(false); }}
        >
          <div
            className={styles.commandPalette}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
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
                onChange={(e) => {
                  setCommandQuery(e.target.value);
                  setCommandSelected(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const item = commandPaletteResults[commandSelected];
                    if (item) {
                      scrollToSection(item.id);
                      setCommandPaletteOpen(false);
                    }
                    e.preventDefault();
                  } else if (e.key === 'ArrowDown' && commandPaletteResults.length > 0) {
                    setCommandSelected((i) => Math.min(i + 1, commandPaletteResults.length - 1));
                    e.preventDefault();
                  } else if (e.key === 'ArrowUp') {
                    setCommandSelected((i) => Math.max(i - 1, 0));
                    e.preventDefault();
                  }
                }}
                autoFocus
              />
              <span className={styles.commandPaletteKbd}>↵</span>
            </div>
            <div ref={commandResultsRef} className={styles.commandPaletteResults}>
              {commandPaletteResults.length === 0 ? (
                <div className={styles.commandPaletteEmpty}>
                  <Text as="p" tone="subdued">No sections match &quot;{commandQuery}&quot;</Text>
                </div>
              ) : (
                commandPaletteResults.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`${styles.commandPaletteItem} ${i === commandSelected ? styles.commandPaletteItemActive : ''}`}
                    onClick={() => {
                      scrollToSection(s.id);
                      setCommandPaletteOpen(false);
                    }}
                  >
                    <Icon source={s.icon} />
                    <span>{s.title}</span>
                    <span className={styles.commandPaletteItemGroup}>{SECTION_GROUPS.find((g) => g.key === s.group)?.label}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {showBackToTop && (
        <button
          type="button"
          className={styles.backToTopFab}
          onClick={scrollToTop}
          aria-label="Back to top"
        >
          <Icon source={ArrowUpIcon} />
        </button>
      )}
      <Page title="" subtitle="">
        <div className={styles.docsHero}>
          <h1 className={styles.docsHeroTitle}>RipX Documentation</h1>
          <p className={styles.docsHeroSubtitle}>
            Enterprise-grade A/B testing for Shopify and standalone sites. Setup, run, and analyze experiments with statistical rigor.
          </p>
          <div className={styles.docsHeroMeta}>
            <span className={styles.docsHeroBadge}>v1.0.0</span>
            <span className={styles.docsHeroBadge}>8 Test Types</span>
            <span className={styles.docsHeroBadge}>Multi-Variant</span>
            <span className={styles.docsHeroBadge}>GA4 & BigQuery</span>
            <span className={styles.docsHeroBadge}>Heatmap & Funnel</span>
            <span className={styles.docsHeroBadge}>{READING_TIME_MIN} min read</span>
          </div>
          <p className={styles.docsHeroHint}>
            Press <kbd className={styles.kbd}>⌘K</kbd> or <kbd className={styles.kbd}>Ctrl+K</kbd> to search and jump
          </p>
        </div>

        <div className={styles.docsQuickJump}>
          {SECTIONS.slice(0, 9).map((s) => (
            <button
              key={s.id}
              type="button"
              className={styles.docsQuickJumpBtn}
              onClick={() => scrollToSection(s.id)}
            >
              <Icon source={s.icon} />
              {s.title}
            </button>
          ))}
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
        <div className={`${styles.docsLayout} ${sidebarCollapsed ? styles.docsLayoutCollapsed : ''}`}>
          <aside className={`${styles.docsSidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
            <div className={styles.sidebarHeader}>
              {!sidebarCollapsed && (
                <div className={styles.sidebarTitleBlock}>
                  <div className={styles.sidebarTitleIcon}>
                    <Icon source={BookIcon} />
                  </div>
                  <h3 className={styles.sidebarTitle}>Contents</h3>
                </div>
              )}
              <button
                type="button"
                className={styles.sidebarToggle}
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <Icon source={sidebarCollapsed ? ChevronDownIcon : ChevronUpIcon} />
              </button>
            </div>
            {!sidebarCollapsed ? (
              <>
                <div className={styles.searchWrap}>
                  <div className={styles.searchInputWrapper}>
                    <span className={styles.searchIcon} aria-hidden>
                      <Icon source={SearchIcon} />
                    </span>
                    <TextField
                      label="Search"
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
                    <div className={styles.sidebarSearchEmpty}>
                      <Text as="p" tone="subdued">No sections match &quot;{searchQuery}&quot;</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Try different keywords</Text>
                    </div>
                  ) : (
                  groupedSections.map((group) => (
                    <div key={group.key} className={styles.navGroup}>
                      <div className={styles.navGroupLabel}>{group.label}</div>
                      {group.items.map((s) => (
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
                  )))}
                </nav>
                <div className={styles.sidebarFooter}>
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
                </div>
                </div>
              </>
            ) : (
              <nav className={styles.sidebarNavCollapsed}>
                {filteredSections.map((s) => (
                  <div
                    key={s.id}
                    ref={activeSection === s.id ? activeCollapsedRef : null}
                    className={styles.navItemCollapsedWrap}
                    onMouseEnter={(e) => {
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
            {SECTIONS.map((section) => (
              <section key={section.id} id={`doc-section-${section.id}`} className={styles.docSection}>
                <div className={styles.docSectionCard}>
                  <Box padding="500">
                    <BlockStack gap="400">
                      <div className={styles.sectionTitleRow}>
                        <div className={styles.sectionIconWrap}>
                          <Icon source={section.icon} />
                        </div>
                        <div className={styles.sectionTitleContent}>
                          <h2>{section.title}</h2>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {section.title} — reference
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

        <div className={styles.docsResources}>
          <Text variant="headingMd" as="h3">
            Additional Resources
          </Text>
          <div className={styles.docsResourcesLinks}>
            <a href="/api-docs" className={styles.docsResourcesLink} target="_blank" rel="noopener noreferrer">
              <CodeIcon /> API Docs (Swagger)
            </a>
            <Link to="/tests" className={styles.docsResourcesLink}>
              <TargetIcon /> All Tests
            </Link>
            <Link to="/connect" className={styles.docsResourcesLink}>
              <ConnectIcon /> Connect / API Key
            </Link>
            <Link to="/settings" className={styles.docsResourcesLink}>
              <SettingsIcon /> Settings
            </Link>
            <Link to="/setup" className={styles.docsResourcesLink}>
              <CompassIcon /> Setup Wizard
            </Link>
            <Link to="/analytics" className={styles.docsResourcesLink}>
              <ChartLineIcon /> Analytics
            </Link>
          </div>
        </div>
      </Page>
    </div>
  );
}

export default Documentation;
