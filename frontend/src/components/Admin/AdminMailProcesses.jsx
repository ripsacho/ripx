/**
 * AdminMailProcesses (Email delivery)
 *
 * Control which transactional emails are sent; enable/disable per type;
 * edit subject and body templates (plain text and HTML). When disabled,
 * the email is not sent but the app flow continues.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Modal,
  TextField,
  Spinner,
  Banner,
} from '@shopify/polaris';
import { EditIcon, RefreshIcon } from '@shopify/polaris-icons';
import { apiGet, apiPut } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import AdminPageLayout from './AdminPageLayout';
import styles from './AdminMailProcesses.module.css';

const PROCESS_KEY_ORDER = [
  'login_code',
  'login_link',
  'confirmation_link',
  'acceptance',
  'domain_api_key',
  'domain_added_notification',
  'announcement',
];

/** Group process keys for section headers */
const PROCESS_GROUPS = {
  Authentication: ['login_code', 'login_link', 'confirmation_link'],
  'Account & domains': ['acceptance', 'domain_api_key', 'domain_added_notification'],
  Announcements: ['announcement'],
};

/** Placeholders hint per process key for the edit modal (replaced at send time) */
const PLACEHOLDERS_BY_KEY = {
  login_code: ['{{code}}'],
  login_link: ['{{link}}', '{{minutes}}'],
  confirmation_link: ['{{link}}', '{{minutes}}'],
  acceptance: ['{{signInUrl}}'],
  domain_api_key: ['{{domain}}', '{{apiKey}}'],
  domain_added_notification: ['{{domain}}', '{{dashboardUrl}}', '{{settingsUrl}}'],
  announcement: [],
};

