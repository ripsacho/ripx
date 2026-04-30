import React from 'react';
import { Link } from 'react-router-dom';
import {
  ChartLineIcon,
  CheckCircleIcon,
  ClockIcon,
  CreditCardIcon,
  DataTableIcon,
  GlobeIcon,
  MagicIcon,
  SearchIcon,
  ShieldCheckMarkIcon,
  TargetIcon,
} from '@shopify/polaris-icons';
import { Icon } from '@shopify/polaris';
import { ROUTES } from '../../constants';
import styles from './MarketingLanding.module.css';

const primaryFeatures = [
  {
    icon: TargetIcon,
    title: 'Launch smarter experiments',
    text: 'Create price, offer, content, shipping, checkout, URL, and theme tests from one guided workflow.',
  },
  {
    icon: CreditCardIcon,
    title: 'Built for Shopify checkout',
    text: 'Use Cart Transform and checkout-ready handoffs for pricing tests, with diagnostics before launch.',
  },
  {
    icon: DataTableIcon,
    title: 'Decision-ready analytics',
    text: 'Track conversion, revenue, AOV, confidence, guardrails, variants, and promotion performance.',
  },
  {
    icon: GlobeIcon,
    title: 'Shopify and standalone',
    text: 'Run store experiments on Shopify themes or standalone sites with one runtime and account hub.',
  },
];

const credibilityStats = [
  ['8+', 'experiment types'],
  ['3', 'preview modes'],
  ['1', 'checkout-safe pipeline'],
  ['0', 'guesswork launches'],
];

const heroSignals = [
  ['Preflight', 'Install, proxy, preview, and checkout checks before traffic.'],
  ['Checkout-safe', 'Price and offer paths designed around Shopify constraints.'],
  ['Decision-ready', 'Revenue, AOV, confidence, and guardrails in one view.'],
];

const testTypeShowcase = [
  {
    icon: CreditCardIcon,
    title: 'Pricing',
    text: 'Direct price override paths for product and variant-level price experiments.',
    accent: 'Price matrix',
  },
  {
    icon: MagicIcon,
    title: 'Offers',
    text: 'Promo, discount, and free-shipping campaigns with checkout-aware tracking.',
    accent: 'Campaign lift',
  },
  {
    icon: ShieldCheckMarkIcon,
    title: 'Checkout',
    text: 'Trust blocks, payment methods, delivery methods, and checkout UI experiments.',
    accent: 'Plus-ready',
  },
  {
    icon: GlobeIcon,
    title: 'Shipping',
    text: 'Shipping promise, threshold, carrier quote, and delivery strategy tests.',
    accent: 'Rate strategy',
  },
  {
    icon: TargetIcon,
    title: 'Themes',
    text: 'Theme, template, and onsite edits without losing experiment attribution.',
    accent: 'No-code edits',
  },
  {
    icon: SearchIcon,
    title: 'Landing pages',
    text: 'Split URLs and page-level targeting for campaigns, funnels, and segments.',
    accent: 'Traffic split',
  },
];

const conversionPillars = [
  {
    title: 'Revenue experiments',
    text: 'Test price points, offers, free shipping, product messaging, and theme changes where profit is actually made.',
  },
  {
    title: 'Launch confidence',
    text: 'Readiness checks, app embed detection, checkout function diagnostics, and customer-safe previews reduce broken launches.',
  },
  {
    title: 'Decision discipline',
    text: 'Analytics, guardrails, exports, conflict checks, and rollouts turn test results into controlled business action.',
  },
];

const purchaseOptions = [
  {
    name: 'Starter',
    price: 'For validation',
    description: 'Connect a store, install the script, and launch focused A/B tests.',
    points: ['Guided setup', 'Core test types', 'Basic analytics', 'Public documentation'],
  },
  {
    name: 'Growth',
    price: 'For scaling teams',
    description: 'Add checkout, pricing, offer, and shipping workflows with stronger diagnostics.',
    points: ['Price test readiness', 'Offer checkout path', 'Preview links', 'Targeting presets'],
    featured: true,
  },
  {
    name: 'Advanced',
    price: 'For optimization programs',
    description: 'Use guardrails, personalization, rollout workflows, exports, and admin controls.',
    points: ['Personalization', 'Rollouts', 'Conflict checks', 'Advanced reporting'],
  },
];

const proofItems = [
  'No-code launch flow for marketers, deep diagnostics for engineers.',
  'Preview every variant before sending traffic.',
  'Designed around Shopify storefront, cart, and checkout constraints.',
  'Clear install checks so missing embeds and function setup are visible before launch.',
];

