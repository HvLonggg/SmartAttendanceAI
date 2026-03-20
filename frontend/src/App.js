import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';

import { AuthProvider } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';

// Layout
import MainLayout from './components/Layout/MainLayout';

// Pages
import Dashboard from './pages/Dashboard';
import EnhancedAttendanceCamera from './pages/EnhancedAttendanceCamera';
import StudentList from './pages/StudentList';
import StudentDetail from './pages/StudentDetail';
import StudentTraining from './pages/StudentTraining';
import SessionManagement from './pages/SessionManagement';
import AnalyticsReport from './pages/AnalyticsReport';
import SettingsPage from './pages/SettingsPage';
import NotAuthorized from './pages/NotAuthorized';
import AdminUserManagement from './pages/AdminUserManagement';
import StudentPortalHome from './pages/student/StudentPortalHome';
import StudentSessionsPage from './pages/student/StudentSessionsPage';
import StudentCoursesPage from './pages/student/StudentCoursesPage';
import StudentFeedbackPage from './pages/student/StudentFeedbackPage';
import StudentProfileRedirect from './pages/student/StudentProfileRedirect';

import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import VerifyOtpPage from './pages/auth/VerifyOtpPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordEmailPage from './pages/auth/ResetPasswordEmailPage';

const themeMode = (typeof window !== 'undefined' && localStorage.getItem('theme_mode')) || 'light';
const isDark = themeMode === 'dark';

const theme = createTheme({
  palette: {
    mode: themeMode,
    primary: {
      main: '#4f46e5',
      light: '#6366f1',
      dark: '#4338ca',
    },
    secondary: {
      main: '#9c27b0',
    },
    success: {
      main: '#2e7d32',
    },
    warning: {
      main: '#ed6c02',
    },
    error: {
      main: '#d32f2f',
    },
    background: {
      default: isDark ? '#0b1220' : '#f5f5f5',
      paper: isDark ? '#111827' : '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 11,
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 600,
    },
  },
  spacing: 6,
  shape: {
    borderRadius: 7,
  },
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
          '&:hover': {
            transform: 'translateY(-2px)',
          },
        },
        contained: {
          boxShadow: '0 4px 14px rgba(79,70,229,0.28)',
          '&:hover': {
            boxShadow: '0 8px 24px rgba(79,70,229,0.38)',
          },
        },
        outlined: {
          '&:hover': {
            boxShadow: '0 4px 16px rgba(99,102,241,0.12)',
            borderColor: '#6366f1',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        },
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
            bgcolor: 'rgba(99,102,241,0.1)',
            color: 'primary.main',
          },
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            <Routes>
              {/* Auth */}
              <Route path="/auth/login" element={<LoginPage />} />
              <Route path="/auth/register" element={<RegisterPage />} />
              <Route path="/auth/verify" element={<VerifyOtpPage />} />
              <Route path="/auth/forgot" element={<ForgotPasswordPage />} />
              <Route path="/auth/reset-password-email" element={<ResetPasswordEmailPage />} />

              {/* Main app */}
              <Route path="/" element={<MainLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />

                {/* Protected */}
                <Route element={<RequireAuth roles={['ADMIN', 'TEACHER', 'STUDENT']} />}>
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="attendance" element={<EnhancedAttendanceCamera />} />
                  <Route path="students/:maSV" element={<StudentDetail />} />
                  <Route path="students/:maSV/training" element={<StudentTraining />} />
                  <Route path="settings" element={<SettingsPage />} />

                  {/* Sinh viên — cổng riêng */}
                  <Route element={<RequireAuth roles={['STUDENT']} />}>
                    <Route path="student" element={<StudentPortalHome />} />
                    <Route path="student/sessions" element={<StudentSessionsPage />} />
                    <Route path="student/courses" element={<StudentCoursesPage />} />
                    <Route path="student/feedback" element={<StudentFeedbackPage />} />
                    <Route path="student/profile" element={<StudentProfileRedirect />} />
                  </Route>

                  {/* Teacher/Admin */}
                  <Route element={<RequireAuth roles={['TEACHER', 'ADMIN']} />}>
                    <Route path="students" element={<StudentList />} />
                    <Route path="sessions" element={<SessionManagement />} />
                  </Route>

                  {/* Admin/Teacher analytics */}
                  <Route element={<RequireAuth roles={['ADMIN', 'TEACHER']} />}>
                    <Route path="analytics" element={<AnalyticsReport />} />
                  </Route>

                  {/* Admin-only */}
                  <Route element={<RequireAuth roles={['ADMIN']} />}>
                    <Route path="admin/users" element={<AdminUserManagement />} />
                  </Route>

                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Route>
              </Route>

              <Route path="/not-authorized" element={<NotAuthorized />} />
            </Routes>
          </Box>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;