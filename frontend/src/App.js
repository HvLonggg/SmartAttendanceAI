import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';

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

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
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
      default: '#f5f5f5',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
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
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
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
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="attendance" element={<EnhancedAttendanceCamera />} />
              <Route path="students" element={<StudentList />} />
              <Route path="students/:maSV" element={<StudentDetail />} />
              <Route path="students/:maSV/training" element={<StudentTraining />} />
              <Route path="sessions" element={<SessionManagement />} />
              <Route path="analytics" element={<AnalyticsReport />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </Box>
      </Router>
    </ThemeProvider>
  );
}

export default App;