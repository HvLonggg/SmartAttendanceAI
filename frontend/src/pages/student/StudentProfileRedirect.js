import React from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '../../auth/AuthContext';

export default function StudentProfileRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  const ma = user?.ma_sv;
  if (!ma) {
    return <Navigate to="/student" replace />;
  }
  return <Navigate to={`/students/${encodeURIComponent(ma)}`} replace />;
}
