/**
 * AdminConsentScript
 *
 * View and set consent_required and script_version (global or per-domain) in KV.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  FormLayout,
  TextField,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Checkbox,
  Banner,
} from '@shopify/polaris';
import { apiGet, apiPut } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

export default function AdminConsentScript() {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState('global');
  const [consentRequired, setConsentRequired] = useState(false);
  const [scriptVersion, setScriptVersion] = useState('');
  const [toast, setToast] = useState({ message: null, type: 'success' });
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'consent-script'],
    queryFn: async () => {
      const res = await apiGet('/admin/consent-script');
      return res.data?.data ?? res.data;
    },
  });
  const putMutation = useMutation({
    mutationFn: body => apiPut('/admin/consent-script', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'consent-script'] });
      setToast({ message: 'Saved', type: 'success' });
      refetch();
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Save failed',
        type: 'error',
      });
    },
  });
  const config = data?.config ?? {};
  const globalConfig = config.global ?? { consentRequired: null, scriptVersion: null };
  const scopes = ['global', ...Object.keys(config).filter(k => k !== 'global')];
  const currentConfig =
    scope === 'global'
      ? globalConfig
      : (config[scope] ?? { consentRequired: null, scriptVersion: null });

  const handleSave = () => {
    const body = {
      consent_required: consentRequired,
      script_version: scriptVersion.trim() || undefined,
    };
    if (scope !== 'global') body.shop_domain = scope;
    putMutation.mutate(body);
  };

  const handleSelectScope = key => {
    setScope(key);
    const c = key === 'global' ? globalConfig : (config[key] ?? {});
    setConsentRequired(c.consentRequired === 'true' || c.consentRequired === true);
    setScriptVersion(c.scriptVersion ?? '');
  };

  React.useEffect(() => {
    if (data && !isLoading) {
      setConsentRequired(
        currentConfig.consentRequired === 'true' || currentConfig.consentRequired === true
      );
      setScriptVersion(currentConfig.scriptVersion ?? '');
    }
  }, [data, isLoading, scope, currentConfig.consentRequired, currentConfig.scriptVersion]);

  return (
    <PageShell className={`${styles.adminPage} ${styles.adminPageWithHero}`}>
      <AdminPageLayout>
        <BlockStack gap="400">
          <Banner tone="info">
            Keys: consent_script.consent_required, consent_script.script_version (global);
            consent_script.&lt;domain&gt;.* for overrides.
          </Banner>
          <Card>
            <BlockStack gap="400">
              {isLoading ? (
                <Text as="p" tone="subdued">
                  Loading…
                </Text>
              ) : (
                <>
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField
                        label="Scope"
                        value={scope}
                        onChange={v => setScope(v.trim() === '' ? 'global' : v.trim())}
                        placeholder="global or domain (e.g. shop.myshopify.com)"
                        autoComplete="off"
                      />
                    </FormLayout.Group>
                    <Checkbox
                      label="Consent required"
                      checked={consentRequired}
                      onChange={setConsentRequired}
                    />
                    <TextField
                      label="Script version"
                      value={scriptVersion}
                      onChange={setScriptVersion}
                      placeholder="e.g. 1.0"
                      autoComplete="off"
                    />
                  </FormLayout>
                  <InlineStack gap="300">
                    <Button variant="primary" onClick={handleSave} loading={putMutation.isPending}>
                      Save
                    </Button>
                    <Button onClick={() => handleSelectScope('global')}>Load global</Button>
                  </InlineStack>
                  {scopes.length > 1 && (
                    <BlockStack gap="200">
                      <Text as="p" fontWeight="semibold">
                        Saved scopes
                      </Text>
                      <InlineStack gap="200" wrap>
                        {scopes.map(s => (
                          <Button key={s} size="slim" onClick={() => handleSelectScope(s)}>
                            {s}
                          </Button>
                        ))}
                      </InlineStack>
                    </BlockStack>
                  )}
                </>
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
          duration={toast.type === 'error' ? 5000 : 3000}
        />
      )}
    </PageShell>
  );
}
