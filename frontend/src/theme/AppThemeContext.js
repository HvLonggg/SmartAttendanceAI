import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import { createAppTheme } from './createAppTheme';

const LEGACY_THEME_KEY = 'theme_mode';

function themeStorageKey(username) {
  if (!username) return null;
  return `app_theme_${String(username).toLowerCase().replace(/[^a-z0-9]/gi, '_')}`;
}

const ThemeModeContext = createContext(null);

export function AppThemeProvider({ children }) {
  const { user } = useAuth();
  const [mode, setModeState] = useState('light');

  useEffect(() => {
    if (!user?.username) {
      setModeState('light');
      return;
    }
    const k = themeStorageKey(user.username);
    if (!k) {
      setModeState('light');
      return;
    }
    try {
      let v = localStorage.getItem(k);
      if (v == null || v === '') {
        v = localStorage.getItem(LEGACY_THEME_KEY);
        if (v) {
          localStorage.setItem(k, v === 'dark' ? 'dark' : 'light');
        }
      }
      setModeState(v === 'dark' ? 'dark' : 'light');
    } catch {
      setModeState('light');
    }
  }, [user?.username]);

  const setMode = useCallback(
    (next) => {
      const m = next === 'dark' ? 'dark' : 'light';
      if (user?.username) {
        const k = themeStorageKey(user.username);
        if (k) {
          try {
            localStorage.setItem(k, m);
            localStorage.setItem(LEGACY_THEME_KEY, m);
          } catch {
            // ignore
          }
        }
      }
      setModeState(m);
    },
    [user?.username]
  );

  const effectiveMode = user?.username ? mode : 'light';
  const theme = useMemo(() => createAppTheme(effectiveMode), [effectiveMode]);

  return (
    <ThemeModeContext.Provider value={{ mode: effectiveMode, setMode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within AppThemeProvider');
  return ctx;
}