export default function AdminMailProcesses() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState({ message: null, type: 'success' });
  const [editKey, setEditKey] = useState(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBodyText, setEditBodyText] = useState('');
  const [editBodyHtml, setEditBodyHtml] = useState('');
  const [editorTab, setEditorTab] = useState(0);
  const [editError, setEditError] = useState(null);
  const [loadingDefault, setLoadingDefault] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'mail-processes'],
    queryFn: async () => {
      const res = await apiGet('/admin/mail-processes');
      const payload = res?.data?.data ?? res?.data ?? {};
      return Array.isArray(payload.processes) ? payload : { processes: payload.processes ?? [] };
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ key, enabled }) => {
      await apiPut(`/admin/mail-processes/${encodeURIComponent(key)}`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'mail-processes'] });
      setToast({ message: 'Updated', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Update failed',
        type: 'error',
      });
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async ({ key, enabled, subject, bodyHtml, bodyText }) => {
      const body = { subject: subject ?? '', bodyHtml: bodyHtml ?? '', bodyText: bodyText ?? '' };
      if (enabled !== undefined) body.enabled = Boolean(enabled);
      await apiPut(`/admin/mail-processes/${encodeURIComponent(key)}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'mail-processes'] });
      setToast({ message: 'Template saved', type: 'success' });
      setEditKey(null);
      setEditError(null);
    },
    onError: err => {
      const msg = err?.response?.data?.error || err?.message || 'Save failed';
      setEditError(msg);
      setToast({ message: msg, type: 'error' });
    },
  });

  const {
    data: editProcessData,
    isLoading: editLoading,
    isError: editFetchError,
    error: editFetchErrorDetail,
  } = useQuery({
    queryKey: ['admin', 'mail-processes', editKey],
    queryFn: async () => {
      const res = await apiGet(`/admin/mail-processes/${encodeURIComponent(editKey)}`);
      const body = res?.data ?? {};
      const process = body.process ?? body.data?.process ?? body;
      return {
        subject: String(process?.subject ?? process?.Subject ?? ''),
        bodyText: String(process?.bodyText ?? process?.body_text ?? ''),
        bodyHtml: String(process?.bodyHtml ?? process?.body_html ?? ''),
        name: process?.name ?? editKey,
        description: process?.description ?? '',
        enabled: process?.enabled !== false,
        placeholders: Array.isArray(process?.placeholders)
          ? process.placeholders
          : PLACEHOLDERS_BY_KEY[editKey] || [],
      };
    },
    enabled: Boolean(editKey),
    staleTime: 0,
  });

  useEffect(() => {
    if (!editKey) {
      setEditError(null);
      return;
    }
    if (editFetchError && editFetchErrorDetail) {
      setEditError(
        editFetchErrorDetail?.response?.data?.error ||
          editFetchErrorDetail?.message ||
          'Could not load template'
      );
      return;
    }
    if (editProcessData) {
      setEditError(null);
      setEditSubject(editProcessData.subject);
      setEditBodyText(editProcessData.bodyText);
      setEditBodyHtml(editProcessData.bodyHtml);
    }
  }, [editKey, editProcessData, editFetchError, editFetchErrorDetail]);

  const openEdit = useCallback(key => {
    setEditKey(key);
    setEditorTab(0);
    setEditError(null);
    setEditSubject('');
    setEditBodyText('');
    setEditBodyHtml('');
  }, []);

  const insertPlaceholder = useCallback((field, placeholder) => {
    if (field === 'subject') {
      setEditSubject(prev => prev + placeholder);
    } else if (field === 'html') {
      setEditBodyHtml(prev => prev + placeholder);
    } else if (field === 'plain') {
      setEditBodyText(prev => prev + placeholder);
    }
  }, []);

  const processes = useMemo(() => {
    const list = (data?.processes ?? []).slice();
    return list.sort((a, b) => {
      const ai = PROCESS_KEY_ORDER.indexOf(a.key);
      const bi = PROCESS_KEY_ORDER.indexOf(b.key);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return (a.name || a.key).localeCompare(b.name || b.key);
    });
  }, [data?.processes]);

  const summary = useMemo(() => {
    const enabled = processes.filter(p => p.enabled).length;
    const total = processes.length;
    const custom = processes.filter(p => p.hasCustomTemplate).length;
    return { enabled, total, custom };
  }, [processes]);

  const editProcess = editKey ? processes.find(p => p.key === editKey) : null;
  const placeholders = editProcessData?.placeholders?.length
    ? editProcessData.placeholders
    : editKey
      ? PLACEHOLDERS_BY_KEY[editKey] || []
      : [];

  const handleSaveTemplate = useCallback(() => {
    if (!editKey) return;
    setEditError(null);
    saveTemplateMutation.mutate({
      key: editKey,
      enabled: editProcess?.enabled,
      subject: editSubject,
      bodyHtml: editBodyHtml,
      bodyText: editBodyText,
    });
  }, [
    editKey,
    editSubject,
    editBodyHtml,
    editBodyText,
    editProcess?.enabled,
    saveTemplateMutation,
  ]);

  const handleResetToDefault = useCallback(() => {
    if (!editKey) return;
    setEditError(null);
    saveTemplateMutation.mutate({
      key: editKey,
      enabled: editProcess?.enabled,
      subject: '',
      bodyHtml: '',
      bodyText: '',
    });
  }, [editKey, editProcess?.enabled, saveTemplateMutation]);

  const handleLoadDefault = useCallback(async () => {
    if (!editKey) return;
    setEditError(null);
    setLoadingDefault(true);
    try {
      const res = await apiGet(`/admin/mail-processes/${encodeURIComponent(editKey)}/default`);
      const body = res?.data ?? {};
      const def = body.defaultTemplate ?? body;
      setEditSubject(def.subject ?? '');
      setEditBodyText(def.bodyText ?? '');
      setEditBodyHtml(def.bodyHtml ?? '');
      setToast({
        message: 'Default template loaded. Save to apply or edit first.',
        type: 'success',
      });
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Could not load default template';
      setEditError(msg);
      setToast({ message: msg, type: 'error' });
    } finally {
      setLoadingDefault(false);
    }
  }, [editKey]);

  const renderProcessRow = p => (
    <div key={p.key} className={styles.processRow}>
      <div className={styles.processRowAccent} data-enabled={p.enabled} aria-hidden />
      <div className={styles.processMain}>
        <InlineStack gap="300" blockAlign="center" wrap>
          <Text as="h3" variant="headingSm">
            {p.name}
          </Text>
          <Badge tone={p.enabled ? 'success' : 'critical'} size="small">
            {p.enabled ? 'Sending' : 'Paused'}
          </Badge>
          {p.hasCustomTemplate && (
            <Badge tone="info" size="small">
              Custom template
            </Badge>
          )}
        </InlineStack>
        <Text as="p" variant="bodySm" tone="subdued" className={styles.processDesc}>
          {p.description}
        </Text>
      </div>
      <div className={styles.processActions}>
        <div className={styles.toggleWrap} role="group" aria-label={`${p.name} – send or pause`}>
          <button
            type="button"
            className={styles.toggleOption}
            data-active={p.enabled}
            onClick={() => toggleMutation.mutate({ key: p.key, enabled: true })}
            disabled={toggleMutation.isPending}
          >
            Sending
          </button>
          <button
            type="button"
            className={styles.toggleOption}
            data-active={!p.enabled}
            onClick={() => toggleMutation.mutate({ key: p.key, enabled: false })}
            disabled={toggleMutation.isPending}
          >
            Paused
          </button>
        </div>
        <Button
          icon={EditIcon}
          variant="secondary"
          size="slim"
          onClick={() => openEdit(p.key)}
          accessibilityLabel={`Edit template for ${p.name}`}
        >
          Edit template
        </Button>
      </div>
    </div>
  );

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
        <BlockStack gap="600">
          {!isLoading && processes.length > 0 && (
            <div className={styles.summaryBar}>
              <div className={styles.summaryStats}>
                <div className={styles.summaryStatItem}>
                  <span className={styles.summaryStatValue}>
                    {summary.enabled}
                    <span className={styles.summaryStatUnit}>/{summary.total}</span>
                  </span>
                  <span className={styles.summaryStatLabel}>Sending</span>
                </div>
                <div className={styles.summaryStatDivider} />
                <div className={styles.summaryStatItem}>
                  <span className={styles.summaryStatValue}>{summary.custom}</span>
                  <span className={styles.summaryStatLabel}>
                    Custom template{summary.custom !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <p className={styles.summaryHelp}>
                When paused, that email is not sent but the flow continues (e.g. login still
                succeeds).
              </p>
            </div>
          )}

          <div className={styles.processesCard}>
            {isLoading ? (
              <div className={styles.loadingState}>
                <Spinner size="large" />
                <Text as="p" tone="subdued">
                  Loading email processes…
                </Text>
              </div>
            ) : (
              <>
                {Object.entries(PROCESS_GROUPS).map(([groupName, keys]) => {
                  const groupProcesses = processes.filter(p => keys.includes(p.key));
                  if (groupProcesses.length === 0) return null;
                  return (
                    <div key={groupName} className={styles.group}>
                      <div className={styles.groupHeader}>
                        <span className={styles.groupTitle}>{groupName}</span>
                        <Badge size="small" tone="info">
                          {groupProcesses.length} email{groupProcesses.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                      <div className={styles.groupList}>{groupProcesses.map(renderProcessRow)}</div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </BlockStack>
      </AdminPageLayout>

      <Modal
        open={Boolean(editKey)}
        onClose={() => {
          setEditKey(null);
          setEditError(null);
        }}
        title=""
        primaryAction={{
          content: 'Save template',
          onAction: handleSaveTemplate,
          loading: saveTemplateMutation.isPending,
          disabled: editLoading,
        }}
        secondaryActions={[
          {
            content: 'Load default',
            onAction: handleLoadDefault,
            loading: loadingDefault,
            disabled: editLoading,
          },
          {
            content: 'Clear custom (use default)',
            destructive: true,
            onAction: handleResetToDefault,
            loading: saveTemplateMutation.isPending,
            disabled: editLoading,
          },
          { content: 'Cancel', onAction: () => setEditKey(null) },
        ]}
        large
      >
        <div className={styles.modalRoot} data-template-editor>
          <header className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>
              {editProcessData?.name ?? editProcess?.name ?? 'Edit template'}
            </h2>
            {(editProcessData?.description || editProcess?.description) && (
              <p className={styles.modalSubtitle}>
                {editProcessData?.description ?? editProcess?.description}
              </p>
            )}
          </header>

          {(editError || editFetchError) && (
            <Banner tone="critical" onDismiss={() => setEditError(null)}>
              {editError ||
                editFetchErrorDetail?.response?.data?.error ||
                editFetchErrorDetail?.message ||
                'Could not load template'}
            </Banner>
          )}

          {editLoading ? (
            <div className={styles.modalLoading}>
              <Spinner size="large" />
              <Text as="p" variant="bodySm" tone="subdued">
                Loading template…
              </Text>
            </div>
          ) : (
            <div className={styles.modalScroll}>
              <section className={styles.editorSection}>
                <label className={styles.editorLabel}>
                  <span className={styles.editorLabelText}>Subject line</span>
                  <span className={styles.editorLabelHint}>
                    Leave empty to use the default. Max 500 characters.
                  </span>
                </label>
                {placeholders.length > 0 && (
                  <div className={styles.insertBar}>
                    <span className={styles.insertBarLabel}>Insert:</span>
                    {placeholders.map(ph => (
                      <button
                        key={ph}
                        type="button"
                        className={styles.insertChip}
                        onClick={() => insertPlaceholder('subject', ph)}
                      >
                        {ph}
                      </button>
                    ))}
                  </div>
                )}
                <TextField
                  label=""
                  labelHidden
                  value={editSubject}
                  onChange={setEditSubject}
                  placeholder="e.g. Your RipX sign-in code"
                  autoComplete="off"
                />
              </section>

              <section className={styles.editorSection}>
                <h3 className={styles.editorPanelTitle}>Email body</h3>
                <div className={styles.tabBar} role="tablist" aria-label="Body format">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={editorTab === 0}
                    aria-controls="mail-body-panel"
                    id="tab-plain"
                    className={styles.tabButton}
                    data-active={editorTab === 0}
                    onClick={() => setEditorTab(0)}
                  >
                    Plain text
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={editorTab === 1}
                    aria-controls="mail-body-panel"
                    id="tab-html"
                    className={styles.tabButton}
                    data-active={editorTab === 1}
                    onClick={() => setEditorTab(1)}
                  >
                    HTML
                  </button>
                </div>
                <div
                  id="mail-body-panel"
                  role="tabpanel"
                  aria-labelledby={editorTab === 0 ? 'tab-plain' : 'tab-html'}
                  className={styles.editorPanel}
                >
                  {editorTab === 0 && (
                    <>
                      <p className={styles.editorHint}>
                        Shown in email clients that don&apos;t support HTML.
                      </p>
                      <textarea
                        className={styles.editorTextarea}
                        value={editBodyText}
                        onChange={e => setEditBodyText(e.target.value)}
                        placeholder="Optional. Leave empty to use the default plain text."
                        rows={14}
                        spellCheck={false}
                        aria-label="Plain text body"
                      />
                    </>
                  )}
                  {editorTab === 1 && (
                    <>
                      {placeholders.length > 0 && (
                        <div className={styles.insertBar}>
                          <span className={styles.insertBarLabel}>Insert placeholder:</span>
                          {placeholders.map(ph => (
                            <button
                              key={ph}
                              type="button"
                              className={styles.insertChip}
                              onClick={() => insertPlaceholder('html', ph)}
                            >
                              {ph}
                            </button>
                          ))}
                        </div>
                      )}
                      <textarea
                        className={styles.editorTextarea}
                        value={editBodyHtml}
                        onChange={e => setEditBodyHtml(e.target.value)}
                        placeholder="Optional. Use valid HTML. Leave empty for default."
                        rows={18}
                        spellCheck={false}
                        aria-label="HTML body"
                        data-editor="html"
                      />
                      {placeholders.length > 0 && (
                        <p className={styles.editorHint}>
                          Placeholders:{' '}
                          {placeholders.map(ph => (
                            <code key={ph} className={styles.placeholderCode}>
                              {ph}
                            </code>
                          ))}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </Modal>

      {toast.message && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast({ message: null, type: 'success' })}
        />
      )}
    </PageShell>
  );
}
