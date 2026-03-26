import React from 'react';
import { Box, Typography } from '@mui/material';
import StudentAttendanceTab from './StudentAttendanceTab';
import { useI18n } from '../../i18n/I18nContext';

export default function StudentAttendancePage() {
  const { t } = useI18n();
  return (
    <Box>
      <Typography variant="h4" fontWeight={900} gutterBottom sx={{ background: 'linear-gradient(90deg,#0ea5e9,#6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        {t('studentAttendancePage.title')}
      </Typography>
      <StudentAttendanceTab />
    </Box>
  );
}

