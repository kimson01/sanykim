// src/pages/organizer/OrgEvents.js
import React, { useEffect, useRef, useState } from 'react';
import { eventsAPI, categoriesAPI, uploadsAPI } from '../../api/client';
import { Modal, Badge, fmtCurrency, fmtDate, useToast } from '../../components/ui';
import { resolveAssetUrl } from '../../utils/assets';

const emptyForm = {
  title: '', description: '', category_id: '', location: '',
  location_type: 'physical', virtual_url: '', event_date: '',
  start_time: '', end_time: '', capacity: 500, banner_url: '', tags: '',
  ticket_types: [{ name: 'Regular', price: 0, quantity: 100, color: '#22c55e' }],
};

export default function OrgEvents() {
  const [events, setEvents]     = useState([]);
  const [cats, setCats]         = useState([]);
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState(emptyForm);
  const [editId, setEditId]     = useState(null);
  const [saving, setSaving]     = useState(false);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]   = useState('');
  const [kycWarning, setKycWarning] = useState('');
  const fileRef                 = useRef();
  const { toast }               = useToast();

  const load = () =>
    eventsAPI.myEvents()
      .then(r => setEvents(r.data.data))
      .catch((err) => {
        setEvents([]);
        toast(err.response?.data?.message || 'Failed to load events', 'error');
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    categoriesAPI.list()
      .then(r => setCats(r.data.data))
      .catch(() => setCats([]));
  }, []);

  const openCreate = () => {
    setEditId(null); setForm(emptyForm); setPreview(''); setModal(true);
  };
  const openEdit = (e) => {
    setEditId(e.id);
    setForm({
      title:         e.title,
      description:   e.description || '',
      category_id:   e.category_id || '',
      location:      e.location,
      location_type: e.location_type,
      virtual_url:   e.virtual_url || '',
      event_date:    e.event_date?.slice(0, 10) || '',
      start_time:    e.start_time || '',
      end_time:      e.end_time || '',
      capacity:      e.capacity,
      banner_url:    e.banner_url || '',
      tags:          (e.tags || []).join(', '),
      ticket_types:  [{ name: 'Regular', price: 0, quantity: 100, color: '#22c55e' }],
    });
    setPreview(resolveAssetUrl(e.banner_url || ''));
    setModal(true);
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setTT = (i, k) => (e) => {
    const tts = [...form.ticket_types];
    tts[i] = {
      ...tts[i],
      [k]: k === 'price' || k === 'quantity' ? Number(e.target.value) : e.target.value,
    };
    setForm(f => ({ ...f, ticket_types: tts }));
  };
  const addTT    = () => setForm(f => ({
    ...f,
    ticket_types: [...f.ticket_types, { name: '', price: 0, quantity: 100, color: '#22c55e' }],
  }));
  const removeTT = (i) => setForm(f => ({
    ...f,
    ticket_types: f.ticket_types.filter((_, idx) => idx !== i),
  }));

  // ── Toggle event status (publish/draft) ─────────────────
  const toggleStatus = async (e) => {
    const newStatus = e.status === 'published' ? 'draft' : 'published';
    try {
      await eventsAPI.updateStatus(e.id, { status: newStatus });
      setKycWarning('');
      toast(`Event ${newStatus === 'published' ? 'published' : 'set to draft'}`);
      load();
    } catch (err) {
      const msg = err.response?.data?.message || 'Update failed';
      const isKycBlock = newStatus === 'published' && err.response?.status === 403
        && /kyc|id|address|terms/i.test(msg);
      if (isKycBlock) {
        const pretty = 'Publishing blocked: complete organizer verification (ID number, physical address, and terms agreement) in your organizer profile, then try again.';
        setKycWarning(pretty);
        toast(pretty, 'error');
      } else {
        toast(msg, 'error');
      }
    }
  };

  // ── Banner file upload ──────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side size check (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      toast('Image must be under 5 MB', 'error'); return;
    }

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('banner', file);
      const res = await uploadsAPI.banner(fd);
      const rawUrl = res.data.data.url;
      const uploadedUrl = /^https?:\/\//i.test(rawUrl)
        ? rawUrl
        : `${process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000'}${rawUrl}`;
      setForm(f => ({ ...f, banner_url: uploadedUrl }));
      toast('Banner uploaded');
    } catch (err) {
      toast(err.response?.data?.message || 'Upload failed', 'error');
      setPreview(form.banner_url);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.title || !form.event_date || !form.location || !form.start_time) {
      toast('Title, date, location and start time are required', 'error'); return;
    }
    if (!form.ticket_types.length) {
      toast('Add at least one ticket type', 'error'); return;
    }
    for (const tt of form.ticket_types) {
      if (!tt.name.trim()) { toast('Every ticket type needs a name', 'error'); return; }
    }

    setSaving(true);
    const payload = {
      ...form,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    };
    try {
      if (editId) {
        await eventsAPI.update(editId, payload);
        toast('Event updated');
      } else {
        await eventsAPI.create(payload);
        toast('Event created');
      }
      setModal(false);
      load();
    } catch (err) {
      toast(err.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
      <i data-lucide="loader-2" style={{ width: 24, height: 24 }} />
    </div>
  );

  return (
    <>
      {kycWarning && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '11px 14px', marginBottom: 12,
          background: 'var(--warning-dim)', border: '1px solid rgba(212,133,10,0.35)',
          borderRadius: 10,
        }}>
          <i data-lucide="shield-alert" style={{ width: 15, height: 15, color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: 'var(--warning)', flex: 1 }}>{kycWarning}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setKycWarning('')}>Dismiss</button>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={openCreate}>
          <i data-lucide="plus" style={{ width: 14, height: 14 }} /> Create Event
        </button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Event</th><th>Date</th><th>Location</th>
                <th>Sold</th><th>Revenue</th><th>Status</th><th>Publish</th><th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>
                    No events yet — create one above
                  </td>
                </tr>
              )}
              {events.map(e => (
                <tr key={e.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {e.banner_url
                        ? <img src={resolveAssetUrl(e.banner_url)} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }} />
                        : <div style={{ width: 36, height: 36, background: 'var(--surface3)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i data-lucide="image" style={{ width: 16, height: 16, color: 'var(--text3)' }} />
                          </div>
                      }
                      <span style={{ fontWeight: 500 }}>{e.title}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text2)' }}>{fmtDate(e.event_date)}</td>
                  <td style={{ color: 'var(--text2)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.location}
                  </td>
                  <td>{e.total_sold}/{e.capacity}</td>
                  <td><strong>{fmtCurrency(e.revenue || 0)}</strong></td>
                  <td><Badge variant={e.status === 'published' ? 'green' : 'gray'}>{e.status}</Badge></td>
                  <td>
                    <button
                      className={`btn btn-sm ${e.status === 'published' ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={() => toggleStatus(e)}
                      style={{ minWidth: 90 }}
                    >
                      {e.status === 'published'
                        ? <><i data-lucide="eye-off" style={{ width: 12, height: 12 }} /> Unpublish</>
                        : <><i data-lucide="eye" style={{ width: 12, height: 12 }} /> Publish</>
                      }
                    </button>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(e)}>
                      <i data-lucide="pencil" style={{ width: 12, height: 12 }} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create / Edit modal ──────────────────────────────── */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editId ? 'Edit Event' : 'Create Event'}
        size="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Title */}
          <div className="form-group">
            <label className="form-label">Event title *</label>
            <input className="input" value={form.title} onChange={set('title')} placeholder="My Awesome Event" />
          </div>

          {/* Category + location type */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="select" value={form.category_id} onChange={set('category_id')}>
                <option value="">Select category…</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Location type</label>
              <select className="select" value={form.location_type} onChange={set('location_type')}>
                <option value="physical">Physical</option>
                <option value="virtual">Virtual</option>
              </select>
            </div>
          </div>

          {/* Location */}
          <div className="form-group">
            <label className="form-label">Venue / address *</label>
            <input className="input" value={form.location} onChange={set('location')} placeholder="Venue name and address" />
          </div>

          {/* Virtual URL */}
          {form.location_type === 'virtual' && (
            <div className="form-group">
              <label className="form-label">Virtual URL</label>
              <input className="input" value={form.virtual_url} onChange={set('virtual_url')} placeholder="https://zoom.us/j/…" />
            </div>
          )}

          {/* Date + times */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date *</label>
              <input className="input" type="date" value={form.event_date} onChange={set('event_date')} />
            </div>
            <div className="form-group">
              <label className="form-label">Start time *</label>
              <input className="input" type="time" value={form.start_time} onChange={set('start_time')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">End time</label>
              <input className="input" type="time" value={form.end_time} onChange={set('end_time')} />
            </div>
            <div className="form-group">
              <label className="form-label">Total capacity</label>
              <input className="input" type="number" min="1" value={form.capacity} onChange={set('capacity')} />
            </div>
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="textarea" value={form.description} onChange={set('description')} placeholder="Describe your event…" />
          </div>

          {/* Banner image */}
          <div className="form-group">
            <label className="form-label">Banner image</label>
            {/* Preview */}
            {preview && (
              <div style={{ marginBottom: 8, borderRadius: 8, overflow: 'hidden', height: 120, background: 'var(--surface3)' }}>
                <img src={preview} alt="Banner preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              {/* File upload button */}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{ flexShrink: 0 }}
              >
                {uploading
                  ? <><i data-lucide="loader-2" style={{ width: 12, height: 12 }} /> Uploading…</>
                  : <><i data-lucide="upload" style={{ width: 12, height: 12 }} /> Upload image</>
                }
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              {/* Or paste URL */}
              <input
                className="input"
                value={form.banner_url}
                onChange={(e) => { set('banner_url')(e); setPreview(e.target.value); }}
                placeholder="…or paste an image URL"
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              JPG, PNG or WebP — max 5 MB
            </div>
          </div>

          {/* Tags */}
          <div className="form-group">
            <label className="form-label">Tags (comma-separated)</label>
            <input className="input" value={form.tags} onChange={set('tags')} placeholder="Jazz, Live Music, Outdoor" />
          </div>

          <hr className="divider" />

          {/* Ticket types */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 600 }}>Ticket types</div>
            <button className="btn btn-secondary btn-sm" onClick={addTT}>
              <i data-lucide="plus" style={{ width: 12, height: 12 }} /> Add type
            </button>
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 32px', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', paddingLeft: 4 }}>Name</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Price (KSh)</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Qty</span>
            <span />
          </div>

          {form.ticket_types.map((tt, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 32px', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                placeholder="e.g. VIP"
                value={tt.name}
                onChange={setTT(i, 'name')}
              />
              <input
                className="input"
                type="number" min="0"
                placeholder="0"
                value={tt.price}
                onChange={setTT(i, 'price')}
              />
              <input
                className="input"
                type="number" min="1"
                placeholder="100"
                value={tt.quantity}
                onChange={setTT(i, 'quantity')}
              />
              <button
                className="btn btn-danger btn-icon btn-sm"
                onClick={() => removeTT(i)}
                disabled={form.ticket_types.length === 1}
                title="Remove"
              >
                <i data-lucide="trash-2" style={{ width: 12, height: 12 }} />
              </button>
            </div>
          ))}

          {/* Save */}
          <button
            className="btn btn-primary btn-lg"
            onClick={save}
            disabled={saving || uploading}
            style={{ justifyContent: 'center', marginTop: 8 }}
          >
            {saving
              ? <><i data-lucide="loader-2" style={{ width: 15, height: 15 }} /> Saving…</>
              : editId
                ? <><i data-lucide="save" style={{ width: 15, height: 15 }} /> Save changes</>
                : <><i data-lucide="plus-circle" style={{ width: 15, height: 15 }} /> Create event</>
            }
          </button>
        </div>
      </Modal>
    </>
  );
}
