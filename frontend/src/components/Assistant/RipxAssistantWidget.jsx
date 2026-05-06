import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Icon, Text } from '@shopify/polaris';
import { BookIcon, ChatIcon, EmailIcon, SendIcon, XIcon } from '@shopify/polaris-icons';
import { useLocation } from 'react-router-dom';
import { formatReplyContent } from '../../utils/supportFormat';
import { apiGet, apiPost } from '../../services/api';
import { getProfile } from '../../services/profileApi';
import { subscribeSupportTicketRealtime } from '../../services/supportRealtime';
import useRipxAssistant from './useRipxAssistant';
import {
  ASSISTANT_FAQS,
  FAQ_ALL_CATEGORY,
  addRecentFaqId,
  buildFaqAgentPrompt,
  buildNoResultAgentPrompt,
  buildFaqSupportMessage,
  filterFaqs,
  getFaqCategories,
  getFaqsByIds,
  getNextFaqIdForKey,
  getRecommendedFaqs,
  normalizeRecentFaqIds,
  resolveSelectedFaq,
} from './assistantFaqs';
import styles from './Assistant.module.css';

const HELP_MODES = [
  {
    id: 'agent',
    label: 'Agent',
    title: 'RipX Agent',
    description: 'Store-aware diagnostics, test readiness, and confirmed actions.',
    badge: 'Best for app context',
    icon: ChatIcon,
  },
  {
    id: 'support',
    label: 'CustomerSupport',
    title: 'CustomerSupport',
    description: 'Start a direct support thread with the RipX team.',
    badge: 'Best for human help',
    icon: EmailIcon,
  },
  {
    id: 'faq',
    label: 'FAQ',
    title: 'FAQ',
    description: 'Browse instant answers for common questions.',
    badge: 'Best for quick answers',
    icon: BookIcon,
  },
];

const FAQ_CATEGORIES = getFaqCategories();
const RECENT_FAQ_STORAGE_KEY = 'ripx.assistant.recentFaqs.v1';

function formatSource(source) {
  if (typeof source === 'string') return source;
  if (source && typeof source === 'object') {
    return source.title || source.source || source.path || source.url || 'Source';
  }
  return 'Source';
}

