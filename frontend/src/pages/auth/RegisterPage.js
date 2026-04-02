// src/pages/auth/RegisterPage.js
// Multi-step registration for organizers; single step for attendees.
import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { settingsAPI } from '../../api/client';
import SanyLogo from '../../components/ui/Logo';

// ── Shared field component ────────────────────────────────────
function Field({ label, required, error, children }) {
  return (
    <div className="form-group">
      <label className="form-label">
        {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {error && (
        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <i data-lucide="circle-x" style={{ width: 11, height: 11 }} /> {error}
        </div>
      )}
    </div>
  );
}

// ── Terms content ─────────────────────────────────────────────
const TERMS = [
  {
    heading: '1. Platform commission',
    body: 'Sany Adventures charges a commission on each ticket sold through the platform. The default rate is 10% of the ticket face value. Your specific rate is agreed at the time of account approval and may be adjusted by Sany Adventures with 14 days notice.',
  },
  {
    heading: '2. Event accuracy',
    body: 'You are solely responsible for the accuracy of all event information including date, time, venue, lineup and ticket pricing. Sany Adventures may remove events that contain false or misleading information without notice.',
  },
  {
    heading: '3. Refunds and cancellations',
    body: 'If you cancel an event after tickets have been sold, you must notify Sany Adventures immediately. Sany Adventures will issue refunds to ticket holders and may recover already-paid revenue from your account balance. You may not charge attendees cancellation fees.',
  },
  {
    heading: '4. Prohibited events',
    body: 'You may not list events that promote illegal activity, hate speech, violence, or that violate Kenyan law. Sany Adventures reserves the right to remove any event and terminate any organizer account at its sole discretion.',
  },
  {
    heading: '5. Payouts',
    body: 'Revenue is held by Sany Adventures until 48 hours after the event concludes, then disbursed via M-PESA to your registered number after deducting platform commission. Disputes must be raised within 7 days of the event date.',
  },
  {
    heading: '6. Account suspension',
    body: 'Repeated violations of these terms, negative attendee feedback patterns, or suspicious activity may result in temporary suspension or permanent termination of your organizer account.',
  },
  {
    heading: '7. Governing law',
    body: 'These terms are governed by the laws of the Republic of Kenya. Any disputes shall be resolved in the courts of Nairobi County.',
  },
];

const DEFAULT_TERMS_TEXT = TERMS.map(t => `${t.heading}\n${t.body}`).join('\n\n');

const EVENT_TYPE_OPTIONS = [
  'Music & Concerts', 'Tech & Innovation', 'Business & Networking',
  'Food & Drink', 'Arts & Culture', 'Sports & Fitness',
  'Comedy & Entertainment', 'Education & Workshops', 'Fashion & Lifestyle', 'Other',
];

const BUSINESS_TYPES = [
  { value: 'individual', label: 'Individual / Freelancer' },
  { value: 'company',    label: 'Registered Company' },
  { value: 'ngo',        label: 'NGO / Non-profit' },
  { value: 'government', label: 'Government / County' },
];

const ID_TYPES = [
  { value: 'national_id',   label: 'National ID' },
  { value: 'passport',      label: 'Passport' },
  { value: 'business_reg',  label: 'Business Registration Number' },
  { value: 'ngo_reg',       label: 'NGO Registration Number' },
];

// ── Step indicator ────────────────────────────────────────────
function StepDots({ current, total }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          width: i + 1 === current ? 24 : 8,
          height: 8, borderRadius: 4,
          background: i + 1 <= current ? 'var(--accent)' : 'var(--surface3)',
          transition: 'all 0.2s',
        }} />
      ))}
    </div>
  );
}

