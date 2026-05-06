export function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDateRangeParams(value, now = new Date()) {
  if (!value || value === 'all') return {};
  const days = parseInt(value, 10);
  if (isNaN(days)) return {};
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  const endNext = new Date(end);
  endNext.setDate(endNext.getDate() + 1);
  return {
    start_date: formatLocalDate(start),
    end_date: formatLocalDate(endNext),
  };
}

export function getApiErrorMessage(error) {
  const payload = error?.response?.data || error?.data;
  const message =
    payload?.error ||
    payload?.message ||
    error?.message ||
    'Funnel data could not be loaded. Try again or check event tracking.';
  const status = error?.response?.status || error?.status;
  return status ? `${message} (HTTP ${status})` : message;
}

export function normalizeFunnelVariantParam(searchParams) {
  return searchParams?.get('funnel_variant') || '';
}
