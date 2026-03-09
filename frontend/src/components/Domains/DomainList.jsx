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
} from '@shopify/polaris-icons';
import { PageShell, LegalFooter } from '../Shared';
import { useSearchParams } from 'react-router-dom';
import { ROUTES, STORAGE_KEYS } from '../../constants';
import styles from './DomainList.module.css';
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
} from '../../services';
import { isShopifyStoreDomain, normalizeShopifyDomain } from '../../utils/shopifyAdmin';

/** postMessage type from OAuth success tab when store connected from embed */
const OAUTH_SUCCESS_MESSAGE_TYPE = 'ripx-store-connected';

/** True only for Shopify OAuth authorize URLs; prevents using our Connect or /api/auth URL as "Continue to Shopify" target */
function isShopifyOAuthUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('https://')) return false;
  return (
    url.includes('myshopify.com') &&
    (url.includes('/admin/oauth') || url.includes('oauth/authorize'))
  );
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
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiKeyError, setApiKeyError] = useState(null);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [domainToRemove, setDomainToRemove] = useState(null);
  const [openingDomain, setOpeningDomain] = useState(null);
  /** When set, show "Continue to Shopify" link/button so user gesture triggers redirect or new tab */
  const [pendingOAuthUrl, setPendingOAuthUrl] = useState(null);
  const [pendingOAuthShop, setPendingOAuthShop] = useState(null);
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

  const useEmailDomains = !!getEmailToken();
  const isEmbedded = isEmbeddedInIframe();

  // When on My domains with email session, clear stored shop so layout/other components don't send requests with a stale unconnected shop (avoids 401 → login redirect)
  useEffect(() => {
    if (useEmailDomains) {
      clearStoreSelection();
    }
  }, [useEmailDomains]);

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
        domains: stores.map(s => ({ domain: s.domain, platform: s.platform || 'shopify' })),
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
      window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(normalizedDomain));
      return;
    }
    // Prevent 401 interceptor from redirecting so we can redirect with shop/reason from catch
    if (returnOAuthUrl && typeof window !== 'undefined') {
      window.sessionStorage?.setItem(STORAGE_KEYS.OAUTH_REDIRECTING, '1');
    }
    const hasEmailSession = !!getEmailToken();
    try {
      if (hasEmailSession) {
        const res = await apiGet('/me/domains');
        const raw = res?.data?.data ?? res?.data;
        const domains = raw?.domains ?? [];
        const connected = domains.some(
          d => (d.domain || '').toLowerCase() === (normalizedDomain || '').toLowerCase()
        );
        if (connected) {
          setCurrentStore(normalizedDomain);
          window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(normalizedDomain));
          return;
        }
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const startRes = await apiGet('/auth/start', {
          shop: normalizedDomain,
          callback_base: origin || undefined,
        });
        const url = startRes?.data?.redirectUrl ?? unwrapData(startRes)?.redirectUrl;
        if (url && typeof url === 'string') {
          if (returnOAuthUrl) return { redirectUrl: url };
          if (isEmbeddedInIframe()) window.open(url, '_blank', 'noopener,noreferrer');
          else window.top.location.href = url;
          return;
        }
        // No OAuth URL from API (e.g. 401 or error). Don't redirect — let caller show "Sign in required" and open Connect in new tab.
        if (returnOAuthUrl) {
          return { signInRequired: true, shop: normalizedDomain };
        }
        const fallbackUrl = `${origin}/api/auth?shop=${encodeURIComponent(normalizedDomain)}${origin ? `&callback_base=${encodeURIComponent(origin)}` : ''}`;
        if (isEmbeddedInIframe()) window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
        else window.top.location.href = fallbackUrl;
        return;
      }

      const res = await apiGet('/account/stores');
      const raw = res?.data?.data ?? res?.data;
      const stores = raw?.stores ?? [];
      const connected = stores.some(
        s => (s.domain || '').toLowerCase() === (normalizedDomain || '').toLowerCase()
      );
      if (connected) {
        setCurrentStore(normalizedDomain);
        window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(normalizedDomain));
      } else {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        try {
          const startRes = await apiGet('/auth/start', {
            shop: normalizedDomain,
            callback_base: origin || undefined,
          });
          const url = startRes?.data?.redirectUrl ?? unwrapData(startRes)?.redirectUrl;
          if (url && typeof url === 'string') {
            if (returnOAuthUrl) return { redirectUrl: url };
            if (isEmbeddedInIframe()) window.open(url, '_blank', 'noopener,noreferrer');
            else window.top.location.href = url;
            return;
          }
        } catch (_) {
          /* /auth/start failed (e.g. 401). Don't return fallback /api/auth — it would send user to login when they click. Send to Connect first. */
        }
        if (returnOAuthUrl) {
          return { signInRequired: true, shop: normalizedDomain };
        }
        const fallbackUrl = `${origin}/api/auth?shop=${encodeURIComponent(normalizedDomain)}${origin ? `&callback_base=${encodeURIComponent(origin)}` : ''}`;
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
        window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(normalizedDomain));
      }
    } finally {
      if (returnOAuthUrl && typeof window !== 'undefined')
        window.sessionStorage?.removeItem(STORAGE_KEYS.OAUTH_REDIRECTING);
    }
  };

  const handleOpen = async domainRow => {
    const domain = typeof domainRow === 'object' ? domainRow?.domain : domainRow;
    if (!domain || openingDomain) return;
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
        await openAppAfterVerify(normalizedDomain, !!key);
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
      window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(domain));
    } catch (_) {
      // ignore storage errors
    }
  };

  const handleOpenApp = async domain => {
    const d = typeof domain === 'object' ? domain?.domain : domain;
    if (!d || openingDomain) return;
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
      window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(normalized));
      return;
    }
    if (isShopify) {
      setOpeningDomain(normalized);
      try {
        await openAppAfterVerify(normalized, false);
      } finally {
        setOpeningDomain(null);
      }
    } else {
      setCurrentStore(normalized);
      window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(normalized));
    }
  };

  const handleAddSubmit = () => {
    setShopifyDomainToConnect(null);
    const validation = validateDomainInput(newDomain);
    if (!validation.valid) {
      setAddError(validation.error);
      if (validation.useShopifyConnect && validation.normalized) {
        setShopifyDomainToConnect(validation.normalized);
      }
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
    setSignInRequiredShop(null);
    setOauthLinkCopied(false);
    try {
      // When we have email session, get OAuth URL via direct fetch so the only source of "shop" is domainToUse (no apiGet/param merging). Ensures correct store when embedded.
      const hasEmailSession = !!getEmailToken();
      if (hasEmailSession) {
        const connected = (meData?.domains ?? []).some(
          d => (d.domain || '').toLowerCase() === normalizedShop.toLowerCase()
        );
        if (connected) {
          setCurrentStore(normalizedShop);
          window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(normalizedShop));
          setConnectShopifyLoading(false);
          return;
        }
        const baseUrl = getApiBaseUrl();
        const token = getEmailToken();
        const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
        // When embedded, use install-link URL so user opens OUR link in incognito; our server then redirects to Shopify for this shop only (no wrong-store possible).
        if (isEmbedded) {
          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          const installLinkUrl = `${baseUrl}/auth/install-link?shop=${encodeURIComponent(normalizedShop)}${origin ? `&callback_base=${encodeURIComponent(origin)}` : ''}`;
          const res = await fetch(installLinkUrl, { credentials: 'include', headers: authHeaders });
          const data = await res.json().catch(() => ({}));
          const installUrl = data?.url ?? data?.data?.url;
          if (res.status === 401) {
            setSignInRequiredShop(domainToUse);
            setConnectShopifyLoading(false);
            return;
          }
          if (
            installUrl &&
            typeof installUrl === 'string' &&
            installUrl.includes('/api/auth/install')
          ) {
            setPendingOAuthUrl(installUrl);
            setPendingOAuthShop(domainToUse);
          } else {
            setAddError(data?.error || 'Could not get connection link.');
          }
          setConnectShopifyLoading(false);
          return;
        }
        // Standalone: get Shopify OAuth URL for same-tab link
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const startUrl = `${baseUrl}/auth/start?shop=${encodeURIComponent(normalizedShop)}&callback_base=${encodeURIComponent(origin)}`;
        const res = await fetch(startUrl, {
          credentials: 'include',
          headers: authHeaders,
        });
        const data = await res.json().catch(() => ({}));
        const redirectUrl = data?.redirectUrl ?? data?.data?.redirectUrl;
        if (res.status === 401) {
          setSignInRequiredShop(domainToUse);
          setConnectShopifyLoading(false);
          return;
        }
        if (redirectUrl && typeof redirectUrl === 'string' && isShopifyOAuthUrl(redirectUrl)) {
          const urlHost = (() => {
            try {
              return new URL(redirectUrl).hostname.toLowerCase();
            } catch {
              return '';
            }
          })();
          if (urlHost !== normalizedShop.toLowerCase()) {
            setAddError(`OAuth URL was for a different store (${urlHost}). Please try again.`);
            setConnectShopifyLoading(false);
            return;
          }
          setPendingOAuthUrl(redirectUrl);
          setPendingOAuthShop(domainToUse);
        } else {
          setAddError(data?.error || 'Could not get connection link.');
        }
        setConnectShopifyLoading(false);
        return;
      }
      // No email session: use existing flow (account/stores path)
      const result = await openAppAfterVerify(domainToUse, false, { returnOAuthUrl: true });
      const url = result?.redirectUrl;
      if (url && isShopifyOAuthUrl(url)) {
        setPendingOAuthUrl(url);
        setPendingOAuthShop(domainToUse);
      } else if (result?.signInRequired && result?.shop) {
        setSignInRequiredShop(result.shop);
      } else if (url) {
        setSignInRequiredShop(domainToUse);
      }
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
      clearStoreSelection();
      setApiKeyModalOpen(false);
      setApiKeyValue('');
      setApiKeyError(null);
      window.location.href = getUrlWithEmbedParams(ROUTES.USER_PANEL);
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

  const rows = useEmailDomains
    ? domains.map(d => {
        const keyForDomain = accountKey || domainKeys[d.domain];
        return [
          d.domain,
          d.platform || 'standalone',
          d.connection || '—',
          (d.permittedUsers || []).map(u => u.email).join(', ') || '—',
          d.myRole || '—',
          <span key={`actions-${d.id}`} className={styles.domainActionsCell}>
            <div className={styles.domainActionsWrap}>
              {keyForDomain ? (
                <button
                  type="button"
                  className={styles.openDomainBtn}
                  onClick={() => handleOpen(d)}
                  aria-label={`Open ${d.domain}`}
                >
                  <Icon source={ExternalIcon} />
                  <span>Open</span>
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
    : domains.map(d => [
        d.domain,
        d.platform || 'standalone',
        <div key={`open-${d.domain}`} className={styles.domainActionsWrap}>
          <button
            type="button"
            className={styles.openDomainBtn}
            onClick={() => handleOpenApp(d.domain)}
            aria-label={`Open app for ${d.domain}`}
            disabled={!!openingDomain}
          >
            {openingDomain === (isShopifyStoreDomain(d) ? normalizeShopifyDomain(d) : d) ? (
              <>
                <Spinner size="small" accessibilityLabel="Connecting" />
                <span>Connecting…</span>
              </>
            ) : (
              <>
                <Icon source={ExternalIcon} />
                <span>Open app</span>
              </>
            )}
          </button>
        </div>,
      ]);

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
                    title="Connect using incognito"
                    onDismiss={() => setStartOAuthNewTab(null)}
                  >
                    <p>
                      This page is inside another store&apos;s admin. To connect{' '}
                      <strong>{startOAuthNewTab.shop}</strong>: 1) Click &quot;Copy link&quot;
                      below. 2) Open incognito/private window. 3) Paste and press Enter. 4) Log in
                      to {startOAuthNewTab.shop} when Shopify asks. 5) Click Install/Approve.
                    </p>
                    <p style={{ marginTop: 8 }}>
                      <Button
                        variant="primary"
                        icon={ClipboardIcon}
                        onClick={() => {
                          try {
                            navigator.clipboard.writeText(startOAuthNewTab.url);
                          } catch {
                            // ignore clipboard errors
                          }
                        }}
                        className={styles.continueToShopifyButton}
                      >
                        Copy link
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
                        Click <strong>Copy link for incognito</strong>, open the link in a new{' '}
                        <strong>incognito/private</strong> window. On the instruction page, click{' '}
                        <strong>Continue to Shopify</strong>. When Shopify asks you to log in, log
                        in and, if it shows a <strong>list of stores</strong>, select{' '}
                        <strong>{oauthWrongStoreShop}</strong>. Before clicking Allow, check the
                        address bar — it should show {oauthWrongStoreShop}. If it shows another
                        store, do not approve; open the link again and pick {oauthWrongStoreShop}.
                        If the copy button fails, sign in first (top right), then try again.
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
          setSignInRequiredShop(null);
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
                    disabled: !newDomain.trim(),
                  }
                : {
                    content: 'Add domain',
                    onAction: handleAddSubmit,
                    loading: addMutation.isPending,
                    disabled: !newDomain.trim(),
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
                    setSignInRequiredShop(null);
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
                    setSignInRequiredShop(null);
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
                        setNewDomain('');
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
                            sign-in page in a new tab. After signing in, return here and try
                            connecting again.
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
                  ) : pendingOAuthUrl && isShopifyOAuthUrl(pendingOAuthUrl) ? (
                    <div className={styles.continueToShopifyBlock}>
                      <div className={styles.addModalIntro} data-step="continue">
                        <div className={styles.addModalIconWrap} aria-hidden data-variant="shopify">
                          <Icon source={LinkIcon} />
                        </div>
                        <div className={styles.addModalDescription}>
                          <h3 className={styles.addModalIntroTitle}>
                            {isEmbedded ? 'Connect store using incognito' : 'Continue to Shopify'}
                          </h3>
                          <p className={styles.addModalIntroSubtitle}>
                            {isEmbedded
                              ? `To connect ${pendingOAuthShop} (and not the store you're viewing now), use the link below in an incognito/private window.`
                              : `Click the button below to connect ${pendingOAuthShop}. You'll be taken to Shopify to approve access, then returned here.`}
                          </p>
                        </div>
                      </div>
                      {isEmbedded ? (
                        <>
                          <p className={styles.addModalHint} style={{ marginBottom: 8 }}>
                            <strong>Steps:</strong> 1) Click &quot;Copy link&quot; below. 2) Open an
                            incognito/private window (Ctrl+Shift+N or Cmd+Shift+N). 3) Paste the
                            link and press Enter. 4) When Shopify asks, log in to{' '}
                            <strong>{pendingOAuthShop}</strong>. 5) Click Install/Approve.
                          </p>
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
                              className={styles.continueToShopifyButton}
                            >
                              {modalOAuthLinkCopied ? 'Copied! Paste in incognito' : 'Copy link'}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Standalone: same-tab link so the flow runs in this window and Shopify returns the intended store. */}
                          <a
                            href={pendingOAuthUrl}
                            target="_top"
                            rel="noopener noreferrer"
                            className={styles.continueToShopifyButton}
                          >
                            Continue to Shopify
                          </a>
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
              Paste an existing RipX API key (e.g. from another device or a site you already added).
              You’ll be taken to the dashboard for that store.
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
