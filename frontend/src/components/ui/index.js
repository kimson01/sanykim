// src/components/ui/index.js — Shared UI components

import React from 'react';

// ─── Badge ────────────────────────────────────────────────────
export const Badge = ({ children, variant = 'gray' }) => {
  const variants = {
    green:  'badge badge-green',
    orange: 'badge badge-orange',
    red:    'badge badge-red',
    yellow: 'badge badge-yellow',
    blue:   'badge badge-blue',
    gray:   'badge badge-gray',
  };
  return <span className={variants[variant] || variants.gray}>{children}</span>;
};

// ─── Button ───────────────────────────────────────────────────
export const Button = ({ children, variant = 'primary', size = '', loading = false, className = '', ...props }) => {
  const variantMap = {
    primary:   'btn btn-primary',
    secondary: 'btn btn-secondary',
    danger:    'btn btn-danger',
    ghost:     'btn btn-ghost',
    orange:    'btn btn-orange',
  };
  const sizeMap = { sm: 'btn-sm', lg: 'btn-lg', '': '' };
  return (
    <button
      className={`${variantMap[variant]} ${sizeMap[size]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <span className="spinner" /> : children}
    </button>
  );
};

// ─── Input ────────────────────────────────────────────────────
export const Input = ({ label, error, ...props }) => (
  <div className="form-group">
    {label && <label className="form-label">{label}</label>}
    <input className={`input ${error ? 'input-error' : ''}`} {...props} />
    {error && <span className="form-error">{error}</span>}
  </div>
);

export const Select = ({ label, error, children, ...props }) => (
  <div className="form-group">
    {label && <label className="form-label">{label}</label>}
    <select className={`select ${error ? 'input-error' : ''}`} {...props}>{children}</select>
    {error && <span className="form-error">{error}</span>}
  </div>
);

export const Textarea = ({ label, error, ...props }) => (
  <div className="form-group">
    {label && <label className="form-label">{label}</label>}
    <textarea className={`textarea ${error ? 'input-error' : ''}`} {...props} />
    {error && <span className="form-error">{error}</span>}
  </div>
);

// ─── Card ─────────────────────────────────────────────────────
export const Card = ({ children, className = '', style }) => (
  <div className={`card ${className}`} style={style}>{children}</div>
);

// ─── Stat Card ────────────────────────────────────────────────
export const StatCard = ({ label, value, icon, color, bg, sub }) => (
  <div className="stat-card">
    <div className="stat-icon" style={{ background: bg }}>
      <i data-lucide={icon} style={{ width: 18, height: 18, color }} />
    </div>
    <div className="stat-value">{value}</div>
    <div className="stat-label">{label}</div>
    {sub && <div className="stat-change" style={{ color }}>{sub}</div>}
  </div>
);

// ─── Modal ────────────────────────────────────────────────────
export const Modal = ({ open, onClose, title, children, size = '' }) => {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`}>
        <div className="modal-header">
          <h3 style={{ fontFamily: 'Syne', fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <i data-lucide="x" style={{ width: 16, height: 16 }} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
};

// ─── Empty State ──────────────────────────────────────────────
export const EmptyState = ({ icon = 'inbox', title, sub, action }) => (
  <div className="empty-state">
    <div className="empty-icon">
      <i data-lucide={icon} style={{ width: 40, height: 40 }} />
    </div>
    <div className="empty-title">{title}</div>
    {sub && <div className="empty-sub">{sub}</div>}
    {action}
  </div>
);

// ─── Table ────────────────────────────────────────────────────
export const Table = ({ columns, data, emptyText = 'No data' }) => (
  <div className="table-wrap">
    <table>
      <thead>
        <tr>{columns.map((c, i) => <th key={i}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {data.length === 0
          ? <tr><td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--text3)', padding: 32 }}>{emptyText}</td></tr>
          : data.map((row, i) => (
            <tr key={i}>
              {columns.map((c, j) => <td key={j}>{c.render ? c.render(row) : row[c.key]}</td>)}
            </tr>
          ))
        }
      </tbody>
    </table>
  </div>
);

// ─── Spinner ──────────────────────────────────────────────────
export const Spinner = ({ size = 24 }) => (
  <div style={{
    width: size, height: size, border: '2px solid var(--border2)',
    borderTop: '2px solid var(--accent)', borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  }} />
);

// ─── Toast hook ───────────────────────────────────────────────
export const useToast = () => {
  const show = (msg, type = 'success') => {
    const c = document.getElementById('toast-container');
    if (!c) return;

    // Safe DOM construction — never use innerHTML with dynamic content (XSS risk)
    const t     = document.createElement('div');
    t.className = `toast toast-${type}`;

    const dot = document.createElement('span');
    dot.style.cssText = `color:${
      type === 'success' ? 'var(--accent)' :
      type === 'error'   ? 'var(--danger)' : 'var(--info)'
    };font-size:14px;flex-shrink:0`;
    dot.textContent = '●';

    const text = document.createElement('span');
    text.style.fontSize = '13px';
    text.textContent = msg;   // textContent is always safe — no HTML parsing

    t.appendChild(dot);
    t.appendChild(text);
    c.appendChild(t);

    setTimeout(() => {
      t.style.opacity    = '0';
      t.style.transform  = 'translateX(40px)';
      t.style.transition = 'all 0.3s';
      setTimeout(() => t.remove(), 300);
    }, 3000);
  };
  return { toast: show };
};

// ─── fmtCurrency ─────────────────────────────────────────────
export const fmtCurrency = (n) => 'KSh ' + Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0 });
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
