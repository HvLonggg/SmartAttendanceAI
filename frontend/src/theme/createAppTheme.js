import { createTheme } from '@mui/material/styles';

/**
 * Theme sáng/tối — chữ và nền tương phản; component defaults theo palette.mode.
 */
export function createAppTheme(mode) {
  const isDark = mode === 'dark';

  return createTheme({
    palette: {
      mode,
      primary: {
        main: isDark ? '#818cf8' : '#4f46e5',
        light: isDark ? '#a5b4fc' : '#6366f1',
        dark: isDark ? '#6366f1' : '#4338ca',
      },
      secondary: {
        main: '#9c27b0',
      },
      success: { main: isDark ? '#4ade80' : '#2e7d32' },
      warning: { main: isDark ? '#fbbf24' : '#ed6c02' },
      error: { main: isDark ? '#f87171' : '#d32f2f' },
      background: {
        default: isDark ? '#0b1220' : '#f5f5f5',
        paper: isDark ? '#111827' : '#ffffff',
      },
      text: {
        primary: isDark ? '#f1f5f9' : 'rgba(0, 0, 0, 0.87)',
        secondary: isDark ? '#94a3b8' : 'rgba(0, 0, 0, 0.6)',
        disabled: isDark ? 'rgba(148,163,184,0.45)' : 'rgba(0, 0, 0, 0.38)',
      },
      divider: isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(0, 0, 0, 0.12)',
      action: {
        active: isDark ? '#e2e8f0' : 'rgba(0, 0, 0, 0.54)',
        hover: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(0, 0, 0, 0.04)',
      },
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      fontSize: 11,
      h4: { fontWeight: 600 },
      h5: { fontWeight: 600 },
      h6: { fontWeight: 600 },
    },
    spacing: 6,
    shape: { borderRadius: 7 },
    components: {
      MuiButton: {
        defaultProps: { size: 'small' },
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            paddingLeft: 12,
            paddingRight: 12,
            borderRadius: 10,
            transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': { transform: 'translateY(-2px)' },
          },
          contained: {
            boxShadow: isDark ? '0 4px 14px rgba(129,140,248,0.35)' : '0 4px 14px rgba(79,70,229,0.28)',
            '&:hover': {
              boxShadow: isDark ? '0 8px 24px rgba(129,140,248,0.45)' : '0 8px 24px rgba(79,70,229,0.38)',
            },
          },
          outlined: {
            '&:hover': {
              boxShadow: isDark ? '0 4px 16px rgba(129,140,248,0.2)' : '0 4px 16px rgba(99,102,241,0.12)',
              borderColor: isDark ? '#a5b4fc' : '#6366f1',
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: ({ theme }) => ({
            boxShadow:
              theme.palette.mode === 'dark'
                ? '0 2px 12px rgba(0,0,0,0.45)'
                : '0 2px 8px rgba(0,0,0,0.1)',
            border: theme.palette.mode === 'dark' ? '1px solid rgba(148,163,184,0.12)' : undefined,
          }),
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { paddingTop: 6, paddingBottom: 6, paddingLeft: 10, paddingRight: 10 },
        },
      },
      MuiTextField: {
        defaultProps: { size: 'small', margin: 'dense' },
      },
      MuiFormControl: {
        defaultProps: { margin: 'dense', size: 'small' },
      },
      MuiChip: {
        defaultProps: { size: 'small' },
      },
      MuiIconButton: {
        defaultProps: { size: 'small' },
        styleOverrides: {
          root: {
            transition: 'all 0.2s ease',
            '&:hover': {
              transform: 'translateY(-2px) scale(1.05)',
              bgcolor: isDark ? 'rgba(129,140,248,0.15)' : 'rgba(99,102,241,0.1)',
              color: 'primary.main',
            },
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: ({ theme }) =>
            theme.palette.mode === 'dark'
              ? { backgroundColor: theme.palette.background.paper, border: '1px solid rgba(148,163,184,0.15)' }
              : {},
        },
      },
    },
  });
}
