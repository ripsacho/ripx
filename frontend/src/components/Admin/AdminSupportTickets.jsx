/**
 * AdminSupportTickets
 *
 * List support tickets for admin triage; sortable columns; filter by status;
 * update status; routing/escalation actions; bulk close/resolve.
 */

import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  DataTable,
  Button,
  Text,
  Badge,
  BlockStack,
  Select,
  EmptyState,
  Checkbox,
  InlineStack,
  Modal,
  TextField,
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

const STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Open', value: 'open' },
  { label: 'Closed', value: 'closed' },
  { label: 'Resolved', value: 'resolved' },
];

const BULK_ACTIONS = [
  { label: 'Close selected', value: 'close' },
  { label: 'Resolve selected', value: 'resolve' },
];
const ANALYTICS_WINDOW_OPTIONS = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
];
const PRIORITY_TONE = {
  low: 'info',
  normal: 'info',
  high: 'attention',
  urgent: 'critical',
};
const SUPPORT_STATUS_OPTIONS = [
  { label: 'Operational', value: 'operational' },
  { label: 'Degraded', value: 'degraded' },
  { label: 'Maintenance', value: 'maintenance' },
  { label: 'Outage', value: 'outage' },
];
const CHANGELOG_LEVEL_OPTIONS = [
  { label: 'Release', value: 'release' },
  { label: 'Improvement', value: 'improvement' },
  { label: 'Fix', value: 'fix' },
  { label: 'Incident', value: 'incident' },
  { label: 'Maintenance', value: 'maintenance' },
  { label: 'Info', value: 'info' },
];
const CHANGELOG_VISIBILITY_OPTIONS = [
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
];
const CHANGELOG_LEVEL_TONE = {
  release: 'success',
  improvement: 'info',
  fix: 'attention',
  incident: 'critical',
  maintenance: 'warning',
  info: 'new',
};

function normalizeMacroKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export default function AdminSupportTickets() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [analyticsWindowDays, setAnalyticsWindowDays] = useState('30');
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAction, setBulkAction] = useState('');
  const [toast, setToast] = useState({ message: null, type: 'success' });
  const [suggestReplyTicket, setSuggestReplyTicket] = useState(null);
  const [suggestReplyDraft, setSuggestReplyDraft] = useState('');
  const [suggestReplyMeta, setSuggestReplyMeta] = useState({ provider: '', sources: [] });
  const [macroTitleInput, setMacroTitleInput] = useState('');
  const [selectedMacroKey, setSelectedMacroKey] = useState('');
  const [routingTicketId, setRoutingTicketId] = useState(null);
  const [supportStatusValue, setSupportStatusValue] = useState('operational');
  const [supportStatusMessage, setSupportStatusMessage] = useState('All systems operational');
  const [changelogTitle, setChangelogTitle] = useState('');
  const [changelogSummary, setChangelogSummary] = useState('');
  const [changelogBody, setChangelogBody] = useState('');
  const [changelogLevel, setChangelogLevel] = useState('release');
  const [changelogVisibility, setChangelogVisibility] = useState('published');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'support-tickets', statusFilter],
    queryFn: async () => {
      const params = { limit: 100, sort: 'created_at', order: 'desc' };
      if (statusFilter) params.status = statusFilter;
      const res = await apiGet('/admin/support-tickets', params);
      const payload = res.data?.data ?? res.data;
      return payload;
    },
  });
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['admin', 'support-tickets', 'analytics', analyticsWindowDays],
    queryFn: async () => {
      const res = await apiGet('/admin/support-tickets/analytics', {
        days: Number(analyticsWindowDays) || 30,
        top: 5,
      });
      const payload = res.data?.data ?? res.data;
      return payload;
    },
  });
  const { data: macrosData, isLoading: macrosLoading } = useQuery({
    queryKey: ['admin', 'support-macros'],
    queryFn: async () => {
      const res = await apiGet('/admin/support-macros');
      const payload = res.data?.data ?? res.data;
      return payload;
    },
  });
  const { data: supportStatusData, isLoading: supportStatusLoading } = useQuery({
    queryKey: ['admin', 'support-status'],
    queryFn: async () => {
      const res = await apiGet('/admin/support-status');
      return res?.data?.data ?? res?.data ?? {};
    },
  });
  const { data: supportChangelogData, isLoading: supportChangelogLoading } = useQuery({
    queryKey: ['admin', 'support-changelog'],
    queryFn: async () => {
      const res = await apiGet('/admin/support-changelog', { limit: 20 });
      return res?.data?.data ?? res?.data ?? {};
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => apiPatch(`/admin/support-tickets/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-tickets'] });
      setToast({ message: 'Status updated', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Update failed',
        type: 'error',
      });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ticketIds, action }) =>
      apiPost('/admin/support-tickets/bulk', { ticketIds, action }),
    onSuccess: (_, { ticketIds }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-tickets'] });
      setSelectedIds([]);
      setBulkAction('');
      setToast({ message: `Updated ${ticketIds.length} ticket(s)`, type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Bulk update failed',
        type: 'error',
      });
    },
  });

  const suggestReplyMutation = useMutation({
    mutationFn: ticketId => apiPost(`/admin/support-tickets/${ticketId}/suggest-reply`, {}),
    onSuccess: res => {
      const payload = res?.data?.data ?? res?.data ?? {};
      setSuggestReplyDraft(payload?.suggested_reply || '');
      setSuggestReplyMeta({
        provider: payload?.provider || '',
        sources: Array.isArray(payload?.sources) ? payload.sources : [],
      });
    },
    onError: err => {
      const message = err?.response?.data?.error || err?.message || 'Could not generate suggestion';
      setSuggestReplyDraft('');
      setSuggestReplyMeta({ provider: '', sources: [] });
      setToast({ message, type: 'error' });
    },
  });
  const saveMacroMutation = useMutation({
    mutationFn: ({ key, title, body }) => apiPut(`/admin/support-macros/${key}`, { title, body }),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-macros'] });
      setSelectedMacroKey(variables.key);
      setToast({ message: 'Macro saved', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Could not save macro',
        type: 'error',
      });
    },
  });
  const deleteMacroMutation = useMutation({
    mutationFn: key => apiDelete(`/admin/support-macros/${key}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-macros'] });
      setSelectedMacroKey('');
      setToast({ message: 'Macro deleted', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Could not delete macro',
        type: 'error',
      });
    },
  });
  const routeTicketMutation = useMutation({
    mutationFn: ({ id, escalate = false }) =>
      apiPost(`/admin/support-tickets/${id}/route`, {
        escalate,
        auto_assign: true,
        reason: escalate ? 'manual_escalate' : 'manual_route',
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-tickets'] });
      setToast({
        message: variables?.escalate ? 'Ticket escalated and routed' : 'Ticket routed',
        type: 'success',
      });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Ticket routing failed',
        type: 'error',
      });
    },
    onSettled: () => {
      setRoutingTicketId(null);
    },
  });
  const escalationSweepMutation = useMutation({
    mutationFn: payload => apiPost('/admin/support-tickets/escalate', payload || {}),
    onSuccess: res => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-tickets'] });
      const payload = res?.data?.data ?? res?.data ?? {};
      const escalatedCount = Number(payload?.summary?.escalated) || 0;
      const candidatesCount = Number(payload?.summary?.candidates) || 0;
      setToast({
        message: `Escalation sweep done: ${escalatedCount}/${candidatesCount} ticket(s) escalated`,
        type: 'success',
      });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Escalation sweep failed',
        type: 'error',
      });
    },
  });
  const updateSupportStatusMutation = useMutation({
    mutationFn: payload => apiPut('/admin/support-status', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-status'] });
      setToast({ message: 'Support status updated', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Could not update support status',
        type: 'error',
      });
    },
  });
  const createChangelogMutation = useMutation({
    mutationFn: payload => apiPost('/admin/support-changelog', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-changelog'] });
      setChangelogTitle('');
      setChangelogSummary('');
      setChangelogBody('');
      setChangelogLevel('release');
      setChangelogVisibility('published');
      setToast({ message: 'Changelog entry created', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Could not create changelog entry',
        type: 'error',
      });
    },
  });
  const patchChangelogMutation = useMutation({
    mutationFn: ({ id, payload }) => apiPatch(`/admin/support-changelog/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-changelog'] });
      setToast({ message: 'Changelog entry updated', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Could not update changelog entry',
        type: 'error',
      });
    },
  });

  const tickets = data?.tickets ?? [];
  const total = data?.total ?? 0;
  const routingDefaults = data?.routing_defaults || {};
  const macros = Array.isArray(macrosData?.macros) ? macrosData.macros : [];
  const macroOptions = [
    { label: 'Select template', value: '' },
    ...macros.map(item => ({
      label: item.title || item.key,
      value: item.key,
    })),
  ];
  const selectedMacro = selectedMacroKey
    ? macros.find(item => item.key === selectedMacroKey)
    : null;
  const analyticsSummary = analyticsData?.summary || {};
  const supportStatusRow = supportStatusData || {};
  const supportChangelogEntries = Array.isArray(supportChangelogData?.entries)
    ? supportChangelogData.entries
    : [];
  const topCategories = analyticsData?.ticket_categories || [];
  const topQuestions = analyticsData?.top_ai_questions || [];
  const slaTargets = analyticsData?.sla_targets_hours || {};
  const slaTrends = analyticsData?.sla_trends || [];

  const formatMinutes = value => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `${Number(value).toFixed(1)} min`;
  };
  const formatPercent = (met, breached) => {
    const total = (Number(met) || 0) + (Number(breached) || 0);
    if (total <= 0) return '—';
    return `${Math.round(((Number(met) || 0) / total) * 100)}%`;
  };
  const slaTrendRows = slaTrends
    .slice(-10)
    .reverse()
    .map(row => [
      row.day || '—',
      String(row.tickets_total ?? 0),
      String(row.tickets_open ?? 0),
      formatMinutes(row.avg_first_response_minutes),
      formatMinutes(row.avg_resolution_minutes),
    ]);

  useEffect(() => {
    const nextStatus = String(supportStatusRow?.status || '')
      .trim()
      .toLowerCase();
    if (nextStatus) {
      setSupportStatusValue(nextStatus);
    }
    if (typeof supportStatusRow?.message === 'string' && supportStatusRow.message.trim()) {
      setSupportStatusMessage(supportStatusRow.message.trim());
    }
  }, [supportStatusRow?.status, supportStatusRow?.message]);

  const handleBulkApply = () => {
    if (!bulkAction || selectedIds.length === 0) return;
    bulkMutation.mutate({ ticketIds: selectedIds, action: bulkAction });
  };
  const handleSaveSupportStatus = () => {
    updateSupportStatusMutation.mutate({
      status: supportStatusValue,
      message: supportStatusMessage,
    });
  };
  const handleCreateChangelog = () => {
    const title = String(changelogTitle || '').trim();
    if (!title) {
      setToast({ message: 'Changelog title is required', type: 'error' });
      return;
    }
    createChangelogMutation.mutate({
      title,
      summary: changelogSummary,
      body: changelogBody,
      level: changelogLevel,
      visibility: changelogVisibility,
    });
  };

  const openSuggestReplyModal = ticket => {
    if (!ticket?.id) return;
    setSuggestReplyTicket(ticket);
    setSuggestReplyDraft('');
    setSuggestReplyMeta({ provider: '', sources: [] });
    setMacroTitleInput('');
    setSelectedMacroKey('');
    suggestReplyMutation.mutate(ticket.id);
  };

  const closeSuggestReplyModal = () => {
    setSuggestReplyTicket(null);
    setSuggestReplyDraft('');
    setSuggestReplyMeta({ provider: '', sources: [] });
    setMacroTitleInput('');
    setSelectedMacroKey('');
  };

  const handleRegenerateSuggestReply = () => {
    if (!suggestReplyTicket?.id) return;
    suggestReplyMutation.mutate(suggestReplyTicket.id);
  };

  const handleCopySuggestedReply = async () => {
    if (!suggestReplyDraft.trim()) return;
    try {
      await navigator.clipboard.writeText(suggestReplyDraft);
      setToast({ message: 'Suggested reply copied', type: 'success' });
    } catch (_err) {
      setToast({ message: 'Could not copy to clipboard', type: 'error' });
    }
  };
  const handleSaveMacro = () => {
    const title = String(macroTitleInput || '').trim();
    const body = String(suggestReplyDraft || '').trim();
    if (!title) {
      setToast({ message: 'Macro title is required', type: 'error' });
      return;
    }
    if (!body) {
      setToast({ message: 'Draft reply is empty', type: 'error' });
      return;
    }
    const key = normalizeMacroKey(title);
    if (!key) {
      setToast({ message: 'Macro title should include letters or numbers', type: 'error' });
      return;
    }
    saveMacroMutation.mutate({ key, title, body });
  };
  const handleInsertMacro = () => {
    if (!selectedMacro?.body) {
      setToast({ message: 'Select a macro first', type: 'error' });
      return;
    }
    setSuggestReplyDraft(prev => {
      const current = String(prev || '').trim();
      const nextChunk = String(selectedMacro.body || '').trim();
      if (!current) {
        return nextChunk;
      }
      return `${current}\n\n${nextChunk}`;
    });
    setToast({ message: 'Macro inserted into draft', type: 'success' });
  };
  const handleDeleteMacro = () => {
    if (!selectedMacroKey) {
      setToast({ message: 'Select a macro to delete', type: 'error' });
      return;
    }
    deleteMacroMutation.mutate(selectedMacroKey);
  };
  const handleRouteTicket = (ticketId, escalate = false) => {
    if (!ticketId || routeTicketMutation.isPending) {
      return;
    }
    setRoutingTicketId(ticketId);
    routeTicketMutation.mutate({ id: ticketId, escalate });
  };

  const toggleSelectAll = checked => {
    setSelectedIds(checked ? tickets.map(t => t.id) : []);
  };
  const toggleSelect = (id, checked) => {
    setSelectedIds(prev => (checked ? [...prev, id] : prev.filter(i => i !== id)));
  };

  const rows = tickets.map(t => [
    <Checkbox
      key={`cb-${t.id}`}
      label=""
      labelHidden
      checked={selectedIds.includes(t.id)}
      onChange={checked => toggleSelect(t.id, checked)}
    />,
    String(t.id).slice(0, 8),
    t.email ?? '—',
    (t.subject || '—').slice(0, 50) + ((t.subject || '').length > 50 ? '…' : ''),
    t.category ?? '—',
    t.status ?? '—',
    <Badge key={`priority-${t.id}`} tone={PRIORITY_TONE[t.priority] || 'new'}>
      {t.priority || 'normal'}
    </Badge>,
    <Text key={`assigned-${t.id}`} as="span" variant="bodySm" tone="subdued">
      {t.assigned_to || 'Unassigned'}
    </Text>,
    t.escalation_due ? (
      <Badge key={`escalate-${t.id}`} tone="attention">
        Due ({t.escalation_target_priority || 'high'})
      </Badge>
    ) : (
      <Text key={`ok-${t.id}`} as="span" variant="bodySm" tone="subdued">
        —{t.hours_open ? ` ${t.hours_open}h open` : ''}
      </Text>
    ),
    t.shop_domain ?? '—',
    t.created_at ? new Date(t.created_at).toLocaleString() : '—',
    <InlineStack key={`act-${t.id}`} gap="100" wrap={false}>
      <Button
        size="slim"
        variant="plain"
        onClick={() => openSuggestReplyModal(t)}
        disabled={suggestReplyMutation.isPending && suggestReplyTicket?.id === t.id}
      >
        Suggest reply
      </Button>
      <Button
        size="slim"
        variant="plain"
        onClick={() => handleRouteTicket(t.id, false)}
        disabled={routeTicketMutation.isPending && routingTicketId === t.id}
      >
        Route
      </Button>
      <Button
        size="slim"
        variant="plain"
        onClick={() => handleRouteTicket(t.id, true)}
        disabled={routeTicketMutation.isPending && routingTicketId === t.id}
      >
        Escalate
      </Button>
      {t.status !== 'open' && (
        <Button
          size="slim"
          variant="plain"
          onClick={() => updateStatusMutation.mutate({ id: t.id, status: 'open' })}
          disabled={updateStatusMutation.isPending}
        >
          Open
        </Button>
      )}
      {t.status !== 'closed' && (
        <Button
          size="slim"
          variant="plain"
          onClick={() => updateStatusMutation.mutate({ id: t.id, status: 'closed' })}
          disabled={updateStatusMutation.isPending}
        >
          Close
        </Button>
      )}
      {t.status !== 'resolved' && (
        <Button
          size="slim"
          variant="plain"
          onClick={() => updateStatusMutation.mutate({ id: t.id, status: 'resolved' })}
          disabled={updateStatusMutation.isPending}
        >
          Resolve
        </Button>
      )}
    </InlineStack>,
  ]);

  return (
    <PageShell className={`${styles.adminPage} ${styles.adminPageWithHero}`}>
      <AdminPageLayout
        primaryAction={{
          content: 'Refresh',
          icon: RefreshIcon,
          onAction: () => refetch(),
          loading: isFetching,
        }}
      >
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center" wrap>
              <Text as="h2" variant="headingMd">
                Support analytics
              </Text>
              <Select
                label="Window"
                options={ANALYTICS_WINDOW_OPTIONS}
                value={analyticsWindowDays}
                onChange={setAnalyticsWindowDays}
              />
            </InlineStack>

            {analyticsLoading ? (
              <Text as="p" tone="subdued">
                Loading analytics…
              </Text>
            ) : (
              <>
                <div className={styles.adminStatsGrid}>
                  <div className={styles.adminStatCard}>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Tickets
                    </Text>
                    <Text as="p" variant="headingLg">
                      {analyticsSummary.tickets_total ?? 0}
                    </Text>
                  </div>
                  <div className={styles.adminStatCard}>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Open
                    </Text>
                    <Text as="p" variant="headingLg">
                      {analyticsSummary.tickets_open ?? 0}
                    </Text>
                  </div>
                  <div className={styles.adminStatCard}>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Resolved
                    </Text>
                    <Text as="p" variant="headingLg">
                      {(analyticsSummary.tickets_resolved ?? 0) +
                        (analyticsSummary.tickets_closed ?? 0)}
                    </Text>
                  </div>
                  <div className={styles.adminStatCard}>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Avg first response
                    </Text>
                    <Text as="p" variant="headingLg">
                      {formatMinutes(analyticsSummary.avg_first_response_minutes)}
                    </Text>
                  </div>
                  <div className={styles.adminStatCard}>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Avg resolution
                    </Text>
                    <Text as="p" variant="headingLg">
                      {formatMinutes(analyticsSummary.avg_resolution_minutes)}
                    </Text>
                  </div>
                  <div className={styles.adminStatCard}>
                    <Text as="p" variant="bodySm" tone="subdued">
                      AI user messages
                    </Text>
                    <Text as="p" variant="headingLg">
                      {analyticsSummary.ai_user_messages_total ?? 0}
                    </Text>
                  </div>
                </div>

                <div className={styles.adminSupportAnalyticsRows}>
                  <div className={styles.adminSupportAnalyticsBlock}>
                    <Text as="p" variant="headingSm">
                      Top ticket categories
                    </Text>
                    {topCategories.length > 0 ? (
                      <ul className={styles.adminSupportAnalyticsList}>
                        {topCategories.map(row => (
                          <li
                            key={`cat-${row.category}`}
                            className={styles.adminSupportAnalyticsListItem}
                          >
                            <span>{row.category}</span>
                            <Badge tone="info">{row.count}</Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Text as="p" variant="bodySm" tone="subdued">
                        No category data for this window.
                      </Text>
                    )}
                  </div>

                  <div className={styles.adminSupportAnalyticsBlock}>
                    <Text as="p" variant="headingSm">
                      Top AI questions
                    </Text>
                    {topQuestions.length > 0 ? (
                      <ul className={styles.adminSupportAnalyticsList}>
                        {topQuestions.map((row, idx) => (
                          <li
                            key={`q-${idx}-${row.question}`}
                            className={styles.adminSupportAnalyticsQuestionItem}
                          >
                            <Text as="span" variant="bodySm">
                              {row.question || '—'}
                            </Text>
                            <Badge tone="attention">{row.count}</Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Text as="p" variant="bodySm" tone="subdued">
                        No AI question data yet.
                      </Text>
                    )}
                  </div>
                </div>

                <div className={styles.adminSupportSlaSection}>
                  <InlineStack align="space-between" blockAlign="center" wrap>
                    <Text as="p" variant="headingSm">
                      SLA dashboard
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      Targets: first response ≤ {slaTargets.first_response ?? 24}h, resolution ≤{' '}
                      {slaTargets.resolution ?? 72}h
                    </Text>
                  </InlineStack>

                  <div className={styles.adminSupportSlaGrid}>
                    <div className={styles.adminSupportSlaCard}>
                      <Text as="p" variant="bodySm" tone="subdued">
                        First response met
                      </Text>
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="p" variant="headingMd">
                          {analyticsSummary.frt_sla_met_count ?? 0}
                        </Text>
                        <Badge tone="success">
                          {formatPercent(
                            analyticsSummary.frt_sla_met_count,
                            analyticsSummary.frt_sla_breached_count
                          )}
                        </Badge>
                      </InlineStack>
                    </div>
                    <div className={styles.adminSupportSlaCard}>
                      <Text as="p" variant="bodySm" tone="subdued">
                        First response breached
                      </Text>
                      <Text as="p" variant="headingMd">
                        {analyticsSummary.frt_sla_breached_count ?? 0}
                      </Text>
                    </div>
                    <div className={styles.adminSupportSlaCard}>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Resolution met
                      </Text>
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="p" variant="headingMd">
                          {analyticsSummary.resolution_sla_met_count ?? 0}
                        </Text>
                        <Badge tone="success">
                          {formatPercent(
                            analyticsSummary.resolution_sla_met_count,
                            analyticsSummary.resolution_sla_breached_count
                          )}
                        </Badge>
                      </InlineStack>
                    </div>
                    <div className={styles.adminSupportSlaCard}>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Resolution breached
                      </Text>
                      <Text as="p" variant="headingMd">
                        {analyticsSummary.resolution_sla_breached_count ?? 0}
                      </Text>
                    </div>
                    <div className={styles.adminSupportSlaCard}>
                      <Text as="p" variant="bodySm" tone="subdued">
                        CSAT
                      </Text>
                      <Text as="p" variant="headingMd">
                        {analyticsSummary.feedback_tracked
                          ? (analyticsSummary.csat_avg ?? '—')
                          : 'Not tracked'}
                      </Text>
                    </div>
                    <div className={styles.adminSupportSlaCard}>
                      <Text as="p" variant="bodySm" tone="subdued">
                        NPS
                      </Text>
                      <Text as="p" variant="headingMd">
                        {analyticsSummary.feedback_tracked
                          ? (analyticsSummary.nps_avg ?? '—')
                          : 'Not tracked'}
                      </Text>
                    </div>
                  </div>

                  {slaTrendRows.length > 0 ? (
                    <div className={styles.adminSupportSlaTrendTableWrap}>
                      <DataTable
                        columnContentTypes={['text', 'numeric', 'numeric', 'text', 'text']}
                        headings={[
                          'Day',
                          'Tickets',
                          'Open',
                          'Avg first response',
                          'Avg resolution',
                        ]}
                        rows={slaTrendRows}
                      />
                    </div>
                  ) : (
                    <Text as="p" variant="bodySm" tone="subdued">
                      No daily SLA trend data for this window.
                    </Text>
                  )}
                </div>
              </>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center" wrap>
              <Text as="h2" variant="headingMd">
                Status and changelog
              </Text>
              {supportStatusLoading || supportChangelogLoading ? (
                <Text as="span" variant="bodySm" tone="subdued">
                  Loading…
                </Text>
              ) : null}
            </InlineStack>

            <div className={styles.adminSupportStatusPanel}>
              <InlineStack gap="300" wrap>
                <Select
                  label="Current status"
                  options={SUPPORT_STATUS_OPTIONS}
                  value={supportStatusValue}
                  onChange={setSupportStatusValue}
                />
                <TextField
                  label="Status message"
                  value={supportStatusMessage}
                  onChange={setSupportStatusMessage}
                  autoComplete="off"
                  maxLength={500}
                  showCharacterCount
                />
                <Button
                  variant="secondary"
                  onClick={handleSaveSupportStatus}
                  loading={updateSupportStatusMutation.isPending}
                >
                  Save status
                </Button>
              </InlineStack>
              {supportStatusRow?.updated_at ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  Last updated: {new Date(supportStatusRow.updated_at).toLocaleString()}
                </Text>
              ) : null}
            </div>

            <div className={styles.adminSupportStatusPanel}>
              <Text as="h3" variant="headingSm">
                Publish changelog entry
              </Text>
              <InlineStack gap="300" wrap>
                <TextField
                  label="Title"
                  value={changelogTitle}
                  onChange={setChangelogTitle}
                  autoComplete="off"
                  maxLength={180}
                  showCharacterCount
                />
                <Select
                  label="Level"
                  options={CHANGELOG_LEVEL_OPTIONS}
                  value={changelogLevel}
                  onChange={setChangelogLevel}
                />
                <Select
                  label="Visibility"
                  options={CHANGELOG_VISIBILITY_OPTIONS}
                  value={changelogVisibility}
                  onChange={setChangelogVisibility}
                />
              </InlineStack>
              <TextField
                label="Summary (optional)"
                value={changelogSummary}
                onChange={setChangelogSummary}
                autoComplete="off"
                maxLength={500}
                showCharacterCount
              />
              <TextField
                label="Details (optional)"
                value={changelogBody}
                onChange={setChangelogBody}
                multiline={4}
                maxLength={10000}
                showCharacterCount
                autoComplete="off"
              />
              <InlineStack align="end">
                <Button
                  variant="primary"
                  onClick={handleCreateChangelog}
                  loading={createChangelogMutation.isPending}
                  disabled={!String(changelogTitle || '').trim()}
                >
                  Create entry
                </Button>
              </InlineStack>
            </div>

            <div className={styles.adminSupportChangelogList}>
              {supportChangelogEntries.length === 0 ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  No changelog entries yet.
                </Text>
              ) : (
                supportChangelogEntries.map(entry => {
                  const isPublished = String(entry.visibility || '').toLowerCase() === 'published';
                  return (
                    <div key={entry.id} className={styles.adminSupportChangelogItem}>
                      <InlineStack align="space-between" blockAlign="center" wrap>
                        <InlineStack gap="200" blockAlign="center" wrap>
                          <Text as="p" variant="headingSm">
                            {entry.title || 'Untitled'}
                          </Text>
                          <Badge
                            tone={
                              CHANGELOG_LEVEL_TONE[String(entry.level || '').toLowerCase()] || 'new'
                            }
                          >
                            {String(entry.level || 'info')}
                          </Badge>
                          <Badge tone={isPublished ? 'success' : 'warning'}>
                            {isPublished ? 'published' : 'draft'}
                          </Badge>
                        </InlineStack>
                        <InlineStack gap="200" wrap>
                          <Button
                            size="slim"
                            variant="plain"
                            onClick={() =>
                              patchChangelogMutation.mutate({
                                id: entry.id,
                                payload: {
                                  visibility: isPublished ? 'draft' : 'published',
                                  publish_now: !isPublished,
                                },
                              })
                            }
                            loading={patchChangelogMutation.isPending}
                          >
                            {isPublished ? 'Move to draft' : 'Publish'}
                          </Button>
                        </InlineStack>
                      </InlineStack>
                      {entry.summary ? (
                        <Text as="p" variant="bodySm" tone="subdued">
                          {entry.summary}
                        </Text>
                      ) : null}
                      <Text as="p" variant="bodySm" tone="subdued">
                        {entry.published_at
                          ? new Date(entry.published_at).toLocaleString()
                          : entry.updated_at
                            ? new Date(entry.updated_at).toLocaleString()
                            : '—'}
                      </Text>
                    </div>
                  );
                })
              )}
            </div>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack gap="300" blockAlign="center" wrap>
              <Select
                label="Status"
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={setStatusFilter}
              />
              <Button
                size="slim"
                variant="secondary"
                onClick={() =>
                  escalationSweepMutation.mutate({
                    limit: 50,
                    high_after_hours: Number(routingDefaults.escalation_high_hours) || 24,
                    urgent_after_hours: Number(routingDefaults.escalation_urgent_hours) || 72,
                    auto_assign: true,
                  })
                }
                loading={escalationSweepMutation.isPending}
              >
                Run escalation sweep
              </Button>
              {selectedIds.length > 0 && (
                <>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {selectedIds.length} selected
                  </Text>
                  <Select
                    label="Bulk action"
                    options={BULK_ACTIONS}
                    value={bulkAction}
                    onChange={setBulkAction}
                  />
                  <Button
                    size="slim"
                    variant="primary"
                    onClick={handleBulkApply}
                    loading={bulkMutation.isPending}
                  >
                    Apply
                  </Button>
                  <Button size="slim" variant="plain" onClick={() => setSelectedIds([])}>
                    Clear
                  </Button>
                </>
              )}
            </InlineStack>
            {isLoading ? (
              <Text as="p" tone="subdued">
                Loading…
              </Text>
            ) : tickets.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading="No support tickets"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Tickets from the Support page (Contact us) will appear here for triage.</p>
                </EmptyState>
              </div>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={[
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                  ]}
                  headings={[
                    <Checkbox
                      key="all"
                      label=""
                      labelHidden
                      checked={selectedIds.length === tickets.length && tickets.length > 0}
                      onChange={toggleSelectAll}
                    />,
                    'ID',
                    'Email',
                    'Subject',
                    'Category',
                    'Status',
                    'Priority',
                    'Assignee',
                    'Escalation',
                    'Shop',
                    'Created',
                    'Actions',
                  ]}
                  rows={rows}
                />
              </div>
            )}
            {total > 0 && (
              <Text as="p" variant="bodySm" tone="subdued">
                Showing {tickets.length} of {total} ticket(s).
              </Text>
            )}
          </BlockStack>
        </Card>
      </AdminPageLayout>

      {suggestReplyTicket && (
        <Modal
          open
          onClose={closeSuggestReplyModal}
          title={`Suggested reply · #${String(suggestReplyTicket.id).slice(0, 8)}`}
          size="large"
          primaryAction={{
            content: 'Copy reply',
            onAction: handleCopySuggestedReply,
            disabled: !suggestReplyDraft.trim(),
          }}
          secondaryActions={[
            {
              content: 'Regenerate',
              onAction: handleRegenerateSuggestReply,
              loading: suggestReplyMutation.isPending,
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="p" variant="bodySm" tone="subdued">
                Subject: {suggestReplyTicket.subject || '—'}
              </Text>
              <div className={styles.adminSupportSuggestReplyMeta}>
                <Badge tone="info">
                  Provider: {suggestReplyMeta.provider === 'openai' ? 'AI' : 'Template'}
                </Badge>
                <Badge tone="attention">Sources: {suggestReplyMeta.sources.length}</Badge>
              </div>
              {suggestReplyMutation.isPending ? (
                <Text as="p" tone="subdued">
                  Generating suggested reply…
                </Text>
              ) : (
                <TextField
                  label="Draft reply"
                  multiline={12}
                  autoComplete="off"
                  value={suggestReplyDraft}
                  onChange={setSuggestReplyDraft}
                  helpText="You can edit before copying and sending."
                />
              )}
              {suggestReplyMeta.sources.length > 0 && (
                <Text as="p" variant="bodySm" tone="subdued">
                  Sources: {suggestReplyMeta.sources.join(', ')}
                </Text>
              )}
              <div className={styles.adminSupportSuggestReplyTemplates}>
                <Text as="p" variant="headingSm">
                  Templates (macros)
                </Text>
                <InlineStack gap="200" wrap>
                  <Select
                    label="Choose template"
                    labelHidden
                    options={macroOptions}
                    value={selectedMacroKey}
                    onChange={setSelectedMacroKey}
                    disabled={macrosLoading}
                  />
                  <Button
                    size="slim"
                    variant="secondary"
                    onClick={handleInsertMacro}
                    disabled={!selectedMacroKey}
                  >
                    Insert
                  </Button>
                  <Button
                    size="slim"
                    variant="plain"
                    onClick={handleDeleteMacro}
                    loading={deleteMacroMutation.isPending}
                    disabled={!selectedMacroKey}
                  >
                    Delete
                  </Button>
                </InlineStack>
                <InlineStack gap="200" wrap>
                  <TextField
                    label="Save current draft as template"
                    labelHidden
                    placeholder="Template name (e.g., Shipping delay follow-up)"
                    value={macroTitleInput}
                    onChange={setMacroTitleInput}
                    autoComplete="off"
                  />
                  <Button
                    size="slim"
                    variant="primary"
                    onClick={handleSaveMacro}
                    loading={saveMacroMutation.isPending}
                    disabled={!suggestReplyDraft.trim()}
                  >
                    Save template
                  </Button>
                </InlineStack>
              </div>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}

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
