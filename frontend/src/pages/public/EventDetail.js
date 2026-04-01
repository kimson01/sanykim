// src/pages/public/EventDetail.js
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import SanyLogo from '../../components/ui/Logo';
import { eventsAPI, waitlistAPI } from '../../api/client';
import { fmtDate, useToast } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { resolveAssetUrl } from '../../utils/assets';

// ── Open Graph meta tag injector ─────────────────────────────
// Injects dynamic OG tags into <head> so WhatsApp, Twitter, and
// Facebook show a rich preview card when the URL is shared.
function useOgTags(event) {
  useEffect(() => {
    if (!event) return;

    const baseUrl  = window.location.origin;
    const pageUrl  = window.location.href;
    const imgUrl   = event.banner_url
      ? resolveAssetUrl(event.banner_url)
      : `${baseUrl}/og-default.png`;

    const minPrice = event.ticket_types?.length
      ? Math.min(...event.ticket_types.map(t => Number(t.price)))
      : 0;
    const priceStr = minPrice === 0 ? 'Free entry' : `From KES ${minPrice.toLocaleString()}`;
    const dateStr  = event.event_date
      ? new Date(event.event_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';

    const description = `${dateStr}${event.start_time ? ' at ' + event.start_time : ''} · ${event.location || ''} · ${priceStr}`;

    const tags = [
      // Standard
      { property: 'og:type',        content: 'website' },
      { property: 'og:url',         content: pageUrl },
      { property: 'og:title',       content: `${event.title} — Sany Adventures` },
      { property: 'og:description', content: description },
      { property: 'og:image',       content: imgUrl },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height',content: '630' },
      { property: 'og:site_name',   content: 'Sany Adventures' },
      // Twitter / X
      { name: 'twitter:card',        content: 'summary_large_image' },
      { name: 'twitter:title',       content: `${event.title} — Sany Adventures` },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image',       content: imgUrl },
      // WhatsApp uses og: tags — the above is sufficient.
    ];

    // Inject tags — remove any previous ones first
    document.querySelectorAll('meta[data-og]').forEach(m => m.remove());
    tags.forEach(({ property, name, content }) => {
      const meta = document.createElement('meta');
      meta.setAttribute('data-og', '1');
      if (property) meta.setAttribute('property', property);
      if (name)     meta.setAttribute('name', name);
      meta.setAttribute('content', content);
      document.head.appendChild(meta);
    });

    // Update document title
    const prevTitle  = document.title;
    document.title   = `${event.title} — Sany Adventures`;

    return () => {
      document.querySelectorAll('meta[data-og]').forEach(m => m.remove());
      document.title = prevTitle;
    };
  }, [event]);
}

// ── Share handler ─────────────────────────────────────────────
function useShare(event) {
  const { toast } = useToast();

  const share = async () => {
    const url   = window.location.href;
    const title = event?.title || 'Sany Adventures';
    const minP  = event?.ticket_types?.length
      ? Math.min(...event.ticket_types.map(t => Number(t.price)))
      : 0;
    const text  = `Check out ${title}${minP === 0 ? ' — Free entry' : ` — From KES ${minP.toLocaleString()}`} on Sany Adventures`;

    // Native share sheet (Android/iOS) — falls back to clipboard
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (_) {}
    }
    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied to clipboard');
    } catch {
      toast('Copy this link: ' + url, 'info');
    }
  };

  return share;
}

