import { Modal, BlockStack, Text, FormLayout, TextField, ChoiceList } from '@shopify/polaris';
import { DEFAULT_SETTINGS, WEBHOOK_EVENT_CHOICES } from '../config/settingsConstants';

export function WebhooksSettingsModal({
  open,
  onClose,
  settings,
  onSettingsChange,
  webhookError,
  onWebhookErrorChange,
  onSave,
  saving,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Webhook delivery"
      primaryAction={{
        content: 'Save webhook settings',
        onAction: async () => {
          const saved = await onSave();
          if (saved) {
            onClose();
          }
        },
        loading: saving,
      }}
      secondaryActions={[
        {
          content: 'Close',
          onAction: onClose,
          disabled: saving,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Text as="p" variant="bodySm" tone="subdued">
            Send JSON to your endpoint only when another system needs RipX test lifecycle events.
          </Text>
          <FormLayout>
            <TextField
              label="Webhook URL"
              value={settings.outboundWebhookUrl}
              onChange={value => {
                onSettingsChange({ ...settings, outboundWebhookUrl: value });
                onWebhookErrorChange(null);
              }}
              helpText="Leave empty to disable. Must be a valid URL when set."
              placeholder="https://your-server.com/webhook"
              autoComplete="off"
              error={webhookError}
            />
            <ChoiceList
              title="Send webhook when"
              choices={WEBHOOK_EVENT_CHOICES}
              selected={settings.outboundWebhookEvents}
              onChange={selected =>
                onSettingsChange({
                  ...settings,
                  outboundWebhookEvents: selected.length
                    ? selected
                    : DEFAULT_SETTINGS.outboundWebhookEvents,
                })
              }
              allowMultiple
            />
          </FormLayout>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
