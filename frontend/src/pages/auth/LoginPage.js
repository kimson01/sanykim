// src/pages/auth/LoginPage.js
import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import SanyLogo from '../../components/ui/Logo';
import { authAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const HINTS = {
  admin:     { email: 'admin@sanyadventures.com', password: 'Admin@1234'     },
  organizer: { email: 'james@nairobievents.com',  password: 'Organizer@123'  },
  user:      { email: 'alice@gmail.com',          password: 'User@1234'      },
};

export default function LoginPage() {
  const [role, setRole]         = useState('user');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // Email-not-verified state — shows resend option
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [resending, setResending]             = useState(false);
  const [resentOk, setResentOk]               = useState(false);
  const [acceptedOk, setAcceptedOk]           = useState(false);

  // Locked organizer recovery modal
  const [termsModalOpen, setTermsModalOpen]   = useState(false);
  const [termsText, setTermsText]             = useState('');
  const [agreeTerms, setAgreeTerms]           = useState(false);
  const [acceptingTerms, setAcceptingTerms]   = useState(false);

  const { login }  = useAuth();
  const navigate   = useNavigate();
  const [searchParams] = useSearchParams();
  const nextUrl = searchParams.get('next');

  const applyHint = (r) => {
    setRole(r);
    setEmail(HINTS[r].email);
    setPassword(HINTS[r].password);
    setError('');
    setUnverifiedEmail('');
    setResentOk(false);
    setAcceptedOk(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setUnverifiedEmail(''); setResentOk(false); setAcceptedOk(false); setLoading(true);
    try {
      const user = await login(email.trim(), password);
      if (nextUrl && nextUrl.startsWith('/')) {
        navigate(nextUrl);
      } else if (user.role === 'admin') {
        navigate('/admin');
      } else if (user.role === 'organizer') {
        navigate('/organizer');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      const data = err.response?.data;
      // Email not verified — show a targeted resend prompt
      if (data?.email_not_verified) {
        setUnverifiedEmail(data.email || email.trim());
        setError('');
      } else if (data?.terms_lock) {
        setError('');
        setTermsText(data.terms_and_conditions || '');
        setAgreeTerms(false);
        setTermsModalOpen(true);
      } else {
        setError(data?.message || 'Invalid email or password');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await authAPI.resendVerification({ email: unverifiedEmail });
      setResentOk(true);
    } catch {
      setError('Could not resend email. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const handleAcceptTerms = async () => {
    setAcceptingTerms(true);
    setError('');
    try {
      await authAPI.acceptOrganizerTerms({
        email: email.trim(),
        password,
        terms_agreed: agreeTerms,
      });
      setTermsModalOpen(false);
      setAcceptedOk(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not accept terms. Please try again.');
    } finally {
      setAcceptingTerms(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-wrap">

        {/* Logo */}
        <div className="auth-header">
          <div className="auth-logo">
            <SanyLogo size={36} full />
          </div>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">
            Sign in to your Sany Adventures account
          </p>
        </div>

        <div className="card auth-card">
          {/* Role selector */}
          <div className="pill-tabs" style={{ marginBottom: 20 }}>
            {['user', 'organizer', 'admin'].map(r => (
              <div
                key={r}
                className={`pill-tab ${role === r ? 'active' : ''}`}
                onClick={() => applyHint(r)}
              >
                {r === 'user' ? 'Attendee' : r === 'organizer' ? 'Organizer' : 'Admin'}
              </div>
            ))}
          </div>

          {/* Email not verified banner */}
          {unverifiedEmail && !resentOk && (
            <div style={{
              background: 'var(--warning-dim)', border: '1px solid rgba(234,179,8,0.25)',
              borderRadius: 8, padding: '12px 14px', marginBottom: 16,
              fontSize: 13,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--warning)', marginBottom: 6 }}>
                <i data-lucide="mail" style={{ width: 14, height: 14, flexShrink: 0 }} />
                Email not verified
              </div>
              <p style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 10 }}>
                Please verify your email before logging in. Check your inbox for the verification link,
                or get a new one below.
              </p>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleResend}
                disabled={resending}
              >
                {resending
                  ? <><i data-lucide="loader-2" style={{ width: 12, height: 12 }} /> Sending…</>
                  : <><i data-lucide="mail" style={{ width: 12, height: 12 }} /> Resend verification email</>
                }
              </button>
            </div>
          )}

          {/* Resent confirmation */}
          {resentOk && (
            <div className="auth-banner auth-banner-success">
              <i data-lucide="mail-check" style={{ width: 14, height: 14, flexShrink: 0 }} />
              Verification email sent — check your inbox.
            </div>
          )}

          {/* General error */}
          {error && (
            <div className="auth-banner auth-banner-error">
              <i data-lucide="circle-x" style={{ width: 14, height: 14, flexShrink: 0 }} />
              {error}
            </div>
          )}

          {/* Terms accepted confirmation */}
          {acceptedOk && (
            <div className="auth-banner auth-banner-success">
              <i data-lucide="check-circle" style={{ width: 14, height: 14, flexShrink: 0 }} />
              Terms accepted. Sign in again to continue.
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="input" type="email" required
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); setUnverifiedEmail(''); setResentOk(false); }}
                placeholder="you@example.com"
              />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label className="form-label" style={{ margin: 0 }}>Password</label>
                <Link to="/forgot-password" style={{ fontSize: 11, color: 'var(--accent)' }}>
                  Forgot password?
                </Link>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showPwd ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="••••••••"
                  style={{ paddingRight: 38 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2,
                  }}
                >
                  <i data-lucide={showPwd ? 'eye-off' : 'eye'} style={{ width: 14, height: 14 }} />
                </button>
              </div>
            </div>

            <button
              className="btn btn-primary btn-lg w-full"
              type="submit"
              disabled={loading}
              style={{ justifyContent: 'center', marginTop: 4 }}
            >
              {loading
                ? <><i data-lucide="loader-2" style={{ width: 15, height: 15 }} /> Signing in…</>
                : <><i data-lucide="log-in"   style={{ width: 15, height: 15 }} /> Sign in</>
              }
            </button>

            <div className="auth-inline-note">
              Don't have an account?{' '}
              <Link to={nextUrl ? `/register?next=${encodeURIComponent(nextUrl)}` : '/register'} className="auth-inline-link">
                Create one
              </Link>
            </div>
          </form>

          <hr className="divider" />
          <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.8 }}>
            Demo: <strong>{HINTS[role].email}</strong> / <strong>{HINTS[role].password}</strong>
          </div>
        </div>

        <div className="auth-center" style={{ marginTop: 16 }}>
          <Link to="/" className="btn btn-ghost btn-sm">
            <i data-lucide="arrow-left" style={{ width: 13, height: 13 }} /> Back to events
          </Link>
        </div>

        {/* Locked organizer modal */}
        {termsModalOpen && (
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !acceptingTerms && setTermsModalOpen(false)}>
            <div className="modal" style={{ maxWidth: 640 }}>
              <div className="modal-header">
                <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 18, fontWeight: 700 }}>
                  Organizer Terms Required
                </h3>
                <button className="btn btn-ghost btn-icon" onClick={() => setTermsModalOpen(false)} disabled={acceptingTerms}>
                  <i data-lucide="x" style={{ width: 16, height: 16 }} />
                </button>
              </div>
              <div className="modal-body">
                <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 12 }}>
                  Your organizer account is locked until you accept the current terms and conditions.
                </p>
                <textarea
                  className="textarea"
                  value={termsText || 'Terms text is not available right now. Please contact support.'}
                  readOnly
                  style={{ minHeight: 220, marginBottom: 12 }}
                />
                <button
                  type="button"
                  onClick={() => setAgreeTerms(v => !v)}
                  style={{
                    width: '100%', textAlign: 'left', background: 'transparent',
                    border: `1px solid ${agreeTerms ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 8, padding: '10px 12px', color: 'var(--text)', cursor: 'pointer',
                    marginBottom: 12,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: 4,
                      border: `2px solid ${agreeTerms ? 'var(--accent)' : 'var(--border2)'}`,
                      background: agreeTerms ? 'var(--accent)' : 'transparent',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {agreeTerms && <i data-lucide="check" style={{ width: 10, height: 10, color: '#000' }} />}
                    </span>
                    I have read and agree to these organizer terms.
                  </span>
                </button>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setTermsModalOpen(false)} disabled={acceptingTerms}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleAcceptTerms} disabled={acceptingTerms || !agreeTerms}>
                    {acceptingTerms
                      ? <><i data-lucide="loader-2" style={{ width: 14, height: 14 }} /> Saving…</>
                      : <><i data-lucide="shield-check" style={{ width: 14, height: 14 }} /> Agree and unlock</>
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
