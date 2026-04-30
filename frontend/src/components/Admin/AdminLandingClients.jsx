import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, BlockStack, Button, Card, InlineStack, Text, TextField } from '@shopify/polaris';
import { apiGet, apiPut } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

const EMPTY_CLIENT = { name: '', icon: '', industry: '', quote: '' };

function normalizeClient(client) {
  return {
    name: String(client?.name || '').trim(),
    icon: String(client?.icon || '').trim(),
    industry: String(client?.industry || '').trim(),
    quote: String(client?.quote || '').trim(),
  };
}

export default function AdminLandingClients() {
  const queryClient = useQueryClient();
  const [clients, setClients] = React.useState([]);
  const [toast, setToast] = React.useState({ message: null, type: 'success' });

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'landing-clients'],
    queryFn: async () => {
      const res = await apiGet('/admin/landing-clients');
      return res.data?.data ?? res.data;
    },
  });

  React.useEffect(() => {
    if (!data) return;
    const configured = Array.isArray(data.clients) ? data.clients : [];
    const fallback = Array.isArray(data.fallback) ? data.fallback : [];
    setClients(
      configured.length > 0 ? configured.map(normalizeClient) : fallback.map(normalizeClient)
    );
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async nextClients => {
      const payload = nextClients.map(normalizeClient).filter(client => client.name);
      await apiPut('/admin/landing-clients', { clients: payload });
      return payload;
    },
    onSuccess: saved => {
      setClients(saved.length > 0 ? saved : [{ ...EMPTY_CLIENT }]);
      queryClient.invalidateQueries({ queryKey: ['admin', 'landing-clients'] });
      setToast({ message: 'Landing clients saved', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Could not save landing clients',
        type: 'error',
      });
    },
  });

  const updateClient = (index, patch) => {
    setClients(prev => prev.map((client, i) => (i === index ? { ...client, ...patch } : client)));
  };

  const addClient = () => setClients(prev => [...prev, { ...EMPTY_CLIENT }]);
  const removeClient = index => setClients(prev => prev.filter((_, i) => i !== index));

  return (
    <PageShell className={`${styles.adminPage} ${styles.adminPageWithHero}`}>
      <AdminPageLayout>
        <BlockStack gap="400">
          <Banner tone="info">
            These entries power the continuous client slider on the public selling page. If no
            entries are saved, RipX shows polished demo clients.
          </Banner>

          <Card>
            <BlockStack gap="400">
              <section className={styles.adminMainSection} aria-label="Landing page clients">
                <Text as="h1" variant="headingLg">
                  Landing clients
                </Text>
                <Text
                  as="p"
                  variant="bodySm"
                  tone="subdued"
                  className={styles.adminPageDescription}
                >
                  Add client names, initials/icons, industry labels, and short quotes for the public
                  homepage slider.
                </Text>
              </section>

              {isLoading ? (
                <Text as="p" tone="subdued">
                  Loading…
                </Text>
              ) : (
                <BlockStack gap="300">
                  {(clients.length > 0 ? clients : [{ ...EMPTY_CLIENT }]).map((client, index) => (
                    <Card key={`client-${index}`}>
                      <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="h2" variant="headingMd">
                            Client {index + 1}
                          </Text>
                          <Button
                            size="slim"
                            tone="critical"
                            variant="plain"
                            onClick={() => removeClient(index)}
                            disabled={clients.length <= 1}
                          >
                            Remove
                          </Button>
                        </InlineStack>
                        <InlineStack gap="300" wrap>
                          <TextField
                            label="Name"
                            value={client.name}
                            onChange={value => updateClient(index, { name: value })}
                            autoComplete="off"
                            placeholder="Northstar Goods"
                          />
                          <TextField
                            label="Icon / initials"
                            value={client.icon}
                            onChange={value => updateClient(index, { icon: value })}
                            autoComplete="off"
                            placeholder="NG"
                          />
                          <TextField
                            label="Industry"
                            value={client.industry}
                            onChange={value => updateClient(index, { industry: value })}
                            autoComplete="off"
                            placeholder="Shopify Plus"
                          />
                        </InlineStack>
                        <TextField
                          label="Short quote"
                          value={client.quote}
                          onChange={value => updateClient(index, { quote: value })}
                          autoComplete="off"
                          placeholder="Pricing and checkout tests in one launch checklist."
                        />
                      </BlockStack>
                    </Card>
                  ))}
                  <InlineStack gap="200" wrap>
                    <Button onClick={addClient}>Add client</Button>
                    <Button
                      variant="primary"
                      loading={saveMutation.isPending}
                      onClick={() => saveMutation.mutate(clients)}
                    >
                      Save client slider
                    </Button>
                  </InlineStack>
                </BlockStack>
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
