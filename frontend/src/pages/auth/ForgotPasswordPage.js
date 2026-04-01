// src/pages/auth/ForgotPasswordPage.js
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import SanyLogo from '../../components/ui/Logo';
import { authAPI } from '../../api/client';

export default function ForgotPasswordPage() {
  const [email, setEmail]       = useState('');
  const [sent, setSent]         = useState(false);
  const [devUrl, setDevUrl]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await authAPI.forgotPassword({ email });
      setSent(true);
      if (res.data.dev_reset_url) setDevUrl(res.data.dev_reset_url);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <SanyLogo size={36} full />
          </div>
          <h1 style={{ fontFamily: 'Syne', fontSize: 22, fontWeight: 700 }}>Reset your password</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 6 }}>
            Enter your email and we'll send reset instructions
          </p>
        </div>

        <div className="card" style={{ padding: 28 }}>
          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 52, height: 52, background: 'var(--accent-dim)',
                borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 16px',
              }}>
                <i data-lucide="mail-check" style={{ width: 24, height: 24, color: 'var(--accent)' }} />
              </div>
              <div style={{ fontFamily: 'Syne', fontWeight: 600, marginBottom: 8 }}>Check your inbox</div>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
                If <strong>{email}</strong> is registered, you'll receive an email with a reset link within a few minutes.
              </p>

              {/* Dev-only: show the raw link so you can test without email */}
              {devUrl && (
                <div style={{
                  background: 'var(--warning-dim)',
                  border: '1px solid rgba(234,179,8,0.25)',
                  borderRadius: 8, padding: '10px 14px',
                  marginBottom: 16, textAlign: 'left',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 600, marginBottom: 4 }}>
                    DEV MODE — reset link
                  </div>
                  <a href={devUrl} style={{ fontSize: 11, color: 'var(--info)', wordBreak: 'break-all' }}>
                    {devUrl}
                  </a>
                </div>
              )}

              <Link to="/login" className="btn btn-secondary w-full" style={{ justifyContent: 'center' }}>
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && (
                <div style={{
                  background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <i data-lucide="circle-x" style={{ width: 14, height: 14, flexShrink: 0 }} />
                  {error}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Email address</label>
                <input
                  className="input" type="email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                />
              </div>
              <button
                className="btn btn-primary btn-lg w-full"
                type="submit" disabled={loading}
                style={{ justifyContent: 'center', marginTop: 4 }}
              >
                {loading
                  ? <><i data-lucide="loader-2" style={{ width: 15, height: 15 }} /> Sending…</>
                  : <><i data-lucide="send" style={{ width: 15, height: 15 }} /> Send reset link</>
                }
              </button>
              <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text2)' }}>
                <Link to="/login" style={{ color: 'var(--accent)' }}>Back to login</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
