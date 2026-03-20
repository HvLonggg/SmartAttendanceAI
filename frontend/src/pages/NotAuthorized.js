import React from 'react';
import { Box, Typography, Button, Alert } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export default function NotAuthorized() {
  const navigate = useNavigate();
  return (
    <Box sx={{ p: 3 }}>
      <Alert severity="warning" sx={{ mb: 2 }}>
        Không đủ quyền truy cập.
      </Alert>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        403 - Forbidden
      </Typography>
      <Button variant="contained" onClick={() => navigate('/dashboard')} sx={{ mt: 1 }}>
        Về trang chính
      </Button>
    </Box>
  );
}

