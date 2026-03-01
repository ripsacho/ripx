/**
 * AdminMaintenance
 *
 * Toggle maintenance mode (off / global / per-domain) and optional message.
 * Phase 3. Uses GET/PUT /api/admin/maintenance (key_value_store: config.maintenance_mode, config.maintenance_message).
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, BlockStack, Text, Select, TextField, Button, Banner } from '@shopify/polaris';
import { apiGet, apiPut } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

const MODE_OFF = '';
const MODE_GLOBAL = 'global';

export default function AdminMaintenance() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState(MODE_OFF);
  const [domain, setDomain] = useState('');
  const [message, setMessage] = useState('');
  const [toast, setToast] = useState({ message: null, type: 'success' });

  const { data } = useQuery({
    queryKey: ['admin', 'maintenance'],
    queryFn: async () => {
      const res = await apiGet('/admin/maintenance');
      return res.data?.data ?? res.data;
    },
  });

  useEffect(() => {
    if (!data) return;
    const v = data.value ?? '';
    const msg = data.message ?? '';
    setMessage(msg);
    if (v === '' || v === 'global') {
      setMode(v || MODE_OFF);
      setDomain('');
    } else {
      setMode('domain');
      setDomain(v);
    }
  }, [data]);

  const putMutation = useMutation({
    mutationFn: async ({ value, message: msg }) => {
      await apiPut('/admin/maintenance', { value, message: msg });
    },
    onSuccess: (_, { value }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'maintenance'] });
      setToast({
        message: value
          ? 'Maintenance mode updated. Track/script may return 503.'
          : 'Maintenance mode turned off.',
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
    const value = mode === 'domain' ? domain.trim().toLowerCase() : mode;
    if (mode === 'domain' && !value) {
      setToast({ message: 'Enter a domain when using per-domain maintenance', type: 'error' });
      return;
    }
    putMutation.mutate({ value, message: message.trim() });
  };

  const currentValue = data?.value ?? '';
  const isActive = !!currentValue;

  return (
    <PageShell className={`${styles.adminPage} ${styles.adminPageWithHero}`}>
      <AdminPageLayout>
        <BlockStack gap="400">
          {isActive && (
            <Banner tone="warning" title="Maintenance is on">
              Track and script endpoints return 503 for affected traffic. The app shows a
              maintenance banner when health returns maintenance. Turn off or set to a specific
              domain when done.
            </Banner>
          )}
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">
                Status
              </Text>
              <Select
                label="Mode"
                options={[
                  { label: 'Off', value: MODE_OFF },
                  { label: 'Global (all domains)', value: MODE_GLOBAL },
                  { label: 'Per-domain', value: 'domain' },
                ]}
                value={mode}
                onChange={setMode}
              />
              {mode === 'domain' && (
                <TextField
                  label="Domain"
                  value={domain}
                  onChange={setDomain}
                  placeholder="e.g. shop.myshopify.com"
                  autoComplete="off"
                  helpText="Only this domain will see maintenance (track/script 503)."
                />
              )}
              <TextField
                label="Message (optional)"
                value={message}
                onChange={setMessage}
                placeholder="e.g. Back in 30 minutes"
                autoComplete="off"
                helpText="Shown in the app maintenance banner when set. If empty, mode (global or domain) is shown."
              />
              <Button variant="primary" onClick={handleSave} loading={putMutation.isPending}>
                Save
              </Button>
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
