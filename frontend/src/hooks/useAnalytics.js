/**
 * useAnalytics - TanStack Query hook for analytics data
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '../services';

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
      return response.data?.analytics || response.data?.data?.analytics;
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
      return response.data?.timeSeries || response.data?.data?.timeSeries || [];
    },
    enabled: !!testId && testId !== 'undefined',
    staleTime: 60 * 1000,
    ...options,
  });
}

/**
 * Fetches all analytics dashboard data in parallel (analytics, timeseries, test, segments)
 */
export function useAnalyticsDashboard(testId, segmentDevice = 'all', segmentCountry = 'all', options = {}) {
  return useQuery({
    queryKey: ['analytics-dashboard', testId, segmentDevice, segmentCountry],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (segmentDevice && segmentDevice !== 'all') params.set('device', segmentDevice);
      if (segmentCountry && segmentCountry !== 'all') params.set('country', segmentCountry);
      const queryString = params.toString();
      const analyticsUrl = `/analytics/tests/${testId}${queryString ? `?${queryString}` : ''}`;

      const [analyticsRes, timeSeriesRes, testRes, segmentsRes] = await Promise.all([
        apiGet(analyticsUrl),
        apiGet(`/analytics/tests/${testId}/timeseries`).catch(() => ({ data: { timeSeries: [] } })),
        apiGet(`/tests/${testId}`),
        apiGet(`/analytics/tests/${testId}/segments`).catch(() => ({
          data: { segments: { devices: [], countries: [] } },
        })),
      ]);

      return {
        analytics: analyticsRes.data?.analytics || analyticsRes.data?.data?.analytics,
        timeSeries: timeSeriesRes.data?.timeSeries || timeSeriesRes.data?.data?.timeSeries || [],
        testInfo: testRes.data?.test || testRes.data?.data?.test || null,
        segments: segmentsRes.data?.segments || { devices: [], countries: [] },
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
