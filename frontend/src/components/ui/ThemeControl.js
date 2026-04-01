import React, { useEffect, useState } from 'react';

const THEMES = [
  { id: 'gold', label: 'Gold', color: '#c9a227' },
  { id: 'ember', label: 'Ember', color: '#d97706' },
  { id: 'forest', label: 'Forest', color: '#4a7c20' },
  { id: 'ocean', label: 'Ocean', color: '#0f766e' },
];

const MODES = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
];

function applyThemePreferences(theme, mode) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-mode', mode);
  localStorage.setItem('ef_theme', theme);
  localStorage.setItem('ef_mode', mode);

  const activeTheme = THEMES.find((item) => item.id === theme);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', mode === 'light' ? '#f7f0de' : (activeTheme?.color || '#c9a227'));
  }
}

export function ThemeBootstrap() {
  useEffect(() => {
    applyThemePreferences(
      localStorage.getItem('ef_theme') || 'gold',
      localStorage.getItem('ef_mode') || 'dark'
    );
  }, []);

  return null;
}

export default function ThemeControl({ compact = false }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('ef_theme') || 'gold');
  const [mode, setMode] = useState(() => localStorage.getItem('ef_mode') || 'dark');

  useEffect(() => {
    applyThemePreferences(theme, mode);
  }, [theme, mode]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: compact ? 6 : 10,
      padding: compact ? '6px 8px' : '10px 12px',
      borderRadius: 999,
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setMode(item.id)}
            style={{
              padding: compact ? '4px 8px' : '6px 10px',
              borderRadius: 999,
              border: `1px solid ${mode === item.id ? 'var(--accent)' : 'var(--border)'}`,
              background: mode === item.id ? 'var(--accent-dim)' : 'transparent',
              color: mode === item.id ? 'var(--accent)' : 'var(--text2)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {THEMES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTheme(item.id)}
            title={item.label}
            aria-label={`Switch to ${item.label} theme`}
            style={{
              width: compact ? 16 : 18,
              height: compact ? 16 : 18,
              borderRadius: '50%',
              border: theme === item.id ? '2px solid var(--text)' : '2px solid transparent',
              background: item.color,
              boxShadow: theme === item.id ? '0 0 0 3px rgba(255,255,255,0.08)' : 'none',
              cursor: 'pointer',
            }}
          />
        ))}
      </div>
    </div>
  );
}
