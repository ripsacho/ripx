/**
 * AdminAnnouncementBanner
 *
 * Set or clear the app-wide announcement banner (dismissible in app layout).
 * Phase 4. Uses GET/PUT /api/admin/announcement-banner (key_value_store: config.announcement_banner).
 */

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, BlockStack, Text, TextField, Button } from '@shopify/polaris';
import { apiGet, apiPut } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

export default function AdminAnnouncementBanner() {
  const queryClient = useQueryClient();
  const [value, setValue] = React.useState('');
  const [toast, setToast] = React.useState({ message: null, type: 'success' });

  const { data } = useQuery({
    queryKey: ['admin', 'announcement-banner'],
    queryFn: async () => {
      const res = await apiGet('/admin/announcement-banner');
      return res.data?.data ?? res.data;
    },
  });

  React.useEffect(() => {
    if (data && typeof data.value === 'string') {
      setValue(data.value);
    }
  }, [data]);

  const putMutation = useMutation({
    mutationFn: async v => {
      await apiPut('/admin/announcement-banner', { value: v });
    },
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'announcement-banner'] });
      setToast({
        message:
          v && String(v).trim()
            ? 'Announcement banner updated. Users will see it until dismissed.'
            : 'Announcement banner cleared.',
        type: 'success',
      });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Failed to save',
        type: 'error',
      });
    },
  });

  const handleSave = () => {
    putMutation.mutate(value.trim());
  };

  const hasValue = (data?.value ?? value).toString().trim() !== '';

  return (
    <PageShell className={`${styles.adminPage} ${styles.adminPageWithHero}`}>
      <AdminPageLayout>
        <BlockStack gap="400">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">
                Banner text
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Shown at the top of the app for all users until they dismiss it. Leave empty to
                clear.
              </Text>
              <TextField
                label="Message"
                value={value}
                onChange={setValue}
                placeholder="e.g. Scheduled maintenance on Saturday 2–4 PM UTC"
                autoComplete="off"
                multiline={3}
              />
              <Button variant="primary" onClick={handleSave} loading={putMutation.isPending}>
                Save
              </Button>
              {hasValue && (
                <Text as="p" variant="bodySm" tone="subdued">
                  Current banner is visible in the app. Clear the field and save to remove it.
                </Text>
              )}
            </BlockStack>
          </Card>
        </BlockStack>
      </AdminPageLayout>
      {toast.message && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: null, type: 'success' })}
        />
      )}
    </PageShell>
  );
}
