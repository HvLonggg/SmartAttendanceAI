import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

const TOKEN_KEY = 'auth_token';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const apiReady = useMemo(() => true, []);

  const fetchMe = async (t) => {
    const res = await authAPI.me();
    return res.data;
  };

  const logout = () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
    setToken(null);
    setUser(null);
  };

  const login = async (payload) => {
    const res = await authAPI.login(payload);
    const nextToken = res.data.token;
    setToken(nextToken);
    try {
      localStorage.setItem(TOKEN_KEY, nextToken);
    } catch {
      // ignore
    }
    const me = await fetchMe(nextToken);
    setUser(me);
    return me;
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        if (!token) {
          setUser(null);
          setLoading(false);
          return;
        }
        const me = await fetchMe(token);
        if (!mounted) return;
        setUser(me);
      } catch (e) {
        // token hết hạn hoặc không hợp lệ
        logout();
      } finally {
        if (mounted) setLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiReady, token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refresh: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