// ── Waitlist form ─────────────────────────────────────────────
function WaitlistForm({ eventId }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name:  user?.name  || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });
  const [loading, setLoading]   = useState(false);
  const [joined, setJoined]     = useState(false);
  const [position, setPosition] = useState(null);
  const [error, setError]       = useState('');

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleJoin = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError('Name and email are required'); return;
    }
    setLoading(true); setError('');
    try {
      const res = await waitlistAPI.join({
        event_id: eventId,
        name:     form.name.trim(),
        email:    form.email.trim(),
        phone:    form.phone.trim() || undefined,
      });
      setJoined(true);
      setPosition(res.data.data?.position);
      toast("You're on the waitlist!");
    } catch (err) {
      const msg = err.response?.data?.message || 'Could not join waitlist';
      // "Tickets still available" means they should just buy
      if (msg.toLowerCase().includes('still available')) {
        toast(msg, 'info');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (joined) {
    return (
      <div style={{
        background: 'var(--accent-dim)', border: '1px solid rgba(201,162,39,0.25)',
        borderRadius: 10, padding: '16px 18px', textAlign: 'center',
      }}>
        <i data-lucide="check-circle" style={{ width: 24, height: 24, color: 'var(--accent)', marginBottom: 8 }} />
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
          You're on the waitlist!
        </div>
        {position && (
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            You are number <strong style={{ color: 'var(--accent)' }}>#{position}</strong> in line.
            We'll email you the moment a ticket becomes available.
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
        Join the waitlist
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>
        Get notified immediately when a ticket becomes available.
      </p>
      <input
        className="input"
        placeholder="Your name"
        value={form.name}
        onChange={set('name')}
        style={{ fontSize: 13 }}
      />
      <input
        className="input"
        type="email"
        placeholder="your@email.com"
        value={form.email}
        onChange={set('email')}
        style={{ fontSize: 13 }}
      />
      <input
        className="input"
        type="tel"
        placeholder="Phone (optional)"
        value={form.phone}
        onChange={set('phone')}
        style={{ fontSize: 13 }}
      />
      {error && (
        <div style={{ fontSize: 12, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <i data-lucide="circle-x" style={{ width: 12, height: 12 }} /> {error}
        </div>
      )}
      <button
        className="btn btn-secondary btn-lg w-full"
        onClick={handleJoin}
        disabled={loading}
      >
        {loading
          ? <><i data-lucide="loader-2" style={{ width: 14, height: 14 }} /> Joining…</>
          : <><i data-lucide="bell" style={{ width: 14, height: 14 }} /> Notify me when available</>
        }
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function EventDetail() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { toast } = useToast();
  const [event, setEvent]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    eventsAPI.get(id)
      .then(r => setEvent(r.data.data))
      .catch(() => setEvent(null))
      .finally(() => setLoading(false));
  }, [id]);

  // Inject OG meta tags whenever event data loads
  useOgTags(event);
  const share = useShare(event);

  if (loading) return (
    <div style={{ padding: 80, textAlign: 'center', color: 'var(--text2)' }}>
      <i data-lucide="loader-2" style={{ width: 28, height: 28 }} />
    </div>
  );
  if (!event) return (
    <div style={{ padding: 80, textAlign: 'center', color: 'var(--text2)' }}>Event not found</div>
  );

  const minPrice        = event.ticket_types?.length
    ? Math.min(...event.ticket_types.map(t => Number(t.price)))
    : 0;
  const remaining       = event.capacity - event.total_sold;
  const allTypesSoldOut = event.ticket_types?.length > 0
    && event.ticket_types.every(t => t.quantity - t.sold <= 0);
  const soldOut         = remaining <= 0 || allTypesSoldOut;
  const almostSoldOut   = !soldOut && remaining <= Math.max(10, event.capacity * 0.1);
  const bannerUrl = resolveAssetUrl(event.banner_url);
  const canBuyAsUser = user?.role === 'user';
  const isLoggedIn = !!user;

  const goToCheckout = () => {
    if (!isLoggedIn) {
      const next = encodeURIComponent(`/checkout/${event.id}`);
      return navigate(`/login?next=${next}`);
    }
    if (!canBuyAsUser) {
      toast('Only attendee accounts can buy tickets', 'info');
      return;
    }
    navigate(`/checkout/${event.id}`);
  };

  return (
    <div>
      {/* Nav */}
      <nav className="landing-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          <i data-lucide="arrow-left" style={{ width: 14, height: 14 }} /> Back
        </button>
        <SanyLogo size={28} full />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={share}>
            <i data-lucide="share-2" style={{ width: 13, height: 13 }} /> Share
          </button>
          {soldOut ? (
            <button className="btn btn-secondary" disabled>
              <i data-lucide="ban" style={{ width: 14, height: 14 }} /> Sold Out
            </button>
          ) : (
            <button
              className={canBuyAsUser || !isLoggedIn ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={goToCheckout}
              title={canBuyAsUser || !isLoggedIn ? 'Buy tickets' : 'Attendee account required'}
            >
              <i data-lucide="ticket" style={{ width: 14, height: 14 }} />
              {canBuyAsUser || !isLoggedIn ? 'Buy Tickets' : 'Attendee Account Required'}
            </button>
          )}
        </div>
      </nav>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
        {/* Banner */}
        {bannerUrl && (
          <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 28, height: 320, position: 'relative' }}>
            <img
              src={bannerUrl}
              alt={event.title}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {soldOut && (
              <div style={{ position: 'absolute', top: 16, right: 16, background: 'var(--danger)', color: '#fff', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i data-lucide="ban" style={{ width: 14, height: 14 }} /> SOLD OUT
              </div>
            )}
            {almostSoldOut && (
              <div style={{ position: 'absolute', top: 16, right: 16, background: 'var(--warning)', color: '#0d0b06', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700 }}>
                🔥 Only {remaining} left!
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32 }}>
          {/* Left */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              {event.category && <span className="badge badge-gray">{event.category}</span>}
              {soldOut && <span className="badge badge-red">Sold Out</span>}
              {almostSoldOut && <span className="badge badge-orange">Almost full</span>}
            </div>

            <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 800, marginBottom: 20, lineHeight: 1.2 }}>
              {event.title}
            </h1>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {[
                { icon: 'calendar', text: `${fmtDate(event.event_date)} at ${event.start_time}` },
                { icon: event.location_type === 'virtual' ? 'video' : 'map-pin', text: event.location },
                { icon: 'users', text: `${event.total_sold} attending · ${Math.max(0, remaining)} left` },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                  <i data-lucide={r.icon} style={{ width: 16, height: 16, color: 'var(--accent)', flexShrink: 0 }} />
                  {r.text}
                </div>
              ))}
            </div>

            {event.virtual_url && (
              <div style={{ marginBottom: 16 }}>
                <a href={event.virtual_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                  <i data-lucide="external-link" style={{ width: 12, height: 12 }} /> Join virtual event
                </a>
              </div>
            )}

            <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 600, marginBottom: 10 }}>About this event</h3>
            <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.7 }}>{event.description}</p>

            {event.tags?.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                {event.tags.map(t => <span key={t} className="badge badge-gray">{t}</span>)}
              </div>
            )}

            <hr className="divider" />

            {/* Organiser section with link to public profile */}
            <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Organiser</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="avatar avatar-orange" style={{ width: 44, height: 44, fontSize: 18 }}>
                {event.organizer_name?.[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{event.organizer_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{event.organizer_contact_name}</div>
              </div>
              {event.organizer_slug && (
                <Link
                  to={`/organisers/${event.organizer_slug}`}
                  className="btn btn-secondary btn-sm"
                >
                  View profile
                </Link>
              )}
            </div>

            {/* Social share strip */}
            <hr className="divider" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>Share this event:</span>
              <button onClick={share} className="btn btn-secondary btn-sm">
                <i data-lucide="share-2" style={{ width: 13, height: 13 }} /> Share
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(event.title + ' — Sany Adventures: ' + window.location.href)}`}
                target="_blank" rel="noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ background: '#25D366', color: '#fff', border: 'none' }}
              >
                WhatsApp
              </a>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(event.title)}&url=${encodeURIComponent(window.location.href)}&via=SanyAdventures`}
                target="_blank" rel="noreferrer"
                className="btn btn-secondary btn-sm"
              >
                Tweet
              </a>
            </div>
          </div>

          {/* Right — sticky ticket panel */}
          <div>
            <div className="card" style={{ position: 'sticky', top: 76 }}>
              <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
                Ticket Options
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {event.ticket_types?.map(t => {
                  const ttAvail   = t.quantity - t.sold;
                  const ttSoldOut = ttAvail <= 0;
                  return (
                    <div key={t.id} style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)', padding: 12,
                      opacity: ttSoldOut ? 0.6 : 1,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color }} />
                          <span style={{ fontWeight: 500 }}>{t.name}</span>
                        </div>
                        {ttSoldOut
                          ? <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>Sold out</span>
                          : <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, color: 'var(--accent)' }}>
                              {Number(t.price) === 0 ? 'Free' : `KSh ${Number(t.price).toLocaleString()}`}
                            </span>
                        }
                      </div>
                      {!ttSoldOut && (
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                          {ttAvail} remaining
                          {ttAvail <= 10 && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>— almost gone!</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {soldOut ? (
                <WaitlistForm eventId={event.id} />
              ) : (
                <button
                  className="btn btn-primary btn-lg w-full"
                  onClick={goToCheckout}
                  style={{ justifyContent: 'center' }}
                >
                  <i data-lucide="ticket" style={{ width: 16, height: 16 }} />
                  {(canBuyAsUser || !isLoggedIn)
                    ? `Get Tickets — From ${minPrice === 0 ? 'Free' : `KSh ${minPrice.toLocaleString()}`}`
                    : 'Attendee Account Required'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
