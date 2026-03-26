import React from 'react';
import { Box, Typography, Button, Alert } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nContext';

export default function NotAuthorized() {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <Box sx={{ p: 3, bgcolor: 'background.default', minHeight: '100vh' }}>
      <Alert severity="warning" sx={{ mb: 2 }}>
        {t('notAuthorized.message')}
      </Alert>
      <Typography variant="h5" fontWeight="bold" gutterBottom color="text.primary">
        {t('notAuthorized.title')}
      </Typography>
      <Button variant="contained" onClick={() => navigate('/dashboard')} sx={{ mt: 1 }}>
        {t('notAuthorized.back')}
      </Button>
    </Box>
  );
}
