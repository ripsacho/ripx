import { apiPost } from './api';

export async function sendSupportAgentMessage(payload) {
  const store = payload?.store ? String(payload.store).trim().toLowerCase() : '';
  const response = await apiPost('/support/agent', payload || {}, {
    ...(store
      ? {
          params: { shop: store },
          headers: {
            'X-RipX-Store': store,
            'X-Shopify-Shop-Domain': store,
          },
        }
      : {}),
  });
  return response?.data || response;
}

export async function confirmSupportAgentAction(payload) {
  const store = payload?.store ? String(payload.store).trim().toLowerCase() : '';
  const response = await apiPost('/support/agent/actions/confirm', payload || {}, {
    ...(store
      ? {
          params: { shop: store },
          headers: {
            'X-RipX-Store': store,
            'X-Shopify-Shop-Domain': store,
          },
        }
      : {}),
  });
  return response?.data || response;
}
