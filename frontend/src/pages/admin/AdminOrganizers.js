// src/pages/admin/AdminOrganizers.js
import React, { useEffect, useState, useCallback } from 'react';
import { adminAPI } from '../../api/client';
import { Badge, fmtCurrency, fmtDate, useToast } from '../../components/ui';

// ── Detail / review modal ─────────────────────────────────────
function OrgDetailModal({ org, onClose, onUpdated }) {
  const [notes,    setNotes]    = useState(org.admin_notes    || '');
  const [reason,   setReason]   = useState(org.rejection_reason || '');
  const [saving,   setSaving]   = useState(false);
  const { toast } = useToast();

  const saveNotes = async () => {
    setSaving(true);
    try {
      await adminAPI.updateOrgNotes(org.id, { admin_notes: notes, rejection_reason: reason });
      toast('Notes saved');
      onUpdated();
    } catch { toast('Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const updateStatus = async (status) => {
    setSaving(true);
    try {
      await adminAPI.updateOrgStatus(org.id, status);
      // If rejecting, also save rejection reason
      if (status === 'rejected' && reason.trim()) {
        await adminAPI.updateOrgNotes(org.id, { rejection_reason: reason });
      }
      toast(`Organizer ${status}`);
      onUpdated();
      onClose();
    } catch (err) {
      toast(err.response?.data?.message || 'Update failed', 'error');
    } finally { setSaving(false); }
  };

  const Row = ({ label, value }) => {
    if (!value) return null;
    return (
      <div style={{ display: 'flex', gap: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 130, paddingTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{value}</span>
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 17, fontWeight: 700 }}>
            Organizer Review — {org.company_name}
          </h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <i data-lucide="x" style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {!org.terms_agreed && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'var(--warning-dim)',
              border: '1px solid rgba(212,133,10,0.35)',
            }}>
              <i data-lucide="shield-alert" style={{ width: 14, height: 14, color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12, color: 'var(--warning)' }}>
                Approval is blocked until this organizer agrees to the registration terms.
              </div>
            </div>
          )}

          {/* Status badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Badge variant={
              org.status === 'approved' ? 'green' : org.status === 'pending' ? 'yellow' :
              org.status === 'rejected' ? 'red' : 'gray'
            }>
              {org.status}
            </Badge>
            {org.terms_agreed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent)' }}>
                <i data-lucide="check-circle" style={{ width: 13, height: 13 }} />
                Terms agreed {org.terms_agreed_at ? `on ${fmtDate(org.terms_agreed_at)}` : ''}
              </div>
            )}
            {!org.terms_agreed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--danger)' }}>
                <i data-lucide="circle-x" style={{ width: 13, height: 13 }} />
                Terms NOT agreed
              </div>
            )}
          </div>

          {/* Contact info */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 12, fontSize: 13 }}>
              Contact details
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Row label="Contact name"  value={org.name} />
              <Row label="Email"         value={org.email} />
              <Row label="Phone"         value={org.phone} />
              <Row label="Company"       value={org.company_name} />
              <Row label="Applied"       value={fmtDate(org.created_at)} />
            </div>
          </div>

          {/* Business profile */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 12, fontSize: 13 }}>
              Business profile
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Row label="Business type" value={org.business_type} />
              <Row label="ID type"       value={org.id_type} />
              <Row label="ID number"     value={org.id_number} />
              <Row label="Address"       value={org.physical_address} />
              <Row label="Website"       value={org.website} />
              <Row label="Social media"  value={org.social_media} />
              <Row label="Event types"   value={Array.isArray(org.event_types) ? org.event_types.join(', ') : org.event_types} />
              <Row label="Monthly events" value={org.expected_monthly_events} />
              <Row label="Events run"    value={org.event_count} />
              <Row label="Total revenue" value={org.total_revenue > 0 ? fmtCurrency(org.total_revenue) : null} />
            </div>
          </div>

          {/* Admin notes */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 10, fontSize: 13 }}>
              Admin notes <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 11 }}>(internal — not visible to organizer)</span>
            </div>
            <textarea
              className="textarea"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add internal notes about this organizer…"
              style={{ minHeight: 80 }}
            />
          </div>

          {/* Rejection reason */}
          {(org.status === 'pending' || org.status === 'rejected') && (
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 10, fontSize: 13 }}>
                Rejection reason <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 11 }}>(shown to organizer)</span>
              </div>
              <textarea
                className="textarea"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. ID number provided does not match our records. Please resubmit with a valid National ID."
                style={{ minHeight: 72 }}
              />
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={saveNotes} disabled={saving}>
              <i data-lucide="save" style={{ width: 13, height: 13 }} /> Save notes
            </button>

            {org.status !== 'approved' && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => updateStatus('approved')}
                disabled={saving || !org.terms_agreed}
                title={!org.terms_agreed ? 'Cannot approve until terms are agreed' : 'Approve organizer'}
              >
                <i data-lucide="check-circle" style={{ width: 13, height: 13 }} /> Approve
              </button>
            )}
            {org.status === 'approved' && (
              <button className="btn btn-secondary btn-sm" onClick={() => updateStatus('suspended')} disabled={saving}>
                <i data-lucide="pause" style={{ width: 13, height: 13 }} /> Suspend
              </button>
            )}
            {org.status !== 'rejected' && org.status !== 'approved' && (
              <button className="btn btn-danger btn-sm" onClick={() => updateStatus('rejected')} disabled={saving || !reason.trim()}>
                <i data-lucide="x-circle" style={{ width: 13, height: 13 }} /> Reject
                {!reason.trim() && <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.7 }}>(add reason)</span>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function AdminOrganizers() {
  const [orgs, setOrgs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all');
  const [selected, setSelected] = useState(null);
  const { toast } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    const params = filter !== 'all' ? { status: filter } : {};
    adminAPI.organizers(params)
      .then(r => setOrgs(r.data.data))
      .catch((err) => {
        setOrgs([]);
        toast(err.response?.data?.message || 'Failed to load organizers', 'error');
      })
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const counts = orgs.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
      <i data-lucide="loader-2" style={{ width: 24, height: 24 }} />
    </div>
  );

  return (
    <>
      {/* Summary counts */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Pending review', key: 'pending',  color: 'var(--warning)', bg: 'var(--warning-dim)'  },
          { label: 'Approved',       key: 'approved', color: 'var(--accent)',  bg: 'var(--accent-dim)'   },
          { label: 'Rejected',       key: 'rejected', color: 'var(--danger)',  bg: 'var(--danger-dim)'   },
          { label: 'Suspended',      key: 'suspended',color: 'var(--text2)',   bg: 'var(--surface3)'     },
        ].map(s => (
          <div
            key={s.key}
            className="card"
            onClick={() => setFilter(filter === s.key ? 'all' : s.key)}
            style={{ padding: '12px 16px', cursor: 'pointer', flex: '1 1 140px', minWidth: 140,
              border: filter === s.key ? `1px solid ${s.color}` : undefined }}
          >
            <div style={{ fontSize: 24, fontFamily: 'Syne, sans-serif', fontWeight: 700, color: s.color }}>
              {counts[s.key] || 0}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 15 }}>
            Organizer Accounts
            <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>
              ({orgs.length})
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['all','pending','approved','rejected','suspended'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
                style={{ textTransform: 'capitalize' }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Organizer</th>
                <th>Company</th>
                <th>Business type</th>
                <th>ID provided</th>
                <th>Terms</th>
                <th>Events</th>
                <th>Applied</th>
                <th>Status</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text3)', padding: 32 }}>
                    No organizers found
                  </td>
                </tr>
              )}
              {orgs.map(org => (
                <tr key={org.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(org)}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="avatar avatar-orange" style={{ width: 28, height: 28, fontSize: 11 }}>
                        {org.name?.[0]}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{org.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{org.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>{org.company_name}</td>
                  <td>
                    <span style={{ fontSize: 12, color: 'var(--text2)', textTransform: 'capitalize' }}>
                      {org.business_type || '—'}
                    </span>
                  </td>
                  <td>
                    {org.id_number
                      ? <div style={{ fontSize: 11 }}>
                          <div style={{ color: 'var(--text2)', textTransform: 'capitalize' }}>{(org.id_type || '').replace('_', ' ')}</div>
                          <div style={{ fontFamily: 'monospace' }}>{org.id_number}</div>
                        </div>
                      : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
                    }
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {org.terms_agreed
                      ? <i data-lucide="check-circle" style={{ width: 15, height: 15, color: 'var(--accent)' }} />
                      : <i data-lucide="x-circle" style={{ width: 15, height: 15, color: 'var(--danger)' }} />
                    }
                  </td>
                  <td style={{ textAlign: 'center' }}>{org.event_count}</td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>{fmtDate(org.created_at)}</td>
                  <td>
                    <Badge variant={
                      org.status === 'approved' ? 'green' :
                      org.status === 'pending'  ? 'yellow' :
                      org.status === 'rejected' ? 'red' : 'gray'
                    }>
                      {org.status}
                    </Badge>
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); setSelected(org); }}>
                      <i data-lucide="eye" style={{ width: 12, height: 12 }} /> Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <OrgDetailModal
          org={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => { load(); setSelected(null); }}
        />
      )}
    </>
  );
}
