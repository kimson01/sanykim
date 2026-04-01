// src/pages/organizer/OrgScan.js
// Phase 3: Camera-based QR scanner + manual code entry
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ticketsAPI } from '../../api/client';
import { useToast } from '../../components/ui';

// ── Result banner ─────────────────────────────────────────────
function ResultBanner({ result, onDismiss }) {
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [result, onDismiss]);

  if (!result) return null;

  const ok      = result.ok;
  const already = result.already;
  const bg      = ok ? 'var(--accent-dim)'  : already ? 'var(--warning-dim)'  : 'var(--danger-dim)';
  const border  = ok ? 'rgba(34,197,94,0.2)' : already ? 'rgba(234,179,8,0.2)' : 'rgba(239,68,68,0.2)';
  const color   = ok ? 'var(--accent)'       : already ? 'var(--warning)'       : 'var(--danger)';
  const icon    = ok ? 'check-circle'        : already ? 'alert-triangle'        : 'x-circle';
  const title   = ok ? 'Valid — entry granted' : already ? 'Already used' : 'Invalid ticket';

  return (
    <div style={{
      background: bg, border: `1px solid ${border}`, borderRadius: 10,
      padding: 16, textAlign: 'center', width: '100%',
    }}>
      <i data-lucide={icon} style={{ width: 28, height: 28, color, marginBottom: 8 }} />
      <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, color, marginBottom: 4 }}>
        {title}
      </div>
      {ok && result.data?.data && (
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 500, color: 'var(--text)' }}>{result.data.data.event}</div>
          <div>{result.data.data.ticket_type} — Seat {result.data.data.seat_number}</div>
          <div>{result.data.data.attendee_name}</div>
        </div>
      )}
      {!ok && (
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{result.message}</div>
      )}
    </div>
  );
}

