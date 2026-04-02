// src/pages/auth/ResetPasswordPage.js
import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import SanyLogo from '../../components/ui/Logo';
import { authAPI } from '../../api/client';

export default function ResetPasswordPage() {
  const [params]            = useSearchParams();
  const token               = params.get('token') || '';
  const navigate            = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [done, setDone]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 6)  { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await authAPI.resetPassword({ token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed — link may have expired');
    } finally {
      setLoading(false);
    }
  };

  if (!token) return (
    <div className="auth-shell">
      <div className="card" style={{ padding: 32, textAlign: 'center', maxWidth: 400 }}>
        <i data-lucide="link-2-off" style={{ width: 36, height: 36, color: 'var(--danger)', marginBottom: 12 }} />
        <div style={{ fontFamily: 'Syne', fontWeight: 600, marginBottom: 8 }}>Invalid link</div>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
          This password reset link is missing or invalid.
        </p>
        <Link to="/forgot-password" className="btn btn-primary" style={{ justifyContent: 'center' }}>
          Request a new link
        </Link>
      </div>
    </div>
  );

  return (
    <div className="auth-shell">
      <div className="auth-wrap">
        <div className="auth-header" style={{ marginBottom: 32 }}>
          <div className="auth-logo">
            <SanyLogo size={36} full />
          </div>
          <h1 className="auth-title">Choose a new password</h1>
        </div>

        <div className="card auth-card">
          {done ? (
            <div className="auth-center">
              <div className="auth-icon-circle auth-icon-circle-success">
                <i data-lucide="check-circle" style={{ width: 24, height: 24, color: 'var(--accent)' }} />
              </div>
              <div className="auth-title" style={{ fontSize: 20, marginBottom: 8 }}>Password updated</div>
              <p className="auth-subtitle">
                Redirecting you to login…
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="auth-form">
              {error && (
                <div className="auth-banner auth-banner-error" style={{ marginBottom: 0 }}>
                  <i data-lucide="circle-x" style={{ width: 14, height: 14, flexShrink: 0 }} />
                  {error}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">New password</label>
                <input
                  className="input" type="password" required minLength={6}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm password</label>
                <input
                  className="input" type="password" required
                  value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat your new password"
                />
              </div>
              <button
                className="btn btn-primary btn-lg w-full"
                type="submit" disabled={loading}
                style={{ justifyContent: 'center', marginTop: 4 }}
              >
                {loading
                  ? <><i data-lucide="loader-2" style={{ width: 15, height: 15 }} /> Updating…</>
                  : <><i data-lucide="key" style={{ width: 15, height: 15 }} /> Reset password</>
                }
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
