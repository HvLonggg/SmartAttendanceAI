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
  Tooltip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { studentPortalAPI } from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { useI18n } from '../../i18n/I18nContext';

function CheckinButton({ row, onNavigate, t }) {
  const hasEligibility =
    row.phase_diem_danh !== undefined ||
    row.co_the_quet !== undefined ||
    row.da_diem_danh !== undefined;

  if (!hasEligibility) {
    return (
      <Button
        size="small"
        variant="contained"
        color="primary"
        startIcon={<CameraAltIcon />}
        onClick={() => onNavigate(row.ma_buoi)}
        sx={{ fontWeight: 800, textTransform: 'none', borderRadius: 2 }}
      >
        {t('studentSessionsPage.checkinGeneric')}
      </Button>
    );
  }

  const disabled = Boolean(row.da_diem_danh) || row.phase_diem_danh === 'het_han';
  const glow =
    row.co_the_quet && row.khoang_dung_gio && !row.da_diem_danh
      ? {
          boxShadow: '0 0 22px rgba(37, 99, 235, 0.55)',
          animation: 'sessGlow 2.2s ease-in-out infinite',
          '@keyframes sessGlow': {
            '0%, 100%': { boxShadow: '0 0 18px rgba(37, 99, 235, 0.45)' },
            '50%': { boxShadow: '0 0 34px rgba(59, 130, 246, 0.9)' },
          },
        }
      : {};

  let label = t('studentSessionsPage.checkinPrepare');
  let color = 'primary';
  let variant = 'outlined';

  if (row.da_diem_danh) {
    label = t('studentSessionsPage.checkinDone');
    color = 'success';
    variant = 'outlined';
  } else if (row.co_the_quet && row.khoang_dung_gio) {
    label = t('studentSessionsPage.checkinOnTime');
    color = 'primary';
    variant = 'contained';
  } else if (row.co_the_quet) {
    label = t('studentSessionsPage.checkinLate');
    color = 'warning';
    variant = 'contained';
  } else if (row.phase_diem_danh === 'chua_mo') {
    label = t('studentSessionsPage.checkinPrepare');
    variant = 'outlined';
  } else if (row.phase_diem_danh === 'het_han') {
    label = t('studentSessionsPage.checkinExpired');
    variant = 'outlined';
  }

  return (
    <Tooltip title={row.goi_y_diem_danh || ''} arrow placement="left">
      <span>
        <Button
          size="small"
          variant={variant}
          color={disabled ? undefined : color}
          disabled={disabled}
          startIcon={<CameraAltIcon />}
          onClick={() => onNavigate(row.ma_buoi)}
          sx={{
            fontWeight: 800,
            textTransform: 'none',
            borderRadius: 2,
            ...glow,
          }}
        >
          {label}
        </Button>
      </span>
    </Tooltip>
  );
}

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

  const goAttendance = (maBuoi) => {
    navigate(`/student/attendance?ma_buoi=${encodeURIComponent(maBuoi)}`);
  };

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
            sx={{
              background: 'linear-gradient(90deg,#4f46e5,#db2777)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
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
          <Button variant="outlined" onClick={() => setFilterDate('')}>
            {t('studentSessionsPage.viewAll')}
          </Button>
          <Button variant="contained" onClick={load}>
            {t('studentSessionsPage.refresh')}
          </Button>
        </Box>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer
          component={Paper}
          sx={{ borderRadius: 3, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}
        >
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'primary.main', '& th': { color: '#fff', fontWeight: 800 } }}>
                <TableCell>{t('studentSessionsPage.table.date')}</TableCell>
                <TableCell>{t('studentSessionsPage.table.time')}</TableCell>
                <TableCell>{t('studentSessionsPage.table.courseName')}</TableCell>
                <TableCell>{t('studentSessionsPage.table.lhpCode')}</TableCell>
                <TableCell>{t('studentSessionsPage.table.teacher')}</TableCell>
                <TableCell>{t('studentSessionsPage.table.sessionCode')}</TableCell>
                <TableCell align="right">{t('studentSessionsPage.table.checkin')}</TableCell>
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
                  <TableCell align="right">
                    <CheckinButton row={r} onNavigate={goAttendance} t={t} />
                  </TableCell>
                </TableRow>
              ))}
              {!displayRows.length && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
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
