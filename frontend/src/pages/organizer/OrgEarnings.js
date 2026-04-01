// src/pages/organizer/OrgEarnings.js
// Organizer's view of their revenue, commission breakdown and payout history.
import React, { useEffect, useState } from 'react';
import { analyticsAPI } from '../../api/client';
import { fmtCurrency, useToast } from '../../components/ui';

function KpiRow({ label, value, color, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text2)' }}>{label}</span>
      <span style={{ fontFamily: bold ? 'Syne, sans-serif' : undefined, fontWeight: bold ? 700 : 600, color: color || 'var(--text)', fontSize: bold ? 16 : 13 }}>
        {value}
      </span>
    </div>
  );
}

export default function OrgEarnings() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    analyticsAPI.organizer()
      .then(r => setData(r.data.data))
      .catch((err) => {
        setData(null);
        toast(err.response?.data?.message || 'Failed to load earnings', 'error');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
      <i data-lucide="loader-2" style={{ width: 24, height: 24 }} />
    </div>
  );
  if (!data) return null;

  const commission    = data.commission_rate   || 10;
  const gross         = data.gross_revenue     || 0;
  const net           = data.net_revenue       || 0;
  const available     = data.available_balance || 0;
  const paidOut       = data.total_paid_out    || 0;
  const platformFee   = gross - net;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>

      {/* Available balance — most important number */}
      <div style={{
        background: available > 0 ? 'var(--accent-dim)' : 'var(--surface)',
        border: `1px solid ${available > 0 ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
        borderRadius: 14, padding: '24px 28px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
            Available for payout
          </div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 36, fontWeight: 900, color: available > 0 ? 'var(--accent)' : 'var(--text3)', lineHeight: 1 }}>
            {fmtCurrency(available)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>
            {available > 0
              ? 'Contact your admin to request a payout'
              : 'No balance available — all earnings have been paid out'
            }
          </div>
        </div>
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          background: available > 0 ? 'rgba(34,197,94,0.15)' : 'var(--surface3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i data-lucide="wallet" style={{ width: 26, height: 26, color: available > 0 ? 'var(--accent)' : 'var(--text3)' }} />
        </div>
      </div>

      {/* Revenue breakdown */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>
          Revenue breakdown
        </div>
        <div style={{ padding: '4px 20px' }}>
          <KpiRow label="Gross ticket revenue"   value={fmtCurrency(gross)}       />
          <KpiRow label={`Platform commission (${commission}%)`} value={`− ${fmtCurrency(platformFee)}`} color="var(--warning)" />
          <KpiRow label="Net revenue (your share)" value={fmtCurrency(net)}        color="var(--accent)" bold />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <KpiRow label="Total paid out to you"   value={fmtCurrency(paidOut)}     color="var(--info)"   />
          <KpiRow label="Remaining balance"        value={fmtCurrency(available)}   color={available > 0 ? 'var(--accent)' : 'var(--text3)'} bold />
        </div>
      </div>

      {/* Commission explainer */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>
          How your commission works
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 13, color: 'var(--accent)' }}>1</span>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Your rate: {commission}%</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                Sany Adventures takes {commission}% of each ticket sale as a platform fee. This covers payment processing, platform maintenance, and support.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 13, color: 'var(--accent)' }}>2</span>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Example: KES 1,000 ticket</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                Platform earns KES {(1000 * commission / 100).toLocaleString()} · You earn KES {(1000 - 1000 * commission / 100).toLocaleString()}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 13, color: 'var(--accent)' }}>3</span>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Payout schedule</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                Revenue is held until 48 hours after your event ends. Once released, contact <strong style={{ color: 'var(--text)' }}>support@sanyadventures.com</strong> to request your payout via M-PESA.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--danger-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i data-lucide="rotate-ccw" style={{ width: 14, height: 14, color: 'var(--danger)' }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Refunds</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                If an attendee is refunded, both their ticket cost and the platform commission are reversed. Your net earnings are reduced by the amount originally credited to you.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>
          All-time summary
        </div>
        <div style={{ padding: '4px 20px' }}>
          <KpiRow label="Total events"       value={data.total_events}    />
          <KpiRow label="Tickets sold"        value={data.total_tickets}   />
          <KpiRow label="Total attendees"     value={data.total_attendees} />
          <KpiRow label="Gross revenue"       value={fmtCurrency(gross)}   />
          <KpiRow label="Platform commission" value={fmtCurrency(platformFee)} color="var(--warning)" />
          <KpiRow label="Your net revenue"    value={fmtCurrency(net)}     color="var(--accent)" bold />
        </div>
      </div>
    </div>
  );
}
