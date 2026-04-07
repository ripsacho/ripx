/**
 * Floating bubble chat window: Ask AI + link to Contact us.
 * Rendered on the Support page.
 */

import React, { useState, useRef, useEffect } from 'react';
import { BlockStack, Text, Button, InlineStack, Icon, Tooltip } from '@shopify/polaris';
import { ChatIcon, ImageIcon, SendIcon, XIcon } from '@shopify/polaris-icons';
import { formatReplyContent, SUGGESTED_PROMPTS, CHAT_PLACEHOLDER } from '../../utils/supportFormat';
import styles from './Support.module.css';

export default function SupportBubbleChat({
  chatMessages,
  chatInput,
  chatLoading,
  onChatInputChange,
  onSendMessage,
  onClearChat,
  onNavigateToContact,
  latestAssistantMessage,
  latestAssistantFeedback,
  chatFeedbackSubmitting,
  onSubmitChatFeedback,
  onEscalateToSupport,
  chatEscalating,
  chatEscalationResult,
}) {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef(null);
  const closeButtonRef = useRef(null);
  const fabRef = useRef(null);
  const dialogRef = useRef(null);

  const close = () => setOpen(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatLoading]);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = e => {
      if (e.key === 'Escape') {
        close();
        fabRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open]);

  // Keep focus inside dialog when open (Tab / Shift+Tab)
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const root = dialogRef.current;
    const getFocusables = () => {
      const sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
      return Array.from(root.querySelectorAll(sel)).filter(
        el => !el.hasAttribute('disabled') && el.tabIndex !== -1
      );
    };
    const handleKeyDown = e => {
      if (e.key !== 'Tab') return;
      const focusables = getFocusables();
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    root.addEventListener('keydown', handleKeyDown);
    return () => root.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const handleBackdropClick = e => {
    if (e.target === e.currentTarget) {
      close();
      fabRef.current?.focus();
    }
  };

  return (
    <>
      <Tooltip content={open ? 'Close help' : 'Open help & chat'} preferredPosition="above">
        <button
          ref={fabRef}
          type="button"
          className={styles.bubbleFab}
          onClick={() => setOpen(prev => !prev)}
          aria-label={open ? 'Close help' : 'Open help & chat'}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <span className={styles.bubbleFabIcon}>
            <Icon source={ChatIcon} tone="base" />
          </span>
        </button>
      </Tooltip>
      {open && (
        <>
          <div className={styles.bubbleBackdrop} onClick={handleBackdropClick} aria-hidden="true" />
          <div
            className={styles.bubbleWindow}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bubble-dialog-title"
            aria-describedby="bubble-dialog-desc"
            ref={dialogRef}
          >
            <div className={styles.bubbleWindowHeader}>
              <h2 id="bubble-dialog-title" className={styles.bubbleWindowTitle}>
                Help
              </h2>
              <Tooltip content="Close" preferredPosition="below">
                <button
                  ref={closeButtonRef}
                  type="button"
                  className={styles.bubbleWindowClose}
                  onClick={() => {
                    close();
                    fabRef.current?.focus();
                  }}
                  aria-label="Close"
                >
                  <Icon source={XIcon} tone="subdued" />
                </button>
              </Tooltip>
            </div>
            <div className={styles.bubbleWindowBody}>
              <BlockStack gap="400">
                {/* Ask AI */}
                <div className={styles.bubbleChatSection} id="bubble-dialog-desc">
                  <div className={styles.bubbleChatHeader}>
                    <div>
                      <Text as="p" variant="bodySm" fontWeight="semibold">
                        Ask AI
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Get instant answers about RipX and A/B testing.
                      </Text>
                    </div>
                    {(chatMessages.length > 0 || chatLoading) && onClearChat && (
                      <button
                        type="button"
                        className={styles.bubbleChatClear}
                        onClick={onClearChat}
                        disabled={chatLoading}
                        aria-label="Clear chat"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div
                    className={styles.bubbleChatArea}
                    ref={scrollRef}
                    role="log"
                    aria-live="polite"
                    aria-busy={chatLoading}
                    aria-label="Chat messages"
                  >
                    {(chatMessages.length > 0 || chatLoading) && (
                      <>
                        {chatMessages.map((m, i) => (
                          <div
                            key={i}
                            className={
                              m.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssistant
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
                              {m.role === 'assistant' ? formatReplyContent(m.content) : m.content}
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
                      </>
                    )}
                    {chatMessages.length === 0 && !chatLoading && (
                      <div className={styles.bubbleSuggestions}>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Try asking:
                        </Text>
                        <InlineStack gap="200" blockAlign="center" wrap>
                          {SUGGESTED_PROMPTS.map((prompt, i) => (
                            <Button
                              key={i}
                              size="slim"
                              variant="plain"
                              onClick={() => onChatInputChange(prompt)}
                            >
                              {prompt}
                            </Button>
                          ))}
                        </InlineStack>
                      </div>
                    )}
                  </div>
                </div>
                <div className={styles.bubbleComposer}>
                  <div className={styles.bubbleComposerInput}>
                    <textarea
                      className={styles.bubbleComposerTextarea}
                      aria-label="Message for AI assistant"
                      placeholder={CHAT_PLACEHOLDER}
                      value={chatInput}
                      onChange={e => onChatInputChange(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          e.stopPropagation();
                          const value = e.target?.value ?? chatInput;
                          if (value?.trim()) onSendMessage(value);
                        }
                      }}
                      rows={1}
                      maxLength={2000}
                      autoComplete="off"
                    />
                    <div className={styles.bubbleComposerActions}>
                      <Button
                        variant="plain"
                        className={styles.bubbleComposerAttach}
                        icon={ImageIcon}
                        accessibilityLabel="Attach (coming soon)"
                        title="Image sharing coming soon"
                        disabled
                      />
                      <Button
                        variant="primary"
                        className={styles.bubbleComposerSend}
                        icon={SendIcon}
                        accessibilityLabel="Send message"
                        onClick={onSendMessage}
                        disabled={!chatInput.trim() || chatLoading}
                        loading={chatLoading}
                      />
                    </div>
                  </div>
                </div>

                {chatMessages.length > 0 && (
                  <div className={styles.bubbleResolutionRow}>
                    {latestAssistantMessage && onSubmitChatFeedback && (
                      <>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Was this answer helpful?
                        </Text>
                        <InlineStack gap="200" wrap>
                          <Button
                            size="slim"
                            variant={
                              latestAssistantFeedback?.helpful === true ? 'primary' : 'secondary'
                            }
                            onClick={() => onSubmitChatFeedback(true)}
                            disabled={chatLoading || chatFeedbackSubmitting}
                            loading={
                              chatFeedbackSubmitting && latestAssistantFeedback?.helpful === true
                            }
                          >
                            Yes
                          </Button>
                          <Button
                            size="slim"
                            variant={
                              latestAssistantFeedback?.helpful === false ? 'primary' : 'secondary'
                            }
                            onClick={() => onSubmitChatFeedback(false)}
                            disabled={chatLoading || chatFeedbackSubmitting}
                            loading={
                              chatFeedbackSubmitting && latestAssistantFeedback?.helpful === false
                            }
                          >
                            No
                          </Button>
                        </InlineStack>
                        {latestAssistantFeedback && (
                          <Text
                            as="p"
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
                                ? 'Thanks for your feedback.'
                                : 'Thanks. We can escalate this to a human agent.'}
                          </Text>
                        )}
                      </>
                    )}

                    {onEscalateToSupport && (
                      <InlineStack gap="200" wrap>
                        <Button
                          size="slim"
                          variant="primary"
                          onClick={onEscalateToSupport}
                          loading={chatEscalating}
                          disabled={chatLoading || chatEscalating}
                        >
                          Escalate to support
                        </Button>
                      </InlineStack>
                    )}

                    {chatEscalationResult && (
                      <Text
                        as="p"
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

                {onNavigateToContact && (
                  <div className={styles.bubbleFooter}>
                    <button
                      type="button"
                      className={styles.bubbleFooterLink}
                      onClick={() => {
                        onNavigateToContact();
                        close();
                      }}
                      aria-label="Go to Contact us form"
                    >
                      Contact us (email form)
                    </button>
                  </div>
                )}
              </BlockStack>
            </div>
          </div>
        </>
      )}
    </>
  );
}
