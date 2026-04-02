// src/pages/public/CheckoutPage.js
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { eventsAPI, ordersAPI, paymentsAPI, settingsAPI } from '../../api/client';
import { fmtDate, fmtCurrency } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import SanyLogo from '../../components/ui/Logo';

const STEPS = ['Select Tickets', 'Your Details', 'Payment', 'Confirmation'];
const pendingOrderStorageKey = (eventId) => `ef_pending_order_${eventId}`;

// ── Steps indicator ───────────────────────────────────────────
function StepsBar({ active }) {
  return (
    <div className="steps" style={{ marginBottom: 28 }}>
      {STEPS.map((s, i) => {
        const n = i + 1;
        const done = n < active, cur = n === active;
        return (
          <div key={i} className="step-item">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div className={`step-dot ${done ? 'done' : cur ? 'active' : ''}`}>
                {done
                  ? <i data-lucide="check" style={{ width: 12, height: 12 }} />
                  : n}
              </div>
              <span className="step-label" style={cur ? { color: 'var(--text)' } : {}}>{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`step-line ${done ? 'done' : ''}`} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Order summary sidebar ─────────────────────────────────────
function OrderSummary({ event, selections, discount, promoApplied }) {
  const subtotal = selections.reduce((s, sel) => {
    const tt = event?.ticket_types?.find(t => t.id === sel.ticket_type_id);
    return s + (tt ? Number(tt.price) * sel.quantity : 0);
  }, 0);
  const total = Math.max(0, subtotal - (discount || 0));

  return (
    <div className="card responsive-sticky-card">
      <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 14 }}>Order Summary</div>
      {event?.banner_url && (
        <img
          src={event.banner_url} alt=""
          style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 8, marginBottom: 12 }}
        />
      )}
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{event?.title}</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
        {fmtDate(event?.event_date)} · {event?.location}
      </div>
      <hr className="divider" style={{ margin: '12px 0' }} />

      {selections.filter(s => s.quantity > 0).map(sel => {
        const tt = event?.ticket_types?.find(t => t.id === sel.ticket_type_id);
        if (!tt) return null;
        return (
          <div key={sel.ticket_type_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
            <span>{tt.name} ×{sel.quantity}</span>
            <span>{Number(tt.price) === 0 ? 'Free' : fmtCurrency(Number(tt.price) * sel.quantity)}</span>
          </div>
        );
      })}

      {discount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: 'var(--accent)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <i data-lucide="tag" style={{ width: 11, height: 11 }} />
            Promo ({promoApplied})
          </span>
          <span>−{fmtCurrency(discount)}</span>
        </div>
      )}

      <hr className="divider" style={{ margin: '12px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
        <span>Total</span>
        <span style={{ color: 'var(--accent)' }}>{total === 0 ? 'Free' : fmtCurrency(total)}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Incl. platform fee</div>
    </div>
  );
}

// ── Inline error banner ───────────────────────────────────────
function ErrorBanner({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.2)',
      borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)',
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
    }}>
      <i data-lucide="circle-x" style={{ width: 14, height: 14, flexShrink: 0 }} />
      {msg}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function CheckoutPage() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  if (user && user.role !== 'user') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Attendee account required
          </div>
          <p style={{ color: 'var(--text2)', marginBottom: 16 }}>
            Organizers and admins cannot buy tickets with their own accounts.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Back to events
          </button>
        </div>
      </div>
    );
  }

  const [event, setEvent]         = useState(null);
  const [step, setStep]           = useState(1);
  const [selections, setSelections] = useState([]);
  const [details, setDetails]     = useState({ name: '', email: '', phone: '' });
  const [payMethod, setPayMethod] = useState('mpesa');

  // Promo code state
  const [promoInput, setPromoInput]   = useState('');
  const [promoApplied, setPromoApplied] = useState('');
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoError, setPromoError]   = useState('');
  const [discount, setDiscount]       = useState(0);

  const [orderId, setOrderId]     = useState(null);
  const [tickets, setTickets]     = useState([]);
  const [orderRef, setOrderRef]   = useState('');
  const [confirmedEmail, setConfirmedEmail] = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [publicSettings, setPublicSettings] = useState({
    trust_show_buyer_protection: 'true',
    trust_show_trust_badges: 'true',
    trust_buyer_protection_text: 'Protected checkout: if payment succeeds and your ticket is not issued, contact support for priority resolution within 24 hours.',
  });

  // M-PESA polling state
  const [mpesaPhase, setMpesaPhase] = useState('idle'); // idle | waiting | polling | done | failed
  const [pollSeconds, setPollSeconds] = useState(0);
  const pollRef   = useRef(null);
  const timerRef  = useRef(null);

  const clearPendingOrder = () => {
    if (id) sessionStorage.removeItem(pendingOrderStorageKey(id));
  };

  const savePendingOrder = (nextOrderId) => {
    if (!id || !nextOrderId) return;
    sessionStorage.setItem(pendingOrderStorageKey(id), nextOrderId);
  };

  const resumePolling = (existingOrderId, emailOverride) => {
    stopPolling();
    setOrderId(existingOrderId);
    setStep(3);
    setMpesaPhase('polling');
    setPollSeconds(0);
    setLoading(false);
    setError('');

    const MAX_WAIT_SECS = 90;
    const POLL_INTERVAL = 4000;
    let elapsed = 0;

    timerRef.current = setInterval(() => {
      elapsed += 1;
      setPollSeconds(elapsed);
      if (elapsed >= MAX_WAIT_SECS) {
        stopPolling();
        setMpesaPhase('failed');
        setError('Payment timed out — check My Tickets before trying again.');
      }
    }, 1000);

    pollRef.current = setInterval(async () => {
      try {
        const statusRes = await ordersAPI.status(existingOrderId);
        const { status, order_ref, tickets: t } = statusRes.data.data;

        if (status === 'success') {
          stopPolling();
          clearPendingOrder();
          setMpesaPhase('done');
          setTickets(t || []);
          setOrderRef(order_ref);
          setConfirmedEmail(emailOverride || details.email.trim());
          setStep(4);
        } else if (status === 'failed') {
          stopPolling();
          clearPendingOrder();
          setMpesaPhase('failed');
          setError('Payment was declined, cancelled, or expired. Please try again.');
        }
      } catch (_) {}
    }, POLL_INTERVAL);
  };

  useEffect(() => {
    eventsAPI.get(id)
      .then(r => {
        const ev = r.data.data;
        setEvent(ev);
        setSelections(ev.ticket_types?.map(t => ({ ticket_type_id: t.id, quantity: 0 })) || []);
      })
      .catch((err) => {
        setEvent(null);
        setSelections([]);
        setError(err.response?.data?.message || 'Unable to load event details');
      });

    settingsAPI.public()
      .then((r) => {
        const next = r?.data?.data || {};
        setPublicSettings((s) => ({ ...s, ...next }));
      })
      .catch(() => {});

    if (user) {
      setDetails(d => ({
        name:  user.name  || d.name,
        email: user.email || d.email,
        phone: user.phone || d.phone,
      }));
    }

    const pendingOrderId = sessionStorage.getItem(pendingOrderStorageKey(id));
    if (pendingOrderId) {
      resumePolling(pendingOrderId, user?.email || '');
    }
  }, [id]);

  // Re-initialise details when user loads after event
  useEffect(() => {
    if (user) {
      setDetails(d => ({
        name:  d.name  || user.name  || '',
        email: d.email || user.email || '',
        phone: d.phone || user.phone || '',
      }));
    }
  }, [user]);

  const changeQty = (ttId, delta) => {
    setSelections(sels => sels.map(s =>
      s.ticket_type_id === ttId
        ? { ...s, quantity: Math.max(0, s.quantity + delta) }
        : s
    ));
    // Reset promo when selection changes
    setPromoApplied('');
    setDiscount(0);
    setPromoInput('');
  };

  const hasSelections = selections.some(s => s.quantity > 0);

  const subtotal = selections.reduce((sum, sel) => {
    const tt = event?.ticket_types?.find(t => t.id === sel.ticket_type_id);
    return sum + (tt ? Number(tt.price) * sel.quantity : 0);
  }, 0);
  const total = Math.max(0, subtotal - discount);

  // ── Promo code check ───────────────────────────────────────
  const applyPromo = async () => {
    if (!promoInput.trim()) return;
    setPromoError('');
    setPromoChecking(true);
    try {
      // We pass the promo at order creation — preview the discount here
      // by creating a temp order call with dry_run (not supported),
      // so instead we attempt the actual order creation as a way to validate.
      // Simpler: call ordersAPI.create with promo_code — if it succeeds we
      // extract the discount. We store the order ID and skip re-creation.
      // For UX we just show an accepted state and pass promo to createOrder.
      // Real validation happens server-side at order creation.
      setPromoApplied(promoInput.trim().toUpperCase());
      setPromoInput('');
      // Optimistic discount hint (server validates for real at creation)
      setDiscount(0); // Will be set from server response
    } catch {
      setPromoError('Could not apply code');
    } finally {
      setPromoChecking(false);
    }
  };

  const removePromo = () => {
    setPromoApplied('');
    setDiscount(0);
    setPromoInput('');
    setPromoError('');
  };

  // ── Step navigation ────────────────────────────────────────
  const goStep2 = () => {
    if (!hasSelections) { setError('Please select at least one ticket'); return; }
    setError(''); setStep(2);
  };

  const goStep3 = () => {
    if (!details.name.trim())  { setError('Full name is required'); return; }
    if (!details.email.trim()) { setError('Email is required'); return; }
    if (!details.phone.trim()) { setError('Phone number is required'); return; }
    setError(''); setStep(3);
  };

  // ── Stop polling helpers ──────────────────────────────────
  const stopPolling = () => {
    if (pollRef.current)  { clearInterval(pollRef.current);  pollRef.current  = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), []);

  // ── Payment ────────────────────────────────────────────────
  const processPayment = async () => {
    setLoading(true); setError(''); setMpesaPhase('idle');
    try {
      const items = selections.filter(s => s.quantity > 0);

      // Step 1 — Create pending order on server
      const orderRes = await ordersAPI.create({
        event_id:       event.id,
        attendee_name:  details.name.trim(),
        attendee_email: details.email.trim(),
        attendee_phone: details.phone.trim(),
        items,
        ...(promoApplied && { promo_code: promoApplied }),
      });
      const {
        order_id,
        discount: serverDiscount = 0,
        total: serverTotal = total,
      } = orderRes.data.data;
      setOrderId(order_id);
      savePendingOrder(order_id);
      setDiscount(serverDiscount);
      if (promoApplied && Number(serverDiscount) <= 0) {
        setPromoError('Promo code was not applied to this order');
      } else {
        setPromoError('');
      }

      // Step 2 — Payment
      const isFree       = Number(serverTotal) === 0;
      const isProduction = process.env.NODE_ENV === 'production';
      const useMpesa     = payMethod === 'mpesa' && isProduction && !isFree;

      if (isFree) {
        // ── Free event: confirm immediately with no payment ──
        const confirmRes = await ordersAPI.confirm(order_id, { method: 'free' });
        clearPendingOrder();
        setTickets(confirmRes.data.data.tickets || []);
        setOrderRef(confirmRes.data.data.order_ref);
        setConfirmedEmail(details.email.trim());
        setStep(4);
        return;
      }

      if (useMpesa) {
        // ── PRODUCTION M-PESA: STK Push → poll for callback ──
        setMpesaPhase('waiting');
        await paymentsAPI.stkPush({ order_id, phone: details.phone.trim() });
        resumePolling(order_id, details.email.trim());

      } else {
        // ── DEV / SIMULATION: instant confirm ────────────────
        const simRes  = await paymentsAPI.simulate({ order_id });
        const txnRef  = simRes.data.data.txn_ref;
        const confirmRes = await ordersAPI.confirm(order_id, { txn_ref: txnRef, method: payMethod });
        clearPendingOrder();
        setTickets(confirmRes.data.data.tickets || []);
        setOrderRef(confirmRes.data.data.order_ref);
        setConfirmedEmail(details.email.trim());
        setStep(4);
      }

    } catch (err) {
      stopPolling();
      setMpesaPhase('idle');
      clearPendingOrder();
      setError(err.response?.data?.message || 'Payment failed — please try again');
    } finally {
      // loading stays true only when polling (it was set to false inside the polling branch)
      // For all other paths, clear it here
      setLoading(false);
    }
  };

  if (!event) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
      <i data-lucide="loader-2" style={{ width: 28, height: 28 }} />
    </div>
  );

  // Sold-out guard
  const allSoldOut = event.ticket_types?.length > 0
    && event.ticket_types.every(t => (t.quantity - t.sold) <= 0);
  if ((event.capacity - event.total_sold) <= 0 || allSoldOut) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div className="card" style={{ maxWidth: 400, textAlign: 'center', padding: 36 }}>
          <div style={{ width: 56, height: 56, background: 'var(--danger-dim)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <i data-lucide="ban" style={{ width: 28, height: 28, color: 'var(--danger)' }} />
          </div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Sold Out</div>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 20 }}>
            All tickets for <strong>{event.title}</strong> have been sold.
          </p>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            <i data-lucide="arrow-left" style={{ width: 14, height: 14 }} /> Back to event
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Nav */}
      <nav className="landing-nav">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => step > 1 && step < 4 ? setStep(s => s - 1) : navigate(-1)}
        >
          <i data-lucide={step === 4 ? 'x' : 'arrow-left'} style={{ width: 14, height: 14 }} />
          {step === 4 ? 'Close' : 'Back'}
        </button>
        <SanyLogo size={28} full />
        <div style={{ width: 80, maxWidth: '100%' }} />
      </nav>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
        <StepsBar active={step} />

        {/* ── Step 1: Select Tickets ──────────────────────── */}
        {step === 1 && (
          <div className="checkout-layout">
            <div>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
                Select tickets
              </h2>
              <ErrorBanner msg={error} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {event.ticket_types?.map(tt => {
                  const sel   = selections.find(s => s.ticket_type_id === tt.id);
                  const qty   = sel?.quantity || 0;
                  const avail = tt.quantity - tt.sold;
                  return (
                    <div key={tt.id} className={`ticket-type-row ${qty > 0 ? 'selected' : ''}`}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: tt.color }} />
                          <span style={{ fontWeight: 600 }}>{tt.name}</span>
                          {avail < 10 && (
                            <span className="badge badge-red" style={{ fontSize: 10 }}>Only {avail} left</span>
                          )}
                        </div>
                        <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
                          {Number(tt.price) === 0 ? 'Free' : fmtCurrency(tt.price)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{avail} available</div>
                      </div>
                      <div className="qty-control">
                        <button className="qty-btn" onClick={() => changeQty(tt.id, -1)} disabled={qty === 0}>−</button>
                        <span style={{ fontSize: 15, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{qty}</span>
                        <button className="qty-btn" onClick={() => changeQty(tt.id, 1)} disabled={qty >= avail || qty >= 10}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="responsive-actions" style={{ justifyContent: 'flex-end', marginTop: 24 }}>
                <button className="btn btn-primary btn-lg" onClick={goStep2}>
                  Continue <i data-lucide="arrow-right" style={{ width: 15, height: 15 }} />
                </button>
              </div>
            </div>
            <OrderSummary event={event} selections={selections} discount={discount} promoApplied={promoApplied} />
          </div>
        )}

        {/* ── Step 2: Your Details ────────────────────────── */}
        {step === 2 && (
          <div className="checkout-layout">
            <div>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
                Your details
              </h2>
              <ErrorBanner msg={error} />

              <div className="card">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Full name *</label>
                      <input
                        className="input"
                        value={details.name}
                        onChange={e => setDetails(d => ({ ...d, name: e.target.value }))}
                        placeholder="Jane Doe"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Email *</label>
                      <input
                        className="input" type="email"
                        value={details.email}
                        onChange={e => setDetails(d => ({ ...d, email: e.target.value }))}
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone number (M-PESA) *</label>
                    <input
                      className="input"
                      value={details.phone}
                      onChange={e => setDetails(d => ({ ...d, phone: e.target.value }))}
                      placeholder="+254700000000"
                    />
                  </div>
                </div>
              </div>

              <div className="responsive-actions" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
                <button className="btn btn-primary btn-lg" onClick={goStep3}>
                  Continue to payment <i data-lucide="arrow-right" style={{ width: 15, height: 15 }} />
                </button>
              </div>
            </div>
            <OrderSummary event={event} selections={selections} discount={discount} promoApplied={promoApplied} />
          </div>
        )}

        {/* ── Step 3: Payment ────────────────────────────── */}
        {step === 3 && (
          <div className="checkout-layout">
            <div>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
                {total === 0 ? 'Confirm registration' : 'Payment'}
              </h2>
              <ErrorBanner msg={error} />

              {/* Promo code */}
              {subtotal > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i data-lucide="tag" style={{ width: 14, height: 14, color: 'var(--accent)' }} />
                    Promo code
                  </div>
                  {promoApplied ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'var(--accent-dim)', border: '1px solid rgba(34,197,94,0.25)',
                      borderRadius: 8, padding: '8px 12px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i data-lucide="check-circle" style={{ width: 14, height: 14, color: 'var(--accent)' }} />
                        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: 'var(--accent)' }}>
                          {promoApplied}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text2)' }}>applied</span>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={removePromo}
                        style={{ color: 'var(--text3)', padding: '2px 6px' }}
                      >
                        <i data-lucide="x" style={{ width: 12, height: 12 }} /> Remove
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="responsive-actions" style={{ alignItems: 'stretch' }}>
                        <input
                          className="input"
                          value={promoInput}
                          onChange={e => setPromoInput(e.target.value.toUpperCase())}
                          onKeyDown={e => e.key === 'Enter' && applyPromo()}
                          placeholder="Enter promo code"
                          style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                        />
                        <button
                          className="btn btn-secondary"
                          onClick={applyPromo}
                          disabled={!promoInput.trim() || promoChecking}
                        >
                          {promoChecking
                            ? <i data-lucide="loader-2" style={{ width: 14, height: 14 }} />
                            : 'Apply'
                          }
                        </button>
                      </div>
                      {promoError && (
                        <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{promoError}</div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                        Try: LAUNCH20 · EARLYBIRD · VIP50
                      </div>
                    </div>
                  )}
                </div>
              )}

              {total > 0 ? (
                /* Payment methods */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { id: 'mpesa', label: 'M-PESA Mobile Money', sub: `STK Push to ${details.phone}`, mpesa: true },
                  ].map(m => (
                    <div
                      key={m.id}
                      className={`payment-method ${payMethod === m.id ? 'selected' : ''}`}
                      onClick={() => setPayMethod(m.id)}
                    >
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        border: `2px solid ${payMethod === m.id ? 'var(--accent)' : 'var(--border2)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {payMethod === m.id && (
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)' }} />
                        )}
                      </div>
                      {m.mpesa
                        ? <div className="mpesa-logo">M-PESA</div>
                        : <i data-lucide={m.icon} style={{ width: 18, height: 18, color: 'var(--text2)' }} />
                      }
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{m.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{m.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Free event */
                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, background: 'var(--accent-dim)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i data-lucide="ticket" style={{ width: 18, height: 18, color: 'var(--accent)' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>Free event</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)' }}>No payment required — click confirm to register</div>
                    </div>
                  </div>
                </div>
              )}

              {String(publicSettings.trust_show_buyer_protection).toLowerCase() === 'true' && (
                <div className="card" style={{ marginTop: 16, borderColor: 'rgba(201,162,39,0.35)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, background: 'var(--accent-dim)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <i data-lucide="shield-check" style={{ width: 15, height: 15, color: 'var(--accent)' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Buyer protection</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                        {publicSettings.trust_buyer_protection_text}
                      </div>
                      {String(publicSettings.trust_show_trust_badges).toLowerCase() === 'true' && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
                          <span className="badge badge-green">Secure checkout</span>
                          <span className="badge badge-blue">Verified organizers</span>
                          <span className="badge badge-orange">Fast support</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* M-PESA waiting state */}
              {mpesaPhase === 'polling' && (
                <div style={{
                  background: 'var(--accent-dim)', border: '1px solid rgba(34,197,94,0.2)',
                  borderRadius: 10, padding: 20, marginTop: 20, textAlign: 'center',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                    <div style={{ position: 'relative', width: 48, height: 48 }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: '50%',
                        border: '3px solid var(--border2)',
                        borderTop: '3px solid var(--accent)',
                        animation: 'spin 0.9s linear infinite',
                      }} />
                    </div>
                  </div>
                  <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 6 }}>
                    Waiting for M-PESA confirmation
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>
                    Enter your M-PESA PIN on your phone to complete payment.
                  </p>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    Checking payment status… ({pollSeconds}s / 90s)
                  </div>
                </div>
              )}

              {mpesaPhase !== 'polling' && (
                <div className="responsive-actions" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={processPayment}
                    disabled={loading || mpesaPhase === 'polling'}
                    style={{ justifyContent: 'center' }}
                  >
                    {loading
                      ? <><i data-lucide="loader-2" style={{ width: 15, height: 15 }} /> Processing…</>
                      : total === 0
                        ? <><i data-lucide="check-circle" style={{ width: 15, height: 15 }} /> Confirm registration</>
                        : <><i data-lucide="lock" style={{ width: 15, height: 15 }} /> Pay {fmtCurrency(total)}</>
                    }
                  </button>
                </div>
              )}
            </div>
            <OrderSummary event={event} selections={selections} discount={discount} promoApplied={promoApplied} />
          </div>
        )}

        {/* ── Step 4: Confirmation ────────────────────────── */}
        {step === 4 && (
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <div style={{
                width: 64, height: 64, background: 'var(--accent-dim)', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
              }}>
                <i data-lucide="check-circle" style={{ width: 32, height: 32, color: 'var(--accent)' }} />
              </div>
              <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
                Booking confirmed
              </h1>
              <p style={{ color: 'var(--text2)', fontSize: 14 }}>
                Your tickets for <strong>{event.title}</strong> are ready.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                <i data-lucide="mail" style={{ width: 13, height: 13, color: 'var(--accent)' }} />
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>
                  Confirmation sent to {confirmedEmail} · Order {orderRef}
                </span>
              </div>
            </div>

            {/* Tickets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {tickets.map((t, i) => (
                <TicketCard key={i} ticket={t} event={event} />
              ))}
            </div>

            {/* Actions */}
            <div className="responsive-actions" style={{ justifyContent: 'center', marginTop: 32 }}>
              <Link to="/" className="btn btn-secondary">
                <i data-lucide="arrow-left" style={{ width: 14, height: 14 }} /> Browse events
              </Link>
              {user && (
                <Link to="/dashboard/tickets" className="btn btn-primary">
                  <i data-lucide="ticket" style={{ width: 14, height: 14 }} /> View all tickets
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Ticket card shown on confirmation ─────────────────────────
function TicketCard({ ticket, event }) {
  return (
    <div className="ticket-card">
      <div className="ticket-header">
        <div className="responsive-header">
          <div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 700 }}>{event.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{event.organizer_name}</div>
          </div>
          <span className="badge badge-green">Valid</span>
        </div>
      </div>
      <div className="ticket-dashed" />
      <div className="ticket-body">
        <div className="responsive-ticket-grid">
          <div>
            <div className="form-label">Date</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{fmtDate(event.event_date)}</div>
          </div>
          <div>
            <div className="form-label">Time</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{event.start_time}</div>
          </div>
          <div>
            <div className="form-label">Type</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent2)' }}>{ticket.type}</div>
          </div>
          {ticket.seat && (
            <div>
              <div className="form-label">Seat</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{ticket.seat}</div>
            </div>
          )}
        </div>
      </div>
      <div className="ticket-dashed" />
      <div className="ticket-qr">
        <div className="qr-container">
          <QRCodeSVG value={ticket.code} size={110} bgColor="#ffffff" fgColor="#000000" level="M" />
        </div>
      </div>
      <div className="ticket-footer">
        <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text2)' }}>{ticket.code}</div>
        <SanyLogo size={20} full={false} />
      </div>
    </div>
  );
}
