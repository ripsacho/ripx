import React from 'react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Text,
  TextField,
} from '@shopify/polaris';
import { DataTableIcon } from '@shopify/polaris-icons';
import styles from '../Settings.module.css';

function ReadinessRow({ item }) {
  return (
    <div className={styles.checkoutReadinessRow}>
      <div className={styles.checkoutReadinessRowMain}>
        <div className={styles.checkoutReadinessCardHeader}>
          <Text as="span" variant="bodySm" fontWeight="semibold">
            {item.title}
          </Text>
          <Badge tone={item.tone}>{item.status}</Badge>
        </div>
        <Text as="p" variant="bodySm">
          {item.summary}
        </Text>
      </div>
      <div className={styles.checkoutReadinessRowText}>
        <Text as="p" variant="bodySm" tone="subdued">
          {item.nextAction}
        </Text>
      </div>
    </div>
  );
}

export function StoreSettingsAdvancedSection({
  currentStoreLabel,
  supportLevelHelpText,
  checkoutExperienceReadiness = [],
  checkoutExperienceDiagError,
  checkoutExperienceDiagLoading,
  onRunCheckoutExperienceDiagnostics,
  onRunFullCheckoutVerification,
  checkoutFullVerifyRunning,
  onRunCheckoutDiagnostics,
  checkoutDiagLoading,
  onRefreshFunctionInventory,
  shopifyFnInventoryLoading,
  shopifyFnInventoryError,
  previewProbeTestId,
  onPreviewProbeTestIdChange,
  previewProbeVariant,
  onPreviewProbeVariantChange,
  onAutofillPreviewProbe,
  previewProbeAutofillLoading,
  onRunPreviewProbe,
  previewProbeLoading,
  previewProbeUrl,
  previewProbeError,
  previewProbeResult,
  shopifyAdminDiscountsUrl,
  shopifyFnInventory,
  checkoutDiag,
  storeHealth,
  onCopyDiagnosticsJson,
  formatRelativeTime,
}) {
  const diagnosticsPayload = { checkoutDiag, shopifyFnInventory, storeHealth };

  return (
    <BlockStack gap="400">
      <Banner tone="info">
        <p>
          Tools for support and troubleshooting. Most merchants can stay on{' '}
          <strong>Store setup</strong> — use this tab when RipX support asks for diagnostics or you
          need to verify checkout extensions.
        </p>
      </Banner>

      <Card className={styles.settingsPanelCard}>
        <Box padding="500">
          <BlockStack gap="400">
            <div className={styles.sectionHeader}>
              <div className={styles.sectionHeaderIcon}>
                <DataTableIcon />
              </div>
              <div className={styles.sectionHeaderContent}>
                <Text variant="headingMd" as="h2">
                  Verification tools
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Re-run checks after theme edits, app URL changes, or extension deploys.
                  {currentStoreLabel ? ` Store: ${currentStoreLabel}.` : ''}
                </Text>
              </div>
            </div>
            <InlineStack gap="200" wrap>
              <Button onClick={onRunFullCheckoutVerification} loading={checkoutFullVerifyRunning}>
                Full store verification
              </Button>
              <Button onClick={onRunCheckoutDiagnostics} loading={checkoutDiagLoading}>
                Checkout diagnostics
              </Button>
              <Button
                onClick={onRunCheckoutExperienceDiagnostics}
                loading={checkoutExperienceDiagLoading}
              >
                Sync checkout UI
              </Button>
              <Button onClick={onRefreshFunctionInventory} loading={shopifyFnInventoryLoading}>
                Refresh function inventory
              </Button>
            </InlineStack>
            {shopifyFnInventoryError && <Banner tone="critical">{shopifyFnInventoryError}</Banner>}
            {checkoutExperienceDiagError && (
              <Banner tone="critical">{checkoutExperienceDiagError}</Banner>
            )}
            <Text as="p" variant="bodySm" tone="subdued">
              {supportLevelHelpText}
            </Text>
          </BlockStack>
        </Box>
      </Card>

      {checkoutExperienceReadiness.length > 0 && (
        <Card className={styles.settingsPanelCard}>
          <Box padding="500">
            <BlockStack gap="400">
              <div className={styles.checkoutReadinessHeader}>
                <Text variant="headingSm" as="h3">
                  Checkout launch surfaces
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Separate readiness for checkout experience, offers, payment methods, and shipping.
                </Text>
              </div>
              <div className={styles.checkoutReadinessList}>
                {checkoutExperienceReadiness.map(item => (
                  <ReadinessRow key={item.id} item={item} />
                ))}
              </div>
            </BlockStack>
          </Box>
        </Card>
      )}

      <Card className={styles.settingsPanelCard}>
        <Box padding="500">
          <BlockStack gap="400">
            <Text variant="headingSm" as="h3">
              Preview probe
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Validate preview URL assignment for a running test without opening the wizard.
            </Text>
            <div className={styles.installAdvancedModalGrid}>
              <TextField
                label="Test ID"
                value={previewProbeTestId}
                onChange={onPreviewProbeTestIdChange}
                autoComplete="off"
                placeholder="68cbfbe8-6bee-479c-acce-58d0d9ffd9fe"
              />
              <TextField
                label="Variant name"
                value={previewProbeVariant}
                onChange={onPreviewProbeVariantChange}
                autoComplete="off"
                placeholder="Variant A"
              />
            </div>
            <InlineStack gap="200" wrap>
              <Button
                size="slim"
                onClick={onAutofillPreviewProbe}
                loading={previewProbeAutofillLoading}
              >
                Use running test
              </Button>
              <Button size="slim" onClick={onRunPreviewProbe} loading={previewProbeLoading}>
                Run preview probe
              </Button>
              <Button
                size="slim"
                url={previewProbeUrl || undefined}
                external
                disabled={!previewProbeUrl}
              >
                Open preview URL
              </Button>
              {shopifyAdminDiscountsUrl && (
                <Button size="slim" url={shopifyAdminDiscountsUrl} external>
                  Open Shopify discounts
                </Button>
              )}
            </InlineStack>
            {previewProbeError && <Banner tone="critical">{previewProbeError}</Banner>}
            {previewProbeResult && (
              <div className={styles.checkoutDiagProbeResult}>
                <Text as="p" variant="bodySm">
                  <strong>Variant:</strong>{' '}
                  {previewProbeResult.variantName || previewProbeResult.variantId || '—'}
                </Text>
                <Text as="p" variant="bodySm">
                  <strong>Mode:</strong> {previewProbeResult.priceMode || '—'}
                </Text>
                <Text as="p" variant="bodySm">
                  <strong>Fixed price:</strong> {previewProbeResult.price ?? '—'}
                </Text>
              </div>
            )}
          </BlockStack>
        </Box>
      </Card>

      {shopifyFnInventory?.summary && (
        <Card className={styles.settingsPanelCard}>
          <Box padding="500">
            <BlockStack gap="300">
              <Text variant="headingSm" as="h3">
                Shopify Functions inventory
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {shopifyFnInventory.summary.totalFunctionsReturned} function(s) returned
                {shopifyFnInventory.generatedAt
                  ? ` · updated ${formatRelativeTime(shopifyFnInventory.generatedAt)}`
                  : ''}
              </Text>
              {shopifyFnInventory.readiness && (
                <InlineStack gap="200" wrap>
                  {typeof shopifyFnInventory.readiness === 'string' ? (
                    <Badge
                      tone={shopifyFnInventory.readiness === 'ready' ? 'success' : 'attention'}
                    >
                      {shopifyFnInventory.readiness}
                    </Badge>
                  ) : (
                    <>
                      <Badge
                        tone={
                          shopifyFnInventory.readiness.discount_function_for_checkout
                            ? 'success'
                            : 'attention'
                        }
                      >
                        Discount path:{' '}
                        {shopifyFnInventory.readiness.discount_function_for_checkout
                          ? 'ready'
                          : 'not detected'}
                      </Badge>
                      <Badge
                        tone={
                          shopifyFnInventory.readiness.cart_transform_for_direct_price
                            ? 'success'
                            : 'attention'
                        }
                      >
                        Direct price path:{' '}
                        {shopifyFnInventory.readiness.cart_transform_for_direct_price
                          ? 'ready'
                          : 'not detected'}
                      </Badge>
                    </>
                  )}
                </InlineStack>
              )}
            </BlockStack>
          </Box>
        </Card>
      )}

      <Card className={styles.settingsPanelCard} id="settings-advanced-diagnostics-json">
        <Box padding="500">
          <BlockStack gap="300">
            <Text variant="headingSm" as="h3">
              Technical details
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Copy for RipX support. Redact secrets before sharing outside your team.
            </Text>
            <pre className={styles.checkoutDiagDebugBox}>
              {JSON.stringify(diagnosticsPayload, null, 2)}
            </pre>
            <InlineStack gap="200">
              <Button size="slim" onClick={onCopyDiagnosticsJson}>
                Copy diagnostics JSON
              </Button>
            </InlineStack>
          </BlockStack>
        </Box>
      </Card>
    </BlockStack>
  );
}
