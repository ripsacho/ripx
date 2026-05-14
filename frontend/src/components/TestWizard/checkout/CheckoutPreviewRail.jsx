import React, { useEffect, useState } from 'react';
import { Badge, Button, Text } from '@shopify/polaris';
import styles from '../TargetingSection.module.css';

function getBadgeTone(severity) {
  if (severity === 'blocker') return 'critical';
  if (severity === 'warning') return 'attention';
  return 'info';
}

function formatIssueScope(scope) {
  if (scope === 'product') return 'Product list';
  if (scope === 'runtime') return 'Runtime';
  if (scope === 'surface') return 'Checkout surface';
  if (scope === 'method') return 'Method target';
  if (scope === 'content') return 'Content';
  return 'Studio';
}

export default function CheckoutPreviewRail({
  title = 'Launch confidence',
  readiness,
  phaseLabel = 'Checkout',
  activeMode = 'overview',
  compact = false,
  collapsible = false,
  defaultOpen,
  onIssueAction,
}) {
  const [showAllSections, setShowAllSections] = useState(false);
  const [showAllIssues, setShowAllIssues] = useState(false);
  const issues = Array.isArray(readiness?.issues) ? readiness.issues : [];
  const sections = Array.isArray(readiness?.sections) ? readiness.sections : [];
  const productSections = Array.isArray(readiness?.productSections)
    ? readiness.productSections
    : [];
  const isMethodPhase = phaseLabel === 'Payment methods' || phaseLabel === 'Delivery methods';
  const hasCartRelatedProducts = productSections.some(
    section => section?.props?.product_source_mode === 'cart_related'
  );
  const hasCollectionProducts = productSections.some(
    section => section?.props?.product_source_mode === 'collection'
  );
  const hasAddToCartProducts = productSections.some(
    section => section?.props?.product_action === 'add_to_cart'
  );
  const blockerCount =
    readiness?.blockerCount ?? issues.filter(issue => issue.severity === 'blocker').length;
  const warningCount =
    readiness?.warningCount ?? issues.filter(issue => issue.severity === 'warning').length;
  const renderableCount = readiness?.actionableSections?.length || 0;
  const topIssue = issues.find(issue => issue.severity === 'blocker') || issues[0];
  const visibleSections = showAllSections ? sections : sections.slice(0, 4);
  const visibleIssues = showAllIssues ? issues : issues.slice(0, 8);
  const showDeepDetails = !compact || issues.length > 0;
  const shouldDefaultOpen =
    defaultOpen ??
    (readiness?.status === 'blocked' ||
      readiness?.status === 'needs_attention' ||
      activeMode === 'preview');
  const [inspectorOpen, setInspectorOpen] = useState(shouldDefaultOpen);
  const deepDetailsDefaultOpen =
    activeMode === 'preview' &&
    (readiness?.status === 'blocked' || readiness?.status === 'needs_attention');

  useEffect(() => {
    if (shouldDefaultOpen) {
      setInspectorOpen(true);
    }
  }, [shouldDefaultOpen]);
  const previewLayers = [
    {
      title: 'Editor preview',
      status: 'Static config',
      notes: [
        isMethodPhase
          ? 'Shows configured method targets and supporting checkout content, not Shopify Function output.'
          : 'Shows saved section copy, product rows, layout, tone, and CTA intent.',
        'Manual product display rows can be represented from saved config.',
      ],
    },
    {
      title: 'Assignment and hydration',
      status:
        hasCollectionProducts || hasCartRelatedProducts ? 'Runtime dependent' : 'Config ready',
      notes: [
        hasCollectionProducts
          ? 'Collection-fed lists hydrate during checkout assignment from Shopify Admin products.'
          : 'No collection hydration dependency detected for this variant.',
        hasCartRelatedProducts
          ? 'Cart-related lists depend on live checkout cart lines and may render empty.'
          : 'No cart-related product dependency detected for this variant.',
      ],
    },
    {
      title: 'Shopify verification',
      status: 'Verify in checkout',
      notes: [
        hasAddToCartProducts
          ? 'Add-to-cart requires cart-line API access and merchandise or variant GIDs.'
          : 'No add-to-cart API dependency detected for product lists.',
        isMethodPhase
          ? 'Payment/delivery changes require Shopify customization deployment and matching customer-facing labels.'
          : 'Checkout UI extension placement, assignment URLs, and conversion tracking must be verified in Shopify.',
      ],
    },
  ];
  const analyticsNotes = isMethodPhase
    ? [
        `${phaseLabel} tests use method action and customization match events.`,
        'Configured targets are not proof that the Shopify customization is deployed or applied.',
      ]
    : [
        'Experience tests can emit section, product, impression, and CTA events.',
        'Preview sessions and missing assignment joins can make analytics look different from production.',
      ];
  const launchChecks = isMethodPhase
    ? [
        {
          label: `${phaseLabel} customization/function is deployed in Shopify.`,
          passed: readiness?.status !== 'blocked',
        },
        {
          label: 'Target method names match customer-facing checkout labels.',
          passed: !issues.some(issue => issue.scope === 'surface'),
        },
        {
          label: 'Checkout assignment attributes are present before method resolution.',
          passed: readiness?.status !== 'blocked',
        },
      ]
    : [
        {
          label: 'Checkout UI extension is deployed and placed in Shopify checkout editor.',
          passed: readiness?.status !== 'blocked',
        },
        {
          label: 'Renderable sections have copy, layout, and CTA behavior verified.',
          passed: (readiness?.actionableSections?.length || 0) > 0,
        },
        {
          label: 'Dynamic product lists are tested with realistic checkout carts.',
          passed: !hasCartRelatedProducts && !hasCollectionProducts,
        },
      ];
  const confidenceLanes = [
    {
      title: 'Design',
      status:
        (readiness?.actionableSections?.length || 0) > 0 || isMethodPhase ? 'Ready' : 'Blocked',
      tone:
        (readiness?.actionableSections?.length || 0) > 0 || isMethodPhase ? 'success' : 'critical',
      detail: isMethodPhase
        ? `${phaseLabel} targets are configured in the method editor.`
        : `${readiness?.actionableSections?.length || 0} renderable checkout block${(readiness?.actionableSections?.length || 0) === 1 ? '' : 's'} saved.`,
    },
    {
      title: 'Deploy',
      status: readiness?.status === 'blocked' ? 'Needs proof' : 'Verify',
      tone: readiness?.status === 'blocked' ? 'attention' : 'info',
      detail: isMethodPhase
        ? 'Confirm the Shopify Function and checkout customization after saving.'
        : 'Confirm extension placement, assignment URL, and Shopify checkout rendering.',
    },
    {
      title: 'Live checkout',
      status: hasCollectionProducts || hasCartRelatedProducts ? 'Runtime dependent' : 'Ready',
      tone: hasCollectionProducts || hasCartRelatedProducts ? 'attention' : 'success',
      detail:
        hasCollectionProducts || hasCartRelatedProducts
          ? 'Dynamic rows depend on assignment hydration or the shopper cart.'
          : 'No dynamic product-list hydration dependency detected.',
    },
  ];

  return (
    <aside
      className={`${styles.checkoutStudioReadinessPanel} ${
        collapsible && !inspectorOpen ? styles.checkoutStudioReadinessPanelCollapsed : ''
      }`}
      aria-label={title}
    >
      <div className={styles.checkoutStudioReadinessHeader}>
        <div>
          <Text as="h6" variant="headingSm">
            {title}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {phaseLabel} checks for {activeMode.replace('_', ' ')} mode and runtime path.
          </Text>
        </div>
        <Badge
          tone={
            readiness?.status === 'blocked'
              ? 'critical'
              : readiness?.status === 'needs_attention'
                ? 'attention'
                : 'success'
          }
        >
          {readiness?.status === 'blocked'
            ? 'Blocked'
            : readiness?.status === 'needs_attention'
              ? 'Needs attention'
              : 'Ready'}
        </Badge>
      </div>

      {collapsible ? (
        <Button
          size="slim"
          variant="secondary"
          aria-expanded={inspectorOpen}
          onClick={() => setInspectorOpen(current => !current)}
        >
          {inspectorOpen ? 'Hide confidence details' : 'Show confidence details'}
        </Button>
      ) : null}

      {!inspectorOpen ? (
        <div className={styles.checkoutConfidenceCollapsedSummary}>
          <strong>
            {blockerCount > 0
              ? `${blockerCount} blocker${blockerCount === 1 ? '' : 's'}`
              : warningCount > 0
                ? `${warningCount} warning${warningCount === 1 ? '' : 's'}`
                : 'Ready'}
          </strong>
          <span>
            {topIssue?.message ||
              `${renderableCount} renderable checkout block${renderableCount === 1 ? '' : 's'} ready for verification.`}
          </span>
          {topIssue && onIssueAction ? (
            <Button size="slim" variant="plain" onClick={() => onIssueAction(topIssue)}>
              Fix next: {formatIssueScope(topIssue.scope)}
            </Button>
          ) : null}
        </div>
      ) : null}

      {inspectorOpen ? (
        <>
          <div className={styles.checkoutPreviewConfidenceCard}>
            <strong>
              {readiness?.status === 'blocked'
                ? 'Blocked by setup'
                : readiness?.status === 'needs_attention'
                  ? 'Ready with runtime warnings'
                  : 'Ready for Shopify verification'}
            </strong>
            <span>
              {topIssue?.message ||
                'No setup blockers detected. Use Shopify checkout for the final runtime proof.'}
            </span>
          </div>

          <div
            className={styles.checkoutConfidenceSummaryChips}
            aria-label="Checkout readiness summary"
          >
            <span>
              <Badge tone={blockerCount > 0 ? 'critical' : 'success'}>
                {blockerCount} blocker{blockerCount === 1 ? '' : 's'}
              </Badge>
            </span>
            <span>
              <Badge tone={warningCount > 0 ? 'attention' : 'success'}>
                {warningCount} warning{warningCount === 1 ? '' : 's'}
              </Badge>
            </span>
            <span>
              {renderableCount} renderable block{renderableCount === 1 ? '' : 's'}
            </span>
          </div>

          <div className={styles.checkoutConfidenceLaneGrid}>
            {confidenceLanes.map(lane => (
              <div key={lane.title} className={styles.checkoutConfidenceLane}>
                <span>{lane.title}</span>
                <Badge tone={lane.tone}>{lane.status}</Badge>
                <small>{lane.detail}</small>
              </div>
            ))}
          </div>

          {issues.length > 0 ? (
            <div className={styles.checkoutPreviewRailCard}>
              <span className={styles.checkoutSectionPreviewLabel}>Readiness issues</span>
              <div className={styles.checkoutStudioReadinessList}>
                {visibleIssues.map((issue, index) => (
                  <div
                    key={`${issue.severity}-${issue.scope}-${index}`}
                    className={styles.checkoutStudioReadinessItem}
                  >
                    <Badge tone={getBadgeTone(issue.severity)}>{issue.severity}</Badge>
                    <div>
                      <span className={styles.checkoutStudioReadinessScope}>
                        {formatIssueScope(issue.scope)}
                      </span>
                      <strong>{issue.message}</strong>
                      {issue.nextAction ? <span>{issue.nextAction}</span> : null}
                      {onIssueAction ? (
                        <Button size="micro" variant="plain" onClick={() => onIssueAction(issue)}>
                          Go to fix
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              {issues.length > 8 ? (
                <Button
                  size="micro"
                  variant="plain"
                  onClick={() => setShowAllIssues(current => !current)}
                >
                  {showAllIssues ? 'Show fewer issues' : `Show all ${issues.length} issues`}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className={styles.checkoutStudioReadinessEmpty}>
              Ready for checkout verification. Use Shopify checkout to confirm final visuals and API
              behavior.
            </div>
          )}

          {showDeepDetails ? (
            <details
              className={styles.checkoutConfidenceInspectorDetails}
              open={deepDetailsDefaultOpen}
            >
              <summary className={styles.checkoutPreviewRailSummary}>
                Deep confidence details
              </summary>
              <div className={styles.checkoutConfidenceInspectorBody}>
                <div className={styles.checkoutPreviewRailCard}>
                  <span className={styles.checkoutSectionPreviewLabel}>Content preview</span>
                  <div className={styles.checkoutPreviewRailStats}>
                    <span>{readiness?.actionableSections?.length || 0} renderable blocks</span>
                    <span>{productSections.length} product lists</span>
                    <span>{readiness?.paymentMethodCount || 0} payment targets</span>
                    <span>{readiness?.deliveryMethodCount || 0} delivery targets</span>
                  </div>
                  {sections.length > 0 ? (
                    <div className={styles.checkoutPreviewRailStack}>
                      {visibleSections.map((section, index) => (
                        <span key={`${section?.id || section?.type || 'section'}-${index}`}>
                          {index + 1}. {section?.type || 'section'}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {sections.length > 4 ? (
                    <Button
                      size="micro"
                      variant="plain"
                      onClick={() => setShowAllSections(current => !current)}
                    >
                      {showAllSections
                        ? 'Show fewer sections'
                        : `Show all ${sections.length} sections`}
                    </Button>
                  ) : null}
                </div>

                {previewLayers.map(layer => (
                  <details key={layer.title} className={styles.checkoutPreviewRailCard}>
                    <summary className={styles.checkoutPreviewRailSummary}>{layer.title}</summary>
                    <div className={styles.checkoutPreviewLayerCard}>
                      <strong>{layer.title}</strong>
                      <em>{layer.status}</em>
                      {layer.notes.map(note => (
                        <span key={note}>{note}</span>
                      ))}
                    </div>
                  </details>
                ))}

                <details className={styles.checkoutPreviewRailCard}>
                  <summary className={styles.checkoutPreviewRailSummary}>Analytics scope</summary>
                  <div className={styles.checkoutRuntimePreviewNotes}>
                    {analyticsNotes.map(note => (
                      <span key={note}>{note}</span>
                    ))}
                  </div>
                </details>

                <div className={styles.checkoutPreviewRailCard}>
                  <span className={styles.checkoutSectionPreviewLabel}>Launch checklist</span>
                  <div className={styles.checkoutPreviewChecklist}>
                    {launchChecks.map(check => (
                      <span key={check.label}>
                        <Badge tone={check.passed ? 'success' : 'attention'}>
                          {check.passed ? 'Pass' : 'Warn'}
                        </Badge>
                        {check.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}
