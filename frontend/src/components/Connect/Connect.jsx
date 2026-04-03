/**
 * Connect – Sign in or register (email only).
 * Login view: left = description, right = login panel only (no register tab).
 * Register view: left = register panel, right = description. Switch via "Create one" link with animation.
 */

import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { Page, FormLayout, TextField, Button, Box, Checkbox, Tooltip } from '@shopify/polaris';
import { PageShell, LegalFooter } from '../Shared';
import { ROUTES } from '../../constants';
import {
  hasEmailSession,
  getEmailToken,
  getApiBaseUrl,
  apiPostPublic,
  setEmailToken,
  clearStoreSelection,
  isEmbeddedInIframe,
  getUrlWithEmbedParams,
} from '../../services';
import { STORAGE_KEYS } from '../../constants';
import { RouteLoading } from '../LoadingSkeleton/RouteLoading';
import { isShopifyStoreDomain } from '../../utils/shopifyAdmin';
import styles from './Connect.module.css';

/** Short visible text with full message in tooltip (advanced tooltip on info icon) */
function ShortTextWithTooltip({ shortText, fullMessage, className = '', iconLabel = 'More info' }) {
  if (!fullMessage || fullMessage === shortText) {
    return <span className={className}>{shortText}</span>;
  }
  return (
    <span className={`${styles.shortTextWithTooltip} ${className}`}>
      <span className={styles.shortTextWithTooltipLabel}>{shortText}</span>
      <Tooltip content={fullMessage} preferredPosition="above" hoverDelay={300}>
        <button
          type="button"
          className={styles.shortTextWithTooltipIcon}
          aria-label={iconLabel}
          tabIndex={0}
        >
          <span aria-hidden>ⓘ</span>
        </button>
      </Tooltip>
    </span>
  );
}

const USER_ERROR_INLINE_MAX = 140;

/** Prefer API `error` / `message`; show first line, capped length, for inline + toast. */
function toUserFacingError(errOrMsg) {
  let msg = '';
  if (typeof errOrMsg === 'string') {
    msg = errOrMsg.trim();
  } else if (errOrMsg !== null && errOrMsg !== undefined) {
    const d = errOrMsg.response?.data;
    msg =
      (typeof d?.error === 'string' && d.error) ||
      (typeof d?.message === 'string' && d.message) ||
      (typeof errOrMsg.message === 'string' && errOrMsg.message) ||
      '';
    msg = String(msg).trim();
  }
  if (!msg) return 'Something went wrong';
  const line = msg.split(/\n/)[0].trim();
  if (line.length <= USER_ERROR_INLINE_MAX) return line;
  return `${line.slice(0, USER_ERROR_INLINE_MAX - 1)}…`;
}

/** Full message for state (API error, validation, or network). */
function apiErrorToString(err, fallback) {
  if (err === null || err === undefined) return fallback;
  const d = err.response?.data;
  const raw =
    (typeof d?.error === 'string' && d.error) ||
    (typeof d?.message === 'string' && d.message) ||
    (typeof err.message === 'string' && err.message) ||
    '';
  const s = String(raw).trim();
  return s || fallback;
}

const OTP_EXPIRY_SECONDS = 60;
/* Transition: minimal wait before clock, timer matches iris duration, no gap after */
const STAGGER_OUT_MS = 280;
const IRIS_SWEEP_MS = 2380;
const STAGGER_IN_MS = 1650;

/* Gentle easing: smooth start and smooth settle (no snap) */
const easeSmooth = t => (t >= 1 ? 1 : t * t * (3 - 2 * t));

