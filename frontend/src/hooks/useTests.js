/**
 * useTests - TanStack Query hook for tests data
 *
 * Query keys include the current shop/domain so switching stores does not show
 * another domain's cached list or detail.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete, unwrapData, getShopDomain } from '../services';

const TESTS_ROOT = 'tests';

function scopeShop(shopDomain) {
  const s =
    shopDomain !== undefined && shopDomain !== null && shopDomain !== ''
      ? String(shopDomain).trim()
      : getShopDomain();
  return s || '_';
}

/** @param {string} [shopDomain] — omit to use getShopDomain() */
export function testsListQueryKey(shopDomain) {
  return [TESTS_ROOT, scopeShop(shopDomain), 'list'];
}

/** @param {string} [shopDomain] — omit to use getShopDomain() */
export function testDetailQueryKey(shopDomain, id) {
  return [TESTS_ROOT, scopeShop(shopDomain), id];
}

async function fetchTests() {
  const response = await apiGet('/tests');
  const raw = unwrapData(response);
  const data = raw?.tests ?? raw;
  return Array.isArray(data) ? data : [];
}

export function useTests(options = {}) {
  const shop = getShopDomain();
  return useQuery({
    queryKey: testsListQueryKey(shop),
    queryFn: fetchTests,
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
}

export function useTest(id, options = {}) {
  const shop = getShopDomain();
  return useQuery({
    queryKey: testDetailQueryKey(shop, id),
    queryFn: async () => {
      const response = await apiGet(`/tests/${id}`);
      const data = unwrapData(response);
      return data?.test ?? data;
    },
    enabled: !!id && id !== 'undefined',
    staleTime: 10 * 1000, // 10s - balance freshness vs requests; variants must stay in sync
    refetchOnMount: 'always',
    refetchOnWindowFocus: true, // Refetch when returning to tab (e.g. edits in another tab)
    ...options,
  });
}

/**
 * Invalidate tests cache. When testId is provided, also invalidates the single test query
 * so the detail view refetches with fresh data (critical for variant count and config).
 */
export function useInvalidateTests() {
  const queryClient = useQueryClient();
  return (testId = null) => {
    const shop = getShopDomain();
    queryClient.invalidateQueries({ queryKey: testsListQueryKey(shop) });
    if (testId) {
      queryClient.invalidateQueries({ queryKey: testDetailQueryKey(shop, testId) });
    }
  };
}

export function useStartTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: input => {
      if (typeof input === 'string') {
        return apiPost(`/tests/${input}/start`, {});
      }
      const testId = input?.testId;
      const payload = input?.payload && typeof input.payload === 'object' ? input.payload : {};
      return apiPost(`/tests/${testId}/start`, payload);
    },
    onMutate: async input => {
      const testId = typeof input === 'string' ? input : input?.testId;
      const listKey = testsListQueryKey();
      await queryClient.cancelQueries({ queryKey: listKey });
      const prev = queryClient.getQueryData(listKey);
      queryClient.setQueryData(listKey, old =>
        Array.isArray(old) ? old.map(t => (t.id === testId ? { ...t, status: 'running' } : t)) : old
      );
      return { prev, listKey };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev && ctx?.listKey) queryClient.setQueryData(ctx.listKey, ctx.prev);
    },
    onSettled: (_data, _error, input) => {
      const testId = typeof input === 'string' ? input : input?.testId;
      const shop = getShopDomain();
      queryClient.invalidateQueries({ queryKey: testsListQueryKey(shop) });
      if (testId) queryClient.invalidateQueries({ queryKey: testDetailQueryKey(shop, testId) });
    },
  });
}

export function useStopTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: testId => apiPost(`/tests/${testId}/stop`, {}),
    onMutate: async testId => {
      const listKey = testsListQueryKey();
      await queryClient.cancelQueries({ queryKey: listKey });
      const prev = queryClient.getQueryData(listKey);
      queryClient.setQueryData(listKey, old =>
        Array.isArray(old) ? old.map(t => (t.id === testId ? { ...t, status: 'stopped' } : t)) : old
      );
      return { prev, listKey };
    },
    onError: (_err, _testId, ctx) => {
      if (ctx?.prev && ctx?.listKey) queryClient.setQueryData(ctx.listKey, ctx.prev);
    },
    onSettled: (_data, _error, testId) => {
      const shop = getShopDomain();
      queryClient.invalidateQueries({ queryKey: testsListQueryKey(shop) });
      if (testId) queryClient.invalidateQueries({ queryKey: testDetailQueryKey(shop, testId) });
    },
  });
}

export function usePersonalizeTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ testId, variantIndex }) =>
      apiPost(
        `/tests/${testId}/personalize`,
        variantIndex !== null && variantIndex !== undefined ? { variantIndex } : {}
      ),
    onSuccess: (_data, { testId }) => {
      const shop = getShopDomain();
      queryClient.invalidateQueries({ queryKey: testDetailQueryKey(shop, testId) });
      queryClient.invalidateQueries({ queryKey: testsListQueryKey(shop) });
    },
  });
}

export function useRolloutTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ testId, initialPercent, schedule }) =>
      apiPost(`/tests/${testId}/rollout`, {
        ...(initialPercent !== null && initialPercent !== undefined && { initialPercent }),
        ...(schedule && { schedule }),
      }),
    onSuccess: (_data, { testId }) => {
      const shop = getShopDomain();
      queryClient.invalidateQueries({ queryKey: testDetailQueryKey(shop, testId) });
      queryClient.invalidateQueries({ queryKey: testsListQueryKey(shop) });
    },
  });
}

export function usePublishWinnerPricesToShopify() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ testId, variantIndex, dryRun }) =>
      apiPost(`/tests/${testId}/personalize/publish-shopify-prices`, {
        ...(variantIndex !== null && variantIndex !== undefined && { variantIndex }),
        ...(dryRun ? { dry_run: true } : {}),
      }),
    onSuccess: (_data, { testId, dryRun }) => {
      if (dryRun) {
        return;
      }
      const shop = getShopDomain();
      queryClient.invalidateQueries({ queryKey: testDetailQueryKey(shop, testId) });
      queryClient.invalidateQueries({ queryKey: testsListQueryKey(shop) });
    },
  });
}

export function useDisablePersonalization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: testId => apiPost(`/tests/${testId}/personalization/disable`, {}),
    onSuccess: (_data, testId) => {
      const shop = getShopDomain();
      queryClient.invalidateQueries({ queryKey: testDetailQueryKey(shop, testId) });
      queryClient.invalidateQueries({ queryKey: testsListQueryKey(shop) });
    },
  });
}

export function useDeleteTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: testId => apiDelete(`/tests/${testId}`),
    onSuccess: (_data, testId) => {
      const shop = getShopDomain();
      queryClient.invalidateQueries({ queryKey: testsListQueryKey(shop) });
      if (testId) queryClient.removeQueries({ queryKey: testDetailQueryKey(shop, testId) });
    },
  });
}
