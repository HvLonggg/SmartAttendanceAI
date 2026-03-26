import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  TextField,
  Button,
  Chip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { studentPortalAPI } from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { useI18n } from '../../i18n/I18nContext';

export default function StudentSessionsPage({ compact = false, maxItems = null }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterDate, setFilterDate] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await studentPortalAPI.getMySessions();
      setRows(data || []);
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail, t('studentSessionsPage.loadFail')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = filterDate
    ? rows.filter((r) => (r.ngay_hoc || '').slice(0, 10) === filterDate)
    : rows;
  const displayRows = maxItems ? filtered.slice(0, maxItems) : filtered;

  return (
    <Box>
      {!compact && (
        <>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/student')} sx={{ mb: 2 }}>
            {t('studentSessionsPage.back')}
          </Button>
          <Typography
            variant="h4"
            fontWeight={900}
            gutterBottom
            sx={{ background: 'linear-gradient(90deg,#4f46e5,#db2777)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            {t('studentSessionsPage.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('studentSessionsPage.subtitle')}
          </Typography>
        </>
      )}

      <Card sx={{ p: 2, mb: 2, borderRadius: 3, boxShadow: '0 8px 32px rgba(99,102,241,0.12)' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <TextField
            label={t('studentSessionsPage.filterLabel')}
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            sx={{ minWidth: 200 }}
          />
          <Button variant="outlined" onClick={() => setFilterDate('')}>{t('studentSessionsPage.viewAll')}</Button>
          <Button variant="contained" onClick={load}>{t('studentSessionsPage.refresh')}</Button>
        </Box>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 3, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'primary.main', '& th': { color: '#fff', fontWeight: 800 } }}>
                <TableCell>{t('studentSessionsPage.table.date')}</TableCell>
                <TableCell>{t('studentSessionsPage.table.time')}</TableCell>
                <TableCell>{t('studentSessionsPage.table.courseName')}</TableCell>
                <TableCell>{t('studentSessionsPage.table.lhpCode')}</TableCell>
                <TableCell>{t('studentSessionsPage.table.teacher')}</TableCell>
                <TableCell>{t('studentSessionsPage.table.sessionCode')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayRows.map((r) => (
                <TableRow key={r.ma_buoi} hover sx={{ '&:nth-of-type(odd)': { bgcolor: 'action.hover' } }}>
                  <TableCell>{r.ngay_hoc}</TableCell>
                  <TableCell>{r.gio_bat_dau}</TableCell>
                  <TableCell>
                    <Typography fontWeight={700}>{r.ten_mon}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={r.ma_lhp} size="small" color="primary" variant="outlined" />
                  </TableCell>
                  <TableCell>{r.giang_vien}</TableCell>
                  <TableCell>{r.ma_buoi}</TableCell>
                </TableRow>
              ))}
              {!displayRows.length && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography color="text.secondary" sx={{ py: 3 }}>
                      {t('studentSessionsPage.empty')}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