function Connect() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState('login'); // 'login' | 'register'
  const [transitionTargetView, setTransitionTargetView] = useState(null); // 'login' | 'register' | null during transition
  const [transitionPhase, setTransitionPhase] = useState('idle'); // 'idle' | 'exiting' | 'flipIn' | 'entering'
  const [clockAngle, setClockAngle] = useState(0); // 0..360 during flipIn for mask sweep
  const [sweepProgress, setSweepProgress] = useState(0); // 0..1 for depth/glow effects
  const [email, setEmail] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  const [step, setStep] = useState('form');
  const [otpEmail, setOtpEmail] = useState('');
  const [otpRememberMe, setOtpRememberMe] = useState(false);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [otpCode, setOtpCode] = useState('');
  const [otpVerifyLoading, setOtpVerifyLoading] = useState(false);
  const [otpResendLoading, setOtpResendLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const otpInputRefs = useRef([]);
  const transitionTimerRef = useRef(null);
  const panelsSwapRef = useRef(null);
  const clockRafRef = useRef(null);

  const runTransition = toRegister => {
    const targetView = toRegister ? 'register' : 'login';
    if ((toRegister && viewMode === 'register') || (!toRegister && viewMode === 'login')) return;
    if (transitionPhase !== 'idle') return;
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);

    /* Apply target + exiting in one flush so first paint already has exit animation (no pre-fade) */
    flushSync(() => {
      setTransitionTargetView(targetView);
      setTransitionPhase('exiting');
    });
    transitionTimerRef.current = setTimeout(() => {
      /* flipIn + initial wedge in one paint so clock is already moving on first frame */
      flushSync(() => {
        setTransitionPhase('flipIn');
        setClockAngle(4);
        setSweepProgress(0.012);
      });
      transitionTimerRef.current = setTimeout(() => {
        flushSync(() => {
          setViewMode(targetView);
          setTransitionPhase('entering');
        });
        transitionTimerRef.current = setTimeout(() => {
          setTransitionPhase('idle');
          setTransitionTargetView(null);
          transitionTimerRef.current = null;
        }, STAGGER_IN_MS);
      }, IRIS_SWEEP_MS);
    }, STAGGER_OUT_MS);
  };

  const switchToRegister = () => runTransition(true);
  const switchToLogin = () => runTransition(false);

  useEffect(
    () => () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      if (clockRafRef.current !== null) cancelAnimationFrame(clockRafRef.current);
    },
    []
  );

  /* JS-driven iris sweep: starts from initial wedge so first paint already shows clock moving */
  useEffect(() => {
    if (transitionPhase !== 'flipIn') {
      setClockAngle(0);
      setSweepProgress(0);
      return;
    }
    const durationMs = 2380;
    const startAngle = 4;
    const start = performance.now();
    const tick = now => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = easeSmooth(t);
      setClockAngle(startAngle + (360 - startAngle) * eased);
      setSweepProgress(eased);
      if (t < 1) clockRafRef.current = requestAnimationFrame(tick);
    };
    clockRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (clockRafRef.current !== null) cancelAnimationFrame(clockRafRef.current);
    };
  }, [transitionPhase]);

  const signInToConnectStartHandled = useRef(false);
  useEffect(() => {
    const reason = searchParams.get('reason');
    const shop = (searchParams.get('shop') || '').trim();
    const launch = (searchParams.get('launch') || '').trim().toLowerCase();
    const signInToConnectReason = ROUTES.CONNECT_REASON?.SIGN_IN_TO_CONNECT || 'sign_in_to_connect';
    if (
      reason !== signInToConnectReason ||
      !shop ||
      !isShopifyStoreDomain(shop) ||
      !hasEmailSession() ||
      signInToConnectStartHandled.current
    )
      return;
    signInToConnectStartHandled.current = true;
    const token = getEmailToken();
    if (!token) return;
    (async () => {
      try {
        const base = getApiBaseUrl();
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const params = new URLSearchParams({ shop });
        if (origin) params.set('callback_base', origin);
        if (launch === 'discount_setup') params.set('launch', 'discount_setup');
        const installLinkUrl = `${base}/auth/install-link?${params.toString()}`;
        const res = await fetch(installLinkUrl, {
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        const installUrl = data?.url ?? data?.data?.url;
        if (
          installUrl &&
          typeof installUrl === 'string' &&
          installUrl.includes('/api/auth/install')
        ) {
          if (isEmbeddedInIframe()) window.open(installUrl, '_blank', 'noopener,noreferrer');
          else window.top.location.href = installUrl;
        }
      } catch (_) {
        signInToConnectStartHandled.current = false;
      }
    })();
  }, [searchParams]);

  const [connectTokenExchanging, setConnectTokenExchanging] = useState(false);
  const connectTokenHandled = useRef(false);
  useEffect(() => {
    const connectToken = searchParams.get('connect_token');
    if (!connectToken || connectTokenHandled.current || isRedirecting) return;
    connectTokenHandled.current = true;
    setConnectTokenExchanging(true);
    setError(null);
    let cancelled = false;
    const clearLoading = () => {
      if (!cancelled) {
        setConnectTokenExchanging(false);
        connectTokenHandled.current = false;
      }
    };
    (async () => {
      try {
        const res = await apiPostPublic(
          '/auth/connect-token',
          { connect_token: connectToken },
          { timeout: 15000 }
        );
        const raw = res.data && typeof res.data === 'object' ? res.data : {};
        const data = raw.data && typeof raw.data === 'object' ? raw.data : raw;
        const apiKey = data?.apiKey;
        const domain = data?.domain;
        if (cancelled || !apiKey || !domain) {
          clearLoading();
          if (!cancelled) {
            setError(raw?.error || 'Invalid or expired link. Request a new one from Admin.');
            setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              next.delete('connect_token');
              return next;
            });
          }
          return;
        }
        try {
          window.sessionStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
          window.sessionStorage.setItem(STORAGE_KEYS.SHOP_DOMAIN, domain);
          window.sessionStorage.setItem(STORAGE_KEYS.CURRENT_STORE, domain);
        } catch (_) {
          /* no-op */
        }
        setSearchParams(p => {
          const next = new URLSearchParams(p);
          next.delete('connect_token');
          return next;
        });
        setIsRedirecting(true);
        window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(domain), { shop: domain });
      } catch (err) {
        if (!cancelled) {
          setError(apiErrorToString(err, 'Invalid or expired link. Request a new one from Admin.'));
          setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.delete('connect_token');
            return next;
          });
        }
        clearLoading();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, isRedirecting, setSearchParams]);

  useEffect(() => {
    if (step !== 'otp' || otpSecondsLeft <= 0) return;
    const t = setInterval(() => setOtpSecondsLeft(s => (s <= 0 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [step, otpSecondsLeft]);

  const handleSignIn = async e => {
    e?.preventDefault();
    setError(null);
    setSuccess(null);
    const value = (email || '').trim().toLowerCase();
    if (!value) {
      setError('Enter your email address');
      return;
    }
    setLoading(true);
    try {
      const res = await apiPostPublic('/auth/send-login-link', {
        email: value,
        remember_me: rememberMe,
      });
      const data = res.data || {};
      if (data.method === 'otp') {
        setOtpEmail(value);
        setOtpRememberMe(rememberMe);
        setOtpSecondsLeft(OTP_EXPIRY_SECONDS);
        setOtpCode('');
        setStep('otp');
        setSuccess(data.message || 'Check your email for the 6-digit code.');
      } else {
        setSuccess(data.message || 'Check your email for a sign-in link.');
        setEmail('');
      }
    } catch (err) {
      setError(apiErrorToString(err, 'Failed to send login link'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async e => {
    e?.preventDefault();
    const code = (otpCode || '').trim().replace(/\D/g, '');
    if (code.length !== 6) {
      setError('Enter the 6-digit code from your email');
      return;
    }
    setError(null);
    setOtpVerifyLoading(true);
    try {
      const res = await apiPostPublic('/auth/verify-login-code', {
        email: otpEmail,
        code,
        remember_me: otpRememberMe,
      });
      const data = res.data || {};
      if (!data.token) {
        setError(data.error || 'Invalid or expired code');
        return;
      }
      setEmailToken(data.token);
      clearStoreSelection();
      setIsRedirecting(true);
      requestAnimationFrame(() => {
        setTimeout(() => {
          window.location.replace(getUrlWithEmbedParams(ROUTES.USER_PANEL));
        }, 180);
      });
    } catch (err) {
      setError(apiErrorToString(err, 'Invalid or expired code. Request a new code.'));
    } finally {
      setOtpVerifyLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (otpSecondsLeft > 0) return;
    setError(null);
    setOtpResendLoading(true);
    try {
      const res = await apiPostPublic('/auth/send-login-link', {
        email: otpEmail,
        remember_me: otpRememberMe,
      });
      const data = res.data || {};
      if (data.method === 'otp') {
        setOtpSecondsLeft(OTP_EXPIRY_SECONDS);
        setSuccess(data.message || 'New code sent. Check your email.');
      } else {
        setSuccess(data.message || 'Check your email.');
      }
    } catch (err) {
      setError(apiErrorToString(err, 'Failed to resend code'));
    } finally {
      setOtpResendLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setStep('form');
    setOtpCode('');
    setOtpSecondsLeft(0);
    setError(null);
    setSuccess(null);
  };

  const otpDigits = (otpCode || '').replace(/\D/g, '').slice(0, 6).split('');
  const setOtpDigit = (index, value) => {
    const digitsOnly = (value || '').replace(/\D/g, '');
    if (digitsOnly.length > 1) {
      const filled = digitsOnly.slice(0, 6);
      setOtpCode(filled);
      otpInputRefs.current[Math.min(filled.length, 5)]?.focus();
      return;
    }
    const digits = (otpCode || '').replace(/\D/g, '').split('');
    digits[index] = digitsOnly.slice(-1) || '';
    setOtpCode(digits.join('').slice(0, 6));
    if (digitsOnly && index < 5) otpInputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) otpInputRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < 5) otpInputRefs.current[index + 1]?.focus();
  };

  const handleOtpPaste = e => {
    e.preventDefault();
    const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      setOtpCode(pasted);
      otpInputRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  useEffect(() => {
    if (step === 'otp') otpInputRefs.current[0]?.focus();
  }, [step]);

  const handleRegister = async e => {
    e?.preventDefault();
    setError(null);
    setSuccess(null);
    const value = (email || '').trim().toLowerCase();
    if (!value) {
      setError('Enter your email address');
      return;
    }
    setLoading(true);
    try {
      const res = await apiPostPublic('/auth/register', { email: value });
      const data = res.data || {};
      setSuccess(
        data.message ||
          'Check your email to confirm. An administrator must approve your account before you can sign in.'
      );
      setEmail('');
    } catch (err) {
      setError(apiErrorToString(err, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  if (connectTokenExchanging || isRedirecting) {
    return (
      <RouteLoading
        message={connectTokenExchanging ? 'Opening app…' : 'Signing you in…'}
        fullScreen
      />
    );
  }

  const reasonBanner = (() => {
    const reason = (searchParams.get('reason') || '').trim();
    const { CONNECT_REASON } = ROUTES;
    const requestedShop = (searchParams.get('requested_shop') || '').trim();
    const connectedShop = (searchParams.get('shop') || '').trim();
    const knownReasons = {
      [CONNECT_REASON?.SIGN_IN_TO_CONNECT || 'sign_in_to_connect']: {
        short: 'Sign in to connect this store.',
        full: 'Sign in with your email to connect a store. After signing in, go to My domains and connect your Shopify store.',
      },
      [CONNECT_REASON?.SIGN_IN_TO_LINK || 'sign_in_to_link']: {
        short: 'Link this store to your account.',
        full:
          requestedShop && connectedShop && requestedShop !== connectedShop
            ? `This store needs to be linked to your account. Sign in, then go to My domains to connect stores. We connected ${connectedShop}. To add ${requestedShop}, use "Copy link for incognito" in My domains.`
            : 'This store needs to be linked to your account. Sign in, then go to My domains to connect stores.',
      },
      [CONNECT_REASON?.STORE_LINKED_TO_ANOTHER || 'store_linked_to_another']: {
        short: 'Store linked to another account.',
        full: 'This store is already linked to another account. Use the account that owns this store, or contact support if you need to transfer it.',
      },
      [CONNECT_REASON?.OAUTH_EXPIRED || 'oauth_expired']: {
        short: 'Link expired or already used.',
        full: 'The connection link expired or was already used. Sign in and connect the store again from My domains.',
      },
    };
    const entry = knownReasons[reason];
    if (!entry) return null;
    return (
      <p className={styles.authReasonBanner} role="alert">
        <ShortTextWithTooltip
          shortText={entry.short}
          fullMessage={entry.full}
          iconLabel="Reason details"
        />
      </p>
    );
  })();

  const heroLogin = (
    <div className={styles.heroContent}>
      <div className={styles.heroBrand}>
        <img src="/logo.svg" alt="" className={styles.heroLogo} width={56} height={56} />
        <div className={styles.heroBrandText}>
          <span className={styles.heroName}>RipX</span>
          <p className={styles.heroTagline}>A/B testing</p>
        </div>
      </div>
      <h2 className={`${styles.heroTitle} ${styles.heroTaglineBelow}`}>
        Run experiments. <br />
        <span className={styles.heroTitleAccent}>Ship winners.</span>
      </h2>
      <p className={styles.heroSub}>
        <ShortTextWithTooltip
          shortText="Sign in to manage domains and A/B tests."
          fullMessage="Sign in to manage your domains and A/B tests with confidence."
          iconLabel="Details"
        />
      </p>
      <ul className={styles.heroList}>
        <li>Passwordless email sign-in</li>
        <li>Multi-domain support</li>
        <li>Admin-approved access</li>
      </ul>
    </div>
  );

  const heroRegister = (
    <div className={styles.heroContent}>
      <div className={styles.heroBrand}>
        <img src="/logo.svg" alt="" className={styles.heroLogo} width={56} height={56} />
        <div className={styles.heroBrandText}>
          <span className={styles.heroName}>RipX</span>
          <p className={styles.heroTagline}>A/B testing</p>
        </div>
      </div>
      <h2 className={`${styles.heroTitle} ${styles.heroTaglineBelow}`}>
        Create your account. <br />
        <span className={styles.heroTitleAccent}>Request access.</span>
      </h2>
      <p className={styles.heroSub}>
        <ShortTextWithTooltip
          shortText="Register with email; admin approval required."
          fullMessage="Register with your email. After confirmation, an administrator will approve your account so you can sign in and add domains."
          iconLabel="Details"
        />
      </p>
      <ul className={styles.heroList}>
        <li>Email confirmation link</li>
        <li>Admin approval for security</li>
        <li>Then full access to RipX</li>
      </ul>
    </div>
  );

  const loginCard = (
    <div className={styles.authCard}>
      <div className={styles.authCardScanLine} aria-hidden />
      <div className={styles.authCardInner}>
        {step === 'otp' ? (
          <>
            <div className={styles.otpHeader}>
              <button type="button" className={styles.otpBack} onClick={handleBackToEmail}>
                ← Back
              </button>
            </div>
            <div className={styles.authCardBody}>
              <div className={styles.otpPanel}>
                <p className={styles.otpSentTo}>
                  We sent a 6-digit code to <strong>{otpEmail}</strong>
                </p>
                {error && (
                  <div className={styles.authInlineMessage} role="alert">
                    <ShortTextWithTooltip
                      shortText={toUserFacingError(error)}
                      fullMessage={error}
                      className={styles.authInlineMessageError}
                      iconLabel="Error details"
                    />
                  </div>
                )}
                <form onSubmit={handleVerifyCode} className={styles.authForm}>
                  <FormLayout>
                    <div className={styles.otpInputWrap}>
                      <label className={styles.otpInputLabel}>Verification code</label>
                      <div
                        className={styles.otpBoxes}
                        role="group"
                        aria-label="6-digit verification code"
                        onPaste={handleOtpPaste}
                      >
                        {[0, 1, 2, 3, 4, 5].map(i => (
                          <input
                            key={i}
                            ref={el => {
                              otpInputRefs.current[i] = el;
                            }}
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={1}
                            className={styles.otpBox}
                            value={otpDigits[i] || ''}
                            onChange={e => setOtpDigit(i, e.target.value)}
                            onKeyDown={e => handleOtpKeyDown(i, e)}
                            aria-label={`Digit ${i + 1} of 6`}
                          />
                        ))}
                      </div>
                      <div className={styles.otpTimer}>
                        {otpSecondsLeft > 0 ? (
                          <span className={styles.otpTimerText}>
                            Code expires in 0:{String(otpSecondsLeft).padStart(2, '0')}
                          </span>
                        ) : (
                          <span className={styles.otpTimerExpired}>Code expired</span>
                        )}
                      </div>
                    </div>
                    <Box paddingBlockStart="300">
                      <div className={styles.authFormActions}>
                        <Button
                          submit
                          variant="primary"
                          fullWidth
                          size="large"
                          loading={otpVerifyLoading}
                          disabled={otpCode.replace(/\D/g, '').length !== 6}
                        >
                          Sign in
                        </Button>
                      </div>
                    </Box>
                    <div className={styles.otpResend}>
                      <Button
                        variant="plain"
                        size="slim"
                        onClick={handleResendCode}
                        disabled={otpSecondsLeft > 0}
                        loading={otpResendLoading}
                      >
                        {otpSecondsLeft > 0
                          ? `Send new code in 0:${String(otpSecondsLeft).padStart(2, '0')}`
                          : 'Send new code'}
                      </Button>
                    </div>
                  </FormLayout>
                </form>
              </div>
            </div>
            <div className={styles.authCardFooter}>
              <p className={styles.otpFooterHint}>
                <ShortTextWithTooltip
                  shortText="Limit: 3 codes per 15 min."
                  fullMessage="You can request a new code up to 3 times every 15 minutes."
                  iconLabel="Resend limit"
                />
              </p>
            </div>
          </>
        ) : (
          <>
            <h3 className={styles.authCardTitle}>Sign in</h3>
            <div className={styles.authCardBody}>
              <p className={styles.authPanelHint}>
                <ShortTextWithTooltip
                  shortText="We'll email you a sign-in code."
                  fullMessage="Enter your email and we'll send a one-time sign-in code. Approved accounts receive a 6-digit code."
                  iconLabel="How it works"
                />
              </p>
              <form onSubmit={handleSignIn} className={styles.authForm}>
                <FormLayout>
                  {success && (
                    <div className={styles.authInlineMessage} role="status">
                      <ShortTextWithTooltip
                        shortText="Check your email."
                        fullMessage={success}
                        className={styles.authInlineMessageSuccess}
                        iconLabel="Full message"
                      />
                    </div>
                  )}
                  {error && (
                    <div className={styles.authInlineMessage} role="alert">
                      <ShortTextWithTooltip
                        shortText={toUserFacingError(error)}
                        fullMessage={error}
                        className={styles.authInlineMessageError}
                        iconLabel="Error details"
                      />
                    </div>
                  )}
                  <TextField
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@example.com"
                    autoComplete="email"
                    error={undefined}
                  />
                  <Checkbox
                    label="Remember me for 30 days on this device"
                    checked={rememberMe}
                    onChange={setRememberMe}
                  />
                  <Box paddingBlockStart="300">
                    <div className={styles.authFormActions}>
                      <Button submit variant="primary" fullWidth size="large" loading={loading}>
                        Email sign-in code
                      </Button>
                    </div>
                  </Box>
                </FormLayout>
              </form>
              <p className={styles.authTrustHint} aria-hidden>
                We only use your email for sign-in. No spam.
              </p>
            </div>
            <div className={styles.authCardFooter}>
              <button
                type="button"
                className={styles.authSwitch}
                onClick={switchToRegister}
                aria-label="Switch to registration"
              >
                Don&apos;t have an account?{' '}
                <span className={styles.authSwitchAccent}>Create one</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  const registerCard = (
    <div className={styles.authCard}>
      <div className={styles.authCardScanLine} aria-hidden />
      <div className={styles.authCardInner}>
        <h3 className={styles.authCardTitle}>Create account</h3>
        <div className={styles.authCardBody}>
          <p className={styles.authPanelHint}>
            <ShortTextWithTooltip
              shortText="Confirmation link + admin approval required."
              fullMessage="We'll send a confirmation link. After you confirm, an administrator must approve your account before you can sign in."
              iconLabel="How it works"
            />
          </p>
          {success && (
            <div className={styles.authInlineMessage} role="status">
              <ShortTextWithTooltip
                shortText="Check your email."
                fullMessage={success}
                className={styles.authInlineMessageSuccess}
                iconLabel="Full message"
              />
            </div>
          )}
          {error && (
            <div className={styles.authInlineMessage} role="alert">
              <ShortTextWithTooltip
                shortText={toUserFacingError(error)}
                fullMessage={error}
                className={styles.authInlineMessageError}
                iconLabel="Error details"
              />
            </div>
          )}
          <form onSubmit={handleRegister} className={styles.authForm}>
            <FormLayout>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                autoComplete="email"
                error={undefined}
              />
              <Box paddingBlockStart="300">
                <div className={styles.authFormActions}>
                  <Button submit variant="primary" fullWidth size="large" loading={loading}>
                    Create account
                  </Button>
                </div>
              </Box>
            </FormLayout>
          </form>
          <p className={styles.authTrustHint} aria-hidden>
            We only use your email for access. No spam.
          </p>
        </div>
        <div className={styles.authCardFooter}>
          <button
            type="button"
            className={styles.authSwitch}
            onClick={switchToLogin}
            aria-label="Switch to sign in"
          >
            Already have an account? <span className={styles.authSwitchAccent}>Sign in</span>
          </button>
        </div>
      </div>
    </div>
  );

  const phaseClass =
    transitionPhase === 'exiting'
      ? styles.phaseExiting
      : transitionPhase === 'flipIn'
        ? styles.phaseFlipIn
        : transitionPhase === 'entering'
          ? styles.phaseEntering
          : '';
  const viewClass = viewMode === 'register' ? styles.viewRegister : styles.viewLogin;
  const incomingView = transitionTargetView ?? viewMode;

  const renderLeftPanel = view =>
    view === 'login' ? (
      <>
        <div className={styles.heroGradient} aria-hidden="true" />
        <div className={styles.heroGrid} aria-hidden="true" />
        {heroLogin}
      </>
    ) : (
      <>
        <header className={styles.authHeader}>
          <div className={styles.authBrand}>
            <img src="/logo.svg" alt="" className={styles.authLogoImg} width={40} height={40} />
            <div className={styles.authBrandText}>
              <span className={styles.authBrandName}>RipX</span>
              <span className={styles.authTagline}>A/B testing</span>
            </div>
          </div>
        </header>
        {registerCard}
      </>
    );

  const renderRightPanel = view =>
    view === 'login' ? (
      <>
        <header className={styles.authHeader}>
          <div className={styles.authBrand}>
            <img src="/logo.svg" alt="" className={styles.authLogoImg} width={40} height={40} />
            <div className={styles.authBrandText}>
              <span className={styles.authBrandName}>RipX</span>
              <span className={styles.authTagline}>A/B testing</span>
            </div>
          </div>
          {hasEmailSession() && (
            <Link to={ROUTES.DOMAINS} className={styles.authLink}>
              Already signed in? Go to My domains →
            </Link>
          )}
        </header>
        {reasonBanner}
        {loginCard}
        <p className={styles.authFooter}>
          <ShortTextWithTooltip
            shortText="Next: My domains → add site or API key."
            fullMessage="After signing in, go to My domains to add a website or connect with an API key."
            iconLabel="Next steps"
          />
        </p>
        <LegalFooter />
      </>
    ) : (
      <>
        <div className={styles.heroGradient} aria-hidden="true" />
        <div className={styles.heroGrid} aria-hidden="true" />
        {heroRegister}
      </>
    );

  const ariaHiddenFlip = transitionPhase === 'exiting' || transitionPhase === 'flipIn';

  const toastMessage =
    error || success ? (error ? toUserFacingError(error) : 'Check your email.') : null;

  return (
    <PageShell
      className={styles.authPageWrapper}
      message={toastMessage}
      messageType={error ? 'error' : 'success'}
      onCloseMessage={() => {
        setError(null);
        setSuccess(null);
      }}
      messageDuration={error ? 5000 : 4000}
    >
      <Page title="">
        <div className={styles.connectRoot}>
          {/* Idle-state tech layer: subtle grid + data feel when not transitioning */}
          {transitionPhase === 'idle' && (
            <div className={styles.connectIdleTech} aria-hidden>
              <div className={styles.connectIdleGrid} />
              <div className={styles.connectIdleDots} />
              <div className={styles.connectIdleCircuit} />
            </div>
          )}
          <div
            ref={panelsSwapRef}
            className={`${styles.connectPanels} ${styles.connectPanelsSwap} ${phaseClass} ${viewClass}`}
            data-view={viewMode}
            data-phase={transitionPhase}
            style={
              transitionPhase === 'flipIn'
                ? {
                    '--hand-angle': `${clockAngle}deg`,
                    '--sweep-progress': String(sweepProgress),
                  }
                : undefined
            }
          >
            {/* Center divider: vertical futuristic seam between equal panels */}
            <div className={styles.connectCenterDivider} aria-hidden>
              <span className={styles.connectCenterDividerLine} />
              <span className={styles.connectCenterDividerGlow} />
              <span className={styles.connectCenterDividerScan} />
            </div>
            {/* Tech overlay: scan line + grid, visible during exit – futuristic HUD feel */}
            <div
              className={`${styles.transitionTechOverlay} ${transitionPhase === 'exiting' ? styles.transitionTechOverlayActive : ''}`}
              aria-hidden
            >
              <div className={styles.transitionTechGrid} />
              <div className={styles.transitionScanLine} />
              <div className={styles.transitionScanLineTrail} />
            </div>
            {/* Glow at leading edge of iris (futuristic sweep line) */}
            {transitionPhase === 'flipIn' && (
              <div
                className={styles.irisGlowEdge}
                aria-hidden
                style={{
                  background: `conic-gradient(from ${-90 + clockAngle}deg at 50% 50%, transparent 0deg, rgba(6,182,212,0.18) 2deg, rgba(167,139,250,0.22) 4deg, rgba(255,255,255,0.12) 6deg, transparent 12deg)`,
                }}
              />
            )}
            {/* Outgoing layer: visible where hand has NOT swept (clockAngle..360); depth during sweep */}
            <div
              className={styles.connectViewOutgoing}
              data-view={viewMode}
              aria-hidden={ariaHiddenFlip}
              style={
                transitionPhase === 'flipIn'
                  ? {
                      WebkitMaskImage: `conic-gradient(from -90deg at 50% 50%, transparent 0deg, transparent ${clockAngle}deg, black ${clockAngle}deg, black 360deg)`,
                      maskImage: `conic-gradient(from -90deg at 50% 50%, transparent 0deg, transparent ${clockAngle}deg, black ${clockAngle}deg, black 360deg)`,
                      WebkitMaskSize: '100% 100%',
                      maskSize: '100% 100%',
                      WebkitMaskPosition: 'center',
                      maskPosition: 'center',
                      WebkitMaskRepeat: 'no-repeat',
                      maskRepeat: 'no-repeat',
                      transform: `scale(${1 - 0.015 * sweepProgress})`,
                      filter: `blur(${0.4 * sweepProgress}px)`,
                    }
                  : undefined
              }
            >
              <aside
                className={`${styles.connectPanel} ${styles.connectPanelLeft} ${viewMode === 'login' ? styles.panelHero : styles.panelForm}`}
              >
                <div className={styles.connectPanelInner}>{renderLeftPanel(viewMode)}</div>
              </aside>
              <main
                className={`${styles.connectPanel} ${styles.connectPanelRight} ${viewMode === 'login' ? styles.panelForm : styles.panelHero}`}
              >
                <div className={styles.connectPanelInner}>{renderRightPanel(viewMode)}</div>
              </main>
            </div>

            {/* Incoming layer: visible where hand HAS swept (0..clockAngle); revealed by iris */}
            <div
              className={styles.connectViewIncoming}
              data-view={incomingView}
              aria-hidden={transitionPhase === 'entering' || transitionPhase === 'exiting'}
              style={
                transitionPhase === 'flipIn'
                  ? {
                      WebkitMaskImage: `conic-gradient(from -90deg at 50% 50%, black 0deg, black ${clockAngle}deg, transparent ${clockAngle}deg, transparent 360deg)`,
                      maskImage: `conic-gradient(from -90deg at 50% 50%, black 0deg, black ${clockAngle}deg, transparent ${clockAngle}deg, transparent 360deg)`,
                      WebkitMaskSize: '100% 100%',
                      maskSize: '100% 100%',
                      WebkitMaskPosition: 'center',
                      maskPosition: 'center',
                      WebkitMaskRepeat: 'no-repeat',
                      maskRepeat: 'no-repeat',
                      transform: `scale(${0.992 + 0.008 * sweepProgress})`,
                    }
                  : undefined
              }
            >
              <aside
                className={`${styles.connectPanel} ${styles.connectPanelLeft} ${incomingView === 'login' ? styles.panelHero : styles.panelForm}`}
              >
                <div className={styles.connectPanelInner}>{renderLeftPanel(incomingView)}</div>
              </aside>
              <main
                className={`${styles.connectPanel} ${styles.connectPanelRight} ${incomingView === 'login' ? styles.panelForm : styles.panelHero}`}
              >
                <div className={styles.connectPanelInner}>{renderRightPanel(incomingView)}</div>
              </main>
            </div>
          </div>
        </div>
      </Page>
    </PageShell>
  );
}

export default Connect;
