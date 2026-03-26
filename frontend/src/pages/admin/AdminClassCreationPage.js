import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { adminTeachingAPI } from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { useI18n } from '../../i18n/I18nContext';

export default function AdminClassCreationPage() {
  const { t } = useI18n();
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const [maMon, setMaMon] = useState('');
  const [namHoc, setNamHoc] = useState('2025-2026');
  const [hocKy, setHocKy] = useState(1);
  const [phongHoc, setPhongHoc] = useState('P301');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await adminTeachingAPI.listCourses();
        if (!mounted) return;
        setCourses(res.data?.courses || []);
      } catch (e) {
        if (!mounted) return;
        setError(formatApiError(e.response?.data?.detail, t('adminClassCreate.loadFail')));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [t]);

  const selectedCourse = useMemo(
    () => courses.find((c) => c.ma_mon === maMon) || null,
    [courses, maMon]
  );

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminTeachingAPI.createClass({
        ma_mon: maMon,
        nam_hoc: namHoc,
        hoc_ky: Number(hocKy),
        phong_hoc: phongHoc,
      });
      setMessage(
        `${t('adminClassCreate.createOk', { ma_lhp: res.data?.ma_lhp || '—' })} ${t('adminClassCreate.createResetHint')}`
      );
      setMaMon('');
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail, t('adminClassCreate.createFail')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight={900} gutterBottom>
        {t('adminClassCreate.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('adminClassCreate.subtitle')}
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

      <Card>
        <CardContent>
          <form onSubmit={onSubmit}>
            <Stack spacing={2} sx={{ maxWidth: 760 }}>
              <TextField
                select
                label={t('adminClassCreate.course')}
                value={maMon}
                onChange={(e) => setMaMon(e.target.value)}
                required
              >
                {courses.map((c) => (
                  <MenuItem key={c.ma_mon} value={c.ma_mon}>
                    {c.ma_mon} - {c.ten_mon} ({c.ten_khoa || c.ma_khoa || '—'})
                  </MenuItem>
                ))}
              </TextField>

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  label={t('adminClassCreate.schoolYear')}
                  value={namHoc}
                  onChange={(e) => setNamHoc(e.target.value)}
                  required
                  sx={{ minWidth: 220 }}
                />
                <TextField
                  select
                  label={t('adminClassCreate.semester')}
                  value={hocKy}
                  onChange={(e) => setHocKy(Number(e.target.value))}
                  sx={{ minWidth: 180 }}
                >
                  <MenuItem value={1}>1</MenuItem>
                  <MenuItem value={2}>2</MenuItem>
                  <MenuItem value={3}>3</MenuItem>
                </TextField>
                <TextField
                  label={t('adminClassCreate.room')}
                  value={phongHoc}
                  onChange={(e) => setPhongHoc(e.target.value)}
                  sx={{ minWidth: 180 }}
                />
              </Stack>

              {selectedCourse && (
                <Alert severity="info">
                  {t('adminClassCreate.preview')}: {selectedCourse.ten_mon} ({selectedCourse.ma_mon}) -{' '}
                  {selectedCourse.chuyen_nganh || selectedCourse.ten_khoa || '—'}
                </Alert>
              )}

              <Box>
                <Button type="submit" variant="contained" disabled={busy || !maMon}>
                  {busy ? t('adminClassCreate.creating') : t('adminClassCreate.create')}
                </Button>
              </Box>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
