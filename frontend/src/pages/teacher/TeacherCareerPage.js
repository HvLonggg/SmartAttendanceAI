import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Stack,
} from '@mui/material';
import WorkHistoryIcon from '@mui/icons-material/WorkHistory';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import SchoolIcon from '@mui/icons-material/School';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import { format, parseISO } from 'date-fns';
import { vi, enUS } from 'date-fns/locale';
import { teacherAPI } from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { useI18n } from '../../i18n/I18nContext';

function parseServerDate(iso) {
  if (iso == null || iso === '') return null;
  const s = String(iso).trim();
  let d = parseISO(s);
  if (Number.isNaN(d.getTime())) d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function TeacherCareerPage() {
  const { t, locale } = useI18n();
  const dateLocale = locale === 'en' ? enUS : vi;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const fmtDateTime = useCallback(
    (iso) => {
      const d = parseServerDate(iso);
      if (!d) return iso == null || iso === '' ? t('common.none') : String(iso);
      return format(d, locale === 'en' ? 'PPp' : 'dd/MM/yyyy HH:mm', { locale: dateLocale });
    },
    [locale, dateLocale, t]
  );

  const fmtDateOnly = useCallback(
    (iso) => {
      const d = parseServerDate(iso);
      if (!d) return iso == null || iso === '' ? t('common.none') : String(iso).slice(0, 16);
      return format(d, locale === 'en' ? 'PP' : 'dd/MM/yyyy', { locale: dateLocale });
    },
    [locale, dateLocale, t]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await teacherAPI.getCareerHistory();
      setData(res.data);
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail, t('teacherCareer.loadError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ maxWidth: 720 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  const rows = data?.lop_hoc_phan || [];

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
        <WorkHistoryIcon sx={{ fontSize: 36, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" fontWeight={900} sx={{ color: 'primary.main' }}>
            {t('teacherCareer.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('teacherCareer.subtitle')}
          </Typography>
        </Box>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <CalendarMonthIcon color="primary" />
                <Typography variant="subtitle2" color="text.secondary" fontWeight={700}>
                  {t('teacherCareer.regDate')}
                </Typography>
              </Stack>
              <Typography variant="h6" fontWeight={800}>
                {fmtDateTime(data?.ngay_dang_ky_tai_khoan)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <EventAvailableIcon color="primary" />
                <Typography variant="subtitle2" color="text.secondary" fontWeight={700}>
                  {t('teacherCareer.profileStart')}
                </Typography>
              </Stack>
              <Typography variant="h6" fontWeight={800}>
                {fmtDateTime(data?.ngay_ho_so_giang_vien)}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                {t('teacherCareer.refDate')}: {fmtDateOnly(data?.ngay_bat_dau_cong_tac)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <SchoolIcon color="primary" />
                <Typography variant="subtitle2" color="text.secondary" fontWeight={700}>
                  {t('teacherCareer.faculty')}
                </Typography>
              </Stack>
              <Typography variant="h6" fontWeight={800}>
                {data?.ten_khoa || t('common.none')}
              </Typography>
              <Chip size="small" label={data?.ma_khoa || t('common.none')} variant="outlined" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={4}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              Tổng lớp học phần
            </Typography>
            <Typography variant="h5" fontWeight={900} color="primary.main">
              {data?.tong_lop ?? 0}
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={4}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              {t('teacherCareer.totalSessions')}
            </Typography>
            <Typography variant="h5" fontWeight={900} color="primary.main">
              {data?.tong_buoi_da_tao ?? 0}
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={700} display="block">
              {t('teacherCareer.teacher')}
            </Typography>
            <Typography variant="body1" fontWeight={800}>
              {data?.ho_ten || t('common.none')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('teacherCareer.maGv')}: {data?.ma_gv || t('common.none')}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Card sx={{ borderRadius: 2,
        boxShadow: '0 4px 24px rgba(37,99,235,0.08)',
      }}>
        <CardContent>
          <Typography variant="h6" fontWeight={800} gutterBottom>
            {t('teacherCareer.assignedCourses')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('teacherCareer.assignedHint')}
          </Typography>

          {rows.length === 0 ? (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              {t('teacherCareer.empty')}
            </Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell sx={{ fontWeight: 800 }}>{t('teacherCareer.colCode')}</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>{t('teacherCareer.colCourse')}</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>{t('teacherCareer.colSubject')}</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>{t('teacherCareer.colFaculty')}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>
                      {t('teacherCareer.colSessions')}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.ma_lhp} hover>
                      <TableCell>{r.ma_lhp}</TableCell>
                      <TableCell>{r.ten_mon}</TableCell>
                      <TableCell>{r.ma_mon || t('common.none')}</TableCell>
                      <TableCell>{r.ten_khoa || r.ma_khoa || t('common.none')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {r.so_buoi_da_tao ?? 0}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