export default function RegisterPage() {
  const [role, setRole]     = useState('user');
  const [step, setStep]     = useState(1);   // organizer: 1 account, 2 business, 3 terms
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [termsText, setTermsText] = useState(DEFAULT_TERMS_TEXT);
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextUrl = searchParams.get('next');

  const [form, setForm] = useState({
    // Step 1 — account
    name: '', email: '', phone: '', password: '',
    // Step 2 — business profile
    company_name: '', business_type: 'individual',
    id_type: 'national_id', id_number: '',
    physical_address: '', event_types: [],
    expected_monthly_events: '', social_media: '',
    // Step 3 — terms
    terms_agreed: false,
  });

  useEffect(() => {
    settingsAPI.public()
      .then((r) => {
        const txt = r?.data?.data?.terms_and_conditions;
        if (txt && txt.trim()) setTermsText(txt);
      })
      .catch(() => {});
  }, []);

  const set = k => e => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    setFieldErrors(fe => ({ ...fe, [k]: '' }));
  };

  const toggleEventType = (type) => {
    setForm(f => ({
      ...f,
      event_types: f.event_types.includes(type)
        ? f.event_types.filter(t => t !== type)
        : [...f.event_types, type],
    }));
  };

  // ── Validation per step ──────────────────────────────────
  const validateStep = (s) => {
    const errs = {};
    if (s === 1) {
      if (!form.name.trim())       errs.name     = 'Name is required';
      if (!form.email.trim())      errs.email    = 'Email is required';
      if (!form.phone.trim())      errs.phone    = 'Phone is required';
      if (form.password.length < 6) errs.password = 'At least 6 characters';
      if (role === 'organizer' && !form.company_name.trim())
                                    errs.company_name = 'Company name is required';
    }
    if (s === 2) {
      if (!form.id_number.trim())          errs.id_number       = 'ID number is required';
      if (!form.physical_address.trim())   errs.physical_address = 'Address is required';
      if (form.event_types.length === 0)   errs.event_types      = 'Select at least one event type';
      if (!form.expected_monthly_events)   errs.expected_monthly_events = 'Please select an estimate';
    }
    if (s === 3) {
      if (!form.terms_agreed) errs.terms_agreed = 'You must read and agree to the terms';
    }
    return errs;
  };

  const next = () => {
    const errs = validateStep(step);
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    const errs = validateStep(role === 'organizer' ? 3 : 1);
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    setError(''); setLoading(true);
    try {
      const user = await register({ ...form, role });
      if (nextUrl && nextUrl.startsWith('/')) {
        navigate(nextUrl);
      } else {
        navigate(user.role === 'organizer' ? '/organizer' : '/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  // ── Attendee — single-step form ──────────────────────────
  const AttendeeForm = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="form-row">
        <Field label="Full name" required error={fieldErrors.name}>
          <input className="input" value={form.name} onChange={set('name')} placeholder="Jane Doe" />
        </Field>
        <Field label="Phone" required error={fieldErrors.phone}>
          <input className="input" value={form.phone} onChange={set('phone')} placeholder="+254700000000" />
        </Field>
      </div>
      <Field label="Email" required error={fieldErrors.email}>
        <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
      </Field>
      <Field label="Password" required error={fieldErrors.password}>
        <div style={{ position: 'relative' }}>
          <input className="input" type={showPwd ? 'text' : 'password'}
            value={form.password} onChange={set('password')}
            placeholder="Min. 6 characters" style={{ paddingRight: 38 }} />
          <button type="button" onClick={() => setShowPwd(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}>
            <i data-lucide={showPwd ? 'eye-off' : 'eye'} style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </Field>
      <button className="btn btn-primary btn-lg w-full" onClick={handleSubmit} disabled={loading}>
        {loading
          ? <><i data-lucide="loader-2" style={{ width: 15, height: 15 }} /> Creating account…</>
          : <><i data-lucide="user-plus" style={{ width: 15, height: 15 }} /> Create account</>
        }
      </button>
    </div>
  );

  // ── Organizer step 1 — Account ───────────────────────────
  const OrgStep1 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>
        Basic account details
      </div>
      <div className="form-row">
        <Field label="Full name" required error={fieldErrors.name}>
          <input className="input" value={form.name} onChange={set('name')} placeholder="Jane Doe" />
        </Field>
        <Field label="Phone number" required error={fieldErrors.phone}>
          <input className="input" value={form.phone} onChange={set('phone')} placeholder="+254700000000" />
        </Field>
      </div>
      <Field label="Email address" required error={fieldErrors.email}>
        <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
      </Field>
      <Field label="Company / organisation name" required error={fieldErrors.company_name}>
        <input className="input" value={form.company_name} onChange={set('company_name')} placeholder="Nairobi Events Ltd." />
      </Field>
      <Field label="Password" required error={fieldErrors.password}>
        <div style={{ position: 'relative' }}>
          <input className="input" type={showPwd ? 'text' : 'password'}
            value={form.password} onChange={set('password')}
            placeholder="Min. 6 characters" style={{ paddingRight: 38 }} />
          <button type="button" onClick={() => setShowPwd(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}>
            <i data-lucide={showPwd ? 'eye-off' : 'eye'} style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </Field>
      <button className="btn btn-primary btn-lg w-full" onClick={next}>
        Continue <i data-lucide="arrow-right" style={{ width: 15, height: 15 }} />
      </button>
    </div>
  );

  // ── Organizer step 2 — Business profile ─────────────────
  const OrgStep2 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>
        Business profile — helps us verify your account
      </div>

      <div className="form-row">
        <Field label="Business type" required>
          <select className="select" value={form.business_type} onChange={set('business_type')}>
            {BUSINESS_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </Field>
        <Field label="ID type" required>
          <select className="select" value={form.id_type} onChange={set('id_type')}>
            {ID_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
      </div>

      <Field label={ID_TYPES.find(t => t.value === form.id_type)?.label + ' Number'} required error={fieldErrors.id_number}>
        <input className="input" value={form.id_number} onChange={set('id_number')} placeholder="e.g. 12345678" />
      </Field>

      <Field label="Physical address" required error={fieldErrors.physical_address}>
        <textarea className="textarea" value={form.physical_address} onChange={set('physical_address')}
          placeholder="Street, area, city e.g. Kimathi Street, Nairobi CBD" style={{ minHeight: 64 }} />
      </Field>

      <Field label="Website" error={fieldErrors.website}>
        <input className="input" value={form.website || ''} onChange={set('website')} placeholder="https://mycompany.co.ke (optional)" />
      </Field>

      <Field label="Social media handle" error={fieldErrors.social_media}>
        <input className="input" value={form.social_media} onChange={set('social_media')} placeholder="@mycompany on Instagram / Facebook / X" />
      </Field>

      <Field label="Types of events you organise" required error={fieldErrors.event_types}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
          {EVENT_TYPE_OPTIONS.map(type => (
            <div
              key={type}
              onClick={() => toggleEventType(type)}
              style={{
                padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                fontSize: 12, fontWeight: 500, border: '1px solid',
                background: form.event_types.includes(type) ? 'var(--accent-dim)' : 'var(--surface2)',
                borderColor: form.event_types.includes(type) ? 'var(--accent)' : 'var(--border2)',
                color: form.event_types.includes(type) ? 'var(--accent)' : 'var(--text2)',
                transition: 'all 0.12s',
              }}
            >
              {type}
            </div>
          ))}
        </div>
      </Field>

      <Field label="Expected events per month" required error={fieldErrors.expected_monthly_events}>
        <select className="select" value={form.expected_monthly_events} onChange={set('expected_monthly_events')}>
          <option value="">Select…</option>
          <option value="1">1 event/month</option>
          <option value="2-4">2 – 4 events/month</option>
          <option value="5-10">5 – 10 events/month</option>
          <option value="10+">More than 10/month</option>
        </select>
      </Field>

      <div className="responsive-actions">
        <button className="btn btn-secondary" onClick={() => setStep(1)} style={{ flex: 1, justifyContent: 'center' }}>
          <i data-lucide="arrow-left" style={{ width: 14, height: 14 }} /> Back
        </button>
        <button className="btn btn-primary" onClick={next} style={{ flex: 2, justifyContent: 'center' }}>
          Continue <i data-lucide="arrow-right" style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </div>
  );

  // ── Organizer step 3 — Terms & agreement ────────────────
  const OrgStep3 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--text2)' }}>
        Read the organizer agreement carefully before proceeding.
      </div>

      {/* Scrollable terms */}
      <div style={{
        background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '14px 16px', maxHeight: 280, overflowY: 'auto',
        fontSize: 12, lineHeight: 1.7,
      }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
          Sany Adventures — Organizer Agreement
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 16 }}>
          Effective date: January 2025 · Governed by Kenyan law
        </div>
        <div style={{ color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>
          {termsText}
        </div>
        <div style={{ color: 'var(--text2)', marginTop: 8 }}>
          By ticking the checkbox below you confirm that you have read, understood and agree to
          all the terms above, and that the information you have provided during registration
          is accurate to the best of your knowledge.
        </div>
      </div>

      {/* Checkbox */}
      <div
        onClick={() => setForm(f => ({ ...f, terms_agreed: !f.terms_agreed }))}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
          padding: '12px 14px', borderRadius: 8,
          background: form.terms_agreed ? 'var(--accent-dim)' : 'var(--surface2)',
          border: `1px solid ${form.terms_agreed ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
          transition: 'all 0.15s',
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
          background: form.terms_agreed ? 'var(--accent)' : 'var(--surface3)',
          border: `2px solid ${form.terms_agreed ? 'var(--accent)' : 'var(--border2)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {form.terms_agreed && <i data-lucide="check" style={{ width: 11, height: 11, color: '#000' }} />}
        </div>
        <span style={{ fontSize: 13, lineHeight: 1.5, color: form.terms_agreed ? 'var(--text)' : 'var(--text2)' }}>
          I have read and agree to the Sany Adventures Organizer Agreement. I confirm that all
          registration information provided is accurate.
        </span>
      </div>

      {fieldErrors.terms_agreed && (
        <div style={{ fontSize: 12, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <i data-lucide="circle-x" style={{ width: 12, height: 12 }} /> {fieldErrors.terms_agreed}
        </div>
      )}

      {/* Summary of what they filled in */}
      <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px', fontSize: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Application summary</div>
        {[
          ['Name',            form.name],
          ['Email',           form.email],
          ['Phone',           form.phone],
          ['Company',         form.company_name],
          ['Business type',   BUSINESS_TYPES.find(b => b.value === form.business_type)?.label],
          ['ID',              `${ID_TYPES.find(t => t.value === form.id_type)?.label}: ${form.id_number}`],
          ['Address',         form.physical_address],
          ['Event types',     form.event_types.join(', ') || '—'],
          ['Monthly events',  form.expected_monthly_events || '—'],
          ['Social media',    form.social_media || '—'],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <span style={{ color: 'var(--text3)', minWidth: 100 }}>{label}</span>
            <span style={{ color: 'var(--text)', fontWeight: 500 }}>{value}</span>
          </div>
        ))}
      </div>

      <div className="responsive-actions">
        <button className="btn btn-secondary" onClick={() => setStep(2)} style={{ flex: 1, justifyContent: 'center' }}>
          <i data-lucide="arrow-left" style={{ width: 14, height: 14 }} /> Back
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={loading || !form.terms_agreed}
          style={{ flex: 2, justifyContent: 'center' }}
        >
          {loading
            ? <><i data-lucide="loader-2" style={{ width: 15, height: 15 }} /> Submitting…</>
            : <><i data-lucide="send" style={{ width: 15, height: 15 }} /> Submit application</>
          }
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: role === 'organizer' ? 520 : 480 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <SanyLogo size={36} full />
          </div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 700 }}>
            {role === 'organizer'
              ? ['Create organizer account', 'Business profile', 'Review & agree'][step - 1]
              : 'Create account'
            }
          </h1>
          {role === 'organizer' && (
            <p style={{ color: 'var(--text2)', fontSize: 12, marginTop: 6 }}>
              Step {step} of 3
            </p>
          )}
        </div>

        <div className="card" style={{ padding: 28 }}>
          {/* Role switcher — only show on step 1 */}
          {step === 1 && (
            <div className="pill-tabs responsive-pill-tabs" style={{ marginBottom: 20 }}>
              <div className={`pill-tab ${role === 'user' ? 'active' : ''}`} onClick={() => { setRole('user'); setStep(1); }}>
                Attendee
              </div>
              <div className={`pill-tab ${role === 'organizer' ? 'active' : ''}`} onClick={() => { setRole('organizer'); setStep(1); }}>
                Event Organizer
              </div>
            </div>
          )}

          {role === 'organizer' && <StepDots current={step} total={3} />}

          {/* Error banner */}
          {error && (
            <div style={{ background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <i data-lucide="circle-x" style={{ width: 14, height: 14, flexShrink: 0 }} /> {error}
            </div>
          )}

          {/* Step content */}
          {role === 'user'           && AttendeeForm()}
          {role === 'organizer' && step === 1 && OrgStep1()}
          {role === 'organizer' && step === 2 && OrgStep2()}
          {role === 'organizer' && step === 3 && OrgStep3()}
        </div>

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>
            Already have an account?{' '}
            <Link to={nextUrl ? `/login?next=${encodeURIComponent(nextUrl)}` : '/login'} style={{ color: 'var(--accent)' }}>
              Sign in
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}
