/**
 * AdminLegal
 *
 * Edit Terms of Service and Privacy Policy URLs (shown in app/Connect footer).
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, FormLayout, TextField, Button, Text, BlockStack } from '@shopify/polaris';
import { apiGet, apiPut } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

export default function AdminLegal() {
  const queryClient = useQueryClient();
  const [termsUrl, setTermsUrl] = useState('');
  const [privacyUrl, setPrivacyUrl] = useState('');
  const [toast, setToast] = useState({ message: null, type: 'success' });
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'config', 'legal'],
    queryFn: async () => {
      const res = await apiGet('/admin/config/legal');
      return res.data?.data ?? res.data;
    },
  });
  React.useEffect(() => {
    if (data) {
      setTermsUrl(data.termsUrl ?? '');
      setPrivacyUrl(data.privacyUrl ?? '');
    }
  }, [data]);
  const putMutation = useMutation({
    mutationFn: body => apiPut('/admin/config/legal', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'config', 'legal'] });
      setToast({ message: 'Saved', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Save failed',
        type: 'error',
      });
    },
  });
  const handleSave = () => {
    putMutation.mutate({
      terms_url: termsUrl.trim() || null,
      privacy_url: privacyUrl.trim() || null,
    });
  };
  return (
    <PageShell className={`${styles.adminPage} ${styles.adminPageWithHero}`}>
      <AdminPageLayout>
        <Card>
          <BlockStack gap="400">
            {isLoading ? (
              <Text as="p" tone="subdued">
                Loading…
              </Text>
            ) : (
              <>
                <FormLayout>
                  <TextField
                    label="Terms of Service URL"
                    value={termsUrl}
                    onChange={setTermsUrl}
                    placeholder="https://example.com/terms"
                    autoComplete="off"
                  />
                  <TextField
                    label="Privacy Policy URL"
                    value={privacyUrl}
                    onChange={setPrivacyUrl}
                    placeholder="https://example.com/privacy"
                    autoComplete="off"
                  />
                </FormLayout>
                <Button variant="primary" onClick={handleSave} loading={putMutation.isPending}>
                  Save
                </Button>
              </>
            )}
          </BlockStack>
        </Card>
      </AdminPageLayout>
      {toast.message && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: null, type: 'success' })}
          duration={toast.type === 'error' ? 5000 : 3000}
        />
      )}
    </PageShell>
  );
}
