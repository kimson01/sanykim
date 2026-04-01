// src/pages/auth/VerifyEmailPage.js
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { authAPI } from '../../api/client';
import SanyLogo from '../../components/ui/Logo';

export default function VerifyEmailPage() {
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();
  const token           = searchParams.get('token');

  const [status, setStatus]   = useState('verifying'); // verifying | success | failed | expired
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending]     = useState(false);
  const [resent, setResent]           = useState(false);
  const [error, setError]             = useState('');

  useEffect(() => {
    if (!token) { setStatus('failed'); return; }

    authAPI.verifyEmail({ token })
      .then(() => {
        setStatus('success');
        // Auto-redirect to login after 3 seconds
        setTimeout(() => navigate('/login'), 3000);
      })
      .catch(err => {
        const data = err.response?.data;
        setStatus(data?.expired ? 'expired' : 'failed');
      });
  }, [token, navigate]);

  const handleResend = async () => {
    if (!resendEmail.trim()) { setError('Enter your email address'); return; }
    setResending(true); setError('');
    try {
      await authAPI.resendVerification({ email: resendEmail.trim() });
      setResent(true);
    } catch {
      setError('Could not send email. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 20, background: 'var(--bg)',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <SanyLogo size={36} full />
          </div>
        </div>

        <div className="card" style={{ padding: 32, textAlign: 'center' }}>

          {/* Verifying spinner */}
          {status === 'verifying' && (
            <>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <i data-lucide="loader-2" style={{ width: 26, height: 26, color: 'var(--accent)' }} />
              </div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
                Verifying your email…
              </div>
              <p style={{ color: 'var(--text2)', fontSize: 13 }}>Please wait a moment.</p>
            </>
          )}

          {/* Success */}
          {status === 'success' && (
            <>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <i data-lucide="check-circle" style={{ width: 28, height: 28, color: 'var(--accent)' }} />
              </div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 20, marginBottom: 8, color: 'var(--accent)' }}>
                Email verified!
              </div>
              <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>
                Your account is now active. Redirecting you to login…
              </p>
              <Link to="/login" className="btn btn-primary w-full">
                <i data-lucide="log-in" style={{ width: 14, height: 14 }} /> Sign in now
              </Link>
            </>
          )}

          {/* Expired — show resend form */}
          {status === 'expired' && (
            <>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--warning-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <i data-lucide="clock" style={{ width: 26, height: 26, color: 'var(--warning)' }} />
              </div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
                Link has expired
              </div>
              <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>
                Verification links expire after 24 hours. Enter your email to get a new one.
              </p>
              {!resent ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input
                    className="input"
                    type="email"
                    value={resendEmail}
                    onChange={e => { setResendEmail(e.target.value); setError(''); }}
                    placeholder="your@email.com"
                  />
                  {error && (
                    <div style={{ fontSize: 12, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i data-lucide="circle-x" style={{ width: 12, height: 12 }} /> {error}
                    </div>
                  )}
                  <button className="btn btn-primary w-full" onClick={handleResend} disabled={resending}>
                    {resending
                      ? <><i data-lucide="loader-2" style={{ width: 14, height: 14 }} /> Sending…</>
                      : <><i data-lucide="mail" style={{ width: 14, height: 14 }} /> Send new link</>
                    }
                  </button>
                </div>
              ) : (
                <div style={{ background: 'var(--accent-dim)', border: '1px solid rgba(201,162,39,0.2)', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
                  <i data-lucide="mail-check" style={{ width: 16, height: 16, color: 'var(--accent)', marginBottom: 6 }} />
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>New link sent!</div>
                  <div style={{ color: 'var(--text2)' }}>Check your inbox and click the new verification link.</div>
                </div>
              )}
            </>
          )}

          {/* Failed — invalid token */}
          {status === 'failed' && (
            <>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--danger-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <i data-lucide="x-circle" style={{ width: 26, height: 26, color: 'var(--danger)' }} />
              </div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
                Invalid verification link
              </div>
              <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>
                This link is invalid. If you need a new verification email, enter your address below.
              </p>
              {!resent ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input
                    className="input"
                    type="email"
                    value={resendEmail}
                    onChange={e => { setResendEmail(e.target.value); setError(''); }}
                    placeholder="your@email.com"
                  />
                  {error && (
                    <div style={{ fontSize: 12, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i data-lucide="circle-x" style={{ width: 12, height: 12 }} /> {error}
                    </div>
                  )}
                  <button className="btn btn-primary w-full" onClick={handleResend} disabled={resending}>
                    {resending
                      ? <><i data-lucide="loader-2" style={{ width: 14, height: 14 }} /> Sending…</>
                      : <><i data-lucide="mail" style={{ width: 14, height: 14 }} /> Send verification email</>
                    }
                  </button>
                </div>
              ) : (
                <div style={{ background: 'var(--accent-dim)', border: '1px solid rgba(201,162,39,0.2)', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Email sent!</div>
                  <div style={{ color: 'var(--text2)' }}>Check your inbox for the new verification link.</div>
                </div>
              )}
            </>
          )}

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <Link to="/login" style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none' }}>
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
