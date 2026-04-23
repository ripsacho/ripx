/**
 * Domain List – list domains the current user can access (email session).
 * Add domain, Open domain (set API key + current store, go to dashboard).
 */

import React, { useState, useEffect } from 'react';

/** Client-side domain validation (aligned with backend). Returns { valid, normalized, error }. */
function validateDomainInput(domain) {
  if (!domain || typeof domain !== 'string') {
    return { valid: false, error: 'Enter a domain (e.g. example.com or www.example.com)' };
  }
  const trimmed = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .replace(/\s/g, '');
  if (!trimmed) {
    return { valid: false, error: 'Enter a valid domain (e.g. example.com or www.example.com)' };
  }
  if (trimmed.length > 253) {
    return { valid: false, error: 'Domain is too long' };
  }
  if (!/\./.test(trimmed)) {
    return { valid: false, error: 'Domain must include a TLD (e.g. example.com)' };
  }
  const labels = trimmed.split('.');
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (label.length === 0) {
      return { valid: false, error: 'Domain cannot have empty parts' };
    }
    if (label.length > 63) {
      return { valid: false, error: 'Domain part is too long' };
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label) && label.length !== 1) {
      return {
        valid: false,
        error:
          'Domain can only contain letters, numbers, and hyphens; hyphens cannot start or end a part',
      };
    }
    if (label.length === 1 && !/^[a-z0-9]$/.test(label)) {
      return { valid: false, error: 'Invalid domain format' };
    }
  }
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,}$/.test(tld)) {
    return { valid: false, error: 'Domain must end with a valid TLD (e.g. .com, .io)' };
  }
  if (/\.myshopify\.com$/i.test(trimmed)) {
    return {
      valid: false,
      error:
        'This is a Shopify store. Connect it with Shopify (button below) to add it to your list—don’t enter it here.',
      useShopifyConnect: true,
      normalized: trimmed,
    };
  }
  if (trimmed === 'localhost' || trimmed.endsWith('.localhost')) {
    return { valid: false, error: 'Use your real domain (e.g. example.com), not localhost' };
  }
  if (trimmed.endsWith('.local')) {
    return {
      valid: false,
      error: 'Use your public domain (e.g. example.com), not .local addresses',
    };
  }
  return { valid: true, normalized: trimmed };
}

/** Normalize domain input: strip protocol, path, trailing slash, query, hash, and extra whitespace. */
function normalizePastedDomain(value) {
  if (!value || typeof value !== 'string') return value;
  let s = value.trim().replace(/\s+/g, '').toLowerCase();
  if (!s) return value.trim();
  try {
    if (/^https?:\/\//i.test(s)) {
      const host = new URL(s).hostname;
      return (
        host ||
        s
          .replace(/^https?:\/\//i, '')
          .split('/')[0]
          .replace(/\/+$/, '')
      );
    }
  } catch {
    s = s
      .replace(/^https?:\/\//i, '')
      .split(/[?#]/)[0]
      .split('/')[0]
      .replace(/^\/+|\/+$/g, '');
    return s || value.trim();
  }
  const withoutPath = s
    .split(/[?#]/)[0]
    .split('/')[0]
    .replace(/^\/+|\/+$/g, '');
  return withoutPath || s;
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Page,
  Card,
  DataTable,
  Modal,
  TextField,
  Text,
  BlockStack,
  Banner,
  Button,
  Spinner,
  Icon,
  Tooltip,
} from '@shopify/polaris';
import {
  PlusIcon,
  ClipboardIcon,
  LinkIcon,
  GlobeIcon,
  ExternalIcon,
  DeleteIcon,
  ArrowRightIcon,
} from '@shopify/polaris-icons';
import { PageShell, LegalFooter } from '../Shared';
import { useSearchParams } from 'react-router-dom';
import { ROUTES, STORAGE_KEYS } from '../../constants';
import styles from './DomainList.module.css';
import { useShopifyInstallStatus } from '../../hooks';
import {
  apiMeGet,
  apiMePost,
  apiMeDelete,
  apiGet,
  getApiBaseUrl,
  getAccountApiKey,
  setAccountApiKey,
  getDomainKeys,
  setDomainKey,
  unwrapData,
  clearStoreSelection,
  getEmailToken,
  setCurrentStore,
  isEmbeddedInIframe,
  redirectToAppUrl,
  getConnectUrl,
  getUrlWithEmbedParams,
  openCenteredPopup,
  fetchShopifyConnectionStatus,
} from '../../services';
import { isShopifyStoreDomain, normalizeShopifyDomain } from '../../utils/shopifyAdmin';

/** postMessage type from OAuth success tab when store connected from embed */
const OAUTH_SUCCESS_MESSAGE_TYPE = 'ripx-store-connected';
const ADD_DOMAIN_DRAFT_KEY = 'ripx_add_domain_draft_v1';
const SHOPIFY_CONNECT_SESSION_KEY = 'ripx_shopify_connect_session_v1';

/** True only for Shopify OAuth authorize URLs; prevents using our Connect or /api/auth URL as "Continue to Shopify" target */
function isShopifyOAuthUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('https://')) return false;
  return (
    url.includes('myshopify.com') &&
    (url.includes('/admin/oauth') || url.includes('oauth/authorize'))
  );
}

/** True when we have a URL to show "Continue" / "Copy link" in Add domain modal (Shopify OAuth or our install page) */
function isConnectStoreUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('https://')) return false;
  return isShopifyOAuthUrl(url) || url.includes('/api/auth/install');
}

function writeShopifyConnectSession(shop) {
  if (typeof window === 'undefined' || !shop) return;
  try {
    window.localStorage.setItem(
      SHOPIFY_CONNECT_SESSION_KEY,
      JSON.stringify({ shop: normalizeShopifyDomain(shop), startedAt: Date.now() })
    );
  } catch {
    // ignore storage issues
  }
}

function readShopifyConnectSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SHOPIFY_CONNECT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.shop) return null;
    return { shop: normalizeShopifyDomain(parsed.shop), startedAt: Number(parsed.startedAt || 0) };
  } catch {
    return null;
  }
}

function clearShopifyConnectSession() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SHOPIFY_CONNECT_SESSION_KEY);
  } catch {
    // ignore storage issues
  }
}

