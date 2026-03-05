/**
 * Connect – Sign in or register (email only).
 * Accepted users get 6-digit OTP (1 min); admins get magic link.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Page, FormLayout, TextField, Button, Box, Checkbox } from '@shopify/polaris';
import { PageShell, LegalFooter } from '../Shared';
import { ROUTES, isPlatformAdmin } from '../../constants';
import {
  hasEmailSession,
  apiPostPublic,
  setEmailToken,
  apiGet,
  clearStoreSelection,
} from '../../services';
import { STORAGE_KEYS } from '../../constants';
import { RouteLoading } from '../LoadingSkeleton/RouteLoading';
import styles from './Connect.module.css';

const OTP_EXPIRY_SECONDS = 60;

function Connect() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState('signin'); // 'signin' | 'register'
  const [email, setEmail] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  // OTP step (accepted users)
  const [step, setStep] = useState('form'); // 'form' | 'otp'
  const [otpEmail, setOtpEmail] = useState('');
  const [otpRememberMe, setOtpRememberMe] = useState(false);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [otpCode, setOtpCode] = useState('');
  const [otpVerifyLoading, setOtpVerifyLoading] = useState(false);
  const [otpResendLoading, setOtpResendLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const otpInputRefs = useRef([]);

  // One-time connect token (from admin "Connect app" / "Open app") – exchange and redirect to dashboard
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
          {
            timeout: 15000,
          }
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
          /* ignore storage errors */
        }
        setSearchParams(p => {
          const next = new URLSearchParams(p);
          next.delete('connect_token');
          return next;
        });
        setIsRedirecting(true);
        window.location.href = ROUTES.DASHBOARD;
      } catch (err) {
        if (!cancelled) {
          const msg =
            err?.response?.data?.error ||
            err?.message ||
            'Invalid or expired link. Request a new one from Admin.';
          setError(msg);
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
      setError(err.response?.data?.error || err.message || 'Failed to send login link');
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
      let target = ROUTES.DOMAINS;
      try {
        const meRes = await apiGet('/admin/me');
        const me = meRes.data?.data ?? meRes.data;
        const role = me?.role ?? null;
        if (isPlatformAdmin(role)) {
          target = ROUTES.ADMIN;
        }
      } catch (_) {
        target = ROUTES.DOMAINS;
      }
      requestAnimationFrame(() => {
        setTimeout(() => {
          window.location.replace(target);
        }, 180);
      });
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || 'Invalid or expired code. Request a new code.'
      );
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
      setError(err.response?.data?.error || err.message || 'Failed to resend code');
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
      const nextIndex = Math.min(pasted.length, 5);
      otpInputRefs.current[nextIndex]?.focus();
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
      setError(err.response?.data?.error || err.message || 'Registration failed');
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

  return (
    <PageShell
      className={styles.authPageWrapper}
      message={error || success}
      messageType={error ? 'error' : 'success'}
      onCloseMessage={() => {
        setError(null);
        setSuccess(null);
      }}
      messageDuration={error ? 5000 : 4000}
    >
      <Page title="">
        <div className={styles.connectRoot}>
          {/* Left: Brand hero (desktop) */}
          <aside className={styles.connectHero}>
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
                Sign in to manage your domains and A/B tests with confidence.
              </p>
              <ul className={styles.heroList}>
                <li>Passwordless email sign-in</li>
                <li>Multi-domain support</li>
                <li>Admin-approved access</li>
              </ul>
            </div>
            <div className={styles.heroGradient} aria-hidden="true" />
            <div className={styles.heroGrid} aria-hidden="true" />
          </aside>

          {/* Right: Form */}
          <main className={styles.connectMain}>
            <div className={styles.connectInner}>
              {/* Mobile-only brand */}
              <header className={styles.authHeader}>
                <div className={styles.authBrand}>
                  <img
                    src="/logo.svg"
                    alt=""
                    className={styles.authLogoImg}
                    width={40}
                    height={40}
                  />
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

              <div className={styles.authCard}>
                <div className={styles.authCardInner}>
                  {step === 'otp' ? (
                    <>
                      <div className={styles.otpHeader}>
                        <button
                          type="button"
                          className={styles.otpBack}
                          onClick={handleBackToEmail}
                        >
                          ← Back
                        </button>
                      </div>
                      <div className={styles.authCardBody}>
                        <div className={styles.otpPanel}>
                          <p className={styles.otpSentTo}>
                            We sent a 6-digit code to <strong>{otpEmail}</strong>
                          </p>
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
                          You can request a new code up to 3 times every 15 minutes.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        className={styles.authTabs}
                        role="tablist"
                        aria-label="Sign in or create account"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={mode === 'signin'}
                          aria-controls="auth-panel-signin"
                          id="auth-tab-signin"
                          className={`${styles.authTab} ${mode === 'signin' ? styles.authTabActive : ''}`}
                          onClick={() => setMode('signin')}
                        >
                          Sign in
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={mode === 'register'}
                          aria-controls="auth-panel-register"
                          id="auth-tab-register"
                          className={`${styles.authTab} ${mode === 'register' ? styles.authTabActive : ''}`}
                          onClick={() => setMode('register')}
                        >
                          Create account
                        </button>
                        <div
                          className={styles.authTabIndicator}
                          style={{
                            transform: mode === 'register' ? 'translateX(100%)' : 'translateX(0)',
                          }}
                        />
                      </div>

                      <div className={styles.authCardBody}>
                        <div className={styles.authPanelWrapper}>
                          <div
                            id="auth-panel-signin"
                            role="tabpanel"
                            aria-labelledby="auth-tab-signin"
                            aria-hidden={mode !== 'signin'}
                            className={`${styles.authPanel} ${mode === 'signin' ? styles.authPanelActive : styles.authPanelInactive}`}
                          >
                            <p className={styles.authPanelHint}>
                              Enter your email and we&apos;ll send a one-time sign-in code. Approved
                              accounts receive a 6-digit code; your account must be approved by an
                              administrator first.
                            </p>
                            <form onSubmit={handleSignIn} className={styles.authForm}>
                              <FormLayout>
                                <TextField
                                  label="Email"
                                  type="email"
                                  value={email}
                                  onChange={setEmail}
                                  placeholder="you@example.com"
                                  autoComplete="email"
                                  error={error}
                                />
                                <Checkbox
                                  label="Remember me for 30 days on this device"
                                  checked={rememberMe}
                                  onChange={setRememberMe}
                                />
                                <Box paddingBlockStart="300">
                                  <div className={styles.authFormActions}>
                                    <Button
                                      submit
                                      variant="primary"
                                      fullWidth
                                      size="large"
                                      loading={loading}
                                    >
                                      Email sign-in code
                                    </Button>
                                  </div>
                                </Box>
                              </FormLayout>
                            </form>
                          </div>
                          <div
                            id="auth-panel-register"
                            role="tabpanel"
                            aria-labelledby="auth-tab-register"
                            aria-hidden={mode !== 'register'}
                            className={`${styles.authPanel} ${mode === 'register' ? styles.authPanelActive : styles.authPanelInactive}`}
                          >
                            <p className={styles.authPanelHint}>
                              We&apos;ll send a confirmation link. After you confirm, an
                              administrator must approve your account before you can sign in.
                            </p>
                            <form onSubmit={handleRegister} className={styles.authForm}>
                              <FormLayout>
                                <TextField
                                  label="Email"
                                  type="email"
                                  value={email}
                                  onChange={setEmail}
                                  placeholder="you@example.com"
                                  autoComplete="email"
                                  error={error}
                                />
                                <Box paddingBlockStart="300">
                                  <div className={styles.authFormActions}>
                                    <Button
                                      submit
                                      variant="primary"
                                      fullWidth
                                      size="large"
                                      loading={loading}
                                    >
                                      Create account
                                    </Button>
                                  </div>
                                </Box>
                              </FormLayout>
                            </form>
                          </div>
                        </div>
                      </div>

                      <div className={styles.authCardFooter}>
                        {mode === 'signin' ? (
                          <button
                            type="button"
                            className={styles.authSwitch}
                            onClick={() => setMode('register')}
                          >
                            Don&apos;t have an account?{' '}
                            <span className={styles.authSwitchAccent}>Create one</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.authSwitch}
                            onClick={() => setMode('signin')}
                          >
                            Already have an account?{' '}
                            <span className={styles.authSwitchAccent}>Sign in</span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <p className={styles.authFooter}>
                After signing in, go to <strong>My domains</strong> to add a website or connect with
                an API key.
              </p>
              <LegalFooter />
            </div>
          </main>
        </div>
      </Page>
    </PageShell>
  );
}

export default Connect;
