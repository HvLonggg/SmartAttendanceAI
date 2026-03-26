import { useState, useEffect, useRef } from 'react';
import { getApiPathPrefix } from '../config/apiBase';

/**
 * Ảnh GET /auth/avatar/{username} yêu cầu JWT; dùng fetch + blob URL.
 * `avatarFileName`: giá trị user.avatar từ /auth/me — khi null/rỗng thì không fetch.
 * `avatarNonce`: tăng sau refreshUser để tải lại file khi ghi đè cùng tên.
 */
export function useAuthAvatarObjectUrl(username, avatarFileName, avatarNonce = 0) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const blobUrlRef = useRef(null);

  const hasFile = Boolean(
    username && avatarFileName != null && String(avatarFileName).trim() !== ''
  );

  useEffect(() => {
    const revoke = () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };

    revoke();
    setObjectUrl(null);

    if (!hasFile) {
      setLoading(false);
      return () => revoke();
    }

    let cancelled = false;
    setLoading(true);

    const prefix = getApiPathPrefix();
    const sig = encodeURIComponent(String(avatarFileName).trim());
    const path = `${prefix}/auth/avatar/${encodeURIComponent(username)}?v=${avatarNonce}&s=${sig}`;

    (async () => {
      try {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
        const res = await fetch(path, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        const u = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        blobUrlRef.current = u;
        setObjectUrl(u);
      } catch {
        if (!cancelled) setObjectUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      revoke();
    };
  }, [username, hasFile, avatarFileName, avatarNonce]);

  return { objectUrl, loading };
}

/** Chữ cái đầu ưu tiên họ tên (giảng viên / tài khoản). */
export function getAccountInitialLetter(hoTen, username) {
  const t = (hoTen && String(hoTen).trim()) || (username && String(username).trim()) || '';
  return t ? t.charAt(0).toUpperCase() : '?';
}
