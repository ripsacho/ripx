import { Modal, BlockStack, Text, Button, InlineStack, Badge } from '@shopify/polaris';
import styles from '../Settings.module.css';

export function InstallSnippetModal({
  open,
  onClose,
  installation,
  onCopy,
  onCopySnippet,
  onRunCheckoutDiagnostics,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Install head script"
      size="large"
      primaryAction={{ content: 'Close', onAction: onClose }}
    >
      <Modal.Section>
        <BlockStack gap="300" data-modal="settings-install-detail">
          <Text as="p" variant="bodySm" tone="subdued">
            Copy the RipX app script for this store and paste the full HTML snippet into the site{' '}
            {'<head>'}. Shopify stores should prefer the theme app embed, with the direct script
            available as a fallback.
          </Text>
          {installation?.scriptUrl && (
            <BlockStack gap="150">
              <Text variant="headingSm" as="h3">
                Script URL
              </Text>
              <div className={styles.installModalCodeBlock}>
                <code className={styles.checkoutDiagMono}>{installation.scriptUrl}</code>
              </div>
              <InlineStack gap="200" wrap>
                <Button size="slim" onClick={() => onCopy(installation.scriptUrl, 'URL copied')}>
                  Copy URL
                </Button>
                <Button size="slim" variant="plain" onClick={onRunCheckoutDiagnostics}>
                  Check now
                </Button>
              </InlineStack>
            </BlockStack>
          )}
          {installation?.snippetHtml && (
            <BlockStack gap="150">
              <Text variant="headingSm" as="h3">
                Full {'<head>'} snippet
              </Text>
              <pre className={styles.checkoutDiagDebugBox}>
                <code>{installation.snippetHtml}</code>
              </pre>
              <Button size="slim" onClick={onCopySnippet}>
                Copy head snippet
              </Button>
            </BlockStack>
          )}
          {Array.isArray(installation?.instructions?.steps) &&
            installation.instructions.steps.length > 0 && (
              <BlockStack gap="150">
                <Text variant="headingSm" as="h3">
                  Install steps
                </Text>
                <ul className={styles.installSteps}>
                  {installation.instructions.steps.map((step, index) => (
                    <li key={`install-step-${index}`}>
                      <Text as="span" variant="bodySm">
                        {step}
                      </Text>
                    </li>
                  ))}
                </ul>
              </BlockStack>
            )}
          {installation?.instructions?.altMethod && (
            <BlockStack gap="150">
              <Text variant="headingSm" as="h3">
                Direct script fallback
              </Text>
              <div className={styles.installModalInfoCard}>
                <BlockStack gap="150">
                  <InlineStack gap="200" blockAlign="center" wrap>
                    <Badge tone="attention">{installation.instructions.altMethod}</Badge>
                    <Text as="span" variant="bodySm" tone="subdued">
                      Fallback only.
                    </Text>
                  </InlineStack>
                  {installation.instructions.altSnippet && (
                    <pre className={styles.checkoutDiagDebugBox}>
                      <code>{installation.instructions.altSnippet}</code>
                    </pre>
                  )}
                  {installation.instructions.altSnippet && (
                    <Button
                      size="slim"
                      onClick={() => onCopy(installation.instructions.altSnippet, 'Snippet copied')}
                    >
                      Copy alternative snippet
                    </Button>
                  )}
                </BlockStack>
              </div>
            </BlockStack>
          )}
          {installation?.instructions?.cartNative && (
            <BlockStack gap="150">
              <Text variant="headingSm" as="h3">
                {installation.instructions.cartNative.heading || 'Cart native discount rendering'}
              </Text>
              <div className={styles.installModalInfoCard}>
                <BlockStack gap="150">
                  <InlineStack gap="200" blockAlign="center" wrap>
                    <Badge
                      tone={
                        installation.instructions.cartNative.status === 'manual_required'
                          ? 'attention'
                          : 'success'
                      }
                    >
                      {installation.instructions.cartNative.status === 'manual_required'
                        ? 'Manual theme step required'
                        : 'Configured'}
                    </Badge>
                    {installation.instructions.cartNative.appBlockName && (
                      <Text as="span" variant="bodySm" tone="subdued">
                        App block: {installation.instructions.cartNative.appBlockName}
                      </Text>
                    )}
                  </InlineStack>
                  {installation.instructions.cartNative.summary && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      {installation.instructions.cartNative.summary}
                    </Text>
                  )}
                  {Array.isArray(installation.instructions.cartNative.steps) &&
                    installation.instructions.cartNative.steps.length > 0 && (
                      <ul className={styles.installSteps}>
                        {installation.instructions.cartNative.steps.map((step, index) => (
                          <li key={`cart-native-step-${index}`}>
                            <Text as="span" variant="bodySm">
                              {step}
                            </Text>
                          </li>
                        ))}
                      </ul>
                    )}
                  {installation.instructions.cartNative.lineSnippet && (
                    <BlockStack gap="100">
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        Cart line snippet
                      </Text>
                      <pre className={styles.checkoutDiagDebugBox}>
                        <code>{installation.instructions.cartNative.lineSnippet}</code>
                      </pre>
                      <Button
                        size="slim"
                        onClick={() =>
                          onCopy(
                            installation.instructions.cartNative.lineSnippet,
                            'Cart line snippet copied'
                          )
                        }
                      >
                        Copy cart line snippet
                      </Button>
                    </BlockStack>
                  )}
                  {installation.instructions.cartNative.summarySnippet && (
                    <BlockStack gap="100">
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        Cart summary snippet
                      </Text>
                      <pre className={styles.checkoutDiagDebugBox}>
                        <code>{installation.instructions.cartNative.summarySnippet}</code>
                      </pre>
                      <Button
                        size="slim"
                        onClick={() =>
                          onCopy(
                            installation.instructions.cartNative.summarySnippet,
                            'Cart summary snippet copied'
                          )
                        }
                      >
                        Copy cart summary snippet
                      </Button>
                    </BlockStack>
                  )}
                </BlockStack>
              </div>
            </BlockStack>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
