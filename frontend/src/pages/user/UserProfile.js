// src/pages/user/UserProfile.js
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../api/client';
import { useToast } from '../../components/ui';

export default function UserProfile() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();

  const [form, setForm] = useState({
    name:             user?.name  || '',
    phone:            user?.phone || '',
    current_password: '',
    new_password:     '',
    confirm_password: '',
  });
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [errors, setErrors]   = useState({});
  const [saved, setSaved]     = useState(false);

  const set = (k) => (e) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    setErrors(er => ({ ...er, [k]: '' }));
    setSaved(false);
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (form.new_password) {
      if (!form.current_password) errs.current_password = 'Enter current password to change it';
      if (form.new_password.length < 6) errs.new_password = 'At least 6 characters';
      if (form.new_password !== form.confirm_password) errs.confirm_password = 'Passwords do not match';
    }
    return errs;
  };

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    try {
      const payload = {
        name:  form.name.trim(),
        phone: form.phone.trim() || null,
      };
      if (form.new_password) {
        payload.current_password = form.current_password;
        payload.new_password     = form.new_password;
      }
      const res = await authAPI.updateProfile(payload);

      // ── Update AuthContext so sidebar name refreshes immediately ──
      updateUser({ name: res.data.user.name, phone: res.data.user.phone });

      toast('Profile updated');
      setSaved(true);
      // Clear password fields only
      setForm(f => ({ ...f, current_password: '', new_password: '', confirm_password: '' }));
    } catch (err) {
      const msg = err.response?.data?.message || 'Save failed';
      toast(msg, 'error');
      if (msg.toLowerCase().includes('current password')) {
        setErrors(e => ({ ...e, current_password: msg }));
      }
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, name, type = 'text', placeholder, hint }) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          className={`input ${errors[name] ? 'input-error' : ''}`}
          type={type === 'password' && showPwd ? 'text' : type}
          value={form[name]}
          onChange={set(name)}
          placeholder={placeholder}
          style={type === 'password' ? { paddingRight: 38 } : {}}
        />
        {type === 'password' && (
          <button
            type="button"
            onClick={() => setShowPwd(v => !v)}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}
          >
            <i data-lucide={showPwd ? 'eye-off' : 'eye'} style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>
      {errors[name] && (
        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <i data-lucide="circle-x" style={{ width: 11, height: 11 }} /> {errors[name]}
        </div>
      )}
      {hint && !errors[name] && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{hint}</div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 520 }}>
      {/* Avatar strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 20px', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 12, marginBottom: 20,
      }}>
        <div className="avatar avatar-green" style={{ width: 52, height: 52, fontSize: 20, flexShrink: 0 }}>
          {user?.name?.[0] || 'U'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 17 }}>{user?.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{user?.email}</div>
        </div>
        <span className="badge badge-green" style={{ fontSize: 10 }}>
          {user?.role === 'organizer' ? 'Organizer' : 'Attendee'}
        </span>
      </div>

      {/* Personal details */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden', marginBottom: 16,
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>
          Personal details
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Full name *" name="name" placeholder="Jane Doe" />
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="input"
              value={user?.email || ''}
              disabled
              style={{ opacity: 0.55, cursor: 'not-allowed' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Email cannot be changed</div>
          </div>
          <Field label="Phone number" name="phone" placeholder="+254700000000" />
        </div>
      </div>

      {/* Change password */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden', marginBottom: 20,
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13 }}>
          Change password
          <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text3)', marginLeft: 8 }}>Leave blank to keep current</span>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Current password" name="current_password" type="password" placeholder="Your current password" />
          <Field label="New password"     name="new_password"     type="password" placeholder="At least 6 characters" />
          <Field label="Confirm new"      name="confirm_password" type="password" placeholder="Repeat new password" />
        </div>
      </div>

      {/* Save */}
      <button
        className="btn btn-primary btn-lg w-full"
        onClick={handleSave}
        disabled={saving}
      >
        {saving
          ? <><i data-lucide="loader-2" style={{ width: 15, height: 15 }} /> Saving…</>
          : saved
            ? <><i data-lucide="check-circle" style={{ width: 15, height: 15 }} /> Saved</>
            : <><i data-lucide="save" style={{ width: 15, height: 15 }} /> Save changes</>
        }
      </button>
    </div>
  );
}
