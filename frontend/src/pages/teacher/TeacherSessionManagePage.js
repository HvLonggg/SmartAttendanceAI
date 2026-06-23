import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import RefreshIcon from '@mui/icons-material/Refresh';
import { attendanceAPI, teacherAttendanceAPI } from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { getStudentAvatarSrc } from '../../utils/studentAvatar';
import { useI18n } from '../../i18n/I18nContext';

export default function TeacherSessionManagePage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const [expandedSession, setExpandedSession] = useState(null);
  const [sessionRowsMap, setSessionRowsMap] = useState({});
  const [sessionLoadingMap, setSessionLoadingMap] = useState({});
  const [sessionSavingMap, setSessionSavingMap] = useState({});
  const [avatarTick, setAvatarTick] = useState(0);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureTitle, setCaptureTitle] = useState('');
  const [captureSrc, setCaptureSrc] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await teacherAttendanceAPI.getSessions();
      setSessions(data || []);
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail, t('teacherSessionManagePage.loadFail')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fromUrl = searchParams.get('ma_buoi');
    if (!fromUrl || !sessions.length) return;
    const hit = sessions.find((s) => String(s.ma_buoi) === String(fromUrl));
    if (!hit) return;
    const key = String(hit.ma_buoi);
    setExpandedSession(key);
    loadSessionStudents(hit);
    const next = new URLSearchParams(searchParams);
    next.delete('ma_buoi');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, searchParams, setSearchParams]);

  const loadSessionStudents = async (session) => {
    const key = String(session.ma_buoi);
    setSessionLoadingMap((prev) => ({ ...prev, [key]: true }));
    setError(null);
    try {
      const { data } = await teacherAttendanceAPI.getSessionAttendanceList(session.ma_buoi);
      const rows = (data?.students || []).map((s) => ({
        ...s,
        trang_thai_manual: s.trang_thai || 'Vắng',
        ly_do_manual: s.ly_do_thu_cong || '',
      }));
      setSessionRowsMap((prev) => ({ ...prev, [key]: rows }));
      setAvatarTick((v) => v + 1);
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail, t('teacherSessionsPage.manualLoadFail')));
    } finally {
      setSessionLoadingMap((prev) => ({ ...prev, [key]: false }));
    }
  };

  const onExpandSession = async (session, isExpanded) => {
    const key = String(session.ma_buoi);
    setExpandedSession(isExpanded ? key : null);
    if (isExpanded) await loadSessionStudents(session);
  };

  const setManualStatus = (maBuoi, maSv, val) => {
    const key = String(maBuoi);
    setSessionRowsMap((prev) => ({
      ...prev,
      [key]: (prev[key] || []).map((r) =>
        String(r.ma_sv) === String(maSv) ? { ...r, trang_thai_manual: val } : r
      ),
    }));
  };

  const setManualReason = (maBuoi, maSv, val) => {
    const key = String(maBuoi);
    setSessionRowsMap((prev) => ({
      ...prev,
      [key]: (prev[key] || []).map((r) =>
        String(r.ma_sv) === String(maSv) ? { ...r, ly_do_manual: val } : r
      ),
    }));
  };

  const saveManual = async (session) => {
    const key = String(session.ma_buoi);
    const rows = sessionRowsMap[key] || [];
    if (!rows.length) return;
    setSessionSavingMap((prev) => ({ ...prev, [key]: true }));
    setError(null);
    try {
      const items = rows.map((r) => ({
        ma_sv: r.ma_sv,
        trang_thai: r.trang_thai_manual || 'Vắng',
        ly_do: (r.ly_do_manual || '').trim() || null,
      }));
      await teacherAttendanceAPI.saveManualAttendance(session.ma_buoi, items);
      setOk(t('teacherSessionsPage.manualSaveOk'));
      setSessionRowsMap((prev) => ({ ...prev, [key]: null }));
      await loadSessionStudents(session);
      await load();
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail, t('teacherSessionsPage.manualSaveFail')));
    } finally {
      setSessionSavingMap((prev) => ({ ...prev, [key]: false }));
    }
  };

  const attendanceStatusChip = (status) => {
    if (status === 'Đúng giờ') return <Chip label={status} color="success" size="small" />;
    if (status === 'Trễ') return <Chip label={status} color="warning" size="small" />;
    if (status === 'Có mặt') return <Chip label={status} color="primary" size="small" />;
    return <Chip label={status || 'Vắng'} size="small" />;
  };

  const sessionStats = useMemo(() => {
    const out = {};
    Object.keys(sessionRowsMap).forEach((key) => {
      const rows = sessionRowsMap[key] || [];
      const present = rows.filter((r) => ['Đúng giờ', 'Trễ', 'Có mặt'].includes(r.trang_thai || '')).length;
      const late = rows.filter((r) => r.trang_thai === 'Trễ').length;
      const absent = rows.length - present;
      out[key] = { total: rows.length, present, late, absent };
    });
    return out;
  }, [sessionRowsMap]);

  const handleViewCapture = async (maDiemDanh, title) => {
    try {
      const res = await attendanceAPI.getCaptureBlob(maDiemDanh);
      const blobUrl = URL.createObjectURL(res.data);
      setCaptureSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return blobUrl;
      });
      setCaptureTitle(title);
      setCaptureOpen(true);
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail, t('teacherSessionManagePage.captureLoadFail')));
    }
  };

  const getSessionStudentAvatarSrc = (row) => {
    const cacheKey = `${row?.anh_dai_dien || ''}-${row?.ma_sv || ''}-${avatarTick}`;
    // Ưu tiên src từ object (khi có cờ ảnh), fallback theo ma_sv để luôn đồng bộ từ endpoint avatar.
    return getStudentAvatarSrc(row, cacheKey) || getStudentAvatarSrc(row?.ma_sv, cacheKey);
  };

  const renderSessionDetails = (session) => {
    const key = String(session.ma_buoi);
    const rows = sessionRowsMap[key] || [];
    const loadingRows = Boolean(sessionLoadingMap[key]);
    const savingRows = Boolean(sessionSavingMap[key]);
    return (
      <AccordionDetails sx={{ pt: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>
          {t('teacherSessionManagePage.detailsHint')}
        </Typography>
        {loadingRows ? (
          <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 1080 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('teacherSessionsPage.manualTable.student')}</TableCell>
                  <TableCell>{t('teacherSessionsPage.manualTable.class')}</TableCell>
                  <TableCell>{t('teacherSessionsPage.manualTable.current')}</TableCell>
                  <TableCell>{t('teacherSessionManagePage.manualTable.source')}</TableCell>
                  <TableCell>{t('teacherSessionManagePage.manualTable.scanTime')}</TableCell>
                  <TableCell>{t('teacherSessionManagePage.manualTable.capture')}</TableCell>
                  <TableCell>{t('teacherSessionsPage.manualTable.manual')}</TableCell>
                  <TableCell>{t('teacherSessionsPage.manualTable.reason')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${key}-${r.ma_sv}`} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar
                          src={getSessionStudentAvatarSrc(r) || undefined}
                          sx={{ width: 34, height: 34, fontSize: 14 }}
                        >
                          {(!r.anh_dai_dien && r.ho_ten?.charAt(0)) || ''}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={700}>{r.ho_ten}</Typography>
                          <Typography variant="caption" color="text.secondary">{r.ma_sv}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>{r.lop || '—'}</TableCell>
                    <TableCell>{attendanceStatusChip(r.trang_thai)}</TableCell>
                    <TableCell>{r.nguon_quet || '—'}</TableCell>
                    <TableCell>{r.thoi_gian_quet ? new Date(r.thoi_gian_quet).toLocaleString() : '—'}</TableCell>
                    <TableCell>
                      {r.ma_diem_danh ? (
                        <Tooltip title={t('teacherSessionManagePage.viewCapture')}>
                          <IconButton
                            size="small"
                            color="secondary"
                            onClick={() => handleViewCapture(r.ma_diem_danh, `${r.ho_ten} • #${session.ma_buoi}`)}
                            sx={{
                              bgcolor: r.co_anh ? 'rgba(236,72,153,0.12)' : 'rgba(99,102,241,0.10)',
                              color: r.co_anh ? 'secondary.main' : 'primary.main',
                              '&:hover': { bgcolor: r.co_anh ? 'rgba(236,72,153,0.22)' : 'rgba(99,102,241,0.18)' },
                            }}
                          >
                            <PhotoCameraIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title={t('teacherSessionManagePage.noCapture')}>
                          <span>
                            <IconButton
                              size="small"
                              disabled
                              sx={{
                                bgcolor: 'rgba(148,163,184,0.12)',
                                color: 'text.disabled',
                              }}
                            >
                              <PhotoCameraIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        value={r.trang_thai_manual || 'Vắng'}
                        onChange={(e) => setManualStatus(session.ma_buoi, r.ma_sv, e.target.value)}
                        sx={{ minWidth: 140 }}
                      >
                        <MenuItem value="Vắng">{t('teacherSessionsPage.manualStatus.absent')}</MenuItem>
                        <MenuItem value="Đúng giờ">{t('teacherSessionsPage.manualStatus.onTime')}</MenuItem>
                        <MenuItem value="Trễ">{t('teacherSessionsPage.manualStatus.late')}</MenuItem>
                        <MenuItem value="Có mặt">{t('teacherSessionsPage.manualStatus.present')}</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell sx={{ minWidth: 280 }}>
                      <TextField
                        fullWidth
                        size="small"
                        value={r.ly_do_manual || ''}
                        onChange={(e) => setManualReason(session.ma_buoi, r.ma_sv, e.target.value)}
                        placeholder={t('teacherSessionsPage.manualReasonPlaceholder')}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow>
                    <TableCell colSpan={8} align="center">{t('teacherSessionsPage.manualEmpty')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        )}

        {!loadingRows && (
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" disabled={savingRows} onClick={() => saveManual(session)}>
              {savingRows ? t('teacherSessionsPage.saving') : t('teacherSessionsPage.manualSave')}
            </Button>
          </Box>
        )}
      </AccordionDetails>
    );
  };

  return (
    <Box>
      <Card
        sx={{
          mb: 2,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          background: 'linear-gradient(120deg, rgba(37,99,235,0.10), rgba(124,58,237,0.10))',
        }}
      >
        <CardContent sx={{ py: 2 }}>
          <Typography variant="h4" fontWeight={900} gutterBottom sx={{ color: 'primary.main', mb: 0.5 }}>
            {t('teacherSessionManagePage.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('teacherSessionManagePage.subtitle')}
          </Typography>
        </CardContent>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {ok && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setOk(null)}>
          {ok}
        </Alert>
      )}

      <Card variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography fontWeight={800}>{t('teacherSessionManagePage.sessionList')}</Typography>
            <Button startIcon={<RefreshIcon />} size="small" onClick={load}>
              {t('teacherSessionsPage.refresh')}
            </Button>
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box>
              {!sessions.length && (
                <Typography color="text.secondary" sx={{ py: 3 }}>
                  {t('teacherSessionsPage.table.empty')}
                </Typography>
              )}
              {sessions.map((s) => {
                const key = String(s.ma_buoi);
                const st = sessionStats[key] || {
                  total: Number(s.so_sv_dang_ky || 0),
                  present: Number(s.so_luot_diem_danh || 0),
                  late: 0,
                  absent: Math.max(0, Number(s.so_sv_dang_ky || 0) - Number(s.so_luot_diem_danh || 0)),
                };
                return (
                  <Accordion
                    key={s.ma_buoi}
                    expanded={expandedSession === key}
                    onChange={(_, ex) => onExpandSession(s, ex)}
                    disableGutters
                    sx={{
                      mb: 1.25,
                      '&:before': { display: 'none' },
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2,
                      overflow: 'hidden',
                      boxShadow:
                        expandedSession === key
                          ? '0 8px 20px rgba(99,102,241,0.12)'
                          : '0 2px 8px rgba(0,0,0,0.04)',
                      transition: 'box-shadow 0.2s ease',
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<ExpandMoreIcon />}
                      sx={{ bgcolor: expandedSession === key ? 'rgba(99,102,241,0.05)' : 'transparent' }}
                    >
                      <Box sx={{ width: '100%', pr: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                          <Typography fontWeight={800}>
                            #{s.ma_buoi} • {s.ten_mon}{' '}
                            <Typography component="span" variant="body2" color="text.secondary">
                              ({s.ma_lhp})
                            </Typography>
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                            <Chip size="small" label={`${t('teacherSessionManagePage.chips.total')}: ${st.total}`} />
                            <Chip size="small" color="success" label={`${t('teacherSessionManagePage.chips.present')}: ${st.present}`} />
                            <Chip size="small" color="warning" label={`${t('teacherSessionManagePage.chips.late')}: ${st.late}`} />
                            <Chip size="small" label={`${t('teacherSessionManagePage.chips.absent')}: ${st.absent}`} />
                          </Box>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {t('teacherSessionManagePage.sessionWhen', {
                            date: (s.ngay_hoc || '').slice(0, 10) || '—',
                            time: (s.gio_bat_dau || '').slice(0, 8) || '—',
                          })}
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    {renderSessionDetails(s)}
                  </Accordion>
                );
              })}
            </Box>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={captureOpen}
        onClose={() => {
          setCaptureOpen(false);
          if (captureSrc) {
            URL.revokeObjectURL(captureSrc);
            setCaptureSrc('');
          }
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{captureTitle || t('teacherSessionManagePage.captureTitle')}</DialogTitle>
        <DialogContent>
          {captureSrc ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 1 }}>
              <img src={captureSrc} alt={captureTitle || 'capture'} style={{ maxWidth: '100%', borderRadius: 8 }} />
            </Box>
          ) : (
            <Typography color="text.secondary">{t('teacherSessionManagePage.noCapture')}</Typography>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
