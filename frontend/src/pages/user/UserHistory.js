// src/pages/user/UserHistory.js
import React, { useEffect, useState } from 'react';
import { ordersAPI } from '../../api/client';
import { Badge, fmtCurrency, fmtDate, useToast } from '../../components/ui';
import { useTicketPdfDownload } from '../../utils/useTicketPdfDownload';

const statusVariant = (status) => (
  status === 'success' ? 'green' :
  status === 'refunded' ? 'orange' :
  status === 'pending' ? 'yellow' : 'red'
);

export default function UserHistory() {
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const { download, downloading } = useTicketPdfDownload('PDF download failed');
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
      <div className="responsive-header" style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 15 }}>
          Purchase History
          <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>
            ({orders.length})
          </span>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="empty-state" style={{ padding: '40px 0' }}>
          <div className="empty-icon"><i data-lucide="history" style={{ width: 36, height: 36 }} /></div>
          <div className="empty-title">No purchases yet</div>
          <div className="empty-sub">Your order history will appear here</div>
        </div>
      ) : (
        <>
          <div className="desktop-only-block">
            <div className="table-wrap responsive-table-shell">
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
                        <Badge variant={statusVariant(o.status)}>
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
          </div>

          <div className="mobile-only-block">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {orders.map((o) => (
              <div key={o.id} className="card" style={{ padding: 16 }}>
                <div className="responsive-header" style={{ marginBottom: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.event_title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace', marginTop: 3 }}>
                      {o.order_ref}
                    </div>
                  </div>
                  <Badge variant={statusVariant(o.status)}>{o.status}</Badge>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
                  <div>
                    <div style={{ color: 'var(--text3)', marginBottom: 2 }}>Event date</div>
                    <div style={{ color: 'var(--text2)' }}>{fmtDate(o.event_date)}</div>
                  </div>

                  <div className="responsive-header">
                    <div>
                      <div style={{ color: 'var(--text3)', marginBottom: 2 }}>Purchased</div>
                      <div style={{ color: 'var(--text2)' }}>{fmtDate(o.created_at)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: 'var(--text3)', marginBottom: 2 }}>Total</div>
                      <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmtCurrency(o.total)}</div>
                    </div>
                  </div>

                  <div className="responsive-header">
                    <div>
                      <div style={{ color: 'var(--text3)', marginBottom: 2 }}>Method</div>
                      <Badge variant="blue">
                        {o.payment_method?.toUpperCase() || 'MPESA'}
                      </Badge>
                    </div>
                    <div style={{ minWidth: 120 }}>
                      {o.status === 'success' ? (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => download(o.id, o.order_ref)}
                          disabled={downloading === o.id}
                          style={{ width: '100%', justifyContent: 'center' }}
                        >
                          {downloading === o.id
                            ? <i data-lucide="loader-2" style={{ width: 12, height: 12 }} />
                            : <><i data-lucide="download" style={{ width: 12, height: 12 }} /> Download PDF</>
                          }
                        </button>
                      ) : (
                        <div style={{ textAlign: 'right', color: 'var(--text3)' }}>No PDF available</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
