import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Box, CircularProgress, Alert } from '@mui/material';

export default function RequireAuth({ roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">Không đủ quyền để truy cập.</Alert>
      </Box>
    );
  }

  return <Outlet />;
}

