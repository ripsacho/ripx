/**
 * useTests - TanStack Query hook for tests data
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../services';

const TESTS_QUERY_KEY = ['tests'];

async function fetchTests() {
  const response = await apiGet('/tests');
  const data = response.data?.tests ?? response.data?.data?.tests;
  return Array.isArray(data) ? data : [];
}

export function useTests(options = {}) {
  return useQuery({
    queryKey: TESTS_QUERY_KEY,
    queryFn: fetchTests,
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
}

export function useTest(id, options = {}) {
  return useQuery({
    queryKey: ['tests', id],
    queryFn: async () => {
      const response = await apiGet(`/tests/${id}`);
      return response.data?.test || response.data?.data?.test;
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
    queryClient.invalidateQueries({ queryKey: TESTS_QUERY_KEY });
    if (testId) {
      queryClient.invalidateQueries({ queryKey: ['tests', testId] });
    }
  };
}

export function useStartTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (testId) => apiPost(`/tests/${testId}/start`, {}),
    onMutate: async (testId) => {
      await queryClient.cancelQueries({ queryKey: TESTS_QUERY_KEY });
      const prev = queryClient.getQueryData(TESTS_QUERY_KEY);
      queryClient.setQueryData(TESTS_QUERY_KEY, (old) =>
        Array.isArray(old)
          ? old.map((t) => (t.id === testId ? { ...t, status: 'running' } : t))
          : old
      );
      return { prev };
    },
    onError: (_err, _testId, { prev }) => {
      if (prev) queryClient.setQueryData(TESTS_QUERY_KEY, prev);
    },
    onSettled: (_data, _error, testId) => {
      queryClient.invalidateQueries({ queryKey: TESTS_QUERY_KEY });
      if (testId) queryClient.invalidateQueries({ queryKey: ['tests', testId] });
    },
  });
}

export function useStopTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (testId) => apiPost(`/tests/${testId}/stop`, {}),
    onMutate: async (testId) => {
      await queryClient.cancelQueries({ queryKey: TESTS_QUERY_KEY });
      const prev = queryClient.getQueryData(TESTS_QUERY_KEY);
      queryClient.setQueryData(TESTS_QUERY_KEY, (old) =>
        Array.isArray(old)
          ? old.map((t) => (t.id === testId ? { ...t, status: 'stopped' } : t))
          : old
      );
      return { prev };
    },
    onError: (_err, _testId, { prev }) => {
      if (prev) queryClient.setQueryData(TESTS_QUERY_KEY, prev);
    },
    onSettled: (_data, _error, testId) => {
      queryClient.invalidateQueries({ queryKey: TESTS_QUERY_KEY });
      if (testId) queryClient.invalidateQueries({ queryKey: ['tests', testId] });
    },
  });
}

export function usePersonalizeTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ testId, variantIndex }) =>
      apiPost(`/tests/${testId}/personalize`, variantIndex !== null && variantIndex !== undefined ? { variantIndex } : {}),
    onSuccess: (_data, { testId }) => {
      queryClient.invalidateQueries({ queryKey: ['tests', testId] });
      queryClient.invalidateQueries({ queryKey: TESTS_QUERY_KEY });
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
      queryClient.invalidateQueries({ queryKey: ['tests', testId] });
      queryClient.invalidateQueries({ queryKey: TESTS_QUERY_KEY });
    },
  });
}

export function useDisablePersonalization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (testId) => apiPost(`/tests/${testId}/personalization/disable`, {}),
    onSuccess: (_data, testId) => {
      queryClient.invalidateQueries({ queryKey: ['tests', testId] });
      queryClient.invalidateQueries({ queryKey: TESTS_QUERY_KEY });
    },
  });
}

export function useDeleteTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (testId) => apiDelete(`/tests/${testId}`),
    onSuccess: (_data, testId) => {
      queryClient.invalidateQueries({ queryKey: TESTS_QUERY_KEY });
      if (testId) queryClient.removeQueries({ queryKey: ['tests', testId] });
    },
  });
}
