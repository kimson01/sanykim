// src/pages/admin/AdminUsers.js
import React, { useEffect, useState, useCallback } from 'react';
import { adminAPI } from '../../api/client';
import { Badge, fmtCurrency, fmtDate, useToast } from '../../components/ui';

export default function AdminUsers() {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null); // id being toggled
  const { toast } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    adminAPI.users()
      .then(r => setUsers(r.data.data))
      .catch((err) => {
        setUsers([]);
        toast(err.response?.data?.message || 'Failed to load users', 'error');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (user) => {
    if (user.role === 'admin') return;
    setToggling(user.id);
    try {
      const res = await adminAPI.toggleUser(user.id);
      const action = res.data.data.is_active ? 'enabled' : 'disabled';
      toast(`${user.name} ${action}`);
      setUsers(prev =>
        prev.map(u => u.id === user.id ? { ...u, is_active: res.data.data.is_active } : u)
      );
    } catch (err) {
      toast(err.response?.data?.message || 'Action failed', 'error');
    } finally {
      setToggling(null);
    }
  };

  const roleBadge = (role) => {
    if (role === 'admin')     return <Badge variant="orange">Admin</Badge>;
    if (role === 'organizer') return <Badge variant="blue">Organizer</Badge>;
    return <Badge variant="gray">User</Badge>;
  };

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
      <i data-lucide="loader-2" style={{ width: 24, height: 24 }} />
    </div>
  );

  return (
    <div className="card">
      <div className="responsive-header" style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 15 }}>
          All Users <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 13 }}>({users.length})</span>
        </div>
      </div>

      <div className="table-wrap responsive-table-shell">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Orders</th>
              <th>Spent</th>
              <th>Joined</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text3)', padding: 32 }}>
                  No users found
                </td>
              </tr>
            )}
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className={`avatar ${u.role === 'organizer' ? 'avatar-blue' : u.role === 'admin' ? 'avatar-orange' : 'avatar-green'}`}
                      style={{ width: 28, height: 28, fontSize: 11, flexShrink: 0 }}>
                      {u.name?.[0] || '?'}
                    </div>
                    <span style={{ fontWeight: 500 }}>{u.name}</span>
                  </div>
                </td>
                <td style={{ color: 'var(--text2)', fontSize: 12 }}>{u.email}</td>
                <td>{roleBadge(u.role)}</td>
                <td style={{ textAlign: 'center' }}>
                  {parseInt(u.order_count) > 0
                    ? <strong>{u.order_count}</strong>
                    : <span style={{ color: 'var(--text3)' }}>—</span>
                  }
                </td>
                <td>
                  {parseFloat(u.total_spent) > 0
                    ? <strong style={{ color: 'var(--accent)' }}>{fmtCurrency(u.total_spent)}</strong>
                    : <span style={{ color: 'var(--text3)' }}>—</span>
                  }
                </td>
                <td style={{ color: 'var(--text2)', fontSize: 12 }}>{fmtDate(u.created_at)}</td>
                <td>
                  <Badge variant={u.is_active ? 'green' : 'red'}>
                    {u.is_active ? 'Active' : 'Disabled'}
                  </Badge>
                </td>
                <td>
                  {u.role === 'admin' ? (
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>—</span>
                  ) : (
                    <button
                      className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-secondary'}`}
                      onClick={() => handleToggle(u)}
                      disabled={toggling === u.id}
                      style={{ minWidth: 70 }}
                    >
                      {toggling === u.id
                        ? <i data-lucide="loader-2" style={{ width: 12, height: 12 }} />
                        : u.is_active
                          ? <><i data-lucide="user-x" style={{ width: 12, height: 12 }} /> Disable</>
                          : <><i data-lucide="user-check" style={{ width: 12, height: 12 }} /> Enable</>
                      }
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
