/**
 * useAnalytics - TanStack Query hook for analytics data
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, unwrapData } from '../services';

export function useAnalytics(testId, segmentDevice = 'all', segmentCountry = 'all', options = {}) {
  return useQuery({
    queryKey: ['analytics', testId, segmentDevice, segmentCountry],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (segmentDevice && segmentDevice !== 'all') params.set('device', segmentDevice);
      if (segmentCountry && segmentCountry !== 'all') params.set('country', segmentCountry);
      const queryString = params.toString();
      const url = `/analytics/tests/${testId}${queryString ? `?${queryString}` : ''}`;
      const response = await apiGet(url);
      return unwrapData(response)?.analytics ?? unwrapData(response);
    },
    enabled: !!testId && testId !== 'undefined',
    staleTime: 60 * 1000, // 1 minute
    ...options,
  });
}

export function useAnalyticsTimeSeries(testId, options = {}) {
  return useQuery({
    queryKey: ['analytics', 'timeseries', testId],
    queryFn: async () => {
      const response = await apiGet(`/analytics/tests/${testId}/timeseries`).catch(() => ({
        data: { timeSeries: [] },
      }));
      return unwrapData(response)?.timeSeries ?? [];
    },
    enabled: !!testId && testId !== 'undefined',
    staleTime: 60 * 1000,
    ...options,
  });
}

/**
 * Fetches all analytics dashboard data in parallel (analytics, timeseries, test, segments)
 */
export function useAnalyticsDashboard(
  testId,
  segmentDevice = 'all',
  segmentCountry = 'all',
  options = {}
) {
  return useQuery({
    queryKey: ['analytics-dashboard', testId, segmentDevice, segmentCountry],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (segmentDevice && segmentDevice !== 'all') params.set('device', segmentDevice);
      if (segmentCountry && segmentCountry !== 'all') params.set('country', segmentCountry);
      const queryString = params.toString();
      const analyticsUrl = `/analytics/tests/${testId}${queryString ? `?${queryString}` : ''}`;

      const [analyticsRes, timeSeriesRes, testRes, segmentsRes, decisionRes] = await Promise.all([
        apiGet(analyticsUrl),
        apiGet(`/analytics/tests/${testId}/timeseries`).catch(() => ({ data: { timeSeries: [] } })),
        apiGet(`/tests/${testId}`),
        apiGet(`/analytics/tests/${testId}/segments`).catch(() => ({
          data: { segments: { devices: [], countries: [] } },
        })),
        apiGet(`/analytics/tests/${testId}/decision${queryString ? `?${queryString}` : ''}`).catch(
          () => ({ data: { decision: null } })
        ),
      ]);

      return {
        analytics: unwrapData(analyticsRes)?.analytics ?? unwrapData(analyticsRes),
        timeSeries: unwrapData(timeSeriesRes)?.timeSeries ?? [],
        testInfo: unwrapData(testRes)?.test ?? unwrapData(testRes) ?? null,
        segments: unwrapData(segmentsRes)?.segments ?? { devices: [], countries: [] },
        decision: unwrapData(decisionRes)?.decision ?? null,
      };
    },
    enabled: !!testId && testId !== 'undefined',
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useInvalidateAnalytics(testId) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: testId ? ['analytics', testId] : ['analytics'],
    });
}