function AssistantMessage({ message, onConfirmAction, actionLoadingId }) {
  const isUser = message.role === 'user';
  return (
    <div className={isUser ? styles.messageUser : styles.messageAssistant}>
      <div className={styles.messageMeta}>
        <Text as="p" variant="bodySm" fontWeight="semibold">
          {isUser ? 'You' : 'RipX Agent'}
        </Text>
        {!isUser ? <span>Context checked</span> : null}
      </div>
      <div className={styles.messageText}>
        {isUser ? message.content : formatReplyContent(message.content)}
      </div>
      {!isUser && Array.isArray(message.toolResults) && message.toolResults.length > 0 ? (
        <div className={styles.toolList} aria-label="Agent checks used">
          {message.toolResults.slice(0, 3).map(result => (
            <span key={`${result.tool}-${result.status}`} className={styles.toolPill}>
              {result.tool}: {result.status}
            </span>
          ))}
        </div>
      ) : null}
      {!isUser && Array.isArray(message.sources) && message.sources.length > 0 ? (
        <div className={styles.sourceList}>
          Sources: {message.sources.slice(0, 3).map(formatSource).join(', ')}
        </div>
      ) : null}
      {!isUser && Array.isArray(message.proposedActions) && message.proposedActions.length > 0 ? (
        <div className={styles.actionList}>
          {message.proposedActions.map(action => (
            <div key={action.id || action.action} className={styles.actionCard}>
              <div>
                <strong>{action.label || 'Agent action'}</strong>
                <p>{action.description || 'Confirm before RipX changes anything.'}</p>
              </div>
              <Button
                size="slim"
                variant="primary"
                loading={actionLoadingId === (action.id || action.action)}
                onClick={() => onConfirmAction(action)}
              >
                Confirm
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function RipxAssistantWidget({ elevated = false }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('home');
  const [supportEmail, setSupportEmail] = useState('');
  const [supportTicketId, setSupportTicketId] = useState(null);
  const [supportMessages, setSupportMessages] = useState([]);
  const [supportInput, setSupportInput] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [supportResult, setSupportResult] = useState(null);
  const [supportStreamState, setSupportStreamState] = useState('idle');
  const [supportPeerTyping, setSupportPeerTyping] = useState(false);
  const [supportPeerLastReadAt, setSupportPeerLastReadAt] = useState(null);
  const [supportPeerOnline, setSupportPeerOnline] = useState(false);
  const [supportPeerDeliveredAt, setSupportPeerDeliveredAt] = useState(null);
  const [selectedFaqId, setSelectedFaqId] = useState(ASSISTANT_FAQS[0].id);
  const [faqSearch, setFaqSearch] = useState('');
  const [faqCategory, setFaqCategory] = useState(FAQ_ALL_CATEGORY);
  const [faqFeedbackById, setFaqFeedbackById] = useState({});
  const [recommendedFaqs, setRecommendedFaqs] = useState([]);
  const [faqSuggestionStatus, setFaqSuggestionStatus] = useState('idle');
  const [recentFaqIds, setRecentFaqIds] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      return normalizeRecentFaqIds(
        JSON.parse(window.localStorage.getItem(RECENT_FAQ_STORAGE_KEY) || '[]')
      );
    } catch {
      return [];
    }
  });
  const scrollRef = useRef(null);
  const closeRef = useRef(null);
  const inputRef = useRef(null);
  const faqSearchRef = useRef(null);
  const supportThreadRef = useRef(null);
  const supportRealtimeUnsubscribeRef = useRef(null);
  const supportTypingTimeoutRef = useRef(null);
  const {
    messages,
    input,
    setInput,
    loading,
    actionLoadingId,
    error,
    sendMessage,
    confirmAction,
    clear,
  } = useRipxAssistant();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, open]);

  useEffect(() => {
    if (supportThreadRef.current) {
      supportThreadRef.current.scrollTop = supportThreadRef.current.scrollHeight;
    }
  }, [supportMessages, mode]);

  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (open && mode === 'faq') {
      faqSearchRef.current?.focus();
    }
  }, [mode, open]);

  useEffect(() => {
    if (!open || supportEmail) return undefined;
    let cancelled = false;
    getProfile()
      .then(data => {
        if (cancelled) return;
        const email = data?.profile?.email || data?.account?.billingEmail || '';
        if (email) setSupportEmail(String(email).trim());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, supportEmail]);

  useEffect(() => {
    const inputEl = inputRef.current;
    if (!inputEl) return;
    inputEl.style.height = 'auto';
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 150)}px`;
  }, [input, open]);

  useEffect(() => {
    const handleOpenAgent = event => {
      const prompt = event?.detail?.prompt;
      if (typeof prompt === 'string' && prompt.trim()) {
        setInput(prompt.trim());
      }
      setMode('agent');
      setOpen(true);
    };
    window.addEventListener('ripx-agent-open', handleOpenAgent);
    return () => window.removeEventListener('ripx-agent-open', handleOpenAgent);
  }, [setInput]);

  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = event => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
      if (mode === 'faq' && event.key === '/') {
        const activeElement = document.activeElement;
        const isTyping =
          activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName);
        if (!isTyping) {
          event.preventDefault();
          faqSearchRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mode, open]);

  const suggestions = [
    'Check this store setup',
    'Why is my test not ready?',
    'Summarize my active experiments',
  ];
  const currentPathname = location?.pathname || '/';
  const currentPageLabel =
    currentPathname === '/'
      ? 'Home'
      : currentPathname.split('/').filter(Boolean).slice(-1)[0]?.replace(/[-_]/g, ' ') ||
        'Current page';
  const pageContext = useMemo(
    () => ({
      pathname: currentPathname,
      search: faqSearch.trim(),
      category: faqCategory,
    }),
    [currentPathname, faqCategory, faqSearch]
  );
  const visibleFaqs = useMemo(
    () => filterFaqs({ query: faqSearch, category: faqCategory }),
    [faqCategory, faqSearch]
  );
  const selectedFaq = resolveSelectedFaq({ visibleFaqs, selectedFaqId });
  const routeRecommendedFaqs = useMemo(
    () => getRecommendedFaqs({ pathname: currentPathname, limit: 3 }),
    [currentPathname]
  );
  const displayedRecommendedFaqs = recommendedFaqs.length ? recommendedFaqs : routeRecommendedFaqs;
  const recentFaqs = useMemo(() => getFaqsByIds(recentFaqIds), [recentFaqIds]);
  const askAgentFromFaq = faq => {
    const prompt =
      typeof faq === 'string' ? faq : buildFaqAgentPrompt(faq || selectedFaq, pageContext);
    setMode('agent');
    sendMessage(prompt);
  };
  const openSupportFromFaq = faq => {
    setSupportInput(buildFaqSupportMessage(faq || selectedFaq, pageContext));
    setMode('support');
  };
  const rememberFaq = faqId => {
    setRecentFaqIds(prev => {
      const next = addRecentFaqId(prev, faqId);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(RECENT_FAQ_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  };
  const selectFaq = faqId => {
    setSelectedFaqId(faqId);
    rememberFaq(faqId);
  };
  const handleFaqListKeyDown = event => {
    const nextFaqId = getNextFaqIdForKey({
      visibleFaqs,
      currentFaqId: selectedFaq?.id || selectedFaqId,
      key: event.key,
    });
    if (nextFaqId && nextFaqId !== selectedFaqId) {
      event.preventDefault();
      selectFaq(nextFaqId);
      window.requestAnimationFrame(() => {
        document
          .getElementById(`ripx-faq-option-${nextFaqId}`)
          ?.scrollIntoView({ block: 'nearest' });
      });
    }
  };
  const submitFaqFeedback = async (faq, value) => {
    if (!faq?.id) return;
    setFaqFeedbackById(prev => ({ ...prev, [faq.id]: value }));
    try {
      await apiPost('/support/faq-feedback', {
        faq_id: faq.id,
        category: faq.category,
        helpful: value === 'helpful',
        reason: value === 'need_help' ? 'still_need_help' : null,
        route_context: pageContext,
        search_query: faqSearch.trim(),
      });
    } catch {
      // Feedback remains useful locally even if the optional analytics endpoint is unavailable.
    }
  };
  const activeMode = HELP_MODES.find(item => item.id === mode);
  const panelTitle = activeMode?.title || 'Ask RipX';
  const panelSubtitle =
    activeMode?.description || 'Choose the best support path for what you need right now.';

  const refreshSupportThread = async ticketId => {
    if (!ticketId) return;
    try {
      const response = await apiGet(`/support/tickets/${ticketId}/thread`);
      const thread = response?.data?.messages || [];
      setSupportMessages(
        thread.map(item => ({
          id: item.id,
          role: item.sender_type === 'admin' ? 'support' : 'user',
          content: item.message || '',
          createdAt: item.created_at || null,
          label: item.sender_label || null,
        }))
      );
    } catch (err) {
      setSupportResult({
        success: false,
        message: err?.response?.data?.error || err?.message || 'Could not load support thread.',
      });
    }
  };

  useEffect(() => {
    if (!open || mode !== 'support' || !supportTicketId) return undefined;
    if (supportRealtimeUnsubscribeRef.current) {
      supportRealtimeUnsubscribeRef.current();
      supportRealtimeUnsubscribeRef.current = null;
    }
    setSupportStreamState('connecting');
    supportRealtimeUnsubscribeRef.current = subscribeSupportTicketRealtime({
      ticketId: supportTicketId,
      audience: 'user',
      onState: setSupportStreamState,
      onMessage: message => {
        setSupportPeerTyping(false);
        setSupportMessages(prev => {
          if (prev.some(item => item.id === message.id)) return prev;
          return [
            ...prev,
            {
              id: message.id,
              role: message.sender_type === 'admin' ? 'support' : 'user',
              content: message.message || '',
              createdAt: message.created_at || null,
              label: message.sender_label || null,
            },
          ];
        });
      },
      onError: error => {
        setSupportResult({ success: false, message: error });
      },
      onTyping: event => {
        if (event.audience === 'admin') {
          setSupportPeerTyping(event.isTyping);
        }
      },
      onRead: event => {
        if (event.audience === 'admin') {
          setSupportPeerLastReadAt(event.readState?.last_read_at || event.timestamp || null);
        }
      },
      onPresence: presence => {
        setSupportPeerOnline(Boolean(presence.hasAdmin));
      },
      onDelivered: event => {
        if (event.senderAudience === 'user' && event.deliveredToAdmin) {
          setSupportPeerDeliveredAt(event.timestamp || new Date().toISOString());
        }
      },
    });
    return () => {
      if (supportRealtimeUnsubscribeRef.current) {
        supportRealtimeUnsubscribeRef.current.sendTyping?.(false);
        supportRealtimeUnsubscribeRef.current();
        supportRealtimeUnsubscribeRef.current = null;
      }
      setSupportPeerTyping(false);
      setSupportPeerLastReadAt(null);
      setSupportPeerOnline(false);
      setSupportPeerDeliveredAt(null);
      if (supportTypingTimeoutRef.current) {
        clearTimeout(supportTypingTimeoutRef.current);
        supportTypingTimeoutRef.current = null;
      }
    };
  }, [open, mode, supportTicketId]);

  const handleSupportInputChange = value => {
    setSupportInput(value);
    supportRealtimeUnsubscribeRef.current?.sendTyping?.(Boolean(String(value || '').trim()));
    if (supportTypingTimeoutRef.current) {
      clearTimeout(supportTypingTimeoutRef.current);
    }
    supportTypingTimeoutRef.current = setTimeout(() => {
      supportRealtimeUnsubscribeRef.current?.sendTyping?.(false);
    }, 1800);
  };

  const submitSupportMessage = async event => {
    event.preventDefault();
    const text = String(supportInput || '').trim();
    if (!text || supportSending) return;
    setSupportSending(true);
    setSupportResult(null);
    supportRealtimeUnsubscribeRef.current?.sendTyping?.(false);
    if (supportTypingTimeoutRef.current) {
      clearTimeout(supportTypingTimeoutRef.current);
      supportTypingTimeoutRef.current = null;
    }
    try {
      let ticketId = supportTicketId;
      if (!ticketId) {
        if (!supportEmail) {
          throw new Error('Sign in or add an email before starting CustomerSupport chat.');
        }
        const created = await apiPost('/support/ticket', {
          email: supportEmail,
          subject: 'CustomerSupport chat from RipX Agent',
          category: 'technical',
          message: text,
        });
        ticketId = created?.data?.ticket_id;
        setSupportTicketId(ticketId || null);
      } else {
        await apiPost(`/support/tickets/${ticketId}/thread/reply`, { message: text });
      }
      setSupportInput('');
      await refreshSupportThread(ticketId);
      setSupportResult({
        success: true,
        message: ticketId
          ? `Connected to CustomerSupport ticket #${String(ticketId).slice(0, 8)}.`
          : 'Message sent to CustomerSupport.',
      });
    } catch (err) {
      setSupportResult({
        success: false,
        message: err?.response?.data?.error || err?.message || 'Could not send support message.',
      });
    } finally {
      setSupportSending(false);
    }
  };

  const supportQuickPrompts = [
    'My test is not showing on the live store.',
    'I need help with Shopify app installation.',
    'Checkout or price testing is not working.',
  ];

  useEffect(() => {
    if (mode !== 'faq' || visibleFaqs.length === 0) return;
    if (!visibleFaqs.some(item => item.id === selectedFaqId)) {
      setSelectedFaqId(visibleFaqs[0].id);
    }
  }, [mode, selectedFaqId, visibleFaqs]);

  useEffect(() => {
    if (!open || mode !== 'faq') return undefined;
    let cancelled = false;
    const params = new URLSearchParams({
      pathname: currentPathname,
      q: faqSearch.trim(),
      category: faqCategory,
      limit: '3',
    });
    setFaqSuggestionStatus('loading');
    apiGet(`/support/faq-suggestions?${params.toString()}`)
      .then(response => {
        if (cancelled) return;
        const suggestions = Array.isArray(response?.data?.suggestions)
          ? response.data.suggestions
          : [];
        setRecommendedFaqs(suggestions.filter(item => item?.id));
        setFaqSuggestionStatus('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setRecommendedFaqs([]);
          setFaqSuggestionStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentPathname, faqCategory, faqSearch, mode, open]);

  return (
    <div className={`${styles.assistantRoot} ${elevated ? styles.assistantRootElevated : ''}`}>
      <button
        type="button"
        className={styles.launcher}
        onClick={() => setOpen(prev => !prev)}
        aria-label={open ? 'Close RipX Agent' : 'Open RipX Agent'}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className={styles.launcherHalo} aria-hidden="true" />
        <span className={styles.launcherIcon}>
          <Icon source={ChatIcon} tone="base" />
        </span>
        <span className={styles.launcherText}>Ask RipX</span>
        <span className={styles.launcherStatus} aria-hidden="true" />
      </button>
      {open ? (
        <section
          className={`${styles.panel} ${mode === 'faq' ? styles.panelFaq : ''}`}
          role="dialog"
          aria-modal="false"
          aria-labelledby="ripx-assistant-title"
          aria-describedby="ripx-assistant-subtitle"
        >
          <header className={styles.panelHeader}>
            <div className={styles.panelHeaderMain}>
              {mode !== 'home' ? (
                <button
                  type="button"
                  className={styles.modeBackButton}
                  onClick={() => setMode('home')}
                  aria-label="Back to support modes"
                >
                  ←
                </button>
              ) : null}
              <span className={styles.panelHeaderIcon}>
                <Icon source={activeMode?.icon || ChatIcon} tone="base" />
              </span>
              <div>
                <h2 id="ripx-assistant-title" className={styles.panelTitle}>
                  {panelTitle}
                </h2>
                <p id="ripx-assistant-subtitle" className={styles.panelSubtitle}>
                  {panelSubtitle}
                </p>
                {mode === 'agent' ? (
                  <div className={styles.panelCapabilityRow} aria-label="Agent capabilities">
                    <span>Store-aware</span>
                    <span>Readiness checks</span>
                    <span>Safe actions</span>
                  </div>
                ) : null}
              </div>
            </div>
            <span className={styles.panelStatus}>{mode === 'home' ? 'Ready' : 'Active'}</span>
            <button
              ref={closeRef}
              type="button"
              className={styles.closeButton}
              onClick={() => setOpen(false)}
              aria-label="Close RipX Agent"
            >
              <Icon source={XIcon} tone="subdued" />
            </button>
          </header>
          <div ref={scrollRef} className={styles.messageArea} role="log" aria-live="polite">
            {mode === 'home' ? (
              <div className={styles.modeHome}>
                <div className={styles.modeHomeIntro}>
                  <Text as="h3" variant="headingSm">
                    How can RipX help?
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Pick a path. Agent is for app context, CustomerSupport is for the team, and FAQ
                    is for instant answers.
                  </Text>
                </div>
                <div className={styles.modeHomeGrid}>
                  {HELP_MODES.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.modeHomeCard} ${
                        item.id === 'agent' ? styles.modeHomeCardPrimary : ''
                      }`}
                      onClick={() => setMode(item.id)}
                    >
                      <span className={styles.modeHomeIcon}>
                        <Icon source={item.icon} tone="base" />
                      </span>
                      <span className={styles.modeHomeCopy}>
                        <span className={styles.modeHomeBadge}>{item.badge}</span>
                        <strong>{item.label}</strong>
                        <span>{item.description}</span>
                      </span>
                      <span className={styles.modeHomeArrow} aria-hidden="true">
                        →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {mode === 'agent' && messages.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}>
                  <Icon source={ChatIcon} tone="base" />
                </div>
                <Text as="h3" variant="headingSm">
                  Ask about this page
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Ask about setup, tests, checkout readiness, or goals. The first version uses
                  read-only checks.
                </Text>
                <div className={styles.emptyStateGrid} aria-label="What RipX Agent can help with">
                  <span>Diagnose setup blockers</span>
                  <span>Explain test readiness</span>
                  <span>Create confirmed tickets</span>
                </div>
                <div className={styles.suggestions}>
                  {suggestions.map(prompt => (
                    <button
                      key={prompt}
                      type="button"
                      className={styles.suggestion}
                      onClick={() => sendMessage(prompt)}
                      disabled={loading}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : mode === 'agent' ? (
              messages.map((message, index) => (
                <AssistantMessage
                  key={message.id || `${message.role}-${index}`}
                  message={message}
                  onConfirmAction={confirmAction}
                  actionLoadingId={actionLoadingId}
                />
              ))
            ) : null}
            {mode === 'support' ? (
              <form className={styles.humanPanel} onSubmit={submitSupportMessage}>
                <div className={styles.modePanelHeader}>
                  <span className={styles.modePanelIcon}>
                    <Icon source={EmailIcon} tone="base" />
                  </span>
                  <div>
                    <Text as="h3" variant="headingSm">
                      Chat with CustomerSupport
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Start a support thread. Replies from admins/support users can be refreshed
                      here.
                    </Text>
                  </div>
                </div>
                {supportTicketId ? (
                  <div className={styles.supportThreadInfo}>
                    <span>
                      <span className={styles.supportLiveDot} aria-hidden="true" />
                      Active thread #{String(supportTicketId).slice(0, 8)}
                    </span>
                    <span className={styles.supportThreadMeta}>
                      {supportStreamState === 'live'
                        ? 'Live'
                        : supportStreamState === 'connecting'
                          ? 'Connecting'
                          : supportStreamState === 'reconnecting'
                            ? 'Reconnecting'
                            : 'Offline'}{' '}
                      · {supportMessages.length} message
                      {supportMessages.length === 1 ? '' : 's'}
                      {' · '}
                      {supportPeerOnline ? 'Support online' : 'Support away'}
                    </span>
                    <button type="button" onClick={() => refreshSupportThread(supportTicketId)}>
                      Refresh replies
                    </button>
                  </div>
                ) : null}
                {supportMessages.length > 0 ? (
                  <div className={styles.supportThreadMessages} ref={supportThreadRef}>
                    {supportMessages.map(item => (
                      <div
                        key={item.id}
                        className={
                          item.role === 'support'
                            ? styles.supportThreadMessageAdmin
                            : styles.supportThreadMessageUser
                        }
                      >
                        <strong>{item.role === 'support' ? item.label || 'Support' : 'You'}</strong>
                        <p>{item.content}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {supportPeerTyping ? (
                  <div className={styles.typing}>
                    <span />
                    <span />
                    <span />
                    <Text as="span" variant="bodySm" tone="subdued">
                      Support is typing…
                    </Text>
                  </div>
                ) : null}
                {supportPeerLastReadAt ? (
                  <div className={styles.supportThreadMeta}>
                    Seen by support {new Date(supportPeerLastReadAt).toLocaleTimeString()}
                  </div>
                ) : supportPeerDeliveredAt ? (
                  <div className={styles.supportThreadMeta}>
                    Delivered to support {new Date(supportPeerDeliveredAt).toLocaleTimeString()}
                  </div>
                ) : null}
                {!supportTicketId && supportMessages.length === 0 ? (
                  <div className={styles.supportQuickPrompts}>
                    {supportQuickPrompts.map(prompt => (
                      <button key={prompt} type="button" onClick={() => setSupportInput(prompt)}>
                        {prompt}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className={styles.customerComposer}>
                  <textarea
                    className={styles.humanTextarea}
                    placeholder="Message CustomerSupport..."
                    value={supportInput}
                    onChange={event => handleSupportInputChange(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        submitSupportMessage(event);
                      }
                    }}
                    rows={2}
                    required
                  />
                  <button
                    type="submit"
                    className={styles.humanSendButton}
                    disabled={!supportInput.trim() || supportSending}
                    aria-label={supportTicketId ? 'Send reply' : 'Start chat'}
                  >
                    <Icon source={SendIcon} tone="base" />
                  </button>
                  <div className={styles.customerComposerFooter}>
                    <span>Enter to send · Shift+Enter for a new line</span>
                    <strong>{supportTicketId ? 'SendReply' : 'StartChat'}</strong>
                  </div>
                </div>
                {supportResult ? (
                  <p className={supportResult.success ? styles.humanSuccess : styles.humanError}>
                    {supportResult.message}
                  </p>
                ) : null}
              </form>
            ) : null}
            {mode === 'faq' ? (
              <div className={styles.faqPanel}>
                <div className={styles.faqCommandHeader}>
                  <div className={styles.faqCommandTitleRow}>
                    <span className={styles.modePanelIcon}>
                      <Icon source={BookIcon} tone="base" />
                    </span>
                    <div>
                      <span className={styles.faqCommandEyebrow}>Smart FAQ command center</span>
                      <Text as="h3" variant="headingSm">
                        Find the right RipX answer faster
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Search curated answers, page-aware suggestions, and hand off with context.
                      </Text>
                      <div className={styles.faqContextPills} aria-label="FAQ context">
                        <span title={`Current page: ${currentPathname}`}>{currentPageLabel}</span>
                        <span title={`Active category: ${faqCategory}`}>{faqCategory}</span>
                        <span title={`Suggestion status: ${faqSuggestionStatus}`}>
                          {faqSuggestionStatus === 'loading' ? 'Syncing' : 'Ready'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={styles.faqCommandStats} aria-label="FAQ search status">
                    <span>{visibleFaqs.length}</span>
                    <small>matches</small>
                  </div>
                  <div className={styles.faqWorkflow} aria-label="FAQ workflow">
                    <span>
                      <strong>1</strong>
                      Search
                    </span>
                    <span>
                      <strong>2</strong>
                      Preview
                    </span>
                    <span>
                      <strong>3</strong>
                      Handoff
                    </span>
                  </div>
                </div>

                <div className={styles.faqSmartSearch}>
                  <label htmlFor="ripx-faq-search">Search FAQ</label>
                  <div className={styles.faqSearchShell}>
                    <span aria-hidden="true">/</span>
                    <input
                      ref={faqSearchRef}
                      id="ripx-faq-search"
                      className={styles.faqSearch}
                      type="search"
                      placeholder="Search setup, analytics, checkout, readiness..."
                      value={faqSearch}
                      onChange={event => setFaqSearch(event.target.value)}
                      aria-controls="ripx-faq-results"
                      aria-keyshortcuts="/"
                    />
                  </div>
                  <div className={styles.faqCategoryRail} aria-label="FAQ categories">
                    {FAQ_CATEGORIES.map(category => (
                      <button
                        key={category}
                        type="button"
                        className={
                          faqCategory === category
                            ? styles.faqCategoryChipActive
                            : styles.faqCategoryChip
                        }
                        onClick={() => setFaqCategory(category)}
                        aria-pressed={faqCategory === category}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                  <div className={styles.faqResultMeta} aria-live="polite">
                    <span>
                      {visibleFaqs.length} answer{visibleFaqs.length === 1 ? '' : 's'} found
                      {faqSuggestionStatus === 'loading' ? ' - updating recommendations' : ''}
                    </span>
                    {faqSearch || faqCategory !== FAQ_ALL_CATEGORY ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFaqSearch('');
                          setFaqCategory(FAQ_ALL_CATEGORY);
                        }}
                      >
                        Clear filters
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className={styles.faqInsightGrid}>
                  {displayedRecommendedFaqs.length > 0 ? (
                    <div className={styles.faqInsightCard}>
                      <div className={styles.faqInsightHeader}>
                        <span>Recommended for this page</span>
                        <small>
                          {faqSuggestionStatus === 'loading'
                            ? 'Updating'
                            : faqSuggestionStatus === 'error'
                              ? 'Local fallback'
                              : 'Context-aware'}
                        </small>
                      </div>
                      {faqSuggestionStatus === 'loading' ? (
                        <div className={styles.faqSyncLine}>
                          <span />
                          Updating page-aware picks...
                        </div>
                      ) : null}
                      <div className={styles.faqInsightActions}>
                        {displayedRecommendedFaqs.map(item => (
                          <button
                            key={`recommended-${item.id}`}
                            type="button"
                            onClick={() => selectFaq(item.id)}
                          >
                            {item.question}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {recentFaqs.length > 0 ? (
                    <div className={styles.faqInsightCard}>
                      <div className={styles.faqInsightHeader}>
                        <span>Recently viewed</span>
                        <small>Quick return</small>
                      </div>
                      <div className={styles.faqInsightActions}>
                        {recentFaqs.map(item => (
                          <button
                            key={`recent-${item.id}`}
                            type="button"
                            onClick={() => selectFaq(item.id)}
                          >
                            {item.question}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.faqInsightCard}>
                      <div className={styles.faqInsightHeader}>
                        <span>Recently viewed</span>
                        <small>Empty</small>
                      </div>
                      <div className={styles.faqInsightEmpty}>
                        Open any FAQ answer and it will appear here for quick return.
                      </div>
                    </div>
                  )}
                  {faqSuggestionStatus === 'error' ? (
                    <div className={styles.faqInsightNotice}>
                      Live suggestions are offline. Showing curated recommendations.
                    </div>
                  ) : null}
                </div>

                <div className={styles.faqKnowledgeLayout}>
                  <div className={styles.faqListPane}>
                    <div className={styles.faqPaneHeader}>
                      <span>Browse answers</span>
                      <small>Use arrows to move</small>
                    </div>
                    <div
                      id="ripx-faq-results"
                      className={styles.faqModeList}
                      role="listbox"
                      tabIndex={0}
                      aria-label="FAQ results"
                      aria-activedescendant={
                        selectedFaq ? `ripx-faq-option-${selectedFaq.id}` : undefined
                      }
                      onKeyDown={handleFaqListKeyDown}
                    >
                      {visibleFaqs.map(item => (
                        <button
                          key={item.id}
                          id={`ripx-faq-option-${item.id}`}
                          type="button"
                          role="option"
                          className={
                            selectedFaqId === item.id
                              ? styles.faqModeQuestionActive
                              : styles.faqModeQuestion
                          }
                          onClick={() => selectFaq(item.id)}
                          tabIndex={-1}
                          aria-selected={selectedFaq?.id === item.id}
                        >
                          <span className={styles.faqQuestionText}>{item.question}</span>
                          <span className={styles.faqQuestionMeta}>
                            <small>{item.category}</small>
                            <span>{(item.tags || []).slice(0, 2).join(' / ')}</span>
                          </span>
                        </button>
                      ))}
                      {visibleFaqs.length === 0 ? (
                        <div className={styles.faqEmptyResult}>
                          <strong>No FAQ match</strong>
                          <span>
                            Ask Agent with this search so it can check your store context.
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              askAgentFromFaq(buildNoResultAgentPrompt(faqSearch, pageContext))
                            }
                          >
                            Ask Agent
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {visibleFaqs.length > 0 && selectedFaq ? (
                    <div className={styles.faqModeAnswer} aria-live="polite">
                      <div className={styles.faqPaneHeader}>
                        <span>Answer preview</span>
                        <small>Context preserved</small>
                      </div>
                      <div className={styles.faqAnswerHeader}>
                        <span className={styles.faqAnswerCategory}>{selectedFaq.category}</span>
                        <span className={styles.faqAnswerStatus}>Curated answer</span>
                      </div>
                      <strong>{selectedFaq.question}</strong>
                      <p>{selectedFaq.answer}</p>
                      <div className={styles.faqAnswerUtility}>
                        <span>Category: {selectedFaq.category}</span>
                        <span>{(selectedFaq.tags || []).length} tags</span>
                        <span>
                          {faqFeedbackById[selectedFaq.id] ? 'Feedback sent' : 'Awaiting feedback'}
                        </span>
                      </div>
                      {selectedFaq.tags?.length ? (
                        <div className={styles.faqTagRow}>
                          {selectedFaq.tags.map(tag => (
                            <span key={tag}>{tag}</span>
                          ))}
                        </div>
                      ) : null}
                      <div className={styles.faqFeedbackRow} aria-label="Was this FAQ helpful?">
                        <button
                          type="button"
                          className={
                            faqFeedbackById[selectedFaq.id] === 'helpful'
                              ? styles.faqFeedbackActive
                              : styles.faqFeedbackButton
                          }
                          onClick={() => submitFaqFeedback(selectedFaq, 'helpful')}
                        >
                          Helpful
                        </button>
                        <button
                          type="button"
                          className={
                            faqFeedbackById[selectedFaq.id] === 'need_help'
                              ? styles.faqFeedbackActive
                              : styles.faqFeedbackButton
                          }
                          onClick={() => submitFaqFeedback(selectedFaq, 'need_help')}
                        >
                          Still need help
                        </button>
                      </div>
                      {faqFeedbackById[selectedFaq.id] === 'helpful' ? (
                        <div className={styles.faqFeedbackNote}>
                          Thanks. RipX will prioritize answers like this.
                        </div>
                      ) : null}
                      {faqFeedbackById[selectedFaq.id] === 'need_help' ? (
                        <div className={styles.faqEscalationCard}>
                          <strong>Need a deeper check?</strong>
                          <span>
                            Share this FAQ, category, and current page with the next support path.
                          </span>
                          <div>
                            <Button size="slim" onClick={() => askAgentFromFaq(selectedFaq)}>
                              Ask Agent
                            </Button>
                            <Button size="slim" onClick={() => openSupportFromFaq(selectedFaq)}>
                              Open CustomerSupport
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="slim" onClick={() => askAgentFromFaq(selectedFaq)}>
                          Ask Agent about this
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {mode === 'agent' && loading ? (
              <div className={styles.typing}>
                <span />
                <span />
                <span />
                <Text as="span" variant="bodySm" tone="subdued">
                  Checking RipX context…
                </Text>
              </div>
            ) : null}
            {mode === 'agent' && error && messages.length === 0 ? (
              <p className={styles.errorText}>{error}</p>
            ) : null}
          </div>
          {mode === 'agent' && (
            <footer className={styles.composer}>
              <div className={styles.composerShell}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={event => setInput(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Ask RipX Agent…"
                  rows={1}
                  maxLength={2500}
                  className={styles.input}
                />
                <button
                  type="button"
                  className={styles.composerSend}
                  aria-label="Send message"
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                >
                  <Icon source={SendIcon} tone="base" />
                </button>
                <div className={styles.composerFooter}>
                  <span>Enter to send · Shift+Enter for a new line</span>
                  {messages.length > 0 ? (
                    <button type="button" onClick={clear} disabled={loading}>
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
            </footer>
          )}
        </section>
      ) : null}
    </div>
  );
}
