import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
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
  /** Tăng sau login / refreshUser để tải lại ảnh auth (blob) khi đổi file (cùng tên file vẫn bust cache). */
  const [avatarNonce, setAvatarNonce] = useState(0);
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
    try {
      localStorage.setItem(TOKEN_KEY, nextToken);
    } catch {
      // ignore
    }
    const me = await fetchMe(nextToken);
    // Gộp token + user trong một commit để sau navigate() không bị RequireAuth thấy user=null
    flushSync(() => {
      setToken(nextToken);
      setUser(me);
      setAvatarNonce((n) => n + 1);
    });
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

  const refreshUser = async () => {
    try {
      if (!token) return null;
      const me = await fetchMe();
      setUser(me);
      setAvatarNonce((n) => n + 1);
      return me;
    } catch {
      return null;
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, logout, refresh: fetchMe, refreshUser, avatarNonce }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