const fallbackClients = [
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

function MarketingLanding() {
  const [clients, setClients] = React.useState(fallbackClients);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/landing/clients', { credentials: 'omit' })
      .then(res => (res.ok ? res.json() : null))
      .then(payload => {
        if (cancelled) return;
        const list = payload?.data?.clients;
        if (Array.isArray(list) && list.length > 0) {
          setClients(list);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link to={ROUTES.MARKETING} className={styles.brand} aria-label="RipX home">
          <span className={styles.brandMark}>R</span>
          <span>RipX</span>
        </Link>
        <nav className={styles.navLinks} aria-label="Public navigation">
          <a href={ROUTES.DOCS} target="_blank" rel="noopener noreferrer">
            Documentation
          </a>
          <Link to={ROUTES.CONNECT}>Sign in</Link>
          <Link to={ROUTES.USER_PANEL}>Dashboard</Link>
        </nav>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.heroBadge}>
              <Icon source={ShieldCheckMarkIcon} />
              Built for Shopify price, cart, and checkout testing
            </div>
            <p className={styles.eyebrow}>Advanced A/B testing for revenue teams</p>
            <h1>Turn every store change into a measured growth decision.</h1>
            <p className={styles.heroText}>
              RipX helps Shopify and ecommerce teams test pricing, offers, checkout experiences,
              shipping promises, landing pages, and theme changes with confidence, diagnostics, and
              analytics in one command center.
            </p>
            <div className={styles.heroSignalGrid} aria-label="RipX value signals">
              {heroSignals.map(([label, text]) => (
                <div key={label} className={styles.heroSignalCard}>
                  <span>{label}</span>
                  <p>{text}</p>
                </div>
              ))}
            </div>
            <div className={styles.heroActions}>
              <Link to={ROUTES.CONNECT} className={styles.primaryButton}>
                Purchase the app
              </Link>
              <a
                href={ROUTES.DOCS}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.secondaryButton}
              >
                Read documentation
              </a>
            </div>
            <div className={styles.heroProof}>
              {proofItems.map(item => (
                <span key={item}>
                  <Icon source={CheckCircleIcon} />
                  {item}
                </span>
              ))}
            </div>
            <div className={styles.statStrip} aria-label="RipX platform highlights">
              {credibilityStats.map(([value, label]) => (
                <div key={label} className={styles.statItem}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            className={styles.heroVisual}
            role="img"
            aria-label="RipX experiment dashboard preview"
          >
            <div className={styles.visualTop}>
              <span />
              <span />
              <span />
              <strong>Live readiness</strong>
            </div>
            <div className={styles.visualStatusBar}>
              <span>Script live</span>
              <span>Checkout path ready</span>
              <span>Preview passed</span>
            </div>
            <div className={styles.visualCard}>
              <div>
                <p>Revenue confidence</p>
                <strong>97.4%</strong>
                <em>Variant B trending +12.8% revenue per visitor</em>
              </div>
              <div className={styles.visualGraph}>
                <span style={{ height: '42%' }} />
                <span style={{ height: '58%' }} />
                <span style={{ height: '71%' }} />
                <span style={{ height: '86%' }} />
                <span style={{ height: '76%' }} />
              </div>
            </div>
            <div className={styles.visualTimeline}>
              {['Build variant', 'Verify checkout', 'Launch test', 'Roll out winner'].map(
                (step, index) => (
                  <div key={step}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{step}</strong>
                  </div>
                )
              )}
            </div>
            <div className={styles.visualGrid}>
              <div>
                <small>Price Test</small>
                <strong>Cart Transform ready</strong>
              </div>
              <div>
                <small>Offer Test</small>
                <strong>Discount path attached</strong>
              </div>
              <div>
                <small>Preview</small>
                <strong>Customer-safe links</strong>
              </div>
              <div>
                <small>Decision</small>
                <strong>Winner rollout queued</strong>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.testTypeShowcase} aria-label="Optimization areas RipX supports">
          <div className={styles.testTypeShowcaseHeader}>
            <p className={styles.eyebrow}>Experiment surfaces</p>
            <h2>More than page edits. Test the moments that move revenue.</h2>
          </div>
          <div className={styles.testTypeRail} aria-label="Supported test types">
            <div className={styles.testTypeTrack}>
              {[...testTypeShowcase, ...testTypeShowcase].map((item, index) => (
                <article
                  key={`${item.title}-${index}`}
                  className={styles.testTypeCard}
                  aria-hidden={index >= testTypeShowcase.length ? 'true' : undefined}
                >
                  <div className={styles.testTypeIcon}>
                    <Icon source={item.icon} />
                  </div>
                  <div className={styles.testTypeCardBody}>
                    <span>{item.accent}</span>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Why RipX</p>
            <h2>One platform for the tests that actually move ecommerce revenue.</h2>
            <p>
              Most A/B tools stop at content changes. RipX is built for the hard parts too: price
              experiments, Shopify checkout execution, cart handoff, preview reliability, and
              operational launch safety.
            </p>
          </div>
          <div className={styles.featureGrid}>
            {primaryFeatures.map(feature => (
              <article key={feature.title} className={styles.featureCard}>
                <div className={styles.featureIcon}>
                  <Icon source={feature.icon} />
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.clientShowcase} aria-label="Client stories">
          <div className={styles.clientSpotlight}>
            <p className={styles.eyebrow}>Trusted by growth teams</p>
            <h2>Client proof that feels alive, not like a static logo wall.</h2>
            <p>
              Showcase merchants, teams, or agencies from Admin. Until then, RipX shows polished
              demo examples so the selling page keeps its momentum.
            </p>
          </div>
          <div className={styles.clientRail} aria-label="Client slider">
            <div className={styles.clientTrack}>
              {[...clients, ...clients].map((client, index) => (
                <article
                  key={`${client.name}-${index}`}
                  className={styles.clientCard}
                  aria-hidden={index >= clients.length ? 'true' : undefined}
                >
                  <div className={styles.clientIcon}>{client.icon || client.name?.slice(0, 2)}</div>
                  <div>
                    <h3>{client.name}</h3>
                    <span>{client.industry || 'Ecommerce team'}</span>
                  </div>
                  <p>
                    {client.quote || 'Experiment workflows became easier to launch and verify.'}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.pillarSection}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Built for modern CRO</p>
            <h2>Everything important stays visible before traffic goes live.</h2>
          </div>
          <div className={styles.pillarGrid}>
            {conversionPillars.map((pillar, index) => (
              <article key={pillar.title} className={styles.pillarCard}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{pillar.title}</h3>
                <p>{pillar.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.purchaseSection}`}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Purchase options</p>
            <h2>Start small, then scale your optimization program.</h2>
            <p>
              Choose the package that matches your testing maturity. The app is designed so teams
              can begin with simple tests and grow into advanced checkout and personalization
              workflows.
            </p>
          </div>
          <div className={styles.planGrid}>
            {purchaseOptions.map(plan => (
              <article
                key={plan.name}
                className={`${styles.planCard} ${plan.featured ? styles.planFeatured : ''}`}
              >
                {plan.featured && <span className={styles.planBadge}>Recommended</span>}
                <h3>{plan.name}</h3>
                <strong>{plan.price}</strong>
                <p>{plan.description}</p>
                <ul>
                  {plan.points.map(point => (
                    <li key={point}>
                      <Icon source={CheckCircleIcon} />
                      {point}
                    </li>
                  ))}
                </ul>
                <Link to={ROUTES.CONNECT} className={styles.planButton}>
                  Purchase {plan.name}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.workflowSection}>
          <div className={styles.workflowPanel}>
            <div className={styles.featureIcon}>
              <Icon source={MagicIcon} />
            </div>
            <h2>From idea to winner without guesswork.</h2>
            <p>
              Build variants, target the right audience, preview the customer journey, run readiness
              checks, launch safely, and use clear analytics to roll out winners.
            </p>
          </div>
          <ol className={styles.workflowSteps}>
            {[
              ['01', 'Design', 'Create variants for pricing, offers, checkout, content, or theme.'],
              ['02', 'Verify', 'Use install, checkout, and preview checks before launch.'],
              ['03', 'Measure', 'Read conversion, revenue, confidence, and guardrail impact.'],
              ['04', 'Scale', 'Personalize, roll out winners, and keep learning.'],
            ].map(([number, title, text]) => (
              <li key={number} className={styles.workflowStep}>
                <span>{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.compareSection}>
          <div className={styles.compareCard}>
            <div className={styles.featureIcon}>
              <Icon source={SearchIcon} />
            </div>
            <h2>Why choose RipX instead of a generic testing script?</h2>
            <p>
              Generic A/B tools are strong for content. RipX focuses on ecommerce execution:
              storefront assignment, Shopify app embed checks, cart-line handoff, checkout function
              readiness, and test operations in one place.
            </p>
          </div>
          <div className={styles.compareList}>
            {[
              'Price-test handoff designed around Shopify cart and checkout constraints.',
              'Customer-view and debug previews built for store teams and developers.',
              'Install checklist surfaces missing app embeds, proxy drift, and checkout setup.',
              'Multiple experiment types share one dashboard, targeting model, and analytics flow.',
            ].map(item => (
              <div key={item}>
                <Icon source={CheckCircleIcon} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.ctaSection}>
          <div>
            <p className={styles.eyebrow}>Ready to test better?</p>
            <h2>Purchase RipX and build your next growth experiment today.</h2>
          </div>
          <div className={styles.ctaActions}>
            <Link to={ROUTES.CONNECT} className={styles.primaryButton}>
              Purchase the app
            </Link>
            <a
              href={ROUTES.DOCS}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.secondaryButton}
            >
              Explore docs
            </a>
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <span>RipX A/B Testing Platform</span>
        <span>
          <Icon source={ClockIcon} /> Built for continuous optimization
        </span>
        <span>
          <Icon source={ChartLineIcon} /> Designed for measurable revenue impact
        </span>
      </footer>
    </div>
  );
}

export default MarketingLanding;
