/**
 * AdminSupportTickets
 *
 * List support tickets for admin triage; sortable columns; filter by status;
 * update status; routing/escalation actions; bulk close/resolve.
 */

import React, { useEffect, useRef, useState } from 'react';
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
import { subscribeSupportTicketRealtime } from '../../services/supportRealtime';
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
const UNIFIED_INBOX_SOURCE_OPTIONS = [
  { label: 'All sources', value: 'all' },
  { label: 'Tickets', value: 'ticket' },
  { label: 'Feature requests', value: 'feature_request' },
  { label: 'Chat feedback', value: 'chat_feedback' },
];
const UNIFIED_INBOX_SOURCE_TONE = {
  ticket: 'success',
  feature_request: 'attention',
  chat_feedback: 'warning',
};
const PROACTIVE_SEVERITY_TONE = {
  critical: 'critical',
  warning: 'attention',
  info: 'info',
};
const SUPPORT_INBOX_PROVIDER_OPTIONS = [
  { label: 'Disabled', value: 'none' },
  { label: 'Zendesk', value: 'zendesk' },
  { label: 'Help Scout', value: 'helpscout' },
];

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
  const [supportInboxProvider, setSupportInboxProvider] = useState('none');
  const [supportInboxEnabled, setSupportInboxEnabled] = useState(false);
  const [supportInboxZendeskSubdomain, setSupportInboxZendeskSubdomain] = useState('');
  const [supportInboxZendeskEmail, setSupportInboxZendeskEmail] = useState('');
  const [supportInboxZendeskApiToken, setSupportInboxZendeskApiToken] = useState('');
  const [supportInboxHelpScoutMailboxId, setSupportInboxHelpScoutMailboxId] = useState('');
  const [supportInboxHelpScoutAccessToken, setSupportInboxHelpScoutAccessToken] = useState('');
  const [threadTicket, setThreadTicket] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadReply, setThreadReply] = useState('');
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadSending, setThreadSending] = useState(false);
  const [threadStreamState, setThreadStreamState] = useState('idle');
  const [threadError, setThreadError] = useState('');
  const [threadPeerTyping, setThreadPeerTyping] = useState(false);
  const [threadPeerLastReadAt, setThreadPeerLastReadAt] = useState(null);
  const [threadPeerOnline, setThreadPeerOnline] = useState(false);
  const [threadPeerDeliveredAt, setThreadPeerDeliveredAt] = useState(null);
  const [unifiedInboxSource, setUnifiedInboxSource] = useState('all');
  const [proactiveWindowDays, setProactiveWindowDays] = useState('14');
  const threadRealtimeUnsubscribeRef = useRef(null);
  const threadTypingTimeoutRef = useRef(null);

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
  const {
    data: supportInboxIntegrationData,
    isLoading: supportInboxIntegrationLoading,
    refetch: refetchSupportInboxIntegration,
  } = useQuery({
    queryKey: ['admin', 'support-inbox-integration'],
    queryFn: async () => {
      const res = await apiGet('/admin/support-inbox-integration');
      return res?.data?.data ?? res?.data ?? {};
    },
  });
  const {
    data: unifiedInboxData,
    isLoading: unifiedInboxLoading,
    refetch: refetchUnifiedInbox,
  } = useQuery({
    queryKey: ['admin', 'support-unified-inbox', unifiedInboxSource],
    queryFn: async () => {
      const res = await apiGet('/admin/support-unified-inbox', {
        source: unifiedInboxSource,
        limit: 60,
      });
      return res?.data?.data ?? res?.data ?? {};
    },
  });
  const {
    data: proactiveSignalsData,
    isLoading: proactiveSignalsLoading,
    refetch: refetchProactiveSignals,
  } = useQuery({
    queryKey: ['admin', 'support-proactive-signals', proactiveWindowDays],
    queryFn: async () => {
      const res = await apiGet('/admin/support/proactive-signals', {
        window_days: Number(proactiveWindowDays) || 14,
      });
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
  const updateSupportInboxIntegrationMutation = useMutation({
    mutationFn: payload => apiPut('/admin/support-inbox-integration', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-inbox-integration'] });
      setSupportInboxZendeskApiToken('');
      setSupportInboxHelpScoutAccessToken('');
      setToast({ message: 'Support inbox integration updated', type: 'success' });
    },
    onError: err => {
      setToast({
        message:
          err?.response?.data?.error ||
          err?.message ||
          'Could not update support inbox integration',
        type: 'error',
      });
    },
  });
  const createProactiveOutreachMutation = useMutation({
    mutationFn: payload => apiPost('/admin/support/proactive-signals/outreach', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-proactive-signals'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-tickets'] });
      setToast({ message: 'Proactive outreach ticket created', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Could not create outreach ticket',
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
  const supportInboxConfig = supportInboxIntegrationData?.config || {};
  const unifiedInboxItems = Array.isArray(unifiedInboxData?.items) ? unifiedInboxData.items : [];
  const unifiedInboxCounts = unifiedInboxData?.counts || {};
  const proactiveSignals = Array.isArray(proactiveSignalsData?.signals)
    ? proactiveSignalsData.signals
    : [];
  const proactiveSummary = proactiveSignalsData?.summary || {};
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

  useEffect(() => {
    const nextProvider = String(supportInboxConfig?.provider || 'none')
      .trim()
      .toLowerCase();
    if (nextProvider) {
      setSupportInboxProvider(nextProvider);
    }
    setSupportInboxEnabled(Boolean(supportInboxConfig?.enabled));
    setSupportInboxZendeskSubdomain(String(supportInboxConfig?.zendesk?.subdomain || '').trim());
    setSupportInboxZendeskEmail(String(supportInboxConfig?.zendesk?.email || '').trim());
    setSupportInboxHelpScoutMailboxId(
      String(supportInboxConfig?.helpscout?.mailboxId || '').trim()
    );
  }, [
    supportInboxConfig?.provider,
    supportInboxConfig?.enabled,
    supportInboxConfig?.zendesk?.subdomain,
    supportInboxConfig?.zendesk?.email,
    supportInboxConfig?.helpscout?.mailboxId,
  ]);

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
  const handleSaveSupportInboxIntegration = () => {
    const provider = String(supportInboxProvider || 'none')
      .trim()
      .toLowerCase();
    const payload = {
      provider,
      enabled: Boolean(supportInboxEnabled && provider !== 'none'),
      zendesk: {
        subdomain: supportInboxZendeskSubdomain,
        email: supportInboxZendeskEmail,
      },
      helpscout: {
        mailboxId: supportInboxHelpScoutMailboxId,
      },
    };
    if (supportInboxZendeskApiToken.trim()) {
      payload.zendesk.apiToken = supportInboxZendeskApiToken.trim();
    }
    if (supportInboxHelpScoutAccessToken.trim()) {
      payload.helpscout.accessToken = supportInboxHelpScoutAccessToken.trim();
    }
    updateSupportInboxIntegrationMutation.mutate(payload);
  };
  const handleCopyConversationId = async conversationId => {
    const value = String(conversationId || '').trim();
    if (!value) {
      setToast({ message: 'Conversation id is missing', type: 'error' });
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setToast({ message: 'Conversation id copied', type: 'success' });
    } catch (_err) {
      setToast({ message: 'Could not copy conversation id', type: 'error' });
    }
  };
  const handleCreateProactiveOutreach = signal => {
    if (!signal || !signal.shop_domain || createProactiveOutreachMutation.isPending) {
      return;
    }
    createProactiveOutreachMutation.mutate({
      shop_domain: signal.shop_domain,
      signal_type: signal.type,
      note: signal.details || '',
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

  const upsertThreadMessage = messageItem => {
    if (!messageItem?.id) {
      return;
    }
    setThreadMessages(prev => {
      if (prev.some(existing => existing?.id === messageItem.id)) {
        return prev;
      }
      const next = [...prev, messageItem];
      next.sort((a, b) => {
        const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return aTime - bTime;
      });
      return next;
    });
  };

  const closeThreadModal = () => {
    if (threadRealtimeUnsubscribeRef.current) {
      threadRealtimeUnsubscribeRef.current.sendTyping?.(false);
      threadRealtimeUnsubscribeRef.current();
      threadRealtimeUnsubscribeRef.current = null;
    }
    if (threadTypingTimeoutRef.current) {
      clearTimeout(threadTypingTimeoutRef.current);
      threadTypingTimeoutRef.current = null;
    }
    setThreadTicket(null);
    setThreadMessages([]);
    setThreadReply('');
    setThreadLoading(false);
    setThreadSending(false);
    setThreadError('');
    setThreadStreamState('idle');
    setThreadPeerTyping(false);
    setThreadPeerLastReadAt(null);
    setThreadPeerOnline(false);
    setThreadPeerDeliveredAt(null);
  };

  const openThreadModal = async ticket => {
    const ticketId = String(ticket?.id || '').trim();
    if (!ticketId) {
      return;
    }
    setThreadTicket({
      id: ticketId,
      subject: ticket?.subject || 'Support request',
      email: ticket?.email || '',
      status: ticket?.status || 'open',
    });
    setThreadMessages([]);
    setThreadReply('');
    setThreadError('');
    setThreadLoading(true);
    setThreadStreamState('connecting');
    try {
      const res = await apiGet(`/admin/support-tickets/${ticketId}/thread`);
      const payload = res?.data?.data ?? res?.data ?? {};
      const ticketPayload = payload?.ticket;
      setThreadTicket(prev => ({
        ...prev,
        ...(ticketPayload || {}),
        id: ticketPayload?.id || prev?.id || ticketId,
      }));
      setThreadMessages(Array.isArray(payload?.messages) ? payload.messages : []);
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-tickets'] });
    } catch (err) {
      setThreadError(err?.response?.data?.error || err?.message || 'Could not load ticket thread');
      setThreadStreamState('offline');
    } finally {
      setThreadLoading(false);
    }
  };

  const sendThreadReply = async () => {
    const ticketId = String(threadTicket?.id || '').trim();
    const text = String(threadReply || '').trim();
    if (!ticketId || !text || threadSending) {
      return;
    }
    setThreadSending(true);
    setThreadError('');
    threadRealtimeUnsubscribeRef.current?.sendTyping?.(false);
    if (threadTypingTimeoutRef.current) {
      clearTimeout(threadTypingTimeoutRef.current);
      threadTypingTimeoutRef.current = null;
    }
    try {
      const res = await apiPost(`/admin/support-tickets/${ticketId}/reply`, { message: text });
      const payload = res?.data?.data ?? res?.data ?? {};
      if (payload?.message?.id) {
        upsertThreadMessage(payload.message);
        setThreadPeerTyping(false);
      }
      setThreadReply('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-tickets'] });
    } catch (err) {
      setThreadError(err?.response?.data?.error || err?.message || 'Could not send reply');
    } finally {
      setThreadSending(false);
    }
  };

  useEffect(() => {
    const ticketId = String(threadTicket?.id || '').trim();
    if (!ticketId) {
      return undefined;
    }
    if (threadRealtimeUnsubscribeRef.current) {
      threadRealtimeUnsubscribeRef.current();
      threadRealtimeUnsubscribeRef.current = null;
    }
    setThreadStreamState('connecting');
    threadRealtimeUnsubscribeRef.current = subscribeSupportTicketRealtime({
      ticketId,
      audience: 'admin',
      onState: setThreadStreamState,
      onMessage: message => {
        upsertThreadMessage(message);
        setThreadPeerTyping(false);
        if (message.sender_type === 'user') {
          queryClient.invalidateQueries({ queryKey: ['admin', 'support-tickets'] });
        }
      },
      onError: error => setThreadError(error),
      onTyping: event => {
        if (event.audience === 'user') {
          setThreadPeerTyping(event.isTyping);
        }
      },
      onRead: event => {
        if (event.audience === 'user') {
          setThreadPeerLastReadAt(event.readState?.last_read_at || event.timestamp || null);
        }
      },
      onPresence: presence => {
        setThreadPeerOnline(Boolean(presence.hasUser));
      },
      onDelivered: event => {
        if (event.senderAudience === 'admin' && event.deliveredToUser) {
          setThreadPeerDeliveredAt(event.timestamp || new Date().toISOString());
        }
      },
    });
    return () => {
      if (threadRealtimeUnsubscribeRef.current) {
        threadRealtimeUnsubscribeRef.current.sendTyping?.(false);
        threadRealtimeUnsubscribeRef.current();
        threadRealtimeUnsubscribeRef.current = null;
      }
      if (threadTypingTimeoutRef.current) {
        clearTimeout(threadTypingTimeoutRef.current);
        threadTypingTimeoutRef.current = null;
      }
      setThreadPeerTyping(false);
    };
  }, [queryClient, threadTicket?.id]);

  const handleThreadReplyChange = value => {
    setThreadReply(value);
    threadRealtimeUnsubscribeRef.current?.sendTyping?.(Boolean(String(value || '').trim()));
    if (threadTypingTimeoutRef.current) {
      clearTimeout(threadTypingTimeoutRef.current);
    }
    threadTypingTimeoutRef.current = setTimeout(() => {
      threadRealtimeUnsubscribeRef.current?.sendTyping?.(false);
    }, 1800);
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
    <InlineStack key={`cat-${t.id}`} gap="100" blockAlign="center" wrap={false}>
      <Text as="span" variant="bodySm">
        {t.category ?? '—'}
      </Text>
      {String(t.category_source || '').toLowerCase() === 'auto' ? (
        <Badge tone="info">Auto</Badge>
      ) : null}
    </InlineStack>,
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
    ) : t.admin_has_unread ? (
      <Badge key={`unread-${t.id}`} tone="critical">
        Unread {t.admin_unread_count > 1 ? t.admin_unread_count : ''}
      </Badge>
    ) : t.customer_waiting ? (
      <Badge key={`waiting-${t.id}`} tone="attention">
        Customer waiting
      </Badge>
    ) : (
      <Text key={`ok-${t.id}`} as="span" variant="bodySm" tone="subdued">
        —{t.hours_open ? ` ${t.hours_open}h open` : ''}
      </Text>
    ),
    t.shop_domain ?? '—',
    t.created_at ? new Date(t.created_at).toLocaleString() : '—',
    <InlineStack key={`act-${t.id}`} gap="100" wrap={false}>
      <Button size="slim" variant="plain" onClick={() => openThreadModal(t)}>
        Thread
      </Button>
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
  const unifiedInboxRows = unifiedInboxItems.map(item => {
    const source = String(item.source || 'ticket').toLowerCase();
    const itemId = String(item.item_id || '');
    const createdAt = item.created_at ? new Date(item.created_at).toLocaleString() : '—';
    const isTicket = source === 'ticket';
    const isChatFeedback = source === 'chat_feedback';
    return [
      <Badge key={`src-${source}-${itemId}`} tone={UNIFIED_INBOX_SOURCE_TONE[source] || 'new'}>
        {item.source_label || source.replace('_', ' ')}
      </Badge>,
      itemId ? itemId.slice(0, 8) : '—',
      String(item.title || '—').slice(0, 90),
      <Text key={`sum-${source}-${itemId}`} as="span" variant="bodySm" tone="subdued">
        {item.summary || '—'}
      </Text>,
      item.status || '—',
      source === 'feature_request'
        ? `${Number(item.vote_count) || 0} votes`
        : item.priority || 'normal',
      createdAt,
      isTicket ? (
        <InlineStack key={`act-ticket-${itemId}`} gap="100" wrap={false}>
          <Button
            size="slim"
            variant="plain"
            onClick={() => openSuggestReplyModal({ id: item.item_id, subject: item.title })}
            disabled={suggestReplyMutation.isPending && suggestReplyTicket?.id === item.item_id}
          >
            Suggest reply
          </Button>
          <Button
            size="slim"
            variant="plain"
            onClick={() => handleRouteTicket(item.item_id, false)}
            disabled={routeTicketMutation.isPending && routingTicketId === item.item_id}
          >
            Route
          </Button>
        </InlineStack>
      ) : isChatFeedback ? (
        <InlineStack key={`act-chat-${itemId}`} gap="100" wrap={false}>
          <Button
            size="slim"
            variant="plain"
            onClick={() => handleCopyConversationId(item.conversation_id)}
            disabled={!item.conversation_id}
          >
            Copy conversation id
          </Button>
        </InlineStack>
      ) : (
        '—'
      ),
    ];
  });
  const proactiveRows = proactiveSignals.map(signal => [
    <Badge
      key={`severity-${signal.id || signal.shop_domain}`}
      tone={PROACTIVE_SEVERITY_TONE[String(signal.severity || '').toLowerCase()] || 'info'}
    >
      {String(signal.severity || 'info')}
    </Badge>,
    signal.shop_domain || '—',
    signal.title || 'Signal',
    <Text
      key={`detail-${signal.id || signal.shop_domain}`}
      as="span"
      variant="bodySm"
      tone="subdued"
    >
      {signal.details || '—'}
    </Text>,
    signal.type || 'generic',
    signal.detected_at ? new Date(signal.detected_at).toLocaleString() : '—',
    <InlineStack key={`action-${signal.id || signal.shop_domain}`} gap="100" wrap={false}>
      <Button
        size="slim"
        variant="plain"
        onClick={() => handleCreateProactiveOutreach(signal)}
        loading={createProactiveOutreachMutation.isPending}
        disabled={!signal.shop_domain || createProactiveOutreachMutation.isPending}
      >
        Create outreach ticket
      </Button>
    </InlineStack>,
  ]);

  return (
    <PageShell className={`${styles.adminPage} ${styles.adminPageWithHero}`}>
      <AdminPageLayout
        primaryAction={{
          content: 'Refresh',
          icon: RefreshIcon,
          onAction: () => {
            refetch();
            refetchSupportInboxIntegration();
            refetchUnifiedInbox();
            refetchProactiveSignals();
          },
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
                Zendesk / Help Scout sync
              </Text>
              {supportInboxIntegrationLoading ? (
                <Text as="span" variant="bodySm" tone="subdued">
                  Loading…
                </Text>
              ) : null}
            </InlineStack>

            <div className={styles.adminSupportStatusPanel}>
              <InlineStack gap="300" wrap>
                <Select
                  label="Provider"
                  options={SUPPORT_INBOX_PROVIDER_OPTIONS}
                  value={supportInboxProvider}
                  onChange={setSupportInboxProvider}
                />
                <Checkbox
                  label="Enable sync on new tickets"
                  checked={Boolean(supportInboxEnabled)}
                  disabled={supportInboxProvider === 'none'}
                  onChange={setSupportInboxEnabled}
                />
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                New support tickets will be pushed to the selected provider when enabled.
              </Text>
            </div>

            {supportInboxProvider === 'zendesk' && (
              <div className={styles.adminSupportStatusPanel}>
                <Text as="h3" variant="headingSm">
                  Zendesk credentials
                </Text>
                <InlineStack gap="300" wrap>
                  <TextField
                    label="Subdomain"
                    value={supportInboxZendeskSubdomain}
                    onChange={setSupportInboxZendeskSubdomain}
                    autoComplete="off"
                    placeholder="your-company"
                  />
                  <TextField
                    label="Agent email"
                    value={supportInboxZendeskEmail}
                    onChange={setSupportInboxZendeskEmail}
                    autoComplete="off"
                    placeholder="support@company.com"
                  />
                  <TextField
                    label="API token (leave blank to keep current)"
                    value={supportInboxZendeskApiToken}
                    onChange={setSupportInboxZendeskApiToken}
                    autoComplete="off"
                    type="password"
                  />
                </InlineStack>
                <InlineStack gap="200" wrap>
                  <Badge tone={supportInboxConfig?.zendesk?.hasApiToken ? 'success' : 'warning'}>
                    {supportInboxConfig?.zendesk?.hasApiToken
                      ? `Stored token: ${supportInboxConfig?.zendesk?.apiTokenMasked || 'set'}`
                      : 'No token stored'}
                  </Badge>
                </InlineStack>
              </div>
            )}

            {supportInboxProvider === 'helpscout' && (
              <div className={styles.adminSupportStatusPanel}>
                <Text as="h3" variant="headingSm">
                  Help Scout credentials
                </Text>
                <InlineStack gap="300" wrap>
                  <TextField
                    label="Mailbox ID"
                    value={supportInboxHelpScoutMailboxId}
                    onChange={setSupportInboxHelpScoutMailboxId}
                    autoComplete="off"
                    placeholder="123456"
                  />
                  <TextField
                    label="Access token (leave blank to keep current)"
                    value={supportInboxHelpScoutAccessToken}
                    onChange={setSupportInboxHelpScoutAccessToken}
                    autoComplete="off"
                    type="password"
                  />
                </InlineStack>
                <InlineStack gap="200" wrap>
                  <Badge
                    tone={supportInboxConfig?.helpscout?.hasAccessToken ? 'success' : 'warning'}
                  >
                    {supportInboxConfig?.helpscout?.hasAccessToken
                      ? `Stored token: ${supportInboxConfig?.helpscout?.accessTokenMasked || 'set'}`
                      : 'No token stored'}
                  </Badge>
                </InlineStack>
              </div>
            )}

            <InlineStack gap="200" align="end">
              <Button
                variant="secondary"
                onClick={() => refetchSupportInboxIntegration()}
                loading={supportInboxIntegrationLoading}
              >
                Refresh
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveSupportInboxIntegration}
                loading={updateSupportInboxIntegrationMutation.isPending}
              >
                Save integration
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center" wrap>
              <Text as="h2" variant="headingMd">
                Proactive support triggers
              </Text>
              <InlineStack gap="200" blockAlign="center" wrap>
                <Select
                  label="Window"
                  options={[
                    { label: 'Last 7 days', value: '7' },
                    { label: 'Last 14 days', value: '14' },
                    { label: 'Last 30 days', value: '30' },
                  ]}
                  value={proactiveWindowDays}
                  onChange={setProactiveWindowDays}
                />
                <Button
                  size="slim"
                  variant="secondary"
                  onClick={() => refetchProactiveSignals()}
                  loading={proactiveSignalsLoading}
                >
                  Refresh
                </Button>
              </InlineStack>
            </InlineStack>

            <div className={styles.adminUnifiedInboxCounts}>
              <Badge tone="critical">Critical: {Number(proactiveSummary.critical) || 0}</Badge>
              <Badge tone="attention">Warning: {Number(proactiveSummary.warning) || 0}</Badge>
              <Badge tone="info">Info: {Number(proactiveSummary.info) || 0}</Badge>
            </div>

            {proactiveSignalsLoading ? (
              <Text as="p" tone="subdued">
                Loading proactive signals…
              </Text>
            ) : proactiveRows.length === 0 ? (
              <Text as="p" tone="subdued">
                No proactive signals in this window.
              </Text>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text']}
                  headings={[
                    'Severity',
                    'Shop',
                    'Signal',
                    'Details',
                    'Type',
                    'Detected',
                    'Actions',
                  ]}
                  rows={proactiveRows}
                />
              </div>
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
                      <InlineStack
                        align="space-between"
                        blockAlign="start"
                        wrap
                        className={styles.adminSupportChangelogHeaderRow}
                      >
                        <InlineStack
                          gap="200"
                          blockAlign="center"
                          wrap
                          className={styles.adminSupportChangelogMeta}
                        >
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
                        <InlineStack gap="200" wrap className={styles.adminSupportChangelogActions}>
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
            <InlineStack align="space-between" blockAlign="center" wrap>
              <Text as="h2" variant="headingMd">
                Unified inbox
              </Text>
              <InlineStack gap="200" blockAlign="center" wrap>
                <Select
                  label="Source"
                  options={UNIFIED_INBOX_SOURCE_OPTIONS}
                  value={unifiedInboxSource}
                  onChange={setUnifiedInboxSource}
                />
                <Button
                  size="slim"
                  variant="secondary"
                  onClick={() => refetchUnifiedInbox()}
                  loading={unifiedInboxLoading}
                >
                  Refresh
                </Button>
              </InlineStack>
            </InlineStack>

            <div className={styles.adminUnifiedInboxCounts}>
              <Badge tone="success">Tickets: {Number(unifiedInboxCounts.ticket) || 0}</Badge>
              <Badge tone="attention">
                Feature requests: {Number(unifiedInboxCounts.feature_request) || 0}
              </Badge>
              <Badge tone="warning">
                Chat feedback: {Number(unifiedInboxCounts.chat_feedback) || 0}
              </Badge>
            </div>

            {unifiedInboxLoading ? (
              <Text as="p" tone="subdued">
                Loading unified inbox…
              </Text>
            ) : unifiedInboxRows.length === 0 ? (
              <Text as="p" tone="subdued">
                No inbox items for this source filter.
              </Text>
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
                  ]}
                  headings={[
                    'Source',
                    'ID',
                    'Title',
                    'Summary',
                    'Status',
                    'Priority / votes',
                    'Created',
                    'Actions',
                  ]}
                  rows={unifiedInboxRows}
                />
              </div>
            )}
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

      {threadTicket && (
        <Modal
          open
          onClose={closeThreadModal}
          title={`Ticket thread · #${String(threadTicket.id || '').slice(0, 8)}`}
          size="large"
          primaryAction={{
            content: 'Send reply',
            onAction: sendThreadReply,
            loading: threadSending,
            disabled: !String(threadReply || '').trim() || threadLoading,
          }}
          secondaryActions={[
            {
              content: 'Close',
              onAction: closeThreadModal,
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="300" data-modal="support-thread">
              <InlineStack
                align="space-between"
                blockAlign="start"
                wrap
                className={styles.adminSupportThreadHeaderRow}
              >
                <Text as="p" variant="bodySm" tone="subdued">
                  {threadTicket.subject || 'Support request'}
                </Text>
                <InlineStack
                  gap="200"
                  blockAlign="center"
                  wrap
                  className={styles.adminSupportThreadHeaderBadges}
                >
                  {threadTicket.email ? <Badge tone="info">{threadTicket.email}</Badge> : null}
                  <Badge tone="info">{String(threadTicket.status || 'open')}</Badge>
                  <Badge
                    tone={
                      threadStreamState === 'live'
                        ? 'success'
                        : threadStreamState === 'connecting'
                          ? 'attention'
                          : 'warning'
                    }
                  >
                    {threadStreamState === 'live'
                      ? 'Live'
                      : threadStreamState === 'connecting'
                        ? 'Connecting'
                        : threadStreamState === 'reconnecting'
                          ? 'Reconnecting'
                          : 'Offline'}
                  </Badge>
                  <Badge tone={threadPeerOnline ? 'success' : 'new'}>
                    {threadPeerOnline ? 'Customer online' : 'Customer away'}
                  </Badge>
                </InlineStack>
              </InlineStack>

              {threadLoading ? (
                <Text as="p" tone="subdued">
                  Loading thread…
                </Text>
              ) : (
                <div className={styles.adminSupportThreadMessages}>
                  {threadMessages.length === 0 ? (
                    <Text as="p" variant="bodySm" tone="subdued">
                      No thread messages yet.
                    </Text>
                  ) : (
                    threadMessages.map(item => {
                      const senderType = String(item?.sender_type || 'user').toLowerCase();
                      const isUser = senderType === 'user';
                      const label = isUser
                        ? item?.sender_label || 'Customer'
                        : senderType === 'admin'
                          ? item?.sender_label || 'Support Agent'
                          : senderType === 'ai'
                            ? 'AI'
                            : item?.sender_label || 'System';
                      return (
                        <div
                          key={item.id}
                          className={
                            isUser
                              ? styles.adminSupportThreadBubbleUser
                              : styles.adminSupportThreadBubbleAdmin
                          }
                        >
                          <Text as="p" variant="bodySm" fontWeight="semibold">
                            {label}
                          </Text>
                          <Text as="p" variant="bodySm">
                            {item?.message || ''}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {item?.created_at ? new Date(item.created_at).toLocaleString() : '—'}
                          </Text>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {threadError ? (
                <Text as="p" variant="bodySm" tone="critical">
                  {threadError}
                </Text>
              ) : null}

              {threadPeerTyping ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  Customer is typing…
                </Text>
              ) : null}

              {threadPeerLastReadAt ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  Seen by customer {new Date(threadPeerLastReadAt).toLocaleTimeString()}
                </Text>
              ) : threadPeerDeliveredAt ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  Delivered to customer {new Date(threadPeerDeliveredAt).toLocaleTimeString()}
                </Text>
              ) : null}

              <TextField
                label="Reply to customer"
                value={threadReply}
                onChange={handleThreadReplyChange}
                multiline={4}
                maxLength={5000}
                autoComplete="off"
                showCharacterCount
                placeholder="Type your support reply…"
              />
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}

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
            <BlockStack gap="300" data-modal="support-suggest-reply">
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
