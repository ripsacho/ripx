/**
 * useAnalytics - TanStack Query hook for analytics data
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, getShopDomain, unwrapData } from '../services';
import { buildAnalyticsQueryString } from './analyticsQueryString';
export { buildAnalyticsQueryString } from './analyticsQueryString';

export function useAnalytics(testId, segmentDevice = 'all', segmentCountry = 'all', options = {}) {
  return useQuery({
    queryKey: ['analytics', testId, segmentDevice, segmentCountry],
    queryFn: async () => {
      const queryString = buildAnalyticsQueryString(segmentDevice, segmentCountry);
      const url = `/analytics/tests/${testId}${queryString ? `?${queryString}` : ''}`;
      const response = await apiGet(url);
      return unwrapData(response)?.analytics ?? unwrapData(response);
    },
    enabled: !!testId && testId !== 'undefined',
    staleTime: 60 * 1000, // 1 minute
    ...options,
  });
}

export function useAnalyticsTimeSeries(
  testId,
  segmentDevice = 'all',
  segmentCountry = 'all',
  options = {}
) {
  return useQuery({
    queryKey: ['analytics', 'timeseries', testId, segmentDevice, segmentCountry],
    queryFn: async () => {
      const queryString = buildAnalyticsQueryString(segmentDevice, segmentCountry);
      const response = await apiGet(
        `/analytics/tests/${testId}/timeseries${queryString ? `?${queryString}` : ''}`
      ).catch(() => ({
        data: { timeSeries: [] },
      }));
      return unwrapData(response)?.timeSeries ?? [];
    },
    enabled: !!testId && testId !== 'undefined',
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useAnalyticsOverview(options = {}) {
  const shop = getShopDomain() || '_';
  return useQuery({
    queryKey: ['analytics', 'overview', shop],
    queryFn: async () => {
      const response = await apiGet('/analytics/overview');
      return unwrapData(response)?.overview ?? null;
    },
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
      const queryString = buildAnalyticsQueryString(segmentDevice, segmentCountry);
      const analyticsUrl = `/analytics/tests/${testId}${queryString ? `?${queryString}` : ''}`;
      const timeSeriesUrl = `/analytics/tests/${testId}/timeseries${queryString ? `?${queryString}` : ''}`;

      const [
        analyticsRes,
        timeSeriesRes,
        testRes,
        segmentsRes,
        decisionRes,
        deviceBreakdownRes,
        countryBreakdownRes,
        cohortsRes,
      ] = await Promise.all([
        apiGet(analyticsUrl),
        apiGet(timeSeriesUrl).catch(() => ({ data: { timeSeries: [] } })),
        apiGet(`/tests/${testId}`),
        apiGet(`/analytics/tests/${testId}/segments`).catch(() => ({
          data: { segments: { devices: [], countries: [] } },
        })),
        apiGet(`/analytics/tests/${testId}/decision${queryString ? `?${queryString}` : ''}`).catch(
          () => ({ data: { decision: null } })
        ),
        apiGet(`/analytics/tests/${testId}/breakdown?dimension=device`).catch(() => ({
          data: { rows: [] },
        })),
        apiGet(`/analytics/tests/${testId}/breakdown?dimension=country`).catch(() => ({
          data: { rows: [] },
        })),
        apiGet(`/analytics/tests/${testId}/cohorts${queryString ? `?${queryString}` : ''}`).catch(
          () => ({
            data: { cohorts: [] },
          })
        ),
      ]);

      return {
        analytics: unwrapData(analyticsRes)?.analytics ?? unwrapData(analyticsRes),
        timeSeries: unwrapData(timeSeriesRes)?.timeSeries ?? [],
        timeSeriesAnnotations: unwrapData(timeSeriesRes)?.annotations ?? [],
        testInfo: unwrapData(testRes)?.test ?? unwrapData(testRes) ?? null,
        segments: unwrapData(segmentsRes)?.segments ?? { devices: [], countries: [] },
        decision: unwrapData(decisionRes)?.decision ?? null,
        segmentBreakdowns: {
          device: unwrapData(deviceBreakdownRes)?.rows ?? [],
          country: unwrapData(countryBreakdownRes)?.rows ?? [],
        },
        cohorts: unwrapData(cohortsRes)?.cohorts ?? [],
      };
    },
    enabled: !!testId && testId !== 'undefined',
    staleTime: 60 * 1000,
    ...options,
  });
}

export function useInvalidateAnalytics(testId) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({
      queryKey: testId ? ['analytics', testId] : ['analytics'],
    });
    queryClient.invalidateQueries({
      queryKey: testId ? ['analytics-dashboard', testId] : ['analytics-dashboard'],
    });
    queryClient.invalidateQueries({
      queryKey: ['analytics', 'overview'],
    });
  };
}
