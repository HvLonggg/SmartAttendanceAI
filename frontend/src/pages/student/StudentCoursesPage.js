import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  Grid,
  CircularProgress,
  Alert,
  Button,
  Chip,
  Avatar,
  Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SchoolIcon from '@mui/icons-material/School';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import { studentPortalAPI, analyticsAPI } from '../../services/api';
import { useAuth } from '../../auth/AuthContext';
import { formatApiError } from '../../utils/apiError';
import { useI18n } from '../../i18n/I18nContext';

export default function StudentCoursesPage({ compact = false, maxItems = null }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const [courses, setCourses] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let ok = true;
    (async () => {
      setLoading(true);
      try {
        const ma = user?.ma_sv;
        const [enr, ana] = await Promise.all([
          studentPortalAPI.getMyEnrollments(),
          ma ? analyticsAPI.getStudentAnalytics(ma) : Promise.resolve({ data: [] }),
        ]);
        if (!ok) return;
        setCourses(enr.data || []);
        setAnalytics(ana.data || []);
      } catch (e) {
        if (!ok) return;
        setError(formatApiError(e.response?.data?.detail, t('studentCoursesPage.loadFail')));
      } finally {
        if (ok) setLoading(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, [user?.ma_sv]);

  const rateByLhp = useMemo(() => {
    const m = {};
    (analytics || []).forEach((a) => {
      m[a.ma_lhp] = {
        ty_le: a.ty_le_chuyen_can,
        co_mat: a.so_buoi_co_mat,
        tong: a.tong_buoi,
      };
    });
    return m;
  }, [analytics]);

  const displayCourses = maxItems ? courses.slice(0, maxItems) : courses;

  return (
    <Box>
      {!compact && (
        <>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/student')} sx={{ mb: 2 }}>
              {t('studentCoursesPage.back')}
          </Button>
          <Typography
            variant="h4"
            fontWeight={900}
            gutterBottom
            sx={{ background: 'linear-gradient(90deg,#db2777,#f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            {t('studentCoursesPage.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {t('studentCoursesPage.subtitle')}
          </Typography>
        </>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={2}>
          {displayCourses.map((c, idx) => {
            const stat = rateByLhp[c.ma_lhp];
            const grad = ['linear-gradient(135deg,#6366f1,#8b5cf6)', 'linear-gradient(135deg,#ec4899,#f97316)', 'linear-gradient(135deg,#0d9488,#2563eb)'][idx % 3];
            return (
              <Grid item xs={12} md={6} key={c.ma_lhp}>
                <Card
                  sx={{
                    borderRadius: 3,
                    overflow: 'hidden',
                    height: '100%',
                    border: '1px solid',
                    borderColor: 'divider',
                    boxShadow: '0 10px 36px rgba(99,102,241,0.12)',
                    transition: 'transform 0.2s ease',
                    '&:hover': { transform: 'translateY(-4px)' },
                  }}
                >
                  <Box sx={{ background: grad, color: '#fff', p: 2, display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                    <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.25)', width: 52, height: 52 }}>
                      <SchoolIcon />
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="h6" fontWeight={900} noWrap title={c.ten_mon}>
                        {c.ten_mon}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.95 }}>
                        {c.ma_mon} · {c.ma_lhp}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ p: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      {t('studentCoursesPage.teacherLabel')}
                    </Typography>
                    <Typography variant="body1" fontWeight={800} gutterBottom>
                      {c.giang_vien}
                    </Typography>
                    {c.ma_gv && (
                      <Chip
                        label={t('studentCoursesPage.maGvPrefix', { code: c.ma_gv })}
                        size="small"
                        sx={{ mr: 0.5, mb: 1 }}
                      />
                    )}
                    <Divider sx={{ my: 1.5 }} />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                      {c.gv_email && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <EmailIcon fontSize="small" color="action" />
                          <Typography variant="body2">{c.gv_email}</Typography>
                        </Box>
                      )}
                      {c.gv_dien_thoai && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <PhoneIcon fontSize="small" color="action" />
                          <Typography variant="body2">{c.gv_dien_thoai}</Typography>
                        </Box>
                      )}
                      {c.ghi_chu_gv && c.ghi_chu_gv !== c.giang_vien && (
                        <Typography variant="caption" color="text.secondary">
                          {t('studentCoursesPage.noteLabel', { note: c.ghi_chu_gv })}
                        </Typography>
                      )}
                    </Box>
                    {stat && (
                      <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Typography variant="caption" color="text.secondary">
                          {t('studentCoursesPage.attendanceEstimated')}
                        </Typography>
                        <Typography variant="h6" fontWeight={900} color="primary.main">
                          {Number(stat.ty_le || 0).toFixed(1)}%
                        </Typography>
                        <Typography variant="caption">
                          {t('studentCoursesPage.attendanceCaption', {
                            present: stat.co_mat,
                            total: stat.tong,
                          })}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Card>
              </Grid>
            );
          })}
          {!displayCourses.length && (
            <Grid item xs={12}>
              <Alert severity="info">{t('studentCoursesPage.empty')}</Alert>
            </Grid>
          )}
        </Grid>
      )}
    </Box>
  );
}
