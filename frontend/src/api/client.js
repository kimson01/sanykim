// src/api/client.js — Axios instance with auth interceptors
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  // Cloud DBs can cold-start; allow a bit more before timing out in UI.
  timeout: 45000,
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ef_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally — redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ef_token');
      localStorage.removeItem('ef_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// ─── Auth ──────────────────────────────────────────────────────
export const authAPI = {
  login:               (data) => api.post('/auth/login', data),
  register:            (data) => api.post('/auth/register', data),
  me:                  ()     => api.get('/auth/me'),
  updateProfile:       (data) => api.put('/auth/profile', data),
  acceptOrganizerTerms:(data) => api.post('/auth/accept-organizer-terms', data),
  verifyEmail:         (data) => api.post('/auth/verify-email', data),
  resendVerification:  (data) => api.post('/auth/resend-verification', data),
  forgotPassword:      (data) => api.post('/auth/forgot-password', data),
  resetPassword:       (data) => api.post('/auth/reset-password', data),
};

// ─── Events ────────────────────────────────────────────────────
export const eventsAPI = {
  list:         (params)     => api.get('/events', { params }),
  get:          (id)         => api.get(`/events/${id}`),
  myEvents:     ()           => api.get('/events/organizer/mine'),
  create:       (data)       => api.post('/events', data),
  update:       (id, data)   => api.put(`/events/${id}`, data),
  updateStatus: (id, data)   => api.patch(`/events/${id}/status`, data),
  delete:       (id)         => api.delete(`/events/${id}`),
};

// ─── Orders ────────────────────────────────────────────────────
export const ordersAPI = {
  create:    (data)       => api.post('/orders', data),
  confirm:   (id, data)   => api.post(`/orders/${id}/confirm`, data),
  status:    (id)         => api.get(`/orders/${id}/status`),
  myOrders:  ()           => api.get('/orders/my'),
  myTickets: ()           => api.get('/orders/my/tickets'),
  all:       (params)     => api.get('/orders', { params }),
};

// ─── Tickets ───────────────────────────────────────────────────
export const ticketsAPI = {
  scan:         (code)     => api.post('/tickets/scan', { code }),
  get:          (code)     => api.get(`/tickets/${code}`),
  eventTickets: (eventId)  => api.get(`/tickets/event/${eventId}`),
  downloadPDF:  (orderId)  => api.get(`/tickets/order/${orderId}/pdf`, { responseType: 'blob' }),
};

// ─── Admin ─────────────────────────────────────────────────────
export const adminAPI = {
  dashboard:       ()            => api.get('/admin/dashboard'),
  eventOptions:    ()            => api.get('/admin/events/options'),
  logs:            (params)      => api.get('/admin/logs', { params }),
  organizers:      (params)      => api.get('/admin/organizers', { params }),
  updateOrgStatus: (id, status)  => api.patch(`/admin/organizers/${id}/status`, { status }),
  setCommission:   (id, value)   => api.patch(`/admin/organizers/${id}/commission`, { commission: value }),
  users:           ()            => api.get('/admin/users'),
  toggleUser:      (id)          => api.patch(`/admin/users/${id}/toggle`),
  transactions:    (params)      => api.get('/admin/transactions', { params }),
  settings:        ()            => api.get('/admin/settings'),
  updateSettings:  (data)        => api.put('/admin/settings', data),
  refundOrder:     (id, data)    => api.post(`/admin/orders/${id}/refund`, data),
  updateOrgNotes:  (id, data)    => api.patch(`/admin/organizers/${id}/notes`, data),
  getOrgLedger:    (id, params)  => api.get(`/admin/organizers/${id}/ledger`, { params }),
  recordPayout:    (id, data)    => api.post(`/admin/organizers/${id}/payout`, data),
  getAllPayouts:    (params)      => api.get('/admin/payouts', { params }),
};

// ─── Payments ──────────────────────────────────────────────────
export const paymentsAPI = {
  stkPush:  (data) => api.post('/payments/mpesa/stkpush', data),
  simulate: (data) => api.post('/payments/simulate', data),
};

// ─── Uploads ───────────────────────────────────────────────────
export const uploadsAPI = {
  banner: (formData) => api.post('/uploads/banner', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};

// ─── Categories ────────────────────────────────────────────────
export const categoriesAPI = {
  list: () => api.get('/categories'),
};

// ─── Public settings ──────────────────────────────────────────
export const settingsAPI = {
  public: () => api.get('/settings/public'),
};

// ─── Customer care ────────────────────────────────────────────
export const supportAPI = {
  list:            (params)       => api.get('/support/tickets', { params }),
  get:             (id)           => api.get(`/support/tickets/${id}`),
  update:          (id, data)     => api.patch(`/support/tickets/${id}`, data),
  delete:          (id)           => api.delete(`/support/tickets/${id}`),
  messages:        (id, params)   => api.get(`/support/tickets/${id}/messages`, { params }),
  reply:           (id, data)     => api.post(`/support/tickets/${id}/messages`, data),
  events:          (id)           => api.get(`/support/tickets/${id}/events`),
  submit:          (data)         => api.post('/support/request', data),
  my:              ()             => api.get('/support/my'),
  organizer:       ()             => api.get('/support/organizer'),
  organizerSettle: (id, data)     => api.patch(`/support/organizer/${id}/settle`, data),
  escalate:        (id, data)     => api.patch(`/support/escalate/${id}`, data),
  adminOverview:   ()             => api.get('/support/admin/overview'),
  adminConflicts:  (params)       => api.get('/support/admin/conflicts', { params }),
  intervene:       (id, data)     => api.patch(`/support/admin/conflicts/${id}/intervene`, data),
};

// ─── Waitlist ──────────────────────────────────────────────────
export const waitlistAPI = {
  join: (data)    => api.post('/waitlist', data),
  get:  (eventId) => api.get(`/waitlist/${eventId}`),
};

// ─── Organiser profiles ────────────────────────────────────────
export const organisersAPI = {
  getProfile: (slug) => api.get(`/organisers/${slug}`),
};

// ─── Analytics ─────────────────────────────────────────────────
export const analyticsAPI = {
  organizer:    ()      => api.get('/organizer/analytics'),
  orgSalesByDay: (days) => api.get('/organizer/analytics/sales', { params: { days } }),
};
