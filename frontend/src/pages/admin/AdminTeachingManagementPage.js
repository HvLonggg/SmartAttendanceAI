import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  TextField,
  Typography,
} from '@mui/material';
import { adminTeachingAPI } from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { useI18n } from '../../i18n/I18nContext';

export default function AdminTeachingManagementPage() {
  const { t, locale } = useI18n();
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [overviewRows, setOverviewRows] = useState([]);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingClass, setSavingClass] = useState(null);

  const [selectedMaGV, setSelectedMaGV] = useState('');
  const [selectedMaLHP, setSelectedMaLHP] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [classTeacherDraft, setClassTeacherDraft] = useState({});

  const dateLocale = locale === 'en' ? 'en-US' : 'vi-VN';

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [teachersRes, classesRes, overviewRes] = await Promise.all([
        adminTeachingAPI.listTeachers(),
        adminTeachingAPI.listClasses(),
        adminTeachingAPI.getOverview(),
      ]);
      const tRows = teachersRes.data?.teachers || [];
      const cRows = classesRes.data?.classes || [];
      setTeachers(tRows);
      setClasses(cRows);
      setOverviewRows(overviewRes.data?.rows || []);
      setClassTeacherDraft(
        cRows.reduce((acc, c) => {
          acc[c.ma_lhp] = c.ma_gv || '';
          return acc;
        }, {})
      );
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail, t('adminTeaching.loadFail')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredOverview = useMemo(() => {
    return overviewRows.filter((row) => {
      if (selectedMaGV && row.ma_gv !== selectedMaGV) return false;
      if (selectedMaLHP && row.ma_lhp !== selectedMaLHP) return false;
      if (fromDate && row.ngay_hoc && row.ngay_hoc.slice(0, 10) < fromDate) return false;
      if (toDate && row.ngay_hoc && row.ngay_hoc.slice(0, 10) > toDate) return false;
      return true;
    });
  }, [overviewRows, selectedMaGV, selectedMaLHP, fromDate, toDate]);

  const saveAssignment = async (maLHP) => {
    setSavingClass(maLHP);
    setError(null);
    setMessage(null);
    try {
      await adminTeachingAPI.assignTeacherForClass(maLHP, classTeacherDraft[maLHP] || null);
      setMessage(t('adminTeaching.assignSuccess', { ma_lhp: maLHP }));
      await loadData();
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail, t('adminTeaching.assignFail')));
    } finally {
      setSavingClass(null);
    }
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        {t('adminTeaching.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('adminTeaching.subtitle')}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {message && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
                <TextField
                  select
                  size="small"
                  label={t('adminTeaching.filterTeacher')}
                  value={selectedMaGV}
                  onChange={(e) => setSelectedMaGV(e.target.value)}
                  sx={{ minWidth: 240 }}
                >
                  <MenuItem value="">{t('adminTeaching.all')}</MenuItem>
                  {teachers.map((g) => (
                    <MenuItem key={g.ma_gv} value={g.ma_gv}>
                      {g.ho_ten} ({g.ma_gv})
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label={t('adminTeaching.filterClass')}
                  value={selectedMaLHP}
                  onChange={(e) => setSelectedMaLHP(e.target.value)}
                  sx={{ minWidth: 220 }}
                >
                  <MenuItem value="">{t('adminTeaching.all')}</MenuItem>
                  {classes.map((c) => (
                    <MenuItem key={c.ma_lhp} value={c.ma_lhp}>
                      {c.ma_lhp}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label={t('adminTeaching.fromDate')}
                  type="date"
                  size="small"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label={t('adminTeaching.toDate')}
                  type="date"
                  size="small"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <Button variant="outlined" onClick={loadData} disabled={loading}>
                  {t('adminTeaching.refresh')}
                </Button>
              </Stack>

              <Typography variant="h6" fontWeight="bold" gutterBottom color="text.primary">
                {t('adminTeaching.assignmentTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {t('adminTeaching.unassignedHint')}
              </Typography>
              <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('adminTeaching.table.classCode')}</TableCell>
                    <TableCell>{t('adminTeaching.table.course')}</TableCell>
                    <TableCell>{t('adminTeaching.table.teacher')}</TableCell>
                    <TableCell>{t('adminTeaching.table.stats')}</TableCell>
                    <TableCell>{t('adminTeaching.table.action')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {classes.map((c) => (
                    <TableRow key={c.ma_lhp} hover>
                      <TableCell>{c.ma_lhp}</TableCell>
                      <TableCell>
                        <Typography fontWeight={500}>{c.ten_mon || '—'}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {c.ma_mon || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          value={classTeacherDraft[c.ma_lhp] || ''}
                          onChange={(e) =>
                            setClassTeacherDraft((prev) => ({
                              ...prev,
                              [c.ma_lhp]: e.target.value,
                            }))
                          }
                          sx={{ minWidth: 260 }}
                        >
                          <MenuItem value="">{t('adminTeaching.unassigned')}</MenuItem>
                          {teachers.map((g) => (
                            <MenuItem key={g.ma_gv} value={g.ma_gv}>
                              {g.ho_ten} ({g.ma_gv})
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <Chip size="small" label={t('adminTeaching.sessionsCount', { count: c.so_buoi || 0 })} />
                          <Chip size="small" label={t('adminTeaching.attendanceCount', { count: c.so_lan_diem_danh || 0 })} />
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="contained"
                          size="small"
                          disabled={savingClass === c.ma_lhp}
                          onClick={() => saveAssignment(c.ma_lhp)}
                        >
                          {savingClass === c.ma_lhp ? t('adminTeaching.saving') : t('adminTeaching.saveAssign')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {classes.length === 0 && (
                    <TableRow>
                      <TableCell align="center" colSpan={5}>
                        {t('adminTeaching.emptyUnassigned')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" gutterBottom color="text.primary">
                {t('adminTeaching.overviewTitle')}
              </Typography>
              <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('adminTeaching.overview.session')}</TableCell>
                    <TableCell>{t('adminTeaching.overview.dateTime')}</TableCell>
                    <TableCell>{t('adminTeaching.overview.courseClass')}</TableCell>
                    <TableCell>{t('adminTeaching.overview.teacher')}</TableCell>
                    <TableCell>{t('adminTeaching.overview.student')}</TableCell>
                    <TableCell>{t('adminTeaching.overview.status')}</TableCell>
                    <TableCell>{t('adminTeaching.overview.scanTime')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredOverview.map((r) => (
                    <TableRow key={`${r.ma_buoi}_${r.ma_sv || 'none'}_${r.thoi_gian_quet || 'none'}`} hover>
                      <TableCell>
                        <Typography fontWeight={500}>{r.ma_buoi}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {r.ma_xac_thuc_buoi || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {r.ngay_hoc ? new Date(r.ngay_hoc).toLocaleDateString(dateLocale) : '—'}
                        {' · '}
                        {r.gio_bat_dau || '—'}
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight={500}>{r.ten_mon || '—'}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {r.ma_lhp} / {r.ma_mon || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>{r.ten_giang_vien ? `${r.ten_giang_vien} (${r.ma_gv || '—'})` : '—'}</TableCell>
                      <TableCell>{r.ma_sv ? `${r.ten_sinh_vien || '—'} (${r.ma_sv})` : t('adminTeaching.noAttendance')}</TableCell>
                      <TableCell>{r.trang_thai || '—'}</TableCell>
                      <TableCell>{r.thoi_gian_quet ? new Date(r.thoi_gian_quet).toLocaleString(dateLocale) : '—'}</TableCell>
                    </TableRow>
                  ))}
                  {filteredOverview.length === 0 && (
                    <TableRow>
                      <TableCell align="center" colSpan={7}>
                        {t('adminTeaching.empty')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
