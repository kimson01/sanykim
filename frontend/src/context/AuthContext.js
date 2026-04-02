// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../api/client';

const AuthContext = createContext(null);

const normalizeUser = (user) => {
  if (!user) return null;

  if (user.organizer !== undefined) {
    return {
      ...user,
      organizer: user.organizer
        ? {
            ...user.organizer,
            company: user.organizer.company ?? user.organizer.company_name ?? null,
            status: user.organizer.status ?? user.organizer.org_status ?? null,
          }
        : null,
    };
  }

  const organizerId = user.organizer_id || user.organizerId || null;
  return {
    ...user,
    organizer: organizerId
      ? {
          id: organizerId,
          company: user.company_name ?? null,
          status: user.org_status ?? user.organizer_status ?? null,
          commission: user.commission ?? null,
        }
      : null,
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Defined with useCallback so it has a stable reference.
  // Used inside useEffect without causing infinite re-runs.
  const logout = useCallback(() => {
    localStorage.removeItem('ef_token');
    localStorage.removeItem('ef_user');
    setUser(null);
  }, []);

  // Rehydrate session from localStorage on mount.
  // Verifies the stored token is still valid against the API.
  useEffect(() => {
    const token  = localStorage.getItem('ef_token');
    const stored = localStorage.getItem('ef_user');

    // Optimistic: show the stored user immediately while we verify
    if (token && stored) {
      try { setUser(normalizeUser(JSON.parse(stored))); } catch (_) {}
    }

    if (token) {
      authAPI.me()
        .then(({ data }) => {
          const normalized = normalizeUser(data.user);
          setUser(normalized);
          localStorage.setItem('ef_user', JSON.stringify(normalized));
        })
        .catch(() => logout())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [logout]);

  const login = async (email, password) => {
    const { data } = await authAPI.login({ email, password });
    const normalized = normalizeUser(data.user);
    localStorage.setItem('ef_token', data.token);
    localStorage.setItem('ef_user', JSON.stringify(normalized));
    setUser(normalized);
    return normalized;
  };

  const register = async (payload) => {
    const { data } = await authAPI.register(payload);
    const normalized = normalizeUser(data.user);
    localStorage.setItem('ef_token', data.token);
    localStorage.setItem('ef_user', JSON.stringify(normalized));
    setUser(normalized);
    return normalized;
  };

  // Call after profile update to keep context and localStorage in sync
  const updateUser = useCallback((fields) => {
    setUser(prev => {
      const updated = { ...prev, ...fields };
      localStorage.setItem('ef_user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const isAdmin     = user?.role === 'admin';
  const isOrganizer = user?.role === 'organizer' || isAdmin;
  const isUser      = !!user;

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, updateUser, isAdmin, isOrganizer, isUser }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
