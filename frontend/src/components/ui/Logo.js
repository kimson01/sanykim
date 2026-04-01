// src/components/ui/Logo.js
// Sany Adventures — shield badge logo matching the brand identity
import React from 'react';

/**
 * SanyLogo
 * @param {number}  size  - icon size in px (default 32)
 * @param {boolean} full  - show wordmark beside icon (default false)
 */
export default function SanyLogo({ size = 32, full = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.28, flexShrink: 0 }}>

      {/* ── Shield badge icon ─────────────────────────────── */}
      <svg
        width={size}
        height={size * 1.12}
        viewBox="0 0 44 49"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        {/* Shield body — dark brown-black background */}
        <path
          d="M22 2 L41 9.5 L41 27 Q41 40 22 47 Q3 40 3 27 L3 9.5 Z"
          fill="#1a1506"
          stroke="#c9a227"
          strokeWidth="2"
        />

        {/* Inner shield highlight line */}
        <path
          d="M22 5.5 L38 12 L38 27 Q38 38 22 44 Q6 38 6 27 L6 12 Z"
          fill="none"
          stroke="#a08520"
          strokeWidth="0.6"
          opacity="0.5"
        />

        {/* Mountain range — forest green */}
        <path d="M8 30 L14 18 L18 22 L22 14 L26 20 L30 16 L36 30 Z" fill="#2d4a14" />

        {/* Snow cap on peak */}
        <path d="M22 14 L25.5 19.5 L22 18.5 L18.5 19.5 Z" fill="#e8dfc0" />

        {/* Sun glow behind mountain */}
        <circle cx="22" cy="13" r="4" fill="#c9a227" opacity="0.25" />
        <circle cx="22" cy="13" r="2" fill="#c9a227" opacity="0.4" />

        {/* Flying eagle silhouette — top left */}
        <path
          d="M9 11 Q10.5 9.5 12 10.5 Q10.5 11 11.5 12.5 Q10 11.5 9 11Z"
          fill="#c9a227"
          opacity="0.7"
        />

        {/* Gold "S" letterform — centred */}
        <path
          d="M27.5 23.5 H20 a2.8 2.8 0 0 0 0 5 h4.5 a2.8 2.8 0 0 1 0 5 H16"
          stroke="#c9a227"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Shield bottom point accent */}
        <path
          d="M18 43 L22 47 L26 43"
          stroke="#c9a227"
          strokeWidth="1.2"
          fill="none"
          opacity="0.6"
        />
      </svg>

      {/* ── Wordmark ──────────────────────────────────────── */}
      {full && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span style={{
            fontFamily: 'Syne, sans-serif',
            fontWeight: 800,
            fontSize:   size * 0.52,
            color:      '#c9a227',
            letterSpacing: '-0.01em',
          }}>
            Sany
          </span>
          <span style={{
            fontFamily:    'DM Sans, sans-serif',
            fontWeight:    700,
            fontSize:      size * 0.25,
            color:         '#a08520',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}>
            Adventures
          </span>
        </div>
      )}
    </div>
  );
}
