/**
 * Support page: Contact us (form), My requests (tickets), Ask AI (chat).
 * See docs/CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Box,
  Select,
  Banner,
  List,
  Badge,
  Icon,
  Spinner,
  Modal,
} from '@shopify/polaris';
import {
  BookIcon,
  ChatIcon,
  EmailIcon,
  ImageIcon,
  ListBulletedIcon,
  SendIcon,
  StoreIcon,
} from '@shopify/polaris-icons';
import { PageShell } from '../Shared';
import { ROUTES } from '../../constants';
import { apiGet, apiPost } from '../../services/api';
import { getProfile } from '../../services/profileApi';
import { subscribeSupportTicketRealtime } from '../../services/supportRealtime';
import { formatReplyContent, SUGGESTED_PROMPTS, CHAT_PLACEHOLDER } from '../../utils/supportFormat';
import styles from './Support.module.css';

const CATEGORIES_FALLBACK = [
  { label: 'Technical / Script', value: 'technical' },
  { label: 'Billing', value: 'billing' },
  { label: 'Feature request', value: 'feature_request' },
  { label: 'Script / Install help', value: 'script_install' },
  { label: 'Other', value: 'other' },
];

const SUPPORT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHAT_ESCALATION_CATEGORY = 'technical';
const FEATURE_REQUEST_STATUS_OPTIONS = [
  { label: 'All statuses', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Planned', value: 'planned' },
  { label: 'In progress', value: 'in_progress' },
  { label: 'Shipped', value: 'shipped' },
];
const FEATURE_REQUEST_STATUS_TONE = {
  open: 'attention',
  planned: 'info',
  in_progress: 'success',
  shipped: 'success',
  closed: 'new',
  rejected: 'critical',
};
const SUPPORT_STATUS_TONE = {
  operational: 'success',
  degraded: 'warning',
  maintenance: 'info',
  outage: 'critical',
};
const SUPPORT_STATUS_LABEL = {
  operational: 'Operational',
  degraded: 'Degraded',
  maintenance: 'Maintenance',
  outage: 'Outage',
};
const SUPPORT_PANEL_META = {
  0: {
    title: 'ContactTeam',
    description:
      'Send a focused request to the RipX team. Best for account, billing, or detailed investigation.',
    eyebrow: 'Human support',
  },
  1: {
    title: 'MyRequests',
    description: 'Review existing conversations, check status, and continue support threads.',
    eyebrow: 'Ticket history',
  },
  2: {
    title: 'SupportAI',
    description: 'Ask documentation and setup questions. For store-aware checks, open RipX Agent.',
    eyebrow: 'Knowledge assistant',
  },
  3: {
    title: 'FeatureRequests',
    description: 'Share product ideas and vote on improvements that should move up the roadmap.',
    eyebrow: 'Product feedback',
  },
  4: {
    title: 'StatusLog',
    description:
      'Check support availability, incidents, maintenance notes, and recent changelog updates.',
    eyebrow: 'Operations',
  },
  5: {
    title: 'FAQ',
    description: 'Open quick answers for common setup, testing, and troubleshooting questions.',
    eyebrow: 'Instant answers',
  },
};
const SUPPORT_FAQS = [
  {
    id: 'connect-store',
    question: 'How do I connect a Shopify store?',
    answer:
      'Open Domains, choose your Shopify store, then complete the Shopify install/authentication flow. After install, return to App settings > Installation and verify the app embed or script status.',
  },
  {
    id: 'test-not-showing',
    question: 'Why is my test not showing on the live store?',
    answer:
      'Check that the test is running, the store script or app embed is verified, targeting rules match the page, and preview/cache settings are not blocking visitor assignment.',
  },
  {
    id: 'checkout-tests',
    question: 'How do checkout or price tests work?',
    answer:
      'Checkout and price tests need Shopify-compatible checkout functions or checkout UI setup. RipX assigns variants on storefront/cart context, then checkout functions or checkout UI read that assigned variant.',
  },
  {
    id: 'agent-vs-support-ai',
    question: 'What is the difference between SupportAI and RipX Agent?',
    answer:
      'SupportAI answers general docs and setup questions. RipX Agent is store-aware and can inspect the current store, test readiness, diagnostics, and propose safe confirmed actions.',
  },
  {
    id: 'human-support',
    question: 'How do I contact a human?',
    answer:
      'Use ContactTeam to create a support request. If you are signed in, you can track replies from MyRequests and continue the thread from the Support page.',
  },
];
const CHAT_LANGUAGE_OPTIONS = [
  { label: 'Auto-detect', value: 'auto' },
  { label: 'English', value: 'en' },
  { label: 'Spanish', value: 'es' },
  { label: 'French', value: 'fr' },
  { label: 'German', value: 'de' },
  { label: 'Portuguese', value: 'pt' },
  { label: 'Italian', value: 'it' },
  { label: 'Dutch', value: 'nl' },
  { label: 'Bengali', value: 'bn' },
  { label: 'Hindi', value: 'hi' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Korean', value: 'ko' },
  { label: 'Chinese (Simplified)', value: 'zh' },
  { label: 'Arabic', value: 'ar' },
];

function buildEscalationTranscript(messages, limit = 12) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return '';
  }
  return messages
    .slice(-Math.max(1, limit))
    .map(m => {
      const role = m?.role === 'assistant' ? 'RipX' : 'User';
      const content = typeof m?.content === 'string' ? m.content.trim() : '';
      if (!content) {
        return null;
      }
      return `${role}: ${content}`;
    })
    .filter(Boolean)
    .join('\n');
}

function Support() {
  const [selectedTab, setSelectedTab] = useState(0);
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('other');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState(null);
  const [ticketStatusFilter, setTicketStatusFilter] = useState('all'); // 'all' | 'open' | 'closed'
  const [threadTicket, setThreadTicket] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState('');
  const [threadReply, setThreadReply] = useState('');
  const [threadSending, setThreadSending] = useState(false);
  const [threadStreamState, setThreadStreamState] = useState('idle');
  const [threadPeerTyping, setThreadPeerTyping] = useState(false);
  const [threadPeerLastReadAt, setThreadPeerLastReadAt] = useState(null);
  const [threadPeerOnline, setThreadPeerOnline] = useState(false);
  const [threadPeerDeliveredAt, setThreadPeerDeliveredAt] = useState(null);
  const [categories, setCategories] = useState(CATEGORIES_FALLBACK);
  // Ask AI state
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [aiNotConfigured, setAiNotConfigured] = useState(false);
  const [chatLanguage, setChatLanguage] = useState('auto');
  const [chatConversationId, setChatConversationId] = useState(null);
  const [chatFeedbackByMessage, setChatFeedbackByMessage] = useState({});
  const [chatFeedbackSubmitting, setChatFeedbackSubmitting] = useState(false);
  const [chatEscalating, setChatEscalating] = useState(false);
  const [chatEscalationResult, setChatEscalationResult] = useState(null);
  const [featureRequestTitle, setFeatureRequestTitle] = useState('');
  const [featureRequestDetails, setFeatureRequestDetails] = useState('');
  const [openFaqId, setOpenFaqId] = useState(SUPPORT_FAQS[0]?.id || null);
  const [featureRequests, setFeatureRequests] = useState([]);
  const [featureRequestsLoading, setFeatureRequestsLoading] = useState(true);
  const [featureRequestsSubmitting, setFeatureRequestsSubmitting] = useState(false);
  const [featureRequestsError, setFeatureRequestsError] = useState(null);
  const [featureRequestStatusFilter, setFeatureRequestStatusFilter] = useState('all');
  const [featureRequestVoteLoadingById, setFeatureRequestVoteLoadingById] = useState({});
  const [supportStatus, setSupportStatus] = useState({
    status: 'operational',
    message: 'All systems operational',
    updated_at: null,
  });
  const [supportStatusLoading, setSupportStatusLoading] = useState(true);
  const [supportChangelog, setSupportChangelog] = useState([]);
  const [supportChangelogLoading, setSupportChangelogLoading] = useState(true);
  const [supportStatusError, setSupportStatusError] = useState(null);
  const chatScrollRef = useRef(null);
  const mountedRef = useRef(true);
  const chatInputRef = useRef('');
  const threadRealtimeUnsubscribeRef = useRef(null);
  const threadTypingTimeoutRef = useRef(null);
  chatInputRef.current = chatInput;

  const latestAssistantMessage =
    [...chatMessages].reverse().find(messageItem => messageItem?.role === 'assistant') || null;
  const latestAssistantKey =
    latestAssistantMessage?.serverMessageId || latestAssistantMessage?.id || null;
  const latestAssistantFeedback =
    latestAssistantKey && chatFeedbackByMessage[latestAssistantKey]
      ? chatFeedbackByMessage[latestAssistantKey]
      : null;

  const openRipxAgent = useCallback((prompt = '') => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('ripx-agent-open', {
        detail: { prompt },
      })
    );
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Scroll chat to bottom when messages or loading state change
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatLoading]);

  useEffect(() => {
    document.title = 'Support - RipX';
    return () => {
      document.title = 'RipX';
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiGet('/support/categories')
      .then(res => {
        if (cancelled) return;
        const data = res?.data;
        if (data?.success && Array.isArray(data.categories) && data.categories.length > 0) {
          const next = data.categories.map(c => ({ value: c.value, label: c.label || c.value }));
          setCategories(next);
          setCategory(prev => {
            const hasPrev = next.some(opt => opt.value === prev);
            return hasPrev ? prev : next[0]?.value || 'other';
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then(data => {
        if (cancelled) return;
        const profileEmail =
          data?.profile?.email || data?.account?.billingEmail || data?.account?.shopDomain;
        if (profileEmail && typeof profileEmail === 'string') {
          setEmail(prev => (prev ? prev : profileEmail.trim()));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchTickets = useCallback((getIsCancelled = () => false) => {
    setTicketsError(null);
    setTicketsLoading(true);
    apiGet('/support/tickets')
      .then(res => {
        if (getIsCancelled()) return;
        const data = res?.data;
        if (data?.success && Array.isArray(data.tickets)) {
          setTickets(data.tickets);
        }
      })
      .catch(err => {
        if (getIsCancelled()) return;
        setTickets([]);
        const status = err?.response?.status;
        setTicketsError(status === 401 ? 'sign_in' : 'error');
      })
      .finally(() => {
        if (!getIsCancelled()) {
          setTicketsLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchTickets(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchTickets]);

  const fetchFeatureRequests = useCallback(
    (getIsCancelled = () => false) => {
      setFeatureRequestsLoading(true);
      setFeatureRequestsError(null);
      const params = {};
      if (featureRequestStatusFilter && featureRequestStatusFilter !== 'all') {
        params.status = featureRequestStatusFilter;
      }
      apiGet('/support/feature-requests', params)
        .then(res => {
          if (getIsCancelled()) return;
          const data = res?.data ?? {};
          const list = Array.isArray(data.feature_requests) ? data.feature_requests : [];
          setFeatureRequests(list);
        })
        .catch(err => {
          if (getIsCancelled()) return;
          const status = err?.response?.status;
          if (status === 401) {
            setFeatureRequestsError('sign_in');
          } else {
            setFeatureRequestsError(
              err?.response?.data?.error || err?.message || 'Could not load feature requests'
            );
          }
          setFeatureRequests([]);
        })
        .finally(() => {
          if (!getIsCancelled()) {
            setFeatureRequestsLoading(false);
          }
        });
    },
    [featureRequestStatusFilter]
  );

  useEffect(() => {
    let cancelled = false;
    fetchFeatureRequests(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchFeatureRequests]);

  const fetchStatusAndChangelog = useCallback((getIsCancelled = () => false) => {
    setSupportStatusLoading(true);
    setSupportChangelogLoading(true);
    setSupportStatusError(null);
    Promise.all([apiGet('/support/status'), apiGet('/support/changelog', { limit: 20 })])
      .then(([statusRes, changelogRes]) => {
        if (getIsCancelled()) return;
        const statusData = statusRes?.data || {};
        const statusValue = String(statusData.status || 'operational')
          .trim()
          .toLowerCase();
        setSupportStatus({
          status: statusValue || 'operational',
          message:
            typeof statusData.message === 'string' && statusData.message.trim()
              ? statusData.message.trim()
              : 'All systems operational',
          updated_at: statusData.updated_at || null,
        });
        const changelogData = changelogRes?.data || {};
        const list = Array.isArray(changelogData.changelog) ? changelogData.changelog : [];
        setSupportChangelog(list);
      })
      .catch(err => {
        if (getIsCancelled()) return;
        setSupportStatusError(
          err?.response?.data?.error || err?.message || 'Could not load status and changelog'
        );
        setSupportChangelog([]);
      })
      .finally(() => {
        if (!getIsCancelled()) {
          setSupportStatusLoading(false);
          setSupportChangelogLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchStatusAndChangelog(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchStatusAndChangelog]);

  const upsertThreadMessage = useCallback(messageItem => {
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
  }, []);

  const closeTicketThread = useCallback(() => {
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
    setThreadError('');
    setThreadLoading(false);
    setThreadSending(false);
    setThreadStreamState('idle');
    setThreadPeerTyping(false);
    setThreadPeerLastReadAt(null);
    setThreadPeerOnline(false);
    setThreadPeerDeliveredAt(null);
  }, []);

  const openTicketThread = useCallback(async ticket => {
    const ticketId = String(ticket?.id || '').trim();
    if (!ticketId) {
      return;
    }
    setThreadTicket({
      id: ticketId,
      subject: ticket?.subject || 'Support request',
      status: ticket?.status || 'open',
    });
    setThreadMessages([]);
    setThreadReply('');
    setThreadError('');
    setThreadLoading(true);
    setThreadStreamState('connecting');
    try {
      const res = await apiGet(`/support/tickets/${ticketId}/thread`);
      if (!mountedRef.current) {
        return;
      }
      const data = res?.data ?? {};
      if (!data?.success) {
        setThreadError(data?.error || 'Could not load ticket thread');
        return;
      }
      setThreadTicket(prev => ({
        ...prev,
        ...(data.ticket || {}),
        id: data?.ticket?.id || prev?.id || ticketId,
      }));
      setThreadMessages(Array.isArray(data.messages) ? data.messages : []);
      setTickets(prev =>
        prev.map(item =>
          item.id === ticketId
            ? {
                ...item,
                unread_count: 0,
                has_unread_support_reply: false,
                user_last_read_at: data?.read_state?.last_read_at || item.user_last_read_at || null,
              }
            : item
        )
      );
    } catch (err) {
      if (!mountedRef.current) {
        return;
      }
      setThreadError(err?.response?.data?.error || err?.message || 'Could not load ticket thread');
      setThreadStreamState('offline');
    } finally {
      if (mountedRef.current) {
        setThreadLoading(false);
      }
    }
  }, []);

  const sendThreadReply = useCallback(async () => {
    const ticketId = String(threadTicket?.id || '').trim();
    const messageText = String(threadReply || '').trim();
    if (!ticketId || !messageText || threadSending) {
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
      const res = await apiPost(`/support/tickets/${ticketId}/thread/reply`, {
        message: messageText,
      });
      if (!mountedRef.current) {
        return;
      }
      const payload = res?.data ?? {};
      if (payload?.message?.id) {
        upsertThreadMessage(payload.message);
        setThreadPeerTyping(false);
        setTickets(prev =>
          prev.map(item =>
            item.id === ticketId
              ? {
                  ...item,
                  updated_at: payload.message.created_at || item.updated_at,
                  unread_count: 0,
                  has_unread_support_reply: false,
                }
              : item
          )
        );
      }
      setThreadReply('');
    } catch (err) {
      if (!mountedRef.current) {
        return;
      }
      setThreadError(err?.response?.data?.error || err?.message || 'Could not send reply');
    } finally {
      if (mountedRef.current) {
        setThreadSending(false);
      }
    }
  }, [threadTicket?.id, threadReply, threadSending, upsertThreadMessage]);

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
      audience: 'user',
      onState: state => {
        if (mountedRef.current) setThreadStreamState(state);
      },
      onMessage: message => {
        upsertThreadMessage(message);
        setThreadPeerTyping(false);
        if (message.sender_type === 'admin') {
          setTickets(prev =>
            prev.map(item =>
              item.id === ticketId
                ? {
                    ...item,
                    unread_count: 0,
                    has_unread_support_reply: false,
                    latest_admin_reply_at: message.created_at || item.latest_admin_reply_at,
                  }
                : item
            )
          );
        }
      },
      onError: error => {
        if (mountedRef.current) setThreadError(error);
      },
      onTyping: event => {
        if (event.audience === 'admin') {
          setThreadPeerTyping(event.isTyping);
        }
      },
      onRead: event => {
        if (event.audience === 'admin') {
          setThreadPeerLastReadAt(event.readState?.last_read_at || event.timestamp || null);
        }
      },
      onPresence: presence => {
        setThreadPeerOnline(Boolean(presence.hasAdmin));
      },
      onDelivered: event => {
        if (event.senderAudience === 'user' && event.deliveredToAdmin) {
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
  }, [threadTicket?.id, upsertThreadMessage]);

  const handleThreadReplyChange = useCallback(value => {
    setThreadReply(value);
    threadRealtimeUnsubscribeRef.current?.sendTyping?.(Boolean(String(value || '').trim()));
    if (threadTypingTimeoutRef.current) {
      clearTimeout(threadTypingTimeoutRef.current);
    }
    threadTypingTimeoutRef.current = setTimeout(() => {
      threadRealtimeUnsubscribeRef.current?.sendTyping?.(false);
    }, 1800);
  }, []);

  const handleSubmit = async e => {
    e?.preventDefault();
    if (!email.trim() || !subject.trim() || !message.trim()) return;
    const submittedSubject = subject.trim();
    const submittedCategory = category || 'other';
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await apiPost('/support/ticket', {
        email: email.trim(),
        subject: submittedSubject,
        category: submittedCategory,
        message: message.trim(),
      });
      if (!mountedRef.current) return;
      const data = res?.data ?? res;
      if (data?.success) {
        setSubmitResult({ success: true, ticketId: data.ticket_id });
        setSubject('');
        setMessage('');
        const createdCategory = String(data?.category || submittedCategory || 'other').trim();
        const createdCategorySource = String(data?.category_source || 'manual')
          .trim()
          .toLowerCase();
        setTickets(prev => [
          {
            id: data.ticket_id,
            subject: submittedSubject,
            category: createdCategory || submittedCategory,
            category_source: createdCategorySource || 'manual',
            status: 'open',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            unread_count: 0,
            has_unread_support_reply: false,
          },
          ...prev,
        ]);
      } else {
        setSubmitResult({ success: false, error: data?.error || 'Request failed' });
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err?.response?.data?.error || err?.message || 'Network error';
      setSubmitResult({ success: false, error: msg });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleCreateFeatureRequest = useCallback(
    async e => {
      e?.preventDefault();
      if (!featureRequestTitle.trim() || featureRequestsSubmitting) {
        return;
      }
      setFeatureRequestsSubmitting(true);
      setFeatureRequestsError(null);
      try {
        const res = await apiPost('/support/feature-requests', {
          title: featureRequestTitle.trim(),
          details: featureRequestDetails.trim(),
          category: 'feature_request',
        });
        if (!mountedRef.current) return;
        const data = res?.data ?? {};
        const created = data?.feature_request;
        if (created) {
          setFeatureRequestTitle('');
          setFeatureRequestDetails('');
          setFeatureRequests(prev => [created, ...prev]);
        } else {
          setFeatureRequestsError('Could not create feature request');
        }
      } catch (err) {
        if (!mountedRef.current) return;
        if (err?.response?.status === 401) {
          setFeatureRequestsError('sign_in');
        } else {
          setFeatureRequestsError(
            err?.response?.data?.error || err?.message || 'Could not create feature request'
          );
        }
      } finally {
        if (mountedRef.current) {
          setFeatureRequestsSubmitting(false);
        }
      }
    },
    [featureRequestTitle, featureRequestDetails, featureRequestsSubmitting]
  );

  const handleVoteFeatureRequest = useCallback(
    async (requestId, value) => {
      if (!requestId || featureRequestVoteLoadingById[requestId]) {
        return;
      }
      setFeatureRequestVoteLoadingById(prev => ({ ...prev, [requestId]: true }));
      setFeatureRequestsError(null);
      try {
        const res = await apiPost(`/support/feature-requests/${requestId}/vote`, { value });
        if (!mountedRef.current) return;
        const updated = res?.data?.feature_request;
        if (updated?.id) {
          setFeatureRequests(prev =>
            prev.map(item =>
              item.id === updated.id
                ? {
                    ...item,
                    vote_count: updated.vote_count ?? item.vote_count,
                    my_vote: updated.my_vote ?? item.my_vote ?? 0,
                    status: updated.status ?? item.status,
                  }
                : item
            )
          );
        }
      } catch (err) {
        if (!mountedRef.current) return;
        if (err?.response?.status === 401) {
          setFeatureRequestsError('sign_in');
        } else {
          setFeatureRequestsError(err?.response?.data?.error || err?.message || 'Could not vote');
        }
      } finally {
        if (mountedRef.current) {
          setFeatureRequestVoteLoadingById(prev => ({ ...prev, [requestId]: false }));
        }
      }
    },
    [featureRequestVoteLoadingById]
  );

  const sendChatMessage = useCallback(
    async textOverride => {
      const text = (
        textOverride !== undefined && textOverride !== null
          ? String(textOverride)
          : (chatInputRef.current ?? '')
      ).trim();
      if (!text || chatLoading) return;
      setChatInput('');
      setChatEscalationResult(null);
      setChatMessages(prev => [
        ...prev,
        {
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'user',
          content: text,
        },
      ]);
      setChatLoading(true);
      setAiNotConfigured(false);
      try {
        const messagesForApi = chatMessages.map(m => ({ role: m.role, content: m.content }));
        const payload = { message: text, messages: messagesForApi, language: chatLanguage };
        if (chatConversationId) payload.conversation_id = chatConversationId;
        const res = await apiPost('/support/chat', payload);
        if (!mountedRef.current) return;
        const data = res?.data ?? res;
        if (data?.conversation_id) setChatConversationId(data.conversation_id);
        let reply = data?.reply || "I couldn't get a response. Please try the **Contact us** form.";
        if (reply.includes("isn't configured") || reply.includes("isn't configured yet")) {
          setAiNotConfigured(true);
          reply =
            "The AI assistant isn't set up for this environment. Use **Contact us** for help.";
        }
        setChatMessages(prev => [
          ...prev,
          {
            id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            serverMessageId: data?.assistant_message_id || null,
            role: 'assistant',
            content: reply,
          },
        ]);
      } catch (err) {
        if (!mountedRef.current) return;
        setChatMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content:
              'Something went wrong. Please use the **Contact us** form and we&apos;ll help you directly.',
          },
        ]);
      } finally {
        if (mountedRef.current) setChatLoading(false);
      }
    },
    [chatLoading, chatMessages, chatConversationId, chatLanguage]
  );

  const submitChatFeedback = useCallback(
    async helpfulValue => {
      if (!latestAssistantKey || !chatConversationId || chatFeedbackSubmitting) {
        return;
      }
      const helpful = !!helpfulValue;
      setChatFeedbackSubmitting(true);
      setChatFeedbackByMessage(prev => ({
        ...prev,
        [latestAssistantKey]: {
          helpful,
          pending: true,
          error: '',
        },
      }));
      try {
        await apiPost('/support/chat-feedback', {
          conversation_id: chatConversationId,
          helpful,
          assistant_message_id: latestAssistantMessage?.serverMessageId || undefined,
        });
        if (!mountedRef.current) return;
        setChatFeedbackByMessage(prev => ({
          ...prev,
          [latestAssistantKey]: {
            helpful,
            pending: false,
            error: '',
            savedAt: new Date().toISOString(),
          },
        }));
      } catch (err) {
        if (!mountedRef.current) return;
        const messageFromApi = err?.response?.data?.error || 'Could not save feedback';
        setChatFeedbackByMessage(prev => ({
          ...prev,
          [latestAssistantKey]: {
            helpful,
            pending: false,
            error: messageFromApi,
          },
        }));
      } finally {
        if (mountedRef.current) {
          setChatFeedbackSubmitting(false);
        }
      }
    },
    [
      chatConversationId,
      chatFeedbackSubmitting,
      latestAssistantKey,
      latestAssistantMessage?.serverMessageId,
    ]
  );

  const escalateChatToTicket = useCallback(async () => {
    if (chatEscalating || chatLoading) {
      return;
    }

    const rawEmail = typeof email === 'string' ? email.trim() : '';
    if (!rawEmail || !SUPPORT_EMAIL_REGEX.test(rawEmail)) {
      setSelectedTab(0);
      setSubmitResult({
        success: false,
        error: 'Add a valid email in Contact us first, then try escalation again.',
      });
      return;
    }

    const latestUserMessage =
      [...chatMessages].reverse().find(messageItem => messageItem?.role === 'user')?.content || '';
    const subjectSeed = String(latestUserMessage || 'Need help from support')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    const transcript = buildEscalationTranscript(chatMessages);
    const helpfulLabel = latestAssistantFeedback
      ? latestAssistantFeedback.helpful
        ? 'yes'
        : 'no'
      : 'not provided';
    const escalationMessage = [
      'Escalated from Support Ask AI chat.',
      `Conversation ID: ${chatConversationId || 'not_available'}`,
      `Latest AI answer helpful: ${helpfulLabel}`,
      '',
      'Recent transcript:',
      transcript || '(no transcript captured)',
    ].join('\n');

    setChatEscalationResult(null);
    setChatEscalating(true);
    try {
      if (latestAssistantMessage && latestAssistantFeedback?.helpful !== false) {
        void submitChatFeedback(false);
      }
      const res = await apiPost('/support/ticket', {
        email: rawEmail,
        subject: `AI chat escalation: ${subjectSeed || 'Need support'}`,
        category: CHAT_ESCALATION_CATEGORY,
        message: escalationMessage,
      });
      if (!mountedRef.current) return;
      const data = res?.data ?? res;
      if (data?.success) {
        setChatEscalationResult({
          success: true,
          ticketId: data.ticket_id,
          message: `Escalated successfully. Ticket #${String(data.ticket_id || '').slice(0, 8)} created.`,
        });
        setTickets(prev => [
          {
            id: data.ticket_id,
            subject: `AI chat escalation: ${subjectSeed || 'Need support'}`,
            category: CHAT_ESCALATION_CATEGORY,
            status: 'open',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            unread_count: 0,
            has_unread_support_reply: false,
          },
          ...prev,
        ]);
      } else {
        setChatEscalationResult({
          success: false,
          message: data?.error || 'Could not escalate this chat right now.',
        });
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setChatEscalationResult({
        success: false,
        message:
          err?.response?.data?.error || err?.message || 'Could not escalate this chat right now.',
      });
    } finally {
      if (mountedRef.current) {
        setChatEscalating(false);
      }
    }
  }, [
    chatEscalating,
    chatLoading,
    email,
    chatMessages,
    latestAssistantFeedback,
    latestAssistantMessage,
    chatConversationId,
    submitChatFeedback,
  ]);

  const clearChat = useCallback(() => {
    setChatMessages([]);
    setChatInput('');
    setChatConversationId(null);
    setChatFeedbackByMessage({});
    setChatFeedbackSubmitting(false);
    setChatEscalating(false);
    setChatEscalationResult(null);
  }, []);

  const tabs = [
    {
      id: 'contact',
      content: 'Contact us',
      accessibilityLabel: 'Contact us',
      panelID: 'contact-panel',
    },
    {
      id: 'requests',
      content: 'My requests',
      accessibilityLabel: 'My requests',
      panelID: 'requests-panel',
    },
    {
      id: 'ask-ai',
      content: 'SupportAI',
      accessibilityLabel: 'SupportAI',
      panelID: 'ask-ai-panel',
    },
    {
      id: 'feature-requests',
      content: 'Feature requests',
      accessibilityLabel: 'Feature requests',
      panelID: 'feature-requests-panel',
    },
    {
      id: 'status-changelog',
      content: 'Status & changelog',
      accessibilityLabel: 'Status and changelog',
      panelID: 'status-changelog-panel',
    },
    {
      id: 'faq',
      content: 'FAQ',
      accessibilityLabel: 'FAQ',
      panelID: 'faq-panel',
    },
  ];
  const activePanelMeta = SUPPORT_PANEL_META[selectedTab] || SUPPORT_PANEL_META[0];

  return (
    <PageShell className={styles.supportPage}>
      <Page
        title="Support"
        titleHidden
        backAction={{ content: 'Home', url: ROUTES.USER_PANEL }}
        fullWidth
      >
        <BlockStack gap="600">
          <section className={styles.hero} aria-labelledby="support-hero-title">
            <div className={styles.heroHeaderRow}>
              <span className={styles.heroBadge}>Help center</span>
              <Badge tone={SUPPORT_STATUS_TONE[supportStatus.status] || 'info'}>
                {SUPPORT_STATUS_LABEL[supportStatus.status] || 'Status'}{' '}
                {supportStatusLoading ? 'checking' : 'live'}
              </Badge>
            </div>
            <h1 id="support-hero-title" className={styles.heroTitle}>
              <span className={styles.heroTitleGradient}>Support that knows your store.</span>
            </h1>
            <p className={styles.heroSubtext}>
              Ask SupportAI for docs help, use RipX Agent in the app for store-aware diagnostics, or
              send the team a request with context attached.
            </p>
            <div className={styles.heroSignalGrid} aria-label="Support channels">
              <span>
                <Icon source={ChatIcon} tone="base" />
                AI answers
              </span>
              <span>
                <Icon source={StoreIcon} tone="base" />
                Store diagnostics
              </span>
              <span>
                <Icon source={EmailIcon} tone="base" />
                Human follow-up
              </span>
            </div>
          </section>

          <nav className={styles.quickLinks} aria-label="Popular topics">
            <span className={styles.quickLinksLabel}>Popular topics</span>
            <div className={styles.quickLinksList}>
              <a
                href={`${ROUTES.DOCS}#support-agent`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.quickLinkPill}
              >
                <Icon source={BookIcon} tone="base" />
                Documentation
              </a>
              <Link to={ROUTES.USER_PANEL} className={styles.quickLinkPill}>
                Dashboard
              </Link>
            </div>
          </nav>

          <div className={styles.supportPathGrid} role="list" aria-label="Support options">
            <button
              type="button"
              aria-selected={selectedTab === 2}
              className={`${styles.supportPathCard} ${styles.supportPathCardPrimary} ${
                selectedTab === 2 ? styles.supportPathCardActive : ''
              }`}
              onClick={() => setSelectedTab(2)}
            >
              <span className={styles.supportPathIcon}>
                <Icon source={ChatIcon} tone="base" />
              </span>
              <span className={styles.supportPathCopy}>
                <strong>SupportAI</strong>
                <span>Docs and setup answers from the support knowledge base.</span>
              </span>
            </button>
            <button
              type="button"
              aria-label="Open RipX Agent"
              className={`${styles.supportPathCard} ${styles.supportPathCardAgent}`}
              onClick={() => openRipxAgent('Check my current store setup and summarize blockers.')}
            >
              <span className={styles.supportPathIcon}>
                <Icon source={StoreIcon} tone="base" />
              </span>
              <span className={styles.supportPathCopy}>
                <strong>RipXAgent</strong>
                <span>Store-aware diagnostics and confirmed actions.</span>
              </span>
            </button>
            <button
              type="button"
              aria-selected={selectedTab === 0}
              className={`${styles.supportPathCard} ${
                selectedTab === 0 ? styles.supportPathCardActive : ''
              }`}
              onClick={() => setSelectedTab(0)}
            >
              <span className={styles.supportPathIcon}>
                <Icon source={EmailIcon} tone="base" />
              </span>
              <span className={styles.supportPathCopy}>
                <strong>ContactTeam</strong>
                <span>Send a support request for human follow-up.</span>
              </span>
            </button>
            <button
              type="button"
              aria-selected={selectedTab === 1}
              className={`${styles.supportPathCard} ${
                selectedTab === 1 ? styles.supportPathCardActive : ''
              }`}
              onClick={() => setSelectedTab(1)}
            >
              <span className={styles.supportPathIcon}>
                <Icon source={ListBulletedIcon} tone="base" />
              </span>
              <span className={styles.supportPathCopy}>
                <strong>MyRequests</strong>
                <span>Track open and resolved conversations.</span>
              </span>
            </button>
            <button
              type="button"
              aria-selected={selectedTab === 3}
              className={`${styles.supportPathCard} ${
                selectedTab === 3 ? styles.supportPathCardActive : ''
              }`}
              onClick={() => setSelectedTab(3)}
            >
              <span className={styles.supportPathIcon}>
                <Icon source={ListBulletedIcon} tone="base" />
              </span>
              <span className={styles.supportPathCopy}>
                <strong>FeatureRequests</strong>
                <span>Share ideas and vote on roadmap items.</span>
              </span>
            </button>
            <button
              type="button"
              aria-selected={selectedTab === 4}
              className={`${styles.supportPathCard} ${
                selectedTab === 4 ? styles.supportPathCardActive : ''
              }`}
              onClick={() => setSelectedTab(4)}
            >
              <span className={styles.supportPathIcon}>
                <Icon source={BookIcon} tone="base" />
              </span>
              <span className={styles.supportPathCopy}>
                <strong>StatusLog</strong>
                <span>View support status and product updates.</span>
              </span>
            </button>
            <button
              type="button"
              aria-selected={selectedTab === 5}
              className={`${styles.supportPathCard} ${
                selectedTab === 5 ? styles.supportPathCardActive : ''
              }`}
              onClick={() => setSelectedTab(5)}
            >
              <span className={styles.supportPathIcon}>
                <Icon source={BookIcon} tone="base" />
              </span>
              <span className={styles.supportPathCopy}>
                <strong>FAQ</strong>
                <span>Quick answers without waiting for AI or support.</span>
              </span>
            </button>
          </div>

          <section className={styles.contentSection} aria-label="Support options">
            <div className={styles.supportPanelHeader}>
              <div>
                <span className={styles.supportPanelEyebrow}>{activePanelMeta.eyebrow}</span>
                <h2>{activePanelMeta.title}</h2>
                <p>{activePanelMeta.description}</p>
              </div>
              <Badge tone={SUPPORT_STATUS_TONE[supportStatus.status] || 'info'}>
                {SUPPORT_STATUS_LABEL[supportStatus.status] || 'Status'}
              </Badge>
            </div>
            <div
              className={styles.tabPanelContent}
              role="tabpanel"
              aria-label={`${tabs[selectedTab]?.content || 'Support'} panel`}
              id={tabs[selectedTab]?.panelID}
            >
              <Box paddingBlockStart="200">
                {selectedTab === 0 && (
                  <Card>
                    <BlockStack gap="400">
                      <div className={styles.tabCardHeader}>
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={EmailIcon} tone="base" />
                          <Text as="h2" variant="headingMd">
                            Contact us
                          </Text>
                        </InlineStack>
                      </div>
                      <Text as="p" variant="bodySm" tone="subdued" className={styles.tabCardIntro}>
                        Send a message and we&apos;ll reply by email, usually within 24 hours.
                      </Text>
                      <form className={styles.tabCardForm} onSubmit={handleSubmit}>
                        <BlockStack gap="400">
                          <TextField
                            label="Email"
                            type="email"
                            value={email}
                            onChange={setEmail}
                            placeholder="you@example.com"
                            autoComplete="email"
                            required
                          />
                          <Select
                            label="Category"
                            options={categories}
                            value={category}
                            onChange={setCategory}
                            helpText="If left as Other, we auto-classify based on your subject and message."
                          />
                          <TextField
                            label="Subject"
                            value={subject}
                            onChange={setSubject}
                            placeholder="Brief summary of your request"
                            maxLength={500}
                            showCharacterCount
                            required
                          />
                          <TextField
                            label="Message"
                            value={message}
                            onChange={setMessage}
                            placeholder="Describe your question or issue..."
                            multiline={4}
                            maxLength={5000}
                            showCharacterCount
                            required
                          />
                          {submitResult?.success && (
                            <Banner tone="success" onDismiss={() => setSubmitResult(null)}>
                              We received your request (Ticket #
                              {String(submitResult.ticketId).slice(0, 8)}). We&apos;ll reply by
                              email soon.
                            </Banner>
                          )}
                          {submitResult?.error && (
                            <Banner tone="critical" onDismiss={() => setSubmitResult(null)}>
                              {submitResult.error}
                            </Banner>
                          )}
                          <Button
                            variant="primary"
                            submit
                            disabled={submitting}
                            loading={submitting}
                          >
                            Send message
                          </Button>
                        </BlockStack>
                      </form>
                    </BlockStack>
                  </Card>
                )}

                {selectedTab === 1 && (
                  <Card>
                    <BlockStack gap="400">
                      <div className={styles.tabCardHeader}>
                        <Text as="h2" variant="headingMd">
                          My requests
                        </Text>
                      </div>
                      <Text as="p" variant="bodySm" tone="subdued" className={styles.tabCardIntro}>
                        When logged in, your support requests appear here.
                      </Text>
                      {ticketsLoading ? (
                        <Box paddingBlock="600" className={styles.tabCardState}>
                          <InlineStack gap="300" blockAlign="center">
                            <Spinner size="small" accessibilityLabel="Loading requests" />
                            <Text as="p" tone="subdued">
                              Loading your requests…
                            </Text>
                          </InlineStack>
                        </Box>
                      ) : ticketsError === 'sign_in' ? (
                        <Box paddingBlock="400" className={styles.tabCardState}>
                          <BlockStack gap="300">
                            <Text as="p" tone="subdued">
                              Sign in to see your past requests here.
                            </Text>
                            <Link to={ROUTES.CONNECT}>
                              <Button variant="primary">Sign in</Button>
                            </Link>
                          </BlockStack>
                        </Box>
                      ) : ticketsError ? (
                        <Box paddingBlock="400" className={styles.tabCardState}>
                          <BlockStack gap="300">
                            <Text as="p" tone="subdued">
                              Could not load your requests. Try again later.
                            </Text>
                            <Button onClick={() => fetchTickets()} variant="secondary">
                              Try again
                            </Button>
                          </BlockStack>
                        </Box>
                      ) : tickets.length === 0 ? (
                        <Box paddingBlock="400" className={styles.tabCardState}>
                          <BlockStack gap="300">
                            <Text as="p" tone="subdued">
                              No support requests yet. Use the Contact us tab to send a message.
                            </Text>
                            <Button onClick={() => setSelectedTab(0)} variant="primary">
                              Contact us
                            </Button>
                          </BlockStack>
                        </Box>
                      ) : (
                        <>
                          <InlineStack gap="300" blockAlign="center" wrap={false}>
                            <Text as="span" variant="bodySm" tone="subdued">
                              Show:
                            </Text>
                            <Select
                              label="Filter by status"
                              labelHidden
                              options={[
                                { label: 'All', value: 'all' },
                                { label: 'Open', value: 'open' },
                                { label: 'Closed', value: 'closed' },
                              ]}
                              value={ticketStatusFilter}
                              onChange={setTicketStatusFilter}
                            />
                          </InlineStack>
                          {(() => {
                            const filtered = tickets.filter(t => {
                              const s = String(t.status || 'open').toLowerCase();
                              if (ticketStatusFilter === 'open') return s === 'open';
                              if (ticketStatusFilter === 'closed')
                                return s === 'closed' || s === 'resolved';
                              return true;
                            });
                            if (filtered.length === 0) {
                              return (
                                <Text as="p" tone="subdued" variant="bodySm">
                                  No requests match this filter. Try &quot;All&quot;.
                                </Text>
                              );
                            }
                            return (
                              <div className={styles.tabCardList}>
                                <List type="number">
                                  {filtered.map(t => (
                                    <List.Item key={t.id}>
                                      <InlineStack
                                        align="space-between"
                                        blockAlign="center"
                                        gap="200"
                                      >
                                        <Text as="span" fontWeight="medium">
                                          {t.subject ?? t.title ?? '—'}
                                        </Text>
                                        <InlineStack gap="150" blockAlign="center" wrap={false}>
                                          {t.has_unread_support_reply ? (
                                            <Badge tone="critical">
                                              New {t.unread_count > 1 ? t.unread_count : ''}
                                            </Badge>
                                          ) : null}
                                          <span
                                            className={styles.ticketStatus}
                                            data-status={String(t.status || 'open').toLowerCase()}
                                            title={
                                              t.status === 'closed' || t.status === 'resolved'
                                                ? 'This request has been closed'
                                                : 'Open request'
                                            }
                                          >
                                            {t.status === 'closed' || t.status === 'resolved'
                                              ? t.status === 'resolved'
                                                ? 'Resolved'
                                                : 'Closed'
                                              : 'Open'}
                                          </span>
                                        </InlineStack>
                                      </InlineStack>
                                      <Text as="p" variant="bodySm" tone="subdued">
                                        #{String(t.id).slice(0, 8)} ·{' '}
                                        {categories.find(c => c.value === t.category)?.label ??
                                          t.category ??
                                          '—'}{' '}
                                        {String(t.category_source || '').toLowerCase() === 'auto'
                                          ? '(auto) · '
                                          : '· '}
                                        {t.created_at
                                          ? new Date(t.created_at).toLocaleDateString()
                                          : '—'}
                                        {t.latest_admin_reply_at ? ' · Support replied' : ''}
                                      </Text>
                                      <InlineStack gap="200" blockAlign="center">
                                        <Button
                                          size="slim"
                                          variant="plain"
                                          onClick={() => openTicketThread(t)}
                                        >
                                          Open thread
                                        </Button>
                                      </InlineStack>
                                    </List.Item>
                                  ))}
                                </List>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </BlockStack>
                  </Card>
                )}

                {selectedTab === 2 && (
                  <Card>
                    <BlockStack gap="400">
                      <div className={styles.tabCardHeader}>
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={ChatIcon} tone="base" />
                          <Text as="h2" variant="headingMd">
                            SupportAI
                          </Text>
                        </InlineStack>
                        <Button
                          size="slim"
                          onClick={() =>
                            openRipxAgent('Check my current store setup and summarize blockers.')
                          }
                        >
                          Open RipX Agent
                        </Button>
                      </div>
                      <div className={styles.aiModeBridge}>
                        <div>
                          <Text as="h3" variant="headingSm">
                            Need store-aware help?
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            SupportAI answers general docs questions. RipX Agent can inspect the
                            active store, tests, readiness, and create confirmed support actions.
                          </Text>
                        </div>
                        <Button
                          size="slim"
                          variant="primary"
                          onClick={() =>
                            openRipxAgent(
                              'Check this page and explain what I should do next in RipX.'
                            )
                          }
                        >
                          Open RipX Agent
                        </Button>
                      </div>
                      <Text as="p" variant="bodySm" tone="subdued" className={styles.tabCardIntro}>
                        Use SupportAI for documentation and setup questions. Use RipX Agent for
                        store-aware diagnostics, test readiness, and confirmed actions.
                      </Text>
                      {aiNotConfigured && (
                        <Banner
                          tone="warning"
                          onDismiss={() => setAiNotConfigured(false)}
                          title="AI assistant not configured"
                        >
                          The AI chat is not set up for this environment. Use the Contact us tab to
                          reach the team. To enable AI, set OPENAI_API_KEY in the backend .env.
                        </Banner>
                      )}
                      <Box paddingBlockStart="200">
                        <BlockStack gap="300">
                          {(chatMessages.length > 0 || chatLoading) && (
                            <div className={styles.chatContainer}>
                              <div className={styles.chatHeader}>
                                <Text
                                  as="span"
                                  variant="bodySm"
                                  fontWeight="semibold"
                                  className={styles.chatHeaderTitle}
                                >
                                  Conversation
                                </Text>
                                <Button
                                  size="slim"
                                  variant="plain"
                                  className={styles.chatHeaderClear}
                                  onClick={clearChat}
                                  disabled={chatLoading}
                                >
                                  Clear chat
                                </Button>
                              </div>
                              <div
                                ref={chatScrollRef}
                                className={styles.chatArea}
                                role="log"
                                aria-live="polite"
                                aria-busy={chatLoading}
                                aria-label="Chat messages"
                              >
                                {chatMessages.map((m, i) => (
                                  <div
                                    key={i}
                                    className={
                                      m.role === 'user'
                                        ? styles.chatBubbleUser
                                        : styles.chatBubbleAssistant
                                    }
                                  >
                                    <Text
                                      as="p"
                                      variant="bodySm"
                                      fontWeight="semibold"
                                      className={styles.chatBubbleLabel}
                                    >
                                      {m.role === 'user' ? 'You' : 'RipX'}
                                    </Text>
                                    <div className={styles.chatBubbleContent}>
                                      {m.role === 'assistant'
                                        ? formatReplyContent(m.content)
                                        : m.content}
                                    </div>
                                  </div>
                                ))}
                                {chatLoading && (
                                  <div className={styles.chatTypingIndicator}>
                                    <span className={styles.chatTypingDot} />
                                    <span className={styles.chatTypingDot} />
                                    <span className={styles.chatTypingDot} />
                                    <Text as="span" variant="bodySm" tone="subdued">
                                      Thinking…
                                    </Text>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          {chatMessages.length === 0 && !chatLoading && (
                            <div className={styles.suggestedPromptsWrap}>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Try asking:
                              </Text>
                              <InlineStack gap="200" blockAlign="center" wrap>
                                {SUGGESTED_PROMPTS.map((prompt, i) => (
                                  <Button
                                    key={i}
                                    size="slim"
                                    variant="plain"
                                    onClick={() => sendChatMessage(prompt)}
                                  >
                                    {prompt}
                                  </Button>
                                ))}
                              </InlineStack>
                            </div>
                          )}
                          <div className={styles.chatLanguagePicker}>
                            <Select
                              label="Reply language"
                              options={CHAT_LANGUAGE_OPTIONS}
                              value={chatLanguage}
                              onChange={setChatLanguage}
                            />
                          </div>
                          <div className={styles.chatComposer}>
                            <div className={styles.chatComposerInput}>
                              <textarea
                                className={styles.chatComposerTextarea}
                                aria-label="Message for AI assistant"
                                placeholder={CHAT_PLACEHOLDER}
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const value = e.target?.value ?? chatInputRef.current;
                                    if (value?.trim()) sendChatMessage(value);
                                  }
                                }}
                                rows={1}
                                maxLength={2000}
                                autoComplete="off"
                              />
                              <div className={styles.chatComposerActions}>
                                <Button
                                  variant="plain"
                                  className={styles.chatComposerAttach}
                                  icon={ImageIcon}
                                  accessibilityLabel="Attach (coming soon)"
                                  title="Image sharing coming soon"
                                  disabled
                                />
                                <Button
                                  variant="primary"
                                  className={styles.chatComposerSend}
                                  icon={SendIcon}
                                  accessibilityLabel="Send message"
                                  onClick={sendChatMessage}
                                  disabled={!chatInput.trim() || chatLoading}
                                  loading={chatLoading}
                                />
                              </div>
                            </div>
                          </div>
                          {chatMessages.length > 0 && (
                            <div className={styles.stillNeedHelp}>
                              {latestAssistantMessage && (
                                <div className={styles.chatResolutionRow}>
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    Was this answer helpful?
                                  </Text>
                                  <div className={styles.chatResolutionButtons}>
                                    <Button
                                      size="slim"
                                      variant={
                                        latestAssistantFeedback?.helpful === true
                                          ? 'primary'
                                          : 'secondary'
                                      }
                                      onClick={() => submitChatFeedback(true)}
                                      disabled={chatFeedbackSubmitting || chatLoading}
                                      loading={
                                        chatFeedbackSubmitting &&
                                        latestAssistantFeedback?.helpful === true
                                      }
                                    >
                                      Yes
                                    </Button>
                                    <Button
                                      size="slim"
                                      variant={
                                        latestAssistantFeedback?.helpful === false
                                          ? 'primary'
                                          : 'secondary'
                                      }
                                      onClick={() => submitChatFeedback(false)}
                                      disabled={chatFeedbackSubmitting || chatLoading}
                                      loading={
                                        chatFeedbackSubmitting &&
                                        latestAssistantFeedback?.helpful === false
                                      }
                                    >
                                      No
                                    </Button>
                                  </div>
                                  {latestAssistantFeedback && (
                                    <Text
                                      as="span"
                                      variant="bodySm"
                                      className={
                                        latestAssistantFeedback.error
                                          ? styles.chatResolutionMetaError
                                          : styles.chatResolutionMetaSuccess
                                      }
                                    >
                                      {latestAssistantFeedback.error
                                        ? latestAssistantFeedback.error
                                        : latestAssistantFeedback.helpful
                                          ? 'Thanks for the feedback.'
                                          : 'Thanks. You can escalate this to a human agent below.'}
                                    </Text>
                                  )}
                                </div>
                              )}
                              <div className={styles.chatResolutionButtons}>
                                <Button
                                  size="slim"
                                  variant="primary"
                                  onClick={escalateChatToTicket}
                                  loading={chatEscalating}
                                  disabled={
                                    chatEscalating || chatLoading || chatMessages.length === 0
                                  }
                                >
                                  Escalate to support
                                </Button>
                                <Button
                                  size="slim"
                                  variant="plain"
                                  onClick={() => setSelectedTab(0)}
                                >
                                  Contact us
                                </Button>
                              </div>
                              {chatEscalationResult && (
                                <Text
                                  as="span"
                                  variant="bodySm"
                                  className={
                                    chatEscalationResult.success
                                      ? styles.chatResolutionMetaSuccess
                                      : styles.chatResolutionMetaError
                                  }
                                >
                                  {chatEscalationResult.message}
                                </Text>
                              )}
                            </div>
                          )}
                        </BlockStack>
                      </Box>
                    </BlockStack>
                  </Card>
                )}

                {selectedTab === 3 && (
                  <Card>
                    <BlockStack gap="400">
                      <div className={styles.tabCardHeader}>
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={ListBulletedIcon} tone="base" />
                          <Text as="h2" variant="headingMd">
                            Feature requests
                          </Text>
                        </InlineStack>
                      </div>
                      <Text as="p" variant="bodySm" tone="subdued" className={styles.tabCardIntro}>
                        Share ideas and vote on what should be built next. Sign in to create and
                        vote.
                      </Text>

                      {featureRequestsError === 'sign_in' && (
                        <Banner
                          tone="info"
                          title="Sign in required for creating and voting"
                          onDismiss={() => setFeatureRequestsError(null)}
                        >
                          <p>
                            You can browse requests without signing in. Sign in to post or vote.
                          </p>
                        </Banner>
                      )}
                      {featureRequestsError && featureRequestsError !== 'sign_in' && (
                        <Banner tone="critical" onDismiss={() => setFeatureRequestsError(null)}>
                          {featureRequestsError}
                        </Banner>
                      )}

                      <form
                        className={styles.featureRequestComposer}
                        onSubmit={handleCreateFeatureRequest}
                      >
                        <BlockStack gap="300">
                          <TextField
                            label="Request title"
                            value={featureRequestTitle}
                            onChange={setFeatureRequestTitle}
                            placeholder="Example: Add rule-based product prioritization"
                            maxLength={180}
                            showCharacterCount
                            autoComplete="off"
                          />
                          <TextField
                            label="Details (optional)"
                            value={featureRequestDetails}
                            onChange={setFeatureRequestDetails}
                            placeholder="Describe the use case and desired outcome…"
                            multiline={3}
                            maxLength={5000}
                            showCharacterCount
                          />
                          <InlineStack align="space-between" blockAlign="center" wrap>
                            <Select
                              label="Filter board"
                              options={FEATURE_REQUEST_STATUS_OPTIONS}
                              value={featureRequestStatusFilter}
                              onChange={setFeatureRequestStatusFilter}
                            />
                            <Button
                              variant="primary"
                              submit
                              loading={featureRequestsSubmitting}
                              disabled={!featureRequestTitle.trim() || featureRequestsSubmitting}
                            >
                              Submit request
                            </Button>
                          </InlineStack>
                        </BlockStack>
                      </form>

                      {featureRequestsLoading ? (
                        <Text as="p" tone="subdued">
                          Loading feature requests…
                        </Text>
                      ) : featureRequests.length === 0 ? (
                        <Text as="p" tone="subdued">
                          No feature requests yet. Be the first to submit one.
                        </Text>
                      ) : (
                        <div className={styles.featureRequestList}>
                          {featureRequests.map(item => (
                            <div key={item.id} className={styles.featureRequestItem}>
                              <InlineStack
                                align="space-between"
                                blockAlign="start"
                                wrap
                                className={styles.featureRequestHeaderRow}
                              >
                                <BlockStack gap="100" className={styles.featureRequestMeta}>
                                  <Text as="p" variant="headingSm">
                                    {item.title || 'Untitled request'}
                                  </Text>
                                  <InlineStack gap="200" blockAlign="center" wrap>
                                    <Badge
                                      tone={
                                        FEATURE_REQUEST_STATUS_TONE[
                                          String(item.status || 'open').toLowerCase()
                                        ] || 'info'
                                      }
                                    >
                                      {String(item.status || 'open').replace('_', ' ')}
                                    </Badge>
                                    <Badge tone="attention">
                                      {Number(item.vote_count) || 0} votes
                                    </Badge>
                                  </InlineStack>
                                </BlockStack>
                                <InlineStack
                                  gap="200"
                                  blockAlign="center"
                                  wrap
                                  className={styles.featureRequestActions}
                                >
                                  <Button
                                    size="slim"
                                    variant={Number(item.my_vote) === 1 ? 'primary' : 'secondary'}
                                    onClick={() => handleVoteFeatureRequest(item.id, 1)}
                                    loading={Boolean(featureRequestVoteLoadingById[item.id])}
                                    disabled={Boolean(featureRequestVoteLoadingById[item.id])}
                                  >
                                    {Number(item.my_vote) === 1 ? 'Voted' : 'Vote'}
                                  </Button>
                                </InlineStack>
                              </InlineStack>
                              {item.details ? (
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {item.details}
                                </Text>
                              ) : null}
                              <Text as="p" variant="bodySm" tone="subdued">
                                #{String(item.id || '').slice(0, 8)} ·{' '}
                                {item.created_at
                                  ? new Date(item.created_at).toLocaleDateString()
                                  : '—'}
                              </Text>
                            </div>
                          ))}
                        </div>
                      )}
                    </BlockStack>
                  </Card>
                )}

                {selectedTab === 4 && (
                  <Card>
                    <BlockStack gap="400">
                      <div className={styles.tabCardHeader}>
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={BookIcon} tone="base" />
                          <Text as="h2" variant="headingMd">
                            Status and changelog
                          </Text>
                        </InlineStack>
                      </div>
                      <Text as="p" variant="bodySm" tone="subdued" className={styles.tabCardIntro}>
                        Track current platform status and recent product updates from the team.
                      </Text>

                      {supportStatusError && (
                        <Banner tone="critical" onDismiss={() => setSupportStatusError(null)}>
                          {supportStatusError}
                        </Banner>
                      )}

                      <div className={styles.supportStatusCard}>
                        <InlineStack align="space-between" blockAlign="center" wrap>
                          <InlineStack gap="200" blockAlign="center" wrap>
                            <Text as="p" variant="headingSm">
                              Current status
                            </Text>
                            <Badge
                              tone={
                                SUPPORT_STATUS_TONE[
                                  String(supportStatus.status || 'operational').toLowerCase()
                                ] || 'success'
                              }
                            >
                              {SUPPORT_STATUS_LABEL[
                                String(supportStatus.status || 'operational').toLowerCase()
                              ] || 'Operational'}
                            </Badge>
                          </InlineStack>
                          <Button
                            size="slim"
                            variant="plain"
                            onClick={() => fetchStatusAndChangelog()}
                            loading={supportStatusLoading || supportChangelogLoading}
                          >
                            Refresh
                          </Button>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {supportStatus.message || 'All systems operational'}
                        </Text>
                        {supportStatus.updated_at ? (
                          <Text as="p" variant="bodySm" tone="subdued">
                            Updated: {new Date(supportStatus.updated_at).toLocaleString()}
                          </Text>
                        ) : null}
                      </div>

                      {supportChangelogLoading ? (
                        <Text as="p" tone="subdued">
                          Loading changelog…
                        </Text>
                      ) : supportChangelog.length === 0 ? (
                        <Text as="p" tone="subdued">
                          No changelog entries published yet.
                        </Text>
                      ) : (
                        <div className={styles.supportChangelogList}>
                          {supportChangelog.map(entry => (
                            <div key={entry.id} className={styles.supportChangelogItem}>
                              <InlineStack
                                align="space-between"
                                blockAlign="start"
                                wrap
                                className={styles.supportChangelogHeaderRow}
                              >
                                <Text as="p" variant="headingSm">
                                  {entry.title || 'Untitled update'}
                                </Text>
                                <Badge tone="info">
                                  {String(entry.level || 'info').replace('_', ' ')}
                                </Badge>
                              </InlineStack>
                              {entry.summary ? (
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {entry.summary}
                                </Text>
                              ) : null}
                              {entry.body ? (
                                <Text as="p" variant="bodySm">
                                  {entry.body}
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
                          ))}
                        </div>
                      )}
                    </BlockStack>
                  </Card>
                )}

                {selectedTab === 5 && (
                  <Card>
                    <BlockStack gap="400">
                      <div className={styles.tabCardHeader}>
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={BookIcon} tone="base" />
                          <Text as="h2" variant="headingMd">
                            FAQ
                          </Text>
                        </InlineStack>
                        <Button
                          size="slim"
                          onClick={() => openRipxAgent('I read the FAQ but still need help.')}
                        >
                          Ask RipX Agent
                        </Button>
                      </div>
                      <Text as="p" variant="bodySm" tone="subdued" className={styles.tabCardIntro}>
                        Browse common questions. Open an item to view the answer instantly, or ask
                        RipX Agent for store-aware follow-up.
                      </Text>
                      <div className={styles.faqGrid}>
                        <div className={styles.faqQuestionList} role="list">
                          {SUPPORT_FAQS.map(item => (
                            <button
                              key={item.id}
                              type="button"
                              className={`${styles.faqQuestionButton} ${
                                openFaqId === item.id ? styles.faqQuestionButtonActive : ''
                              }`}
                              onClick={() => setOpenFaqId(item.id)}
                            >
                              {item.question}
                            </button>
                          ))}
                        </div>
                        <div className={styles.faqAnswerPanel}>
                          {(() => {
                            const activeFaq =
                              SUPPORT_FAQS.find(item => item.id === openFaqId) || SUPPORT_FAQS[0];
                            return (
                              <>
                                <span className={styles.faqAnswerEyebrow}>Answer</span>
                                <Text as="h3" variant="headingMd">
                                  {activeFaq.question}
                                </Text>
                                <Text as="p" variant="bodyMd">
                                  {activeFaq.answer}
                                </Text>
                                <InlineStack gap="200" wrap>
                                  <Button
                                    size="slim"
                                    onClick={() => openRipxAgent(activeFaq.question)}
                                  >
                                    Ask Agent about this
                                  </Button>
                                  <Button
                                    size="slim"
                                    variant="plain"
                                    onClick={() => setSelectedTab(0)}
                                  >
                                    ContactTeam
                                  </Button>
                                </InlineStack>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </BlockStack>
                  </Card>
                )}
              </Box>
            </div>

            <div className={styles.moreOptions}>
              <Text as="p" variant="bodySm" tone="subdued">
                Use RipXAgent for store-aware help, SupportAI for docs questions, or ContactTeam for
                a human reply.
              </Text>
            </div>
          </section>

          {threadTicket && (
            <Modal
              open
              onClose={closeTicketThread}
              title={`Support thread · #${String(threadTicket.id || '').slice(0, 8)}`}
              primaryAction={{
                content: 'Send reply',
                onAction: sendThreadReply,
                loading: threadSending,
                disabled: !String(threadReply || '').trim() || threadLoading,
              }}
              secondaryActions={[
                {
                  content: 'Close',
                  onAction: closeTicketThread,
                },
              ]}
              size="large"
            >
              <Modal.Section>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center" wrap>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {threadTicket.subject || 'Support request'}
                    </Text>
                    <InlineStack gap="200" blockAlign="center">
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
                        {threadPeerOnline ? 'Support online' : 'Support away'}
                      </Badge>
                    </InlineStack>
                  </InlineStack>

                  {threadLoading ? (
                    <Text as="p" tone="subdued">
                      Loading thread…
                    </Text>
                  ) : (
                    <div className={styles.ticketThreadMessages}>
                      {threadMessages.length === 0 ? (
                        <Text as="p" variant="bodySm" tone="subdued">
                          No messages yet.
                        </Text>
                      ) : (
                        threadMessages.map(item => {
                          const senderType = String(item?.sender_type || 'user').toLowerCase();
                          const isUser = senderType === 'user';
                          const senderLabel = isUser
                            ? 'You'
                            : senderType === 'admin'
                              ? item?.sender_label || 'Support'
                              : senderType === 'ai'
                                ? 'AI'
                                : item?.sender_label || 'System';
                          return (
                            <div
                              key={item.id}
                              className={
                                isUser ? styles.chatBubbleUser : styles.chatBubbleAssistant
                              }
                            >
                              <Text
                                as="p"
                                variant="bodySm"
                                fontWeight="semibold"
                                className={styles.chatBubbleLabel}
                              >
                                {senderLabel}
                              </Text>
                              <div className={styles.chatBubbleContent}>
                                {isUser
                                  ? item?.message || ''
                                  : formatReplyContent(item?.message || '')}
                              </div>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {item?.created_at
                                  ? new Date(item.created_at).toLocaleString()
                                  : '—'}
                              </Text>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {threadError ? (
                    <Banner tone="critical" onDismiss={() => setThreadError('')}>
                      {threadError}
                    </Banner>
                  ) : null}

                  {threadPeerTyping ? (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Support is typing…
                    </Text>
                  ) : null}

                  {threadPeerLastReadAt ? (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Seen by support {new Date(threadPeerLastReadAt).toLocaleTimeString()}
                    </Text>
                  ) : threadPeerDeliveredAt ? (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Delivered to support {new Date(threadPeerDeliveredAt).toLocaleTimeString()}
                    </Text>
                  ) : null}

                  <TextField
                    label="Reply"
                    value={threadReply}
                    onChange={handleThreadReplyChange}
                    multiline={4}
                    maxLength={5000}
                    autoComplete="off"
                    showCharacterCount
                    placeholder="Type your reply to support…"
                  />
                </BlockStack>
              </Modal.Section>
            </Modal>
          )}
        </BlockStack>
      </Page>
    </PageShell>
  );
}

export default Support;