// ── Camera scanner (uses BarcodeDetector if available, else jsQR) ──
function CameraScanner({ onScan, active }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef    = useRef(null);
  const [error, setError] = useState('');

  const stopCamera = useCallback(() => {
    if (rafRef.current)  cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        tick();
      }
    } catch (err) {
      setError('Camera access denied — use manual entry below.');
    }
  }, []); // eslint-disable-line

  const tick = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(tick); return;
    }
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Try BarcodeDetector (Chrome 83+, Android WebView)
    if ('BarcodeDetector' in window) {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      detector.detect(canvas)
        .then(codes => {
          if (codes.length > 0) onScan(codes[0].rawValue);
          else rafRef.current = requestAnimationFrame(tick);
        })
        .catch(() => { rafRef.current = requestAnimationFrame(tick); });
    } else {
      // Fallback: dynamically load jsQR from CDN
      if (!window._jsQR) {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
        s.onload = () => { tick(); };
        document.head.appendChild(s);
        return;
      }
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window._jsQR(data.data, data.width, data.height);
      if (code) {
        // jsQR returns the raw QR data — if it's our JSON payload, extract code
        let raw = code.data;
        try { raw = JSON.parse(raw).code || raw; } catch (_) {}
        onScan(raw);
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
  }, [onScan]);

  // Wire jsQR global after script loads
  useEffect(() => {
    window._jsQR = window.jsQR;
  });

  useEffect(() => {
    if (active) startCamera();
    else        stopCamera();
    return stopCamera;
  }, [active, startCamera, stopCamera]);

  if (error) return (
    <div style={{
      background: 'var(--warning-dim)', border: '1px solid rgba(234,179,8,0.2)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--warning)',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <i data-lucide="camera-off" style={{ width: 14, height: 14, flexShrink: 0 }} />
      {error}
    </div>
  );

  return (
    <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
      <video
        ref={videoRef}
        muted playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {/* Scanner overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{
          width: 180, height: 180,
          border: '2px solid var(--accent)',
          borderRadius: 12,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
        }} />
      </div>
      <div style={{
        position: 'absolute', bottom: 12, left: 0, right: 0,
        textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.7)',
      }}>
        Point camera at a QR code
      </div>
    </div>
  );
}

// ── Recent scan log ───────────────────────────────────────────
function ScanLog({ entries }) {
  if (!entries.length) return null;
  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 12, fontSize: 14 }}>
        Recent scans
      </div>
      {entries.map((e, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 0', borderBottom: i < entries.length - 1 ? '1px solid var(--border)' : 'none',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: e.ok ? 'var(--text)' : 'var(--text2)' }}>
              {e.label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>{e.code}</div>
          </div>
          <span className={`badge ${e.ok ? 'badge-green' : e.already ? 'badge-yellow' : 'badge-red'}`}>
            {e.ok ? 'Valid' : e.already ? 'Used' : 'Invalid'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function OrgScan() {
  const [code, setCode]       = useState('');
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [log, setLog]         = useState([]);
  const { toast } = useToast();

  const processCode = useCallback(async (rawCode) => {
    if (!rawCode?.trim() || loading) return;
    // If it's a JSON QR payload, extract the code field
    let ticketCode = rawCode.trim();
    try { ticketCode = JSON.parse(rawCode).code || ticketCode; } catch (_) {}

    setLoading(true); setResult(null);
    try {
      const res  = await ticketsAPI.scan(ticketCode);
      const ok   = { ok: true, data: res.data };
      setResult(ok);
      setLog(l => [{
        ok: true, already: false,
        label: res.data?.data?.event || ticketCode,
        code:  ticketCode,
      }, ...l.slice(0, 9)]);
    } catch (err) {
      const already = err.response?.status === 409;
      const msg     = err.response?.data?.message || 'Scan failed';
      const bad     = { ok: false, already, message: msg, data: err.response?.data?.data };
      setResult(bad);
      setLog(l => [{
        ok: false, already,
        label: already ? 'Already used' : 'Invalid ticket',
        code:  ticketCode,
      }, ...l.slice(0, 9)]);
    } finally {
      setLoading(false);
      setCode('');
    }
  }, [loading]);

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button
          className={`btn ${!cameraOn ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setCameraOn(false)}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <i data-lucide="keyboard" style={{ width: 14, height: 14 }} />
          Manual entry
        </button>
        <button
          className={`btn ${cameraOn ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setCameraOn(true)}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <i data-lucide="camera" style={{ width: 14, height: 14 }} />
          Camera scan
        </button>
      </div>

      <div className="scan-frame">
        {/* Camera view */}
        {cameraOn && (
          <div style={{ width: '100%' }}>
            <CameraScanner
              active={cameraOn}
              onScan={code => { setCameraOn(false); processCode(code); }}
            />
          </div>
        )}

        {/* Manual entry */}
        {!cameraOn && (
          <>
            <div style={{
              width: 64, height: 64, background: 'var(--accent-dim)',
              borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i data-lucide="scan-line" style={{ width: 30, height: 30, color: 'var(--accent)' }} />
            </div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 18, fontWeight: 700 }}>
              Ticket scanner
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', margin: 0 }}>
              Enter a ticket code manually or switch to camera mode
            </p>
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              <input
                className="input" style={{ flex: 1 }}
                value={code}
                onChange={e => setCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && processCode(code)}
                placeholder="EF-XXXX-XXXXXXXX"
                autoFocus
              />
              <button
                className="btn btn-primary"
                onClick={() => processCode(code)}
                disabled={loading || !code.trim()}
              >
                {loading
                  ? <i data-lucide="loader-2" style={{ width: 14, height: 14 }} />
                  : <><i data-lucide="check" style={{ width: 14, height: 14 }} /> Validate</>
                }
              </button>
            </div>
          </>
        )}

        {/* Result */}
        <ResultBanner result={result} onDismiss={() => setResult(null)} />
      </div>

      <ScanLog entries={log} />
    </div>
  );
}