function DomainList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addDomainFlow, setAddDomainFlow] = useState('choice'); // 'choice' | 'custom' | 'shopify'
  const [newDomain, setNewDomain] = useState('');
  const [addError, setAddError] = useState(null);
  const [shopifyDomainToConnect, setShopifyDomainToConnect] = useState(null);
  const [connectShopifyLoading, setConnectShopifyLoading] = useState(false);
  const [newlyReceivedApiKey, setNewlyReceivedApiKey] = useState(null);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [autoApiKeyModalShown, setAutoApiKeyModalShown] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiKeyError, setApiKeyError] = useState(null);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [domainToRemove, setDomainToRemove] = useState(null);
  const [openingDomain, setOpeningDomain] = useState(null);
  /** When set, show "Continue to Shopify" link/button so user gesture triggers redirect or new tab */
  const [pendingOAuthUrl, setPendingOAuthUrl] = useState(null);
  const [pendingOAuthShop, setPendingOAuthShop] = useState(null);
  /** Expiry in seconds for the install link (from install-link API); shown in modal */
  const [pendingOAuthExpiresInSeconds, setPendingOAuthExpiresInSeconds] = useState(null);
  const [oauthExpiresInSecondsLive, setOauthExpiresInSecondsLive] = useState(null);
  /** When set, show "Sign in required" and open Connect in new tab instead of redirecting */
  const [signInRequiredShop, setSignInRequiredShop] = useState(null);
  /** When true, show "Link copied" and incognito steps (after Copy link in embed) */
  const [_oauthLinkCopied, setOauthLinkCopied] = useState(false);
  /** When in iframe with start_oauth=1 we show a link to open OAuth in new tab (user click avoids popup blocker). { url, shop } */
  const [startOAuthNewTab, setStartOAuthNewTab] = useState(null);
  /** Wrong-store banner: 'idle' | 'loading' | 'copied' | 'error' when user gets incognito link */
  const [wrongStoreIncognitoStatus, setWrongStoreIncognitoStatus] = useState('idle');
  /** Modal: true for 2s after user copies OAuth link (embedded) */
  const [modalOAuthLinkCopied, setModalOAuthLinkCopied] = useState(false);
  const [oauthAutoRedirecting, setOauthAutoRedirecting] = useState(false);
  const [assistantCelebrate, setAssistantCelebrate] = useState(false);
  const [assistantStoreCopied, setAssistantStoreCopied] = useState(false);
  const assistantDoneCountRef = React.useRef(0);
  const assistantCelebrateTimerRef = React.useRef(null);
  const assistantStoreCopiedTimerRef = React.useRef(null);

  const useEmailDomains = !!getEmailToken();
  const isEmbedded = isEmbeddedInIframe();
  const switchReason = searchParams.get('reason');
  const requestedShop = searchParams.get('shop');
  const needsApiKeyForSwitch = switchReason === 'api_key_required' && !!requestedShop;
  const suggestedShopifyDomain = (() => {
    const qShop = searchParams.get('shop');
    return qShop && isShopifyStoreDomain(qShop) ? normalizeShopifyDomain(qShop) : '';
  })();

  // When on My domains with email session, clear stored shop so layout/other components don't send requests with a stale unconnected shop (avoids 401 → login redirect)
  useEffect(() => {
    if (useEmailDomains) {
      clearStoreSelection();
    }
  }, [useEmailDomains]);

  useEffect(() => {
    if (!needsApiKeyForSwitch || autoApiKeyModalShown) return;
    setApiKeyModalOpen(true);
    setAutoApiKeyModalShown(true);
  }, [needsApiKeyForSwitch, autoApiKeyModalShown]);

  // Smooth recovery path: if we already have an account key, resume the requested standalone store automatically.
  useEffect(() => {
    if (!needsApiKeyForSwitch || !requestedShop) return;
    const accountKey = getAccountApiKey();
    if (!accountKey) return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.API_KEY, accountKey);
      setCurrentStore(requestedShop);
      const next = getUrlWithEmbedParams(ROUTES.appDashboard(requestedShop), {
        shop: requestedShop,
      });
      redirectToAppUrl(next);
    } catch (_) {
      // ignore storage errors and keep manual recovery UI visible
    }
  }, [needsApiKeyForSwitch, requestedShop]);

  // Resume add-domain draft when modal is reopened (user-friendly "continue where you left off").
  useEffect(() => {
    if (!addModalOpen) return;
    if (addDomainFlow !== 'choice' || newDomain.trim()) return;
    try {
      const raw = window.localStorage.getItem(ADD_DOMAIN_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const ageMs = Date.now() - Number(parsed?.ts || 0);
      if (ageMs > 24 * 60 * 60 * 1000) return; // ignore stale drafts (>24h)
      if (parsed?.flow === 'custom' || parsed?.flow === 'shopify') {
        setAddDomainFlow(parsed.flow);
      }
      if (typeof parsed?.domain === 'string' && parsed.domain.trim()) {
        setNewDomain(normalizePastedDomain(parsed.domain));
      }
    } catch {
      // ignore malformed draft
    }
  }, [addModalOpen, addDomainFlow, newDomain]);

  // Persist add-domain draft while modal is open.
  useEffect(() => {
    if (!addModalOpen) return;
    try {
      window.localStorage.setItem(
        ADD_DOMAIN_DRAFT_KEY,
        JSON.stringify({
          flow: addDomainFlow,
          domain: newDomain,
          ts: Date.now(),
        })
      );
    } catch {
      // ignore storage issues
    }
  }, [addModalOpen, addDomainFlow, newDomain]);

  // When OAuth completed in a new tab (from embed), the success tab posts this; refresh domains list so the new store appears without leaving Admin
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = event => {
      try {
        if (
          event?.data?.type === OAUTH_SUCCESS_MESSAGE_TYPE &&
          event.origin === window.location.origin
        ) {
          queryClient.invalidateQueries({ queryKey: ['me', 'domains'] });
          queryClient.invalidateQueries({ queryKey: ['account', 'stores'] });
          queryClient.invalidateQueries({ queryKey: ['domains', 'shopify-install-status'] });
        }
      } catch (_) {
        // Ignore malformed or cross-origin messages
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [queryClient]);

  // Same-tab OAuth: when we landed here with ?start_oauth=1&shop=... (after leaving embed), get OAuth URL and redirect so the correct store connects.
  // If we're still in an iframe (top navigation was blocked), open OAuth in a new tab so the flow runs in a top-level window and Shopify returns the correct shop.
  const startOAuthHandled = React.useRef(false);
  useEffect(() => {
    const shop = searchParams.get('shop');
    const startOAuth = searchParams.get('start_oauth');
    if (startOAuth !== '1' || !shop || !isShopifyStoreDomain(shop) || startOAuthHandled.current)
      return;
    startOAuthHandled.current = true;
    const _origin = window.location.origin;
    const normalizedShop = normalizeShopifyDomain(shop);
    const inIframe = isEmbeddedInIframe();
    (async () => {
      try {
        const baseUrl = getApiBaseUrl();
        const token = getEmailToken();
        if (inIframe) {
          // Use install-link URL so when they copy and open in incognito, our server redirects to Shopify for this shop only.
          const origin = window.location.origin;
          const installLinkUrl = `${baseUrl}/auth/install-link?shop=${encodeURIComponent(normalizedShop)}${origin ? `&callback_base=${encodeURIComponent(origin)}` : ''}`;
          const res = await fetch(installLinkUrl, {
            credentials: 'include',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          const data = await res.json().catch(() => ({}));
          const installUrl = data?.url ?? data?.data?.url;
          if (
            installUrl &&
            typeof installUrl === 'string' &&
            installUrl.includes('/api/auth/install')
          ) {
            setStartOAuthNewTab({ url: installUrl, shop: normalizedShop });
          }
        } else {
          const origin = window.location.origin;
          const url = `${baseUrl}/auth/start?shop=${encodeURIComponent(normalizedShop)}&callback_base=${encodeURIComponent(origin)}`;
          const res = await fetch(url, {
            credentials: 'include',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          const data = await res.json().catch(() => ({}));
          const redirectUrl = data?.redirectUrl ?? data?.data?.redirectUrl;
          if (redirectUrl && typeof redirectUrl === 'string' && isShopifyOAuthUrl(redirectUrl)) {
            window.location.href = redirectUrl;
          }
        }
      } catch (_) {
        startOAuthHandled.current = false;
      }
    })();
  }, [searchParams]);

  const {
    data: meData,
    isLoading: meLoading,
    error: meError,
  } = useQuery({
    queryKey: ['me', 'domains'],
    queryFn: async () => {
      const res = await apiMeGet('/me/domains');
      return unwrapData(res) || { domains: [] };
    },
    staleTime: 30 * 1000,
    enabled: useEmailDomains,
  });

  const {
    data: accountStoresData,
    isLoading: accountStoresLoading,
    error: accountStoresError,
  } = useQuery({
    queryKey: ['account', 'stores'],
    queryFn: async () => {
      const res = await apiGet('/account/stores');
      const raw = res.data?.data ?? res.data;
      const stores = raw?.stores ?? [];
      return {
        domains: stores.map(s => ({
          domain: s.domain,
          platform: /\.myshopify\.com$/i.test(s.domain) ? 'shopify' : s.platform || 'standalone',
        })),
        raw,
      };
    },
    staleTime: 30 * 1000,
    enabled: !useEmailDomains,
  });

  const data = useEmailDomains ? meData : accountStoresData;
  const isLoading = useEmailDomains ? meLoading : accountStoresLoading;
  const error = useEmailDomains ? meError : accountStoresError;
  const domains = React.useMemo(() => data?.domains ?? [], [data]);
  const { statusByShop: shopifyInstallStatus } = useShopifyInstallStatus(domains, 'domains-list');

  // Smart resume: if Shopify connect session completed, open that store automatically.
  useEffect(() => {
    if (!useEmailDomains || !domains.length) return;
    const session = readShopifyConnectSession();
    if (!session?.shop) return;
    const isConnected = domains.some(
      d => normalizeShopifyDomain(d.domain || '') === normalizeShopifyDomain(session.shop)
    );
    if (!isConnected) return;
    clearShopifyConnectSession();
    setPendingOAuthUrl(null);
    setPendingOAuthShop(null);
    setPendingOAuthExpiresInSeconds(null);
    setOauthAutoRedirecting(false);
    setAddModalOpen(false);
    setCurrentStore(session.shop);
    redirectToAppUrl(
      getUrlWithEmbedParams(ROUTES.appDashboard(session.shop), { shop: session.shop })
    );
  }, [useEmailDomains, domains]);

  const getShopifyInstallState = domainValue => {
    if (!isShopifyStoreDomain(domainValue)) return null;
    const normalized = normalizeShopifyDomain(domainValue);
    if (openingDomain === normalized) return 'checking';
    return shopifyInstallStatus?.[normalized] || 'unknown';
  };

  const getShopifyInstallBadge = domainValue => {
    const status = getShopifyInstallState(domainValue);
    if (!status) return null;
    const labels = {
      connected: 'Connected',
      needs_install: 'Needs install',
      needs_link: 'Needs link',
      restricted: 'Restricted',
      checking: 'Checking…',
      unknown: 'Status unknown',
    };
    return (
      <span
        className={`${styles.shopifyInstallBadge} ${styles[`shopifyInstallBadge_${status}`]}`}
        title={
          status === 'needs_install'
            ? 'RipX app is not installed or connected for this Shopify store'
            : status === 'needs_link'
              ? 'RipX app is installed but this store is not linked to your account yet'
              : status === 'restricted'
                ? 'This store is connected but your account access is currently restricted'
                : labels[status]
        }
      >
        {labels[status]}
      </span>
    );
  };

  // Seamless handoff: after generating install link, auto-continue to the connect page.
  useEffect(() => {
    if (!pendingOAuthUrl || !oauthAutoRedirecting) return;
    const handoffTimer = window.setTimeout(() => {
      const popup = openCenteredPopup(pendingOAuthUrl);
      if (!popup) {
        redirectToAppUrl(pendingOAuthUrl);
      }
    }, 550);
    const fallbackTimer = window.setTimeout(() => {
      // If browser blocks/ignores automatic navigation, keep manual actions visible.
      setOauthAutoRedirecting(false);
    }, 3200);
    return () => {
      window.clearTimeout(handoffTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, [pendingOAuthUrl, oauthAutoRedirecting]);

  useEffect(() => {
    setOauthExpiresInSecondsLive(
      typeof pendingOAuthExpiresInSeconds === 'number' && pendingOAuthExpiresInSeconds > 0
        ? pendingOAuthExpiresInSeconds
        : null
    );
  }, [pendingOAuthExpiresInSeconds]);

  useEffect(() => {
    if (!pendingOAuthUrl || !oauthExpiresInSecondsLive || oauthExpiresInSecondsLive <= 0) return;
    const timer = window.setInterval(() => {
      setOauthExpiresInSecondsLive(prev => (typeof prev === 'number' && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pendingOAuthUrl, oauthExpiresInSecondsLive]);

  // When we had wrong-store redirect and the intended shop is now in the list, clear URL params so the banner goes away and we don't redirect again
  useEffect(() => {
    if (!useEmailDomains || !domains.length) return;
    const reason = searchParams.get('reason');
    const intendedShop = searchParams.get('shop');
    if (
      reason === (ROUTES.CONNECT_REASON?.OAUTH_WRONG_STORE || 'oauth_wrong_store') &&
      intendedShop &&
      domains.some(d => (d.domain || '').toLowerCase() === intendedShop.toLowerCase())
    ) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('reason');
        next.delete('shop');
        next.delete('connected_shop');
        return next;
      });
    }
  }, [useEmailDomains, domains, searchParams, setSearchParams]);

  const addMutation = useMutation({
    mutationFn: async domain => {
      const res = await apiMePost('/me/domains', { domain: domain.trim() });
      return unwrapData(res);
    },
    onSuccess: (payload, submittedDomain) => {
      const normalized = submittedDomain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .split('/')[0];
      if (payload?.apiKey) {
        setAccountApiKey(payload.apiKey);
        setDomainKey(normalized, payload.apiKey);
        setNewlyReceivedApiKey(payload.apiKey);
      }
      queryClient.invalidateQueries({ queryKey: ['me', 'domains'] });
      clearAddDomainDraft();
      setAddModalOpen(false);
      setNewDomain('');
      setAddError(null);
    },
    onError: err => {
      setAddError(err.response?.data?.error || err.message || 'Failed to add domain');
    },
  });

  const removeDomainMutation = useMutation({
    mutationFn: async ({ tenantId }) => {
      const res = await apiMeDelete(`/me/domains/${encodeURIComponent(tenantId)}`);
      return res.data;
    },
    onSuccess: (_data, { domain: domainName }) => {
      if (domainName) setDomainKey(domainName, null);
      queryClient.invalidateQueries({ queryKey: ['me', 'domains'] });
      setRemoveConfirmOpen(false);
      setDomainToRemove(null);
    },
    onError: () => {
      setRemoveConfirmOpen(false);
      setDomainToRemove(null);
    },
  });

  const regenerateKeyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiMePost('/me/account/regenerate-api-key', {});
      return unwrapData(res);
    },
    onSuccess: payload => {
      if (payload?.apiKey) {
        setAccountApiKey(payload.apiKey);
        setNewlyReceivedApiKey(payload.apiKey);
        // If user came here from a Shopify -> standalone switch, continue immediately.
        if (needsApiKeyForSwitch && requestedShop) {
          try {
            window.localStorage.setItem(STORAGE_KEYS.API_KEY, payload.apiKey);
            setCurrentStore(requestedShop);
            const next = getUrlWithEmbedParams(ROUTES.appDashboard(requestedShop), {
              shop: requestedShop,
            });
            redirectToAppUrl(next);
            return;
          } catch (_) {
            // keep fallback banner/key display
          }
        }
      }
      setRegenerateConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['me', 'domains'] });
    },
    onError: () => {
      setRegenerateConfirmOpen(false);
    },
  });

  const handleRegenerateApiKey = () => {
    regenerateKeyMutation.mutate();
  };

  /**
   * @param {string} normalizedDomain
   * @param {boolean} hasKey
   * @param {{ returnOAuthUrl?: boolean }} options - When true and we would redirect to Shopify OAuth, return { redirectUrl } instead so caller can show a user-gesture link (required in embedded Admin iframe).
   * @returns {Promise<void | { redirectUrl: string }} - redirectUrl when options.returnOAuthUrl and we have an OAuth URL to show
   */
  const openAppAfterVerify = async (normalizedDomain, hasKey, options = {}) => {
    const returnOAuthUrl = !!options.returnOAuthUrl;
    if (hasKey) {
      setCurrentStore(normalizedDomain);
      window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(normalizedDomain), {
        shop: normalizedDomain,
      });
      return;
    }
    if (isShopifyStoreDomain(normalizedDomain)) {
      try {
        const connectionStatus = await fetchShopifyConnectionStatus(normalizedDomain);
        if (connectionStatus?.connected) {
          setCurrentStore(normalizedDomain);
          window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(normalizedDomain), {
            shop: normalizedDomain,
          });
          return;
        }
      } catch (statusErr) {
        if (statusErr?.response?.status === 401) {
          // No live Shopify session for this tab yet. Keep going so account-linked store
          // checks below can open the app directly instead of forcing OAuth immediately.
        }
      }
    }
    // Prevent 401 interceptor from redirecting so we can redirect with shop/reason from catch
    if (returnOAuthUrl && typeof window !== 'undefined') {
      window.sessionStorage?.setItem(STORAGE_KEYS.OAUTH_REDIRECTING, '1');
    }
    const hasEmailSession = !!getEmailToken();
    try {
      if (hasEmailSession) {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const startRes = await apiGet('/auth/start', {
          shop: normalizedDomain,
          callback_base: origin || undefined,
        });
        const url = startRes?.data?.redirectUrl ?? unwrapData(startRes)?.redirectUrl;
        if (url && typeof url === 'string') {
          if (returnOAuthUrl) return { redirectUrl: url };
          const popup = openCenteredPopup(url);
          if (!popup) {
            if (isEmbeddedInIframe()) window.open(url, '_blank', 'noopener,noreferrer');
            else window.top.location.href = url;
          }
          return;
        }
        // No OAuth URL from API (e.g. 401 or error). Don't redirect — let caller show "Sign in required" and open Connect in new tab.
        if (returnOAuthUrl) {
          return { signInRequired: true, shop: normalizedDomain };
        }
        const fallbackUrl = `${origin}/api/auth?shop=${encodeURIComponent(normalizedDomain)}${origin ? `&callback_base=${encodeURIComponent(origin)}` : ''}`;
        const popup = openCenteredPopup(fallbackUrl);
        if (!popup) {
          if (isEmbeddedInIframe()) window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
          else window.top.location.href = fallbackUrl;
        }
        return;
      }
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      try {
        const startRes = await apiGet('/auth/start', {
          shop: normalizedDomain,
          callback_base: origin || undefined,
        });
        const url = startRes?.data?.redirectUrl ?? unwrapData(startRes)?.redirectUrl;
        if (url && typeof url === 'string') {
          if (returnOAuthUrl) return { redirectUrl: url };
          const popup = openCenteredPopup(url);
          if (!popup) {
            if (isEmbeddedInIframe()) window.open(url, '_blank', 'noopener,noreferrer');
            else window.top.location.href = url;
          }
          return;
        }
      } catch (_) {
        /* /auth/start failed (e.g. 401). Don't return fallback /api/auth — it would send user to login when they click. Send to Connect first. */
      }
      if (returnOAuthUrl) {
        return { signInRequired: true, shop: normalizedDomain };
      }
      const fallbackUrl = `${origin}/api/auth?shop=${encodeURIComponent(normalizedDomain)}${origin ? `&callback_base=${encodeURIComponent(origin)}` : ''}`;
      const popup = openCenteredPopup(fallbackUrl);
      if (!popup) {
        if (isEmbeddedInIframe()) window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
        else window.top.location.href = fallbackUrl;
      }
    } catch (err) {
      if (err?.response?.status === 401 && returnOAuthUrl) {
        return { signInRequired: true, shop: normalizedDomain };
      }
      if (err?.response?.status === 401) {
        redirectToAppUrl(
          getConnectUrl({
            shop: normalizedDomain,
            reason: ROUTES.CONNECT_REASON?.SIGN_IN_TO_CONNECT || 'sign_in_to_connect',
          })
        );
      } else {
        setCurrentStore(normalizedDomain);
        window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(normalizedDomain), {
          shop: normalizedDomain,
        });
      }
    } finally {
      if (returnOAuthUrl && typeof window !== 'undefined')
        window.sessionStorage?.removeItem(STORAGE_KEYS.OAUTH_REDIRECTING);
    }
  };

  const handleOpen = async domainRow => {
    const domain = typeof domainRow === 'object' ? domainRow?.domain : domainRow;
    if (!domain || openingDomain) return;
    setStartOAuthNewTab(null);
    setSignInRequiredShop(null);
    const isShopify = isShopifyStoreDomain(domain);
    const normalizedDomain = isShopify ? normalizeShopifyDomain(domain) : domain;
    if (isShopify) {
      setOpeningDomain(normalizedDomain);
      const key =
        getAccountApiKey() || getDomainKeys()[domain] || getDomainKeys()[normalizedDomain];
      if (key) {
        try {
          window.localStorage.setItem(STORAGE_KEYS.API_KEY, key);
        } catch (_) {
          /* ignore */
        }
      }
      try {
        await openAppAfterVerify(normalizedDomain, false);
      } finally {
        setOpeningDomain(null);
      }
      return;
    }
    const key = getAccountApiKey() || getDomainKeys()[domain];
    if (!key) return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.API_KEY, key);
      setCurrentStore(domain);
      window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(domain), { shop: domain });
    } catch (_) {
      // ignore storage errors
    }
  };

  const handleOpenApp = async domain => {
    const d = typeof domain === 'object' ? domain?.domain : domain;
    if (!d || openingDomain) return;
    setStartOAuthNewTab(null);
    setSignInRequiredShop(null);
    const isShopify = isShopifyStoreDomain(d);
    const normalized = isShopify ? normalizeShopifyDomain(d) : d;
    const key = getAccountApiKey() || getDomainKeys()[d] || getDomainKeys()[normalized];
    if (key) {
      try {
        window.localStorage.setItem(STORAGE_KEYS.API_KEY, key);
      } catch {
        // ignore localStorage errors
      }
      setCurrentStore(normalized);
      window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(normalized), {
        shop: normalized,
      });
      return;
    }
    if (isShopify) {
      setOpeningDomain(normalized);
      try {
        if (key) {
          try {
            window.localStorage.setItem(STORAGE_KEYS.API_KEY, key);
          } catch {
            // ignore localStorage errors
          }
        }
        await openAppAfterVerify(normalized, false);
      } finally {
        setOpeningDomain(null);
      }
    } else {
      setCurrentStore(normalized);
      window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(normalized), {
        shop: normalized,
      });
    }
  };

  const handleAddSubmit = () => {
    setShopifyDomainToConnect(null);
    const validation = validateDomainInput(newDomain);
    if (!validation.valid) {
      if (validation.useShopifyConnect && validation.normalized) {
        // Smart upgrade: switch to Shopify connect flow automatically.
        setAddDomainFlow('shopify');
        setNewDomain(validation.normalized);
        setShopifyDomainToConnect(validation.normalized);
        setAddError(
          'Detected a Shopify store. Continue with "Connect with Shopify" to link it correctly.'
        );
        return;
      }
      setAddError(validation.error);
      return;
    }
    setAddError(null);
    addMutation.mutate(validation.normalized);
  };

  const handleConnectShopifyFromModal = async () => {
    const domainToUse =
      shopifyDomainToConnect ||
      (addDomainFlow === 'shopify' && newDomain.trim() ? newDomain.trim().toLowerCase() : null);
    if (!domainToUse) return;
    if (addDomainFlow === 'shopify' && !isShopifyStoreDomain(domainToUse)) {
      setAddError('Enter a valid Shopify store domain (e.g. mystore.myshopify.com).');
      return;
    }
    const normalizedShop = normalizeShopifyDomain(domainToUse);
    setConnectShopifyLoading(true);
    setAddError(null);
    setPendingOAuthUrl(null);
    setPendingOAuthShop(null);
    setPendingOAuthExpiresInSeconds(null);
    setSignInRequiredShop(null);
    setOauthAutoRedirecting(false);
    clearShopifyConnectSession();
    setOauthLinkCopied(false);
    try {
      // When we have email session, get OAuth URL via direct fetch so the only source of "shop" is domainToUse (no apiGet/param merging). Ensures correct store when embedded.
      const hasEmailSession = !!getEmailToken();
      if (hasEmailSession) {
        const connected = (meData?.domains ?? []).some(
          d => (d.domain || '').toLowerCase() === normalizedShop.toLowerCase()
        );
        if (connected) {
          clearShopifyConnectSession();
          setCurrentStore(normalizedShop);
          window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(normalizedShop), {
            shop: normalizedShop,
          });
          setConnectShopifyLoading(false);
          return;
        }
        const baseUrl = getApiBaseUrl();
        const token = getEmailToken();
        const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        // Use install-link for both embedded and standalone: same instruction page (Step 1 → store admin, Step 2 → Continue to Shopify) so the correct store is approved.
        const installLinkUrl = `${baseUrl}/auth/install-link?shop=${encodeURIComponent(normalizedShop)}${origin ? `&callback_base=${encodeURIComponent(origin)}` : ''}`;
        const res = await fetch(installLinkUrl, { credentials: 'include', headers: authHeaders });
        const data = await res.json().catch(() => ({}));
        const installUrl = data?.url ?? data?.data?.url;
        if (res.status === 401) {
          setOauthAutoRedirecting(false);
          setSignInRequiredShop(domainToUse);
          setConnectShopifyLoading(false);
          return;
        }
        if (!res.ok) {
          const msg =
            res.status === 429
              ? 'Too many requests. Please try again in a few minutes.'
              : data?.error || `Could not get connection link (${res.status}).`;
          setAddError(msg);
          setConnectShopifyLoading(false);
          return;
        }
        if (
          installUrl &&
          typeof installUrl === 'string' &&
          installUrl.includes('/api/auth/install')
        ) {
          writeShopifyConnectSession(normalizedShop);
          setPendingOAuthUrl(installUrl);
          setPendingOAuthShop(normalizedShop);
          const expiresIn = data?.expires_in_seconds ?? 600;
          setPendingOAuthExpiresInSeconds(
            typeof expiresIn === 'number' && expiresIn > 0 ? expiresIn : 600
          );
          setOauthAutoRedirecting(true);
        } else {
          setAddError(data?.error || 'Could not get connection link.');
        }
        setConnectShopifyLoading(false);
        return;
      }
      // No email session: show sign-in in modal (avoids 401 redirect to login page)
      setSignInRequiredShop(domainToUse);
    } catch (err) {
      setAddError(err?.response?.data?.error || err?.message || 'Could not start connection.');
    } finally {
      setConnectShopifyLoading(false);
    }
  };

  const handleConnectWithApiKey = () => {
    setApiKeyError(null);
    const trimmed = (apiKeyValue || '').trim();
    if (!trimmed) {
      setApiKeyError('Enter your API key');
      return;
    }
    if (!trimmed.startsWith('sk_')) {
      setApiKeyError('API key should start with sk_');
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEYS.API_KEY, trimmed);
      const targetShop = requestedShop && typeof requestedShop === 'string' ? requestedShop : null;
      if (targetShop) {
        setCurrentStore(targetShop);
      } else {
        clearStoreSelection();
      }
      setApiKeyModalOpen(false);
      setApiKeyValue('');
      setApiKeyError(null);
      if (targetShop) {
        const next = getUrlWithEmbedParams(ROUTES.appDashboard(targetShop), { shop: targetShop });
        redirectToAppUrl(next);
      } else {
        window.location.href = getUrlWithEmbedParams(ROUTES.USER_PANEL);
      }
    } catch (_) {
      setApiKeyError('Could not save API key');
    }
  };

  /** Copy install-link URL for the given shop so user can open in incognito; our server then redirects to Shopify for that shop only. */
  const handleCopyIncognitoOAuthLink = async shop => {
    if (!shop || !isShopifyStoreDomain(shop)) return;
    setWrongStoreIncognitoStatus('loading');
    try {
      const baseUrl = getApiBaseUrl();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const installLinkUrl = `${baseUrl}/auth/install-link?shop=${encodeURIComponent(normalizeShopifyDomain(shop))}${origin ? `&callback_base=${encodeURIComponent(origin)}` : ''}`;
      const token = getEmailToken();
      const res = await fetch(installLinkUrl, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      const installUrl = data?.url ?? data?.data?.url;
      if (installUrl && typeof installUrl === 'string') {
        await navigator.clipboard.writeText(installUrl);
        setWrongStoreIncognitoStatus('copied');
      } else {
        setWrongStoreIncognitoStatus('error');
      }
    } catch (_) {
      setWrongStoreIncognitoStatus('error');
    }
  };

  const accountKey = getAccountApiKey();
  const domainKeys = getDomainKeys();
  const normalizedInput = normalizePastedDomain(newDomain || '');
  const hasTypedDomain = normalizedInput.length > 0;
  const inputLooksShopify = isShopifyStoreDomain(normalizedInput);
  const emailSessionActive = !!getEmailToken();
  const customInputValidation = inputLooksShopify ? null : validateDomainInput(normalizedInput);
  const canProceedWithCurrentInput =
    addDomainFlow === 'shopify'
      ? inputLooksShopify
      : Boolean(customInputValidation && customInputValidation.valid);
  function clearAddDomainDraft() {
    try {
      window.localStorage.removeItem(ADD_DOMAIN_DRAFT_KEY);
    } catch {
      // ignore storage issues
    }
  }
  const domainValidationMessage =
    addDomainFlow === 'shopify'
      ? inputLooksShopify
        ? 'Shopify domain format looks valid'
        : 'Use a .myshopify.com domain'
      : customInputValidation?.valid
        ? 'Custom domain format looks valid'
        : customInputValidation?.error || 'Enter a valid custom domain';
  const domainValidationTone =
    addDomainFlow === 'shopify'
      ? inputLooksShopify
        ? 'ok'
        : hasTypedDomain
          ? 'warn'
          : 'idle'
      : customInputValidation?.valid
        ? 'ok'
        : hasTypedDomain
          ? 'warn'
          : 'idle';
  const timelineSteps = [
    {
      id: 'domain',
      label: 'Detect and validate domain',
      status: hasTypedDomain ? (domainValidationTone === 'ok' ? 'done' : 'warn') : 'pending',
      note: domainValidationMessage,
    },
    {
      id: 'auth',
      label: 'Confirm account session',
      status: emailSessionActive ? 'done' : 'warn',
      note: emailSessionActive ? 'Session active' : 'Sign in may be required',
    },
    {
      id: 'connect',
      label: addDomainFlow === 'shopify' ? 'Open Shopify connect flow' : 'Create domain + API key',
      status: canProceedWithCurrentInput ? 'pending' : 'blocked',
      note: canProceedWithCurrentInput
        ? 'Ready for next step'
        : 'Complete checks above to continue',
    },
  ];
  const timelineDoneCount = timelineSteps.filter(s => s.status === 'done').length;
  const timelineProgressPct = Math.round((timelineDoneCount / timelineSteps.length) * 100);
  const assistantLastAttemptedStore =
    pendingOAuthShop ||
    signInRequiredShop ||
    (addDomainFlow === 'shopify' && inputLooksShopify
      ? normalizeShopifyDomain(normalizedInput)
      : '') ||
    (needsApiKeyForSwitch && requestedShop ? requestedShop : '');
  const connectHandoffSteps =
    pendingOAuthUrl && isConnectStoreUrl(pendingOAuthUrl)
      ? [
          {
            id: 'link',
            label: 'Preparing secure connect link',
            status: 'done',
            note: `Ready for ${pendingOAuthShop || 'this store'}`,
          },
          {
            id: 'open',
            label: 'Opening Shopify',
            status: oauthAutoRedirecting ? 'active' : 'warn',
            note: oauthAutoRedirecting
              ? 'Auto-redirecting now'
              : 'Use Continue to Shopify to open manually',
          },
          {
            id: 'approve',
            label: 'Waiting for approval',
            status: 'pending',
            note: 'Approve app install in Shopify admin',
          },
        ]
      : [];
  const handleCopyAssistantStore = () => {
    if (!assistantLastAttemptedStore) return;
    try {
      navigator.clipboard.writeText(assistantLastAttemptedStore);
      setAssistantStoreCopied(true);
      if (assistantStoreCopiedTimerRef.current) {
        window.clearTimeout(assistantStoreCopiedTimerRef.current);
      }
      assistantStoreCopiedTimerRef.current = window.setTimeout(() => {
        setAssistantStoreCopied(false);
        assistantStoreCopiedTimerRef.current = null;
      }, 1600);
    } catch {
      // ignore clipboard errors
    }
  };

  useEffect(() => {
    if (!addModalOpen) {
      assistantDoneCountRef.current = timelineDoneCount;
      setAssistantCelebrate(false);
      if (assistantCelebrateTimerRef.current) {
        window.clearTimeout(assistantCelebrateTimerRef.current);
        assistantCelebrateTimerRef.current = null;
      }
      return;
    }
    if (timelineDoneCount > assistantDoneCountRef.current) {
      setAssistantCelebrate(true);
      if (assistantCelebrateTimerRef.current) {
        window.clearTimeout(assistantCelebrateTimerRef.current);
      }
      assistantCelebrateTimerRef.current = window.setTimeout(() => {
        setAssistantCelebrate(false);
        assistantCelebrateTimerRef.current = null;
      }, 700);
    }
    assistantDoneCountRef.current = timelineDoneCount;
    return () => {
      if (assistantCelebrateTimerRef.current) {
        window.clearTimeout(assistantCelebrateTimerRef.current);
        assistantCelebrateTimerRef.current = null;
      }
    };
  }, [timelineDoneCount, addModalOpen]);

  useEffect(
    () => () => {
      if (assistantStoreCopiedTimerRef.current) {
        window.clearTimeout(assistantStoreCopiedTimerRef.current);
        assistantStoreCopiedTimerRef.current = null;
      }
    },
    []
  );

  const handleAutoRouteDomain = () => {
    const normalized = normalizePastedDomain(newDomain || '');
    if (!normalized) {
      setAddError('Paste a domain to continue.');
      return;
    }
    if (isShopifyStoreDomain(normalized)) {
      setAddDomainFlow('shopify');
      setNewDomain(normalizeShopifyDomain(normalized));
      setAddError(null);
      setShopifyDomainToConnect(null);
      return;
    }
    const validation = validateDomainInput(normalized);
    if (validation.valid) {
      setAddDomainFlow('custom');
      setNewDomain(validation.normalized);
      setAddError(null);
      setShopifyDomainToConnect(null);
      return;
    }
    setAddError(validation.error || 'Enter a valid domain.');
  };

  useEffect(() => {
    document.title = useEmailDomains ? 'My domains · RipX' : 'Your store · RipX';
    return () => {
      document.title = 'RipX';
    };
  }, [useEmailDomains]);

  // Clear add error when opening Add domain modal so previous errors don't persist
  useEffect(() => {
    if (addModalOpen) {
      setAddError(null);
    }
  }, [addModalOpen]);

  // Data attribute for CSS to target Add domain modal size (modal is portaled to body)
  useEffect(() => {
    if (addModalOpen) {
      document.documentElement.setAttribute('data-add-domain-modal-open', 'true');
    }
    return () => {
      document.documentElement.removeAttribute('data-add-domain-modal-open');
    };
  }, [addModalOpen]);

  const displayPlatform = d =>
    isShopifyStoreDomain(d?.domain) ? 'shopify' : d?.platform || 'standalone';
  const rows = useEmailDomains
    ? domains.map(d => {
        const installState = getShopifyInstallState(d.domain);
        const openLabel = isShopifyStoreDomain(d.domain)
          ? installState === 'needs_install'
            ? 'Install app'
            : installState === 'needs_link'
              ? 'Link app'
              : installState === 'restricted'
                ? 'Review access'
                : 'Open app'
          : 'Open';
        const keyForDomain = accountKey || domainKeys[d.domain];
        return [
          d.domain,
          displayPlatform(d),
          d.connection || '—',
          (d.permittedUsers || []).map(u => u.email).join(', ') || '—',
          d.myRole || '—',
          <span key={`actions-${d.id}`} className={styles.domainActionsCell}>
            <div className={styles.domainActionsWrap}>
              {getShopifyInstallBadge(d.domain)}
              {keyForDomain ? (
                <button
                  type="button"
                  className={styles.openDomainBtn}
                  onClick={() => handleOpen(d)}
                  aria-label={`${openLabel} for ${d.domain}`}
                >
                  <Icon source={ExternalIcon} />
                  <span>{openLabel}</span>
                </button>
              ) : (
                <Tooltip content="Paste your API key to open this domain">
                  <button
                    type="button"
                    className={styles.connectKeyHintBtn}
                    onClick={() => setApiKeyModalOpen(true)}
                  >
                    <Icon source={LinkIcon} />
                    <span>Connect with API key</span>
                  </button>
                </Tooltip>
              )}
              <Tooltip content={`Remove ${d.domain} from your list`}>
                <button
                  type="button"
                  className={styles.removeDomainBtn}
                  onClick={() => {
                    setDomainToRemove({ id: d.id, domain: d.domain });
                    setRemoveConfirmOpen(true);
                  }}
                  aria-label={`Remove ${d.domain}`}
                >
                  <Icon source={DeleteIcon} />
                  <span>Remove</span>
                </button>
              </Tooltip>
            </div>
          </span>,
        ];
      })
    : domains.map(d => {
        const installState = getShopifyInstallState(d.domain);
        const openLabel =
          isShopifyStoreDomain(d.domain) && installState === 'needs_install'
            ? 'Install app'
            : isShopifyStoreDomain(d.domain) && installState === 'needs_link'
              ? 'Link app'
              : isShopifyStoreDomain(d.domain) && installState === 'restricted'
                ? 'Review access'
                : 'Open app';
        return [
          d.domain,
          displayPlatform(d),
          <div key={`open-${d.domain}`} className={styles.domainActionsWrap}>
            {getShopifyInstallBadge(d.domain)}
            <button
              type="button"
              className={styles.openDomainBtn}
              onClick={() => handleOpenApp(d.domain)}
              aria-label={`${openLabel} for ${d.domain}`}
              disabled={!!openingDomain}
            >
              {openingDomain === (isShopifyStoreDomain(d) ? normalizeShopifyDomain(d) : d) ? (
                <>
                  <Spinner size="small" accessibilityLabel="Opening" />
                  <span>Opening…</span>
                </>
              ) : (
                <>
                  <Icon source={ExternalIcon} />
                  <span>{openLabel}</span>
                </>
              )}
            </button>
          </div>,
        ];
      });

  const isEmpty = domains.length === 0 && !isLoading && !error;
  const emptyStateMarkup =
    domains.length === 0 ? (
      useEmailDomains ? (
        <div className={styles.emptyStateFill}>
          <section className={styles.mainEmptySection} aria-label="No domains">
            <div className={styles.mainEmptyMessage}>
              <div className={styles.mainEmptyIcon}>
                <Icon source={GlobeIcon} tone="base" />
              </div>
              <h2 className={styles.mainEmptyHeading}>No domains connected</h2>
              <p className={styles.mainEmptyText}>
                You don’t have any domains yet. Add your first domain to connect a website and start
                running A/B tests with RipX.
              </p>
              <div className={styles.mainEmptyActions}>
                <button
                  type="button"
                  className={styles.mainEmptyCta}
                  onClick={() => setAddModalOpen(true)}
                >
                  <Icon source={PlusIcon} />
                  Add domain
                </button>
                <button
                  type="button"
                  className={styles.mainEmptySecondary}
                  onClick={() => setApiKeyModalOpen(true)}
                >
                  <Icon source={LinkIcon} />
                  Connect with API key
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className={styles.emptyStateFill}>
          <section className={styles.mainEmptySection} aria-label="No stores">
            <div className={styles.mainEmptyMessage}>
              <div className={styles.mainEmptyIcon}>
                <Icon source={GlobeIcon} tone="base" />
              </div>
              <h2 className={styles.mainEmptyHeading}>No stores</h2>
              <p className={styles.mainEmptyText}>
                No stores found for this session. Open the app from Shopify Admin or sign in to see
                your stores.
              </p>
            </div>
          </section>
        </div>
      )
    ) : null;

  return (
    <PageShell className={`${styles.domainsPage}${isEmpty ? ` ${styles.domainsPageEmpty}` : ''}`}>
      <div className={styles.domainsCanvas}>
        {/* Hero – full impact (match User Panel) */}
        <header className={styles.domainsHero} aria-label="My domains">
          <div className={styles.domainsHeroGradient} aria-hidden="true" />
          <div className={styles.domainsHeroGrid} aria-hidden="true" />
          <div className={styles.domainsHeroOrb1} aria-hidden="true" />
          <div className={styles.domainsHeroOrb2} aria-hidden="true" />
          <div className={styles.domainsHeroContent}>
            <h1 className={styles.domainsHeroTitle}>
              <span className={styles.domainsHeroTitleAccent}>My domains</span>
            </h1>
            <p className={styles.domainsHeroSubtitle}>
              {useEmailDomains
                ? 'Connect your websites and open any domain to manage A/B tests, analytics, and experiments.'
                : 'Open the app for your store to manage A/B tests, analytics, and experiments.'}
            </p>
            {useEmailDomains && (
              <div className={styles.domainsHeroQuickActions}>
                <button
                  type="button"
                  className={styles.domainsQuickActionCard}
                  onClick={() => setAddModalOpen(true)}
                >
                  <span className={styles.domainsQuickActionIcon}>
                    <Icon source={PlusIcon} tone="base" />
                  </span>
                  <span className={styles.domainsQuickActionText}>
                    <span className={styles.domainsQuickActionLabel}>Add domain</span>
                    <span className={styles.domainsQuickActionDesc}>Connect a website</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.domainsQuickActionCard}
                  onClick={() => setApiKeyModalOpen(true)}
                >
                  <span className={styles.domainsQuickActionIcon}>
                    <Icon source={LinkIcon} tone="base" />
                  </span>
                  <span className={styles.domainsQuickActionText}>
                    <span className={styles.domainsQuickActionLabel}>Connect with API key</span>
                    <span className={styles.domainsQuickActionDesc}>Use existing key</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Stats strip */}
        {useEmailDomains && (
          <div className={styles.domainsStatsStrip}>
            <div className={styles.domainsStatsItem}>
              <span className={styles.domainsStatsValue}>{domains.length}</span>
              <span className={styles.domainsStatsLabel}>
                {domains.length === 1 ? 'Domain' : 'Domains'}
              </span>
            </div>
            {domains.length === 0 && (
              <>
                <div className={styles.domainsStatsDivider} aria-hidden="true" />
                <button
                  type="button"
                  className={styles.domainsStatsCta}
                  onClick={() => setAddModalOpen(true)}
                >
                  Add your first domain
                  <Icon source={PlusIcon} tone="subdued" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className={styles.domainsAppContent}>
        <Page title="" subtitle="">
          <div className={styles.domainsContent}>
            <BlockStack gap="400">
              {startOAuthNewTab && (
                <div className={styles.bannerWrap}>
                  <Banner
                    tone="info"
                    title={
                      startOAuthNewTab.mode === 'install_required'
                        ? 'App not installed for this store'
                        : 'Connect this store'
                    }
                    onDismiss={() => setStartOAuthNewTab(null)}
                  >
                    <p>
                      {startOAuthNewTab.mode === 'install_required' ? (
                        <>
                          <strong>{startOAuthNewTab.shop}</strong> is not installed (or is no longer
                          connected). Click <strong>Install in Shopify</strong> to install/reconnect
                          this exact store. You can also copy the link and open it in a private
                          window.
                        </>
                      ) : (
                        <>
                          To connect <strong>{startOAuthNewTab.shop}</strong>: click &quot;Continue
                          to Shopify&quot; to open the connection flow in this window. Or copy the
                          link to open in a private window.
                        </>
                      )}
                    </p>
                    <p style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                      <a
                        href={startOAuthNewTab.url}
                        target="_top"
                        rel="noopener noreferrer"
                        className={styles.continueToShopifyButton}
                      >
                        {startOAuthNewTab.mode === 'install_required'
                          ? 'Install in Shopify'
                          : 'Continue to Shopify'}
                      </a>
                      <Button
                        icon={ClipboardIcon}
                        onClick={() => {
                          try {
                            navigator.clipboard.writeText(startOAuthNewTab.url);
                          } catch {
                            // ignore clipboard errors
                          }
                        }}
                      >
                        Copy link for private window
                      </Button>
                    </p>
                  </Banner>
                </div>
              )}
              {(() => {
                const reason = searchParams.get('reason');
                const oauthWrongStoreShop = searchParams.get('shop');
                const connectedShop = searchParams.get('connected_shop') || '';
                const isOauthWrongStore =
                  reason === (ROUTES.CONNECT_REASON?.OAUTH_WRONG_STORE || 'oauth_wrong_store') &&
                  oauthWrongStoreShop;
                return isOauthWrongStore ? (
                  <div className={styles.bannerWrap}>
                    <Banner
                      tone="warning"
                      title="Wrong store approved"
                      onDismiss={() => {
                        setWrongStoreIncognitoStatus('idle');
                        setSearchParams(prev => {
                          const next = new URLSearchParams(prev);
                          next.delete('reason');
                          next.delete('shop');
                          next.delete('connected_shop');
                          return next;
                        });
                      }}
                      action={{
                        content:
                          wrongStoreIncognitoStatus === 'copied'
                            ? 'Copied!'
                            : wrongStoreIncognitoStatus === 'loading'
                              ? 'Loading…'
                              : 'Copy link for incognito',
                        icon: ClipboardIcon,
                        onAction: () => handleCopyIncognitoOAuthLink(oauthWrongStoreShop),
                        loading: wrongStoreIncognitoStatus === 'loading',
                      }}
                    >
                      <p>
                        {connectedShop ? (
                          <>
                            We connected <strong>{connectedShop}</strong>. To add{' '}
                            <strong>{oauthWrongStoreShop}</strong>:
                          </>
                        ) : (
                          <>
                            You approved a different store. To add{' '}
                            <strong>{oauthWrongStoreShop}</strong>:
                          </>
                        )}
                      </p>
                      <p style={{ marginTop: 8 }}>
                        <strong>Use the same-tab flow:</strong> Copy the link and open it in{' '}
                        <strong>incognito</strong>. On the instruction page: <strong>Step 1</strong>{' '}
                        — click the button to go to <strong>{oauthWrongStoreShop} admin</strong>,
                        log in there, then use your browser <strong>Back</strong> to return.{' '}
                        <strong>Step 2</strong> — click &ldquo;Continue to Shopify&rdquo;. When
                        Shopify asks to approve, the address bar must show {oauthWrongStoreShop}. If
                        the copy button fails, sign in first (top right), then try again.
                      </p>
                    </Banner>
                  </div>
                ) : null;
              })()}
              {useEmailDomains && newlyReceivedApiKey && (
                <div className={styles.bannerWrap}>
                  <Banner
                    tone="warning"
                    title="Store your API key"
                    onDismiss={() => setNewlyReceivedApiKey(null)}
                    action={{
                      content: 'Copy key',
                      icon: ClipboardIcon,
                      onAction: () => {
                        try {
                          navigator.clipboard.writeText(newlyReceivedApiKey);
                        } catch (_) {
                          // clipboard not available
                        }
                      },
                    }}
                  >
                    <p>
                      This key is shown only once. Copy it and store it securely. Use it in the
                      X-RipX-API-Key header or at Connect.
                    </p>
                    <p
                      style={{
                        marginTop: 8,
                        wordBreak: 'break-all',
                        fontFamily: 'monospace',
                        fontSize: '0.9em',
                      }}
                    >
                      {newlyReceivedApiKey}
                    </p>
                  </Banner>
                </div>
              )}
              {needsApiKeyForSwitch && (
                <div className={styles.bannerWrap}>
                  <Banner
                    tone="warning"
                    title="API key required to open this standalone store"
                    action={{
                      content: 'Connect with API key',
                      onAction: () => setApiKeyModalOpen(true),
                    }}
                    secondaryAction={{
                      content: 'Get new API key',
                      onAction: () => setRegenerateConfirmOpen(true),
                    }}
                    onDismiss={() =>
                      setSearchParams(prev => {
                        const next = new URLSearchParams(prev);
                        next.delete('reason');
                        next.delete('shop');
                        return next;
                      })
                    }
                  >
                    <p>
                      You switched from Shopify to <strong>{requestedShop}</strong>. Add your API
                      key for this account, then RipX will open that store directly.
                    </p>
                  </Banner>
                </div>
              )}
              {/* Shown when user has domains (from API) but this browser has no stored API key – e.g. they added the domain on another device or cleared storage */}
              {useEmailDomains && !accountKey && domains.length > 0 && !newlyReceivedApiKey && (
                <div className={styles.bannerWrap}>
                  <Banner
                    tone="info"
                    action={{
                      content: 'Get new API key',
                      onAction: () => setRegenerateConfirmOpen(true),
                      loading: regenerateKeyMutation.isPending,
                    }}
                    secondaryAction={{
                      content: 'Connect with API key',
                      onAction: () => setApiKeyModalOpen(true),
                    }}
                  >
                    You have domains but no API key in this browser. Get a new key for this device
                    (invalidates any previous key), or paste an existing key with &quot;Connect with
                    API key&quot;.
                  </Banner>
                </div>
              )}
              {error && (
                <div className={styles.bannerWrap}>
                  <Banner
                    tone="critical"
                    action={{
                      content: 'Retry',
                      onAction: () =>
                        queryClient.invalidateQueries({
                          queryKey: useEmailDomains ? ['me', 'domains'] : ['account', 'stores'],
                        }),
                    }}
                    onDismiss={() =>
                      queryClient.invalidateQueries({
                        queryKey: useEmailDomains ? ['me', 'domains'] : ['account', 'stores'],
                      })
                    }
                  >
                    {error.message || 'Failed to load domains'}
                  </Banner>
                </div>
              )}
              {isLoading ? (
                <Card className={styles.domainsCard}>
                  <div className={styles.loadingCard}>
                    <Spinner size="large" />
                    <Text as="p" fontWeight="medium">
                      Loading domains…
                    </Text>
                  </div>
                </Card>
              ) : emptyStateMarkup ? (
                emptyStateMarkup
              ) : (
                <div className={styles.tableSection}>
                  <div className={styles.tableSectionHeader}>
                    <h2 className={styles.tableSectionTitle}>
                      {useEmailDomains ? 'Your domains' : 'Your store'}
                    </h2>
                    <span className={styles.tableSectionBadge}>{domains.length}</span>
                  </div>
                  <Card className={`${styles.domainsCard} ${styles.tableCard}`}>
                    <DataTable
                      columnContentTypes={
                        useEmailDomains
                          ? ['text', 'text', 'text', 'text', 'text', 'text']
                          : ['text', 'text', 'text']
                      }
                      headings={
                        useEmailDomains
                          ? [
                              'Domain',
                              'Platform',
                              'Connection',
                              'Permitted users',
                              'Role',
                              'Actions',
                            ]
                          : ['Domain', 'Platform', 'Actions']
                      }
                      rows={rows}
                    />
                  </Card>
                </div>
              )}
            </BlockStack>
            <div className={styles.legalWrap}>
              <LegalFooter />
            </div>
          </div>
        </Page>
      </div>

      <Modal
        open={addModalOpen}
        size="large"
        onClose={() => {
          setAddModalOpen(false);
          setAddDomainFlow('choice');
          setNewDomain('');
          setAddError(null);
          setShopifyDomainToConnect(null);
          setPendingOAuthUrl(null);
          setPendingOAuthShop(null);
          setPendingOAuthExpiresInSeconds(null);
          setSignInRequiredShop(null);
          setOauthAutoRedirecting(false);
          setOauthLinkCopied(false);
        }}
        title={
          addDomainFlow === 'choice'
            ? 'Add domain'
            : addDomainFlow === 'shopify'
              ? 'Connect Shopify store'
              : 'Add custom domain'
        }
        primaryAction={
          addDomainFlow === 'choice'
            ? undefined
            : pendingOAuthUrl
              ? undefined
              : addDomainFlow === 'shopify'
                ? {
                    content: 'Connect with Shopify',
                    onAction: handleConnectShopifyFromModal,
                    loading: connectShopifyLoading,
                    disabled: !canProceedWithCurrentInput,
                  }
                : {
                    content: 'Add domain',
                    onAction: handleAddSubmit,
                    loading: addMutation.isPending,
                    disabled: !canProceedWithCurrentInput,
                  }
        }
        secondaryActions={
          addDomainFlow === 'choice'
            ? [
                {
                  content: 'Cancel',
                  onAction: () => {
                    setAddModalOpen(false);
                    setAddDomainFlow('choice');
                    setNewDomain('');
                    setAddError(null);
                    setShopifyDomainToConnect(null);
                    setPendingOAuthUrl(null);
                    setPendingOAuthShop(null);
                    setPendingOAuthExpiresInSeconds(null);
                    setSignInRequiredShop(null);
                    setOauthAutoRedirecting(false);
                    setOauthLinkCopied(false);
                  },
                },
              ]
            : [
                {
                  content: 'Back',
                  onAction: () => {
                    setAddDomainFlow('choice');
                    setNewDomain('');
                    setAddError(null);
                    setShopifyDomainToConnect(null);
                    setPendingOAuthUrl(null);
                    setPendingOAuthShop(null);
                    setPendingOAuthExpiresInSeconds(null);
                    setSignInRequiredShop(null);
                    setOauthAutoRedirecting(false);
                    setOauthLinkCopied(false);
                  },
                },
              ]
        }
      >
        <Modal.Section>
          <div className={styles.addModalSection} data-add-domain-modal>
            <div className={styles.addModalAccentBar} aria-hidden="true" />
            <BlockStack gap="600">
              <div className={styles.addModalStepWrap} role="status" aria-live="polite">
                <span className={styles.addModalStepPill}>
                  Step {addDomainFlow === 'choice' ? 1 : 2} of 2
                </span>
                <div className={styles.addModalStepTrack} aria-hidden="true">
                  <span
                    className={styles.addModalStepProgress}
                    style={{ width: addDomainFlow === 'choice' ? '50%' : '100%' }}
                  />
                </div>
              </div>

              {addDomainFlow === 'choice' && (
                <>
                  <div className={styles.addModalIntro}>
                    <div className={styles.addModalIconWrap} aria-hidden>
                      <Icon source={GlobeIcon} />
                    </div>
                    <div className={styles.addModalDescription}>
                      <h3 className={styles.addModalIntroTitle}>How do you want to connect?</h3>
                      <p className={styles.addModalIntroSubtitle}>
                        Choose your site type below. You can add more domains later from this page.
                      </p>
                    </div>
                  </div>
                  <div className={styles.smartEntryCard}>
                    <Text as="p" variant="headingSm">
                      Smart quick start
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Paste any domain and we will route you to the best setup automatically.
                    </Text>
                    <div className={styles.smartEntryActions}>
                      <TextField
                        label="Domain"
                        value={newDomain}
                        onChange={value => {
                          setNewDomain(normalizePastedDomain(value));
                          if (addError) setAddError(null);
                        }}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleAutoRouteDomain();
                          }
                        }}
                        placeholder="example.com or mystore.myshopify.com"
                        autoComplete="url"
                        clearButton={!!newDomain.trim()}
                        onClearButtonClick={() => {
                          setNewDomain('');
                          setAddError(null);
                        }}
                      />
                      <Button
                        icon={ArrowRightIcon}
                        variant="primary"
                        onClick={handleAutoRouteDomain}
                        disabled={!newDomain.trim()}
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                  <div
                    className={styles.addModalChoiceGrid}
                    role="group"
                    aria-labelledby="add-modal-choice-heading"
                  >
                    <span id="add-modal-choice-heading" className={styles.visuallyHidden}>
                      Choose connection type
                    </span>
                    <button
                      type="button"
                      className={styles.addModalChoiceCard}
                      data-type="custom"
                      onClick={() => {
                        setAddDomainFlow('custom');
                        setAddError(null);
                      }}
                      aria-describedby="add-modal-choice-custom-desc"
                    >
                      <div className={styles.addModalChoiceCardTop}>
                        <span className={styles.addModalChoiceCardIcon}>
                          <Icon source={GlobeIcon} tone="base" />
                        </span>
                        <span className={styles.addModalChoiceCardLabel}>Custom website</span>
                      </div>
                      <p
                        id="add-modal-choice-custom-desc"
                        className={styles.addModalChoiceCardDesc}
                      >
                        Your own domain. We’ll generate an API key to install on your site.
                      </p>
                      <span className={styles.addModalChoiceCardArrow} aria-hidden>
                        →
                      </span>
                    </button>
                    <button
                      type="button"
                      className={styles.addModalChoiceCard}
                      data-type="shopify"
                      onClick={() => {
                        setAddDomainFlow('shopify');
                        setNewDomain(suggestedShopifyDomain || '');
                        setAddError(null);
                      }}
                      aria-describedby="add-modal-choice-shopify-desc"
                    >
                      <div className={styles.addModalChoiceCardTop}>
                        <span className={styles.addModalChoiceCardIcon}>
                          <Icon source={LinkIcon} tone="base" />
                        </span>
                        <span className={styles.addModalChoiceCardLabel}>Shopify store</span>
                      </div>
                      <p
                        id="add-modal-choice-shopify-desc"
                        className={styles.addModalChoiceCardDesc}
                      >
                        One-click connect. We’ll open Shopify to install and link the store.
                      </p>
                      <span className={styles.addModalChoiceCardArrow} aria-hidden>
                        →
                      </span>
                    </button>
                  </div>
                </>
              )}

              {(addDomainFlow === 'custom' || addDomainFlow === 'shopify') && (
                <>
                  <div className={styles.assistantPanel}>
                    <div className={styles.assistantHeaderRow}>
                      <div className={styles.assistantHeaderTitleWrap}>
                        <Text as="p" variant="headingSm">
                          Connection assistant
                        </Text>
                        {assistantLastAttemptedStore ? (
                          <div className={styles.assistantTargetRow}>
                            <span className={styles.assistantTargetPill}>
                              Last attempted: {assistantLastAttemptedStore}
                            </span>
                            <Button size="slim" variant="plain" onClick={handleCopyAssistantStore}>
                              {assistantStoreCopied ? 'Copied!' : 'Copy'}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      <span className={styles.assistantStatusPill}>
                        {timelineProgressPct}% ready
                      </span>
                    </div>
                    <div className={styles.assistantTimelineTrack} aria-hidden>
                      <span
                        className={styles.assistantTimelineProgress}
                        style={{ width: `${timelineProgressPct}%` }}
                      />
                    </div>
                    <div className={styles.assistantRows}>
                      {timelineSteps.map((step, index) => (
                        <div
                          key={step.id}
                          className={`${styles.assistantRow} ${
                            step.status === 'done' ? styles.assistantRowDone : ''
                          } ${
                            step.status === 'done' && assistantCelebrate
                              ? styles.assistantRowCelebrate
                              : ''
                          }`}
                        >
                          {step.status === 'done' ? (
                            <span
                              className={`${styles.assistantStepIcon} ${styles.assistantStepIconDone}`}
                            >
                              ✓
                            </span>
                          ) : (
                            <span
                              className={`${styles.assistantDot} ${
                                step.status === 'warn' ? styles.assistantDotWarn : ''
                              }`}
                              aria-hidden
                            />
                          )}
                          <div className={styles.assistantRowContent}>
                            <Text as="p" variant="bodySm">
                              {index + 1}. {step.label}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {step.note}
                            </Text>
                          </div>
                        </div>
                      ))}
                    </div>
                    {addDomainFlow === 'custom' && inputLooksShopify && (
                      <div className={styles.assistantHintCard}>
                        <Text as="p" variant="bodySm">
                          This looks like a Shopify store. Use Shopify connect for a faster setup.
                        </Text>
                        <Button
                          size="slim"
                          onClick={() => {
                            setAddDomainFlow('shopify');
                            setNewDomain(normalizeShopifyDomain(normalizedInput));
                            setAddError(null);
                          }}
                        >
                          Switch to Shopify flow
                        </Button>
                      </div>
                    )}
                    {addDomainFlow === 'shopify' && hasTypedDomain && !inputLooksShopify && (
                      <div className={styles.assistantHintCard}>
                        <Text as="p" variant="bodySm">
                          This appears to be a custom domain.
                        </Text>
                        <Button
                          size="slim"
                          onClick={() => {
                            setAddDomainFlow('custom');
                            setAddError(null);
                          }}
                        >
                          Switch to custom flow
                        </Button>
                      </div>
                    )}
                  </div>
                  <details className={styles.assistantTroubleshoot}>
                    <summary>Having trouble connecting?</summary>
                    <div className={styles.assistantTroubleshootBody}>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Use these quick fixes if connection gets stuck:
                      </Text>
                      <ul className={styles.assistantTroubleshootList}>
                        <li>Wrong store opened: enter the exact target domain and reconnect.</li>
                        <li>Session expired: sign in again, then retry from this modal.</li>
                        <li>
                          No API key for standalone: regenerate one and connect it to this browser.
                        </li>
                      </ul>
                      <div className={styles.assistantTroubleshootActions}>
                        <Button
                          size="slim"
                          onClick={() => {
                            setAddError(null);
                            setPendingOAuthUrl(null);
                            setSignInRequiredShop(null);
                            setOauthAutoRedirecting(false);
                            setOauthLinkCopied(false);
                          }}
                        >
                          Retry cleanly
                        </Button>
                        <Button
                          size="slim"
                          variant="plain"
                          onClick={() => {
                            clearAddDomainDraft();
                            clearShopifyConnectSession();
                            setAddDomainFlow('choice');
                            setNewDomain('');
                            setAddError(null);
                            setPendingOAuthUrl(null);
                            setSignInRequiredShop(null);
                            setOauthAutoRedirecting(false);
                            setOauthLinkCopied(false);
                          }}
                        >
                          Start over
                        </Button>
                      </div>
                    </div>
                  </details>
                  {signInRequiredShop ? (
                    <div className={styles.continueToShopifyBlock}>
                      <div className={styles.addModalIntro} data-step="sign-in-required">
                        <div className={styles.addModalIconWrap} aria-hidden data-variant="shopify">
                          <Icon source={LinkIcon} />
                        </div>
                        <div className={styles.addModalDescription}>
                          <h3 className={styles.addModalIntroTitle}>
                            Sign in to connect this store
                          </h3>
                          <p className={styles.addModalIntroSubtitle}>
                            You need to be signed in to connect {signInRequiredShop}. We’ll open the
                            sign-in page in a new tab. After signing in, return to this tab, click
                            Back, then try Connect with Shopify again.
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="primary"
                        onClick={() =>
                          window.open(
                            getConnectUrl({
                              shop: signInRequiredShop,
                              reason:
                                ROUTES.CONNECT_REASON?.SIGN_IN_TO_CONNECT || 'sign_in_to_connect',
                            }),
                            '_blank',
                            'noopener,noreferrer'
                          )
                        }
                        className={styles.continueToShopifyButton}
                      >
                        Open sign-in page
                      </Button>
                    </div>
                  ) : pendingOAuthUrl && isConnectStoreUrl(pendingOAuthUrl) ? (
                    <div className={styles.continueToShopifyBlock}>
                      <div className={styles.addModalIntro} data-step="continue">
                        <div className={styles.addModalIconWrap} aria-hidden data-variant="shopify">
                          <Icon source={LinkIcon} />
                        </div>
                        <div className={styles.addModalDescription}>
                          <h3 className={styles.addModalIntroTitle}>
                            {isEmbedded ? 'Connect this store' : 'Continue to Shopify'}
                          </h3>
                          <p className={styles.addModalIntroSubtitle}>
                            {isEmbedded
                              ? `We prepared a secure connect link for ${pendingOAuthShop}. We'll continue automatically, or you can continue manually if needed.`
                              : `We prepared a secure connect link for ${pendingOAuthShop}. We'll continue automatically, or you can continue manually if needed.`}
                          </p>
                        </div>
                      </div>
                      <div className={styles.connectHandoffPanel}>
                        <div className={styles.connectHandoffHeader}>
                          <Text as="p" variant="bodySm" fontWeight="semibold">
                            Smart handoff
                          </Text>
                          {typeof oauthExpiresInSecondsLive === 'number' &&
                            oauthExpiresInSecondsLive > 0 && (
                              <span
                                className={`${styles.connectHandoffExpiryBadge} ${
                                  oauthExpiresInSecondsLive <= 60
                                    ? styles.connectHandoffExpiryBadgeWarn
                                    : ''
                                }`}
                              >
                                Expires in{' '}
                                {oauthExpiresInSecondsLive >= 60
                                  ? `${Math.floor(oauthExpiresInSecondsLive / 60)}:${String(
                                      oauthExpiresInSecondsLive % 60
                                    ).padStart(2, '0')}`
                                  : `${oauthExpiresInSecondsLive}s`}
                              </span>
                            )}
                        </div>
                        <div className={styles.connectHandoffRows}>
                          {connectHandoffSteps.map((step, idx) => (
                            <div key={step.id} className={styles.connectHandoffRow}>
                              <span
                                className={`${styles.connectHandoffDot} ${
                                  step.status === 'done'
                                    ? styles.connectHandoffDotDone
                                    : step.status === 'active'
                                      ? styles.connectHandoffDotActive
                                      : step.status === 'warn'
                                        ? styles.connectHandoffDotWarn
                                        : ''
                                }`}
                                aria-hidden
                              />
                              <div className={styles.connectHandoffContent}>
                                <Text as="p" variant="bodySm">
                                  {idx + 1}. {step.label}
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {step.note}
                                </Text>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {isEmbedded ? (
                        <>
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              gap: 12,
                            }}
                          >
                            <Button
                              variant="primary"
                              className={styles.continueToShopifyButton}
                              onClick={() => {
                                setOauthAutoRedirecting(false);
                                const popup = openCenteredPopup(pendingOAuthUrl);
                                if (!popup) {
                                  redirectToAppUrl(pendingOAuthUrl);
                                }
                              }}
                            >
                              {oauthAutoRedirecting ? 'Opening Shopify…' : 'Continue to Shopify'}
                            </Button>
                            <Button
                              icon={ClipboardIcon}
                              onClick={() => {
                                try {
                                  navigator.clipboard.writeText(pendingOAuthUrl);
                                  setModalOAuthLinkCopied(true);
                                  setTimeout(() => setModalOAuthLinkCopied(false), 3000);
                                } catch {
                                  // ignore clipboard errors
                                }
                              }}
                            >
                              {modalOAuthLinkCopied ? 'Copied!' : 'Copy link for private window'}
                            </Button>
                          </div>
                          {oauthAutoRedirecting && (
                            <p className={styles.addModalHint} style={{ marginTop: 8 }}>
                              Opening the secure connect flow automatically. If it does not open,
                              use &quot;Continue to Shopify&quot; above.
                            </p>
                          )}
                          <p className={styles.addModalHint} style={{ marginTop: 8 }}>
                            Continuing opens the connection page in this window. On that page: Step
                            1 — go to <strong>{pendingOAuthShop}</strong> admin, log in, Back. Step
                            2 — click Continue to Shopify, then Allow when prompted.
                          </p>
                          {pendingOAuthExpiresInSeconds !== null && (
                            <p className={styles.addModalHint} style={{ marginTop: 8 }}>
                              Link expires in{' '}
                              {pendingOAuthExpiresInSeconds >= 60
                                ? `${Math.round(pendingOAuthExpiresInSeconds / 60)} minutes`
                                : `${pendingOAuthExpiresInSeconds} seconds`}
                              .
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          {/* Standalone: same-tab link so the flow runs in this window and Shopify returns the intended store. */}
                          <Button
                            variant="primary"
                            className={styles.continueToShopifyButton}
                            onClick={() => {
                              setOauthAutoRedirecting(false);
                              const popup = openCenteredPopup(pendingOAuthUrl);
                              if (!popup) {
                                redirectToAppUrl(pendingOAuthUrl);
                              }
                            }}
                          >
                            {oauthAutoRedirecting ? 'Opening Shopify…' : 'Continue to Shopify'}
                          </Button>
                          {oauthAutoRedirecting && (
                            <p className={styles.addModalHint} style={{ marginTop: 8 }}>
                              Opening the secure connect flow automatically. If it does not open,
                              click the button again.
                            </p>
                          )}
                          {pendingOAuthExpiresInSeconds !== null && (
                            <p className={styles.addModalHint} style={{ marginTop: 8 }}>
                              Link expires in{' '}
                              {pendingOAuthExpiresInSeconds >= 60
                                ? `${Math.round(pendingOAuthExpiresInSeconds / 60)} minutes`
                                : `${pendingOAuthExpiresInSeconds} seconds`}
                              .
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className={styles.addModalIntro} data-step="form">
                        <div
                          className={styles.addModalIconWrap}
                          aria-hidden
                          data-variant={addDomainFlow === 'shopify' ? 'shopify' : undefined}
                        >
                          <Icon source={addDomainFlow === 'shopify' ? LinkIcon : GlobeIcon} />
                        </div>
                        <div className={styles.addModalDescription}>
                          <h3 className={styles.addModalIntroTitle}>
                            {addDomainFlow === 'shopify'
                              ? 'Enter your Shopify store'
                              : 'Enter your domain'}
                          </h3>
                          <p className={styles.addModalIntroSubtitle}>
                            {addDomainFlow === 'shopify'
                              ? 'Use your store’s .myshopify.com address. We’ll open Shopify to complete the connection.'
                              : 'We’ll generate an API key for this domain. Paste a full URL if you like—we’ll use just the domain.'}
                          </p>
                        </div>
                      </div>
                      <div className={styles.addModalFormCard}>
                        <div className={styles.addDomainFieldWrap}>
                          <TextField
                            label="Domain"
                            value={newDomain}
                            onChange={value => {
                              const normalized = normalizePastedDomain(value);
                              setNewDomain(normalized);
                              if (addError) setAddError(null);
                              if (shopifyDomainToConnect) setShopifyDomainToConnect(null);
                            }}
                            placeholder={
                              addDomainFlow === 'shopify'
                                ? 'mystore.myshopify.com'
                                : 'example.com or www.mystore.com'
                            }
                            autoComplete="url"
                            error={addError}
                            helpText={
                              addDomainFlow === 'shopify'
                                ? isShopifyStoreDomain(newDomain.trim())
                                  ? undefined
                                  : 'Use your store’s .myshopify.com domain only.'
                                : 'Domain only (no https:// or path). Must be a valid hostname with a TLD.'
                            }
                            clearButton={!!newDomain.trim()}
                            onClearButtonClick={() => {
                              setNewDomain('');
                              setAddError(null);
                              setShopifyDomainToConnect(null);
                            }}
                          />
                          {addDomainFlow === 'shopify' &&
                            newDomain.trim() &&
                            isShopifyStoreDomain(newDomain.trim()) && (
                              <p className={styles.addDomainFieldSuccess} role="status">
                                <span className={styles.addDomainFieldSuccessCheck} aria-hidden>
                                  ✓
                                </span>
                                Valid Shopify store
                              </p>
                            )}
                        </div>
                      </div>
                      {addError && (
                        <Banner
                          tone="critical"
                          onDismiss={() => {
                            setAddError(null);
                            setShopifyDomainToConnect(null);
                          }}
                        >
                          <BlockStack gap="300">
                            <Text as="p">{addError}</Text>
                            {shopifyDomainToConnect && addDomainFlow === 'custom' && (
                              <Button
                                variant="primary"
                                onClick={handleConnectShopifyFromModal}
                                loading={connectShopifyLoading}
                              >
                                Connect with Shopify instead
                              </Button>
                            )}
                          </BlockStack>
                        </Banner>
                      )}
                    </>
                  )}
                </>
              )}
            </BlockStack>
          </div>
        </Modal.Section>
      </Modal>

      <Modal
        open={apiKeyModalOpen}
        onClose={() => {
          setApiKeyModalOpen(false);
          setApiKeyValue('');
          setApiKeyError(null);
        }}
        title="Connect with API key"
        primaryAction={{
          content: 'Connect',
          onAction: handleConnectWithApiKey,
        }}
      >
        <Modal.Section>
          <div className={styles.modalSectionInner}>
            <p className={styles.modalHint}>
              {needsApiKeyForSwitch && requestedShop
                ? `Paste your RipX API key to open ${requestedShop} now.`
                : 'Paste an existing RipX API key (e.g. from another device or a site you already added). You’ll be taken to the dashboard for that store.'}
            </p>
            <TextField
              label="RipX API Key"
              value={apiKeyValue}
              onChange={setApiKeyValue}
              placeholder="sk_..."
              type="password"
              autoComplete="off"
              error={apiKeyError}
              helpText="Keys start with sk_ and are shown once when you add a domain"
            />
          </div>
        </Modal.Section>
      </Modal>

      <Modal
        open={removeConfirmOpen}
        onClose={() => {
          if (!removeDomainMutation.isPending) {
            setRemoveConfirmOpen(false);
            setDomainToRemove(null);
          }
        }}
        title="Remove domain"
        primaryAction={{
          content: 'Remove domain',
          destructive: true,
          onAction: () => {
            if (domainToRemove)
              removeDomainMutation.mutate({
                tenantId: domainToRemove.id,
                domain: domainToRemove.domain,
              });
          },
          loading: removeDomainMutation.isPending,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => {
              setRemoveConfirmOpen(false);
              setDomainToRemove(null);
            },
          },
        ]}
      >
        <Modal.Section>
          <p className={styles.modalHint}>
            {domainToRemove
              ? `Remove ${domainToRemove.domain} from your list? It will no longer appear here. You can add it again later.`
              : ''}
          </p>
        </Modal.Section>
      </Modal>

      <Modal
        open={regenerateConfirmOpen}
        onClose={() => !regenerateKeyMutation.isPending && setRegenerateConfirmOpen(false)}
        title="Get new API key"
        primaryAction={{
          content: 'Get new key',
          onAction: handleRegenerateApiKey,
          loading: regenerateKeyMutation.isPending,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setRegenerateConfirmOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <p className={styles.modalHint}>
            A new API key will be generated and the previous one will stop working. Use the new key
            in this browser to open your domains. Store it securely—it is shown only once.
          </p>
        </Modal.Section>
      </Modal>
    </PageShell>
  );
}

export default DomainList;
