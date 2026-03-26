import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { translations } from './translations';

function getNested(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

export function normalizeLangInput(raw) {
  if (raw == null || raw === '') return 'vi';
  const s = String(raw).toUpperCase();
  if (s === 'ENG' || s === 'EN' || s === 'ENGLISH') return 'en';
  return 'vi';
}

export function langStorageKey(username) {
  if (!username) return null;
  return `app_lang_${String(username).toLowerCase().replace(/[^a-z0-9]/gi, '_')}`;
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const { user } = useAuth();
  const [locale, setLocaleState] = useState('vi');

  useEffect(() => {
    if (!user?.username) {
      setLocaleState('vi');
      return;
    }
    const k = langStorageKey(user.username);
    if (!k) return;
    try {
      const stored = localStorage.getItem(k);
      setLocaleState(normalizeLangInput(stored || 'VIE'));
    } catch {
      setLocaleState('vi');
    }
  }, [user?.username]);

  const setLocale = useCallback(
    (lang) => {
      const normalized = normalizeLangInput(lang);
      setLocaleState(normalized);
      if (user?.username) {
        const k = langStorageKey(user.username);
        if (k) {
          try {
            localStorage.setItem(k, normalized === 'en' ? 'ENG' : 'VIE');
          } catch {
            // ignore
          }
        }
      }
    },
    [user?.username]
  );

  const effectiveLocale = user ? locale : 'vi';

  const t = useCallback(
    (key, vars) => {
      const pack = translations[effectiveLocale] || translations.vi;
      let str = getNested(pack, key);
      if (str === undefined && effectiveLocale !== 'vi') {
        str = getNested(translations.vi, key);
      }
      let out = str !== undefined && str !== null ? str : key;
      // Optional string interpolation: replace `{name}` with vars.name
      if (out && typeof out === 'string' && vars && typeof vars === 'object') {
        for (const [k, v] of Object.entries(vars)) {
          out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return out;
    },
    [effectiveLocale]
  );

  const value = useMemo(
    () => ({
      t,
      locale: effectiveLocale,
      setLocale,
      /** Select value VIE | ENG cho UI cài đặt */
      localeSelectValue: effectiveLocale === 'en' ? 'ENG' : 'VIE',
    }),
    [t, effectiveLocale, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
