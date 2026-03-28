import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Chip,
  Divider,
  Stack,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import { studentPortalAPI } from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { useI18n } from '../../i18n/I18nContext';

export default function StudentClassEnrollPage() {
  const { maLhp } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [enrollOk, setEnrollOk] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState('');

  useEffect(() => {
    if (!maLhp) return undefined;
    let ok = true;
    (async () => {
      setLoading(true);
      setError(null);
      setEnrollOk(false);
      setEnrollMsg('');
      try {
        const { data } = await studentPortalAPI.getOpenClass(maLhp);
        if (!ok) return;
        setDetail(data || null);
      } catch (e) {
        if (!ok) return;
        setDetail(null);
        setError(formatApiError(e.response?.data?.detail, t('studentClassEnrollPage.loadFail')));
      } finally {
        if (ok) setLoading(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, [maLhp, t]);

  const handleEnroll = async () => {
    if (!detail?.ma_lhp) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await studentPortalAPI.enrollClass(detail.ma_lhp);
      setEnrollOk(true);
      setEnrollMsg(data?.message || t('studentClassEnrollPage.successDefault'));
      setDetail((d) => (d ? { ...d, da_dang_ky: true } : d));
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail, t('studentClassEnrollPage.enrollFail')));
    } finally {
      setSubmitting(false);
    }
  };

  const showEnrolled = detail?.da_dang_ky || enrollOk;

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/student/catalog')} sx={{ mb: 2 }}>
        {t('studentClassEnrollPage.backList')}
      </Button>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress />
        </Box>
      ) : !detail ? (
        <Alert severity="error">{error || t('studentClassEnrollPage.notFound')}</Alert>
      ) : (
        <>
          <Typography
            variant="h4"
            fontWeight={900}
            gutterBottom
            sx={{
              background: 'linear-gradient(90deg,#0d9488,#2563eb)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {t('studentClassEnrollPage.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('studentClassEnrollPage.subtitle')}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          {enrollOk && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {enrollMsg}
            </Alert>
          )}

          <Card sx={{ borderRadius: 3, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
            <Box
              sx={{
                background: 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)',
                color: '#fff',
                p: 2.5,
              }}
            >
              <Typography variant="overline" sx={{ opacity: 0.9 }}>
                {detail.ma_lhp}
              </Typography>
              <Typography variant="h5" fontWeight={900}>
                {detail.ten_mon}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.95 }}>
                {detail.ma_mon}
                {detail.nam_hoc ? ` · ${t('studentClassEnrollPage.term', { y: detail.nam_hoc })}` : ''}
                {detail.hoc_ky != null ? ` · ${t('studentClassEnrollPage.semester', { n: detail.hoc_ky })}` : ''}
              </Typography>
            </Box>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('studentClassEnrollPage.teacherSection')}
              </Typography>
              <Typography variant="h6" fontWeight={800} gutterBottom>
                {detail.giang_vien}
              </Typography>
              {detail.ma_gv && (
                <Chip
                  size="small"
                  label={t('studentClassEnrollPage.maGv', { code: detail.ma_gv })}
                  sx={{ mr: 1, mb: 1 }}
                />
              )}
              {!detail.du_dieu_kien_dang_ky && (
                <Chip size="small" color="warning" label={t('studentClassEnrollPage.noTeacherYet')} sx={{ mb: 1 }} />
              )}
              <Stack spacing={1} sx={{ mt: 1 }}>
                {detail.gv_email && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <EmailIcon fontSize="small" color="action" />
                    <Typography variant="body2">{detail.gv_email}</Typography>
                  </Box>
                )}
                {detail.gv_dien_thoai && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PhoneIcon fontSize="small" color="action" />
                    <Typography variant="body2">{detail.gv_dien_thoai}</Typography>
                  </Box>
                )}
              </Stack>
              {(detail.phong_hoc || detail.ma_khoa) && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="body2" color="text.secondary">
                    {detail.phong_hoc && (
                      <span>
                        {t('studentClassEnrollPage.room')}: <strong>{detail.phong_hoc}</strong>
                      </span>
                    )}
                    {detail.phong_hoc && detail.ma_khoa ? ' · ' : ''}
                    {detail.ma_khoa && (
                      <span>
                        {t('studentClassEnrollPage.facultyCode')}: <strong>{detail.ma_khoa}</strong>
                      </span>
                    )}
                  </Typography>
                </>
              )}
              <Divider sx={{ my: 2 }} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap">
                {!showEnrolled && detail.du_dieu_kien_dang_ky && (
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<HowToRegIcon />}
                    disabled={submitting}
                    onClick={handleEnroll}
                    sx={{ fontWeight: 800 }}
                  >
                    {submitting ? t('studentClassEnrollPage.enrolling') : t('studentClassEnrollPage.enrollCta')}
                  </Button>
                )}
                {!showEnrolled && !detail.du_dieu_kien_dang_ky && (
                  <Alert severity="warning" sx={{ flex: 1 }}>
                    {t('studentClassEnrollPage.waitTeacherHint')}
                  </Alert>
                )}
                {showEnrolled && (
                  <>
                    <Chip color="success" label={t('studentClassEnrollPage.enrolledChip')} sx={{ fontWeight: 700 }} />
                    <Button
                      variant="outlined"
                      startIcon={<MenuBookIcon />}
                      onClick={() => navigate('/student/courses')}
                    >
                      {t('studentClassEnrollPage.gotoCourses')}
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<CalendarMonthIcon />}
                      onClick={() => navigate('/student/sessions')}
                    >
                      {t('studentClassEnrollPage.gotoSessions')}
                    </Button>
                    <Button
                      variant="contained"
                      color="secondary"
                      startIcon={<CameraAltIcon />}
                      onClick={() => navigate('/student/attendance')}
                    >
                      {t('studentClassEnrollPage.gotoAttendance')}
                    </Button>
                  </>
                )}
              </Stack>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
