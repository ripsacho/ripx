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
  Icon,
  Spinner,
} from '@shopify/polaris';
import {
  BookIcon,
  ChatIcon,
  EmailIcon,
  ImageIcon,
  ListBulletedIcon,
  SendIcon,
} from '@shopify/polaris-icons';
import { PageShell } from '../Shared';
import { ROUTES } from '../../constants';
import { apiGet, apiPost } from '../../services/api';
import { getProfile } from '../../services/profileApi';
import { formatReplyContent, SUGGESTED_PROMPTS, CHAT_PLACEHOLDER } from '../../utils/supportFormat';
import SupportBubbleChat from './SupportBubbleChat';
import styles from './Support.module.css';

const CATEGORIES_FALLBACK = [
  { label: 'Technical / Script', value: 'technical' },
  { label: 'Billing', value: 'billing' },
  { label: 'Feature request', value: 'feature_request' },
  { label: 'Script / Install help', value: 'script_install' },
  { label: 'Other', value: 'other' },
];

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
  const [categories, setCategories] = useState(CATEGORIES_FALLBACK);
  // Ask AI state
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [aiNotConfigured, setAiNotConfigured] = useState(false);
  const [chatConversationId, setChatConversationId] = useState(null);
  const chatScrollRef = useRef(null);
  const mountedRef = useRef(true);
  const chatInputRef = useRef('');
  chatInputRef.current = chatInput;

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
        setTickets(prev => [
          {
            id: data.ticket_id,
            subject: submittedSubject,
            category: submittedCategory,
            status: 'open',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
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

  const sendChatMessage = useCallback(
    async textOverride => {
      const text = (
        textOverride !== undefined && textOverride !== null
          ? String(textOverride)
          : (chatInputRef.current ?? '')
      ).trim();
      if (!text || chatLoading) return;
      setChatInput('');
      setChatMessages(prev => [...prev, { role: 'user', content: text }]);
      setChatLoading(true);
      setAiNotConfigured(false);
      try {
        const messagesForApi = chatMessages.map(m => ({ role: m.role, content: m.content }));
        const payload = { message: text, messages: messagesForApi };
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
        setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);
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
    [chatLoading, chatMessages, chatConversationId]
  );

  const clearChat = useCallback(() => {
    setChatMessages([]);
    setChatInput('');
    setChatConversationId(null);
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
      content: 'Ask AI',
      accessibilityLabel: 'Ask AI',
      panelID: 'ask-ai-panel',
    },
  ];

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
            <span className={styles.heroBadge}>Help center</span>
            <h1 id="support-hero-title" className={styles.heroTitle}>
              <span className={styles.heroTitleGradient}>Support</span>
            </h1>
            <p className={styles.heroSubtext}>
              Get instant answers from our AI, chat with our team in real time, or send us a
              message. We typically reply within 24 hours by email.
            </p>
          </section>

          <nav className={styles.quickLinks} aria-label="Popular topics">
            <span className={styles.quickLinksLabel}>Popular topics</span>
            <div className={styles.quickLinksList}>
              <Link to={ROUTES.DOCS} className={styles.quickLinkPill}>
                <Icon source={BookIcon} tone="base" />
                Documentation
              </Link>
              <Link to={ROUTES.USER_PANEL} className={styles.quickLinkPill}>
                Dashboard
              </Link>
            </div>
          </nav>

          <div className={styles.actionCardsGrid} role="list">
            <div className={`${styles.actionCard} ${styles.actionCardAccentAi}`} role="listitem">
              <div className={styles.actionCardIcon}>
                <Icon source={ChatIcon} tone="base" />
              </div>
              <h2 className={styles.actionCardTitle}>Ask AI</h2>
              <p className={styles.actionCardDesc}>
                Get instant answers about RipX, setup, and A/B testing. Or use the chat bubble in
                the corner.
              </p>
              <div className={styles.actionCardCta}>
                <Button onClick={() => setSelectedTab(2)}>Open Ask AI</Button>
              </div>
            </div>
            <div className={`${styles.actionCard} ${styles.actionCardAccentEmail}`} role="listitem">
              <div className={styles.actionCardIcon}>
                <Icon source={EmailIcon} tone="base" />
              </div>
              <h2 className={styles.actionCardTitle}>Send a message</h2>
              <p className={styles.actionCardDesc}>
                We reply by email, usually within 24 hours. Use for detailed questions or when chat
                is offline.
              </p>
              <div className={styles.actionCardCta}>
                <Button onClick={() => setSelectedTab(0)}>Contact us</Button>
              </div>
            </div>
            <div
              className={`${styles.actionCard} ${styles.actionCardAccentTickets}`}
              role="listitem"
            >
              <div className={styles.actionCardIcon}>
                <Icon source={ListBulletedIcon} tone="base" />
              </div>
              <h2 className={styles.actionCardTitle}>My requests</h2>
              <p className={styles.actionCardDesc}>
                View your past support requests and their status. Sign in to see your tickets.
              </p>
              <div className={styles.actionCardCta}>
                <Button onClick={() => setSelectedTab(1)}>View my requests</Button>
              </div>
            </div>
          </div>

          <section className={styles.contentSection} aria-label="Support options">
            <div className={styles.tabStrip} role="tablist" aria-label="Support options">
              {tabs.map((tab, i) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedTab === i}
                  aria-controls={tab.panelID}
                  id={`${tab.id}-tab`}
                  className={selectedTab === i ? styles.tabStripItemActive : styles.tabStripItem}
                  onClick={() => setSelectedTab(i)}
                >
                  {tab.content}
                </button>
              ))}
            </div>
            <div
              className={styles.tabPanelContent}
              role="tabpanel"
              aria-labelledby={`${tabs[selectedTab]?.id}-tab`}
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
                                      <Text as="p" variant="bodySm" tone="subdued">
                                        #{String(t.id).slice(0, 8)} ·{' '}
                                        {categories.find(c => c.value === t.category)?.label ??
                                          t.category ??
                                          '—'}{' '}
                                        ·{' '}
                                        {t.created_at
                                          ? new Date(t.created_at).toLocaleDateString()
                                          : '—'}
                                      </Text>
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
                            Ask AI
                          </Text>
                        </InlineStack>
                      </div>
                      <Text as="p" variant="bodySm" tone="subdued" className={styles.tabCardIntro}>
                        Get instant answers about RipX and A/B testing. Need a human? Use the
                        Contact us tab.
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
                              <Text as="span" variant="bodySm" tone="subdued">
                                Still need help?
                              </Text>
                              <Button size="slim" variant="plain" onClick={() => setSelectedTab(0)}>
                                Contact us
                              </Button>
                            </div>
                          )}
                        </BlockStack>
                      </Box>
                    </BlockStack>
                  </Card>
                )}
              </Box>
            </div>

            <div className={styles.moreOptions}>
              <Text as="p" variant="bodySm" tone="subdued">
                Use the chat bubble (bottom right) to ask AI, or use Contact us to send a message.
              </Text>
            </div>
          </section>

          <SupportBubbleChat
            chatMessages={chatMessages}
            chatInput={chatInput}
            chatLoading={chatLoading}
            onChatInputChange={setChatInput}
            onSendMessage={sendChatMessage}
            onClearChat={clearChat}
            onNavigateToContact={() => setSelectedTab(0)}
          />
        </BlockStack>
      </Page>
    </PageShell>
  );
}

export default Support;
