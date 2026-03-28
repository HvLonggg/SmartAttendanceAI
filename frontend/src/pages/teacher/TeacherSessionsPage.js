import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  TextField,
  Button,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import { teacherAPI } from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { isSessionScanCodeValid } from '../../utils/sessionScanCode';
import { useI18n } from '../../i18n/I18nContext';

export default function TeacherSessionsPage() {
  const [classes, setClasses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);

  const [maLhp, setMaLhp] = useState('');
  const [ngayHoc, setNgayHoc] = useState('');
  const [gioBatDau, setGioBatDau] = useState('07:00');
  const [maXacThuc, setMaXacThuc] = useState('');
  const [phutDung, setPhutDung] = useState(15);
  const [phutMax, setPhutMax] = useState(60);
  const [saving, setSaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const { t } = useI18n();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, s] = await Promise.all([teacherAPI.getMyClasses(), teacherAPI.getSessions()]);
      setClasses(c.data || []);
      setSessions(s.data || []);
      if (!maLhp && (c.data || []).length) setMaLhp(c.data[0].ma_lhp);
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail, t('teacherSessionsPage.loadFail')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCreate = async (e) => {
    e.preventDefault();
    setOk(null);
    setError(null);
    if (!isSessionScanCodeValid(maXacThuc)) {
      setError(t('teacherSessionsPage.invalidScanCode'));
      return;
    }
    setSaving(true);
    try {
      const pd = parseInt(String(phutDung), 10);
      const pm = parseInt(String(phutMax), 10);
      await teacherAPI.createSession({
        ma_lhp: maLhp,
        ngay_hoc: ngayHoc,
        gio_bat_dau: gioBatDau,
        ma_xac_thuc_buoi: maXacThuc.trim(),
        phut_het_han_dung_gio: Number.isFinite(pd) && pd > 0 ? pd : 15,
        phut_het_han_diem_danh: Number.isFinite(pm) && pm > 0 ? pm : 60,
      });
      setOk(t('teacherSessionsPage.createOk'));
      setMaXacThuc('');
      await load();
    } catch (e2) {
      setError(formatApiError(e2.response?.data?.detail, t('teacherSessionsPage.createFail')));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (row) => {
    setEditRow(row);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editRow) return;
    setError(null);
    if (editRow.ma_xac_thuc_buoi != null && String(editRow.ma_xac_thuc_buoi).trim() !== '') {
      if (!isSessionScanCodeValid(editRow.ma_xac_thuc_buoi)) {
        setError(t('teacherSessionsPage.invalidScanCode'));
        return;
      }
    }
    try {
      await teacherAPI.updateSession(editRow.ma_buoi, {
        ngay_hoc: editRow.ngay_hoc,
        gio_bat_dau: editRow.gio_bat_dau?.slice?.(0, 5) || editRow.gio_bat_dau,
        ma_xac_thuc_buoi: editRow.ma_xac_thuc_buoi,
        phut_het_han_dung_gio: editRow.phut_het_han_dung_gio,
        phut_het_han_diem_danh: editRow.phut_het_han_diem_danh,
      });
      setEditOpen(false);
      setOk(t('teacherSessionsPage.updateOk'));
      await load();
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail, t('teacherSessionsPage.updateFail')));
    }
  };

  const onDelete = async (row) => {
    if (!window.confirm(t('teacherSessionsPage.confirmDelete', { code: row.ma_buoi }))) return;
    try {
      await teacherAPI.deleteSession(row.ma_buoi);
      setOk(t('teacherSessionsPage.deleteOk'));
      await load();
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail, t('teacherSessionsPage.deleteFail')));
    }
  };

  if (loading && !sessions.length && !classes.length) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" fontWeight={900} gutterBottom sx={{ color: 'primary.main' }}>
        {t('teacherSessionsPage.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('teacherSessionsPage.description', { firstMinutes: phutDung, maxMinutes: phutMax })}
      </Typography>

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

      {!classes.length && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t('teacherSessionsPage.notAssigned')}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={5}>
          <Card variant="outlined">
            <CardContent>
              <Typography fontWeight={800} gutterBottom>{t('teacherSessionsPage.addNew')}</Typography>
              <Box component="form" onSubmit={onCreate}>
                <TextField
                  select
                  fullWidth
                  label={t('teacherSessionsPage.selectClass')}
                  value={maLhp}
                  onChange={(e) => setMaLhp(e.target.value)}
                  required
                  sx={{ mb: 2 }}
                  size="small"
                >
                  {classes.map((c) => (
                    <MenuItem key={c.ma_lhp} value={c.ma_lhp}>
                      {c.ma_lhp} — {c.ten_mon}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  fullWidth
                  type="date"
                  label={t('teacherSessionsPage.sessionDate')}
                  InputLabelProps={{ shrink: true }}
                  value={ngayHoc}
                  onChange={(e) => setNgayHoc(e.target.value)}
                  required
                  sx={{ mb: 2 }}
                  size="small"
                />
                <TextField
                  fullWidth
                  type="time"
                  label={t('teacherSessionsPage.startTime')}
                  InputLabelProps={{ shrink: true }}
                  value={gioBatDau}
                  onChange={(e) => setGioBatDau(e.target.value)}
                  required
                  sx={{ mb: 2 }}
                  size="small"
                />
                <TextField
                  fullWidth
                  label={t('teacherSessionsPage.scanCode')}
                  value={maXacThuc}
                  onChange={(e) => setMaXacThuc(e.target.value)}
                  required
                  helperText={t('teacherSessionsPage.helperScanCode')}
                  sx={{ mb: 2 }}
                  size="small"
                />
                <Grid container spacing={1} sx={{ mb: 2 }}>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      type="number"
                      label={t('teacherSessionsPage.firstMinutesLabel')}
                      value={phutDung}
                      onChange={(e) => setPhutDung(e.target.value)}
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      type="number"
                      label={t('teacherSessionsPage.maxMinutesLabel')}
                      value={phutMax}
                      onChange={(e) => setPhutMax(e.target.value)}
                      size="small"
                    />
                  </Grid>
                </Grid>
                <Button type="submit" variant="contained" disabled={saving || !classes.length}>
                  {saving ? t('teacherSessionsPage.saving') : t('teacherSessionsPage.createButton')}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={7}>
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography fontWeight={800}>{t('teacherSessionsPage.sessionsCreated')}</Typography>
                <Button startIcon={<RefreshIcon />} size="small" onClick={load}>
                  {t('teacherSessionsPage.refresh')}
                </Button>
              </Box>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('teacherSessionsPage.table.sessionCode')}</TableCell>
                    <TableCell>{t('teacherSessionsPage.table.courseLhp')}</TableCell>
                    <TableCell>{t('teacherSessionsPage.table.date')}</TableCell>
                    <TableCell>{t('teacherSessionsPage.table.time')}</TableCell>
                    <TableCell>{t('teacherSessionsPage.table.scanCode')}</TableCell>
                    <TableCell align="right">{t('teacherSessionsPage.table.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.ma_buoi}>
                      <TableCell>{s.ma_buoi}</TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>
                          {s.ten_mon}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {s.ma_lhp}
                        </Typography>
                      </TableCell>
                      <TableCell>{(s.ngay_hoc || '').slice(0, 10)}</TableCell>
                      <TableCell>{(s.gio_bat_dau || '').slice(0, 8)}</TableCell>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {s.ma_xac_thuc_buoi || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => openEdit({ ...s })}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => onDelete(s)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!sessions.length && (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        {t('teacherSessionsPage.table.empty')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('teacherSessionsPage.editDialogTitle')}</DialogTitle>
        <DialogContent>
          {editRow && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                label={t('teacherSessionsPage.editLabels.sessionDate')}
                type="date"
                InputLabelProps={{ shrink: true }}
                value={(editRow.ngay_hoc || '').slice(0, 10)}
                onChange={(e) => setEditRow({ ...editRow, ngay_hoc: e.target.value })}
                size="small"
              />
              <TextField
                label={t('teacherSessionsPage.editLabels.startTime')}
                type="time"
                InputLabelProps={{ shrink: true }}
                value={typeof editRow.gio_bat_dau === 'string' ? editRow.gio_bat_dau.slice(0, 5) : '07:00'}
                onChange={(e) => setEditRow({ ...editRow, gio_bat_dau: e.target.value })}
                size="small"
              />
              <TextField
                label={t('teacherSessionsPage.editLabels.scanCode')}
                value={editRow.ma_xac_thuc_buoi || ''}
                onChange={(e) => setEditRow({ ...editRow, ma_xac_thuc_buoi: e.target.value })}
                size="small"
              />
              <TextField
                type="number"
                label={t('teacherSessionsPage.editLabels.firstMinutesLabel')}
                value={editRow.phut_het_han_dung_gio ?? 15}
                onChange={(e) => setEditRow({ ...editRow, phut_het_han_dung_gio: Number(e.target.value) })}
                size="small"
              />
              <TextField
                type="number"
                label={t('teacherSessionsPage.editLabels.maxMinutesLabel')}
                value={editRow.phut_het_han_diem_danh ?? 60}
                onChange={(e) => setEditRow({ ...editRow, phut_het_han_diem_danh: Number(e.target.value) })}
                size="small"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>{t('teacherSessionsPage.editCancel')}</Button>
          <Button variant="contained" onClick={saveEdit}>
            {t('teacherSessionsPage.editSave')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
