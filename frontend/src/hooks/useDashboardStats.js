/**
 * useDashboardStats - Fetches aggregated dashboard stats from dedicated API
 *
 * Uses GET /api/dashboard/stats which runs direct DB aggregation.
 * More reliable than computing from tests list (avoids enrichment/variant matching issues).
 */

import { useQuery } from '@tanstack/react-query';
import { apiGet, unwrapData } from '../services';

const DASHBOARD_STATS_KEY = ['dashboard', 'stats'];

async function fetchDashboardStats() {
  const response = await apiGet('/dashboard/stats');
  const data = unwrapData(response);
  // Ensure numbers (API/PostgreSQL may return strings); required for useAnimatedCounter
  return {
    totalTests: Number(data?.totalTests) || 0,
    activeTests: Number(data?.activeTests) || 0,
    totalVisitors: Number(data?.totalVisitors) || 0,
    totalConversions: Number(data?.totalConversions) || 0,
    totalRevenue: Number(data?.totalRevenue) || 0,
    avgConversionRate: Number(data?.avgConversionRate) || 0,
  };
}

export function useDashboardStats(options = {}) {
  return useQuery({
    queryKey: DASHBOARD_STATS_KEY,
    queryFn: fetchDashboardStats,
    staleTime: 30 * 1000,
    ...options,
  });
}
