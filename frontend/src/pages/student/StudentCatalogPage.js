import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
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
  Chip,
  InputAdornment,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { studentPortalAPI } from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { useI18n } from '../../i18n/I18nContext';

export default function StudentCatalogPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await studentPortalAPI.listOpenClasses();
      setRows(data || []);
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail, t('studentCatalogPage.loadFail')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        String(r.ma_lhp || '')
          .toLowerCase()
          .includes(s) ||
        String(r.ten_mon || '')
          .toLowerCase()
          .includes(s) ||
        String(r.ma_mon || '')
          .toLowerCase()
          .includes(s) ||
        String(r.giang_vien || '')
          .toLowerCase()
          .includes(s)
    );
  }, [rows, q]);

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/student')} sx={{ mb: 2 }}>
        {t('studentCatalogPage.back')}
      </Button>
      <Typography
        variant="h4"
        fontWeight={900}
        gutterBottom
        sx={{
          background: 'linear-gradient(90deg,#4f46e5,#7c3aed)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {t('studentCatalogPage.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('studentCatalogPage.subtitle')}
      </Typography>

      <Card sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder={t('studentCatalogPage.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ fontWeight: 800 }}>{t('studentCatalogPage.colCode')}</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>{t('studentCatalogPage.colCourse')}</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>{t('studentCatalogPage.colTeacher')}</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>{t('studentCatalogPage.colStatus')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800 }}>
                  {t('studentCatalogPage.colAction')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.ma_lhp} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {r.ma_lhp}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {r.ma_mon}
                    </Typography>
                  </TableCell>
                  <TableCell>{r.ten_mon}</TableCell>
                  <TableCell>{r.giang_vien}</TableCell>
                  <TableCell>
                    {r.du_dieu_kien_dang_ky ? (
                      <Chip size="small" color="success" label={t('studentCatalogPage.statusOpen')} />
                    ) : (
                      <Chip size="small" color="warning" label={t('studentCatalogPage.statusWait')} />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      endIcon={<ChevronRightIcon />}
                      onClick={() =>
                        navigate(`/student/catalog/${encodeURIComponent(String(r.ma_lhp || '').trim())}`)
                      }
                    >
                      {t('studentCatalogPage.viewDetail')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Alert severity="info">{t('studentCatalogPage.empty')}</Alert>
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
