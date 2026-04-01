// src/pages/user/UserHistory.js
import React, { useEffect, useState } from 'react';
import { ordersAPI, ticketsAPI } from '../../api/client';
import { Badge, fmtCurrency, fmtDate, useToast } from '../../components/ui';

// ── PDF download hook ─────────────────────────────────────────
function usePDFDownload() {
  const [downloading, setDownloading] = useState(null);
  const { toast } = useToast();

  const download = async (orderId, orderRef) => {
    setDownloading(orderId);
    try {
      const res  = await ticketsAPI.downloadPDF(orderId);
      const url  = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href  = url;
      link.setAttribute('download', `sany-tickets-${orderRef}.pdf`);
      document.body.appendChild(link);
      link.click();
      if (link.parentNode === document.body) link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast('PDF download failed', 'error');
    } finally {
      setDownloading(null);
    }
  };

  return { download, downloading };
}

export default function UserHistory() {
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const { download, downloading } = usePDFDownload();
  const { toast } = useToast();

  useEffect(() => {
    ordersAPI.myOrders()
      .then(r => setOrders(r.data.data))
      .catch((err) => {
        setOrders([]);
        toast(err.response?.data?.message || 'Failed to load purchase history', 'error');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
      <i data-lucide="loader-2" style={{ width: 24, height: 24 }} />
    </div>
  );

  return (
    <div className="card">
      <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, marginBottom: 16, fontSize: 15 }}>
        Purchase History
        <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>
          ({orders.length})
        </span>
      </div>

      {orders.length === 0 ? (
        <div className="empty-state" style={{ padding: '40px 0' }}>
          <div className="empty-icon"><i data-lucide="history" style={{ width: 36, height: 36 }} /></div>
          <div className="empty-title">No purchases yet</div>
          <div className="empty-sub">Your order history will appear here</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order Ref</th>
                <th>Event</th>
                <th>Purchased</th>
                <th>Total</th>
                <th>Method</th>
                <th>Status</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.order_ref}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{o.event_title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{fmtDate(o.event_date)}</div>
                  </td>
                  <td style={{ color: 'var(--text2)', fontSize: 12 }}>{fmtDate(o.created_at)}</td>
                  <td><strong>{fmtCurrency(o.total)}</strong></td>
                  <td>
                    <Badge variant="blue">
                      {o.payment_method?.toUpperCase() || 'MPESA'}
                    </Badge>
                  </td>
                  <td>
                    <Badge variant={
                      o.status === 'success'  ? 'green'  :
                      o.status === 'refunded' ? 'orange' :
                      o.status === 'pending'  ? 'yellow' : 'red'
                    }>
                      {o.status}
                    </Badge>
                  </td>
                  <td>
                    {o.status === 'success' ? (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => download(o.id, o.order_ref)}
                        disabled={downloading === o.id}
                        style={{ padding: '3px 10px' }}
                      >
                        {downloading === o.id
                          ? <i data-lucide="loader-2" style={{ width: 12, height: 12 }} />
                          : <><i data-lucide="download" style={{ width: 12, height: 12 }} /> PDF</>
                        }
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
