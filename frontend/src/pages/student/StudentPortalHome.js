import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardActionArea,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  LinearProgress,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PersonIcon from '@mui/icons-material/Person';
import RateReviewIcon from '@mui/icons-material/RateReview';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { studentPortalAPI, analyticsAPI } from '../../services/api';
import { useAuth } from '../../auth/AuthContext';
import { formatApiError } from '../../utils/apiError';
import { useI18n } from '../../i18n/I18nContext';

const cardSx = {
  borderRadius: 3,
  overflow: 'hidden',
  border: '1px solid',
  borderColor: 'divider',
  transition: 'all 0.25s ease',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: '0 12px 40px rgba(99,102,241,0.2)',
  },
};

export default function StudentPortalHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [courses, setCourses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [analytics, setAnalytics] = useState([]);

  useEffect(() => {
    let ok = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const ma = user?.ma_sv;
        const [enr, sess, ana] = await Promise.all([
          studentPortalAPI.getMyEnrollments(),
          studentPortalAPI.getMySessions(),
          ma ? analyticsAPI.getStudentAnalytics(ma) : Promise.resolve({ data: [] }),
        ]);
        if (!ok) return;
        setCourses(enr.data || []);
        setSessions(sess.data || []);
        setAnalytics(ana.data || []);
      } catch (e) {
        if (!ok) return;
        setError(formatApiError(e.response?.data?.detail, t('studentPortalHome.loadError')));
      } finally {
        if (ok) setLoading(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, [user?.ma_sv]);

  const totalClasses = analytics.reduce((s, x) => s + (x.tong_buoi || 0), 0);
  const attended = analytics.reduce((s, x) => s + (x.so_buoi_co_mat || 0), 0);
  const rate = totalClasses > 0 ? Math.round((attended / totalClasses) * 100) : 0;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySessions = sessions.filter((s) => s.ngay_hoc === todayStr);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  const tiles = [
    {
      title: t('studentPortalHome.tiles.sessions'),
      sub: t('studentPortalHome.tiles.sessionsSub', { count: todaySessions.length }),
      icon: <CalendarMonthIcon sx={{ fontSize: 40, color: '#fff' }} />,
      path: '/student/sessions',
      grad: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
    },
    {
      title: t('studentPortalHome.tiles.courses'),
      sub: t('studentPortalHome.tiles.coursesSub', { count: courses.length }),
      icon: <MenuBookIcon sx={{ fontSize: 40, color: '#fff' }} />,
      path: '/student/courses',
      grad: 'linear-gradient(135deg, #db2777 0%, #f97316 100%)',
    },
    {
      title: t('studentPortalHome.tiles.profile'),
      sub: t('studentPortalHome.tiles.profileSub'),
      icon: <PersonIcon sx={{ fontSize: 40, color: '#fff' }} />,
      path: '/student/profile',
      grad: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
    },
    {
      title: t('studentPortalHome.tiles.feedback'),
      sub: t('studentPortalHome.tiles.feedbackSub'),
      icon: <RateReviewIcon sx={{ fontSize: 40, color: '#fff' }} />,
      path: '/student/feedback',
      grad: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
    },
  ];

  return (
    <Box>
      <Box
        sx={{
          borderRadius: 4,
          p: 3,
          mb: 3,
          background: 'linear-gradient(110deg, #4f46e5 0%, #7c3aed 40%, #ec4899 100%)',
          color: '#fff',
          boxShadow: '0 16px 48px rgba(79,70,229,0.35)',
        }}
      >
        <Typography variant="h4" fontWeight={900} gutterBottom>
          {t('studentPortalHome.greeting', { name: user?.ho_ten || user?.username })}
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.95, maxWidth: 560 }}>
          {t('studentPortalHome.subtitle')}
        </Typography>
        <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Chip
            label={t('studentPortalHome.myStudentId', { id: user?.ma_sv || '—' })}
            sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700 }}
          />
          <Chip
            label={t('studentPortalHome.coursesCount', { count: courses.length })}
            sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff' }}
          />
        </Box>
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card sx={{ ...cardSx, p: 2, background: 'linear-gradient(145deg, #f8fafc, #eef2ff)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <TrendingUpIcon color="primary" />
              <Typography fontWeight={800}>{t('studentPortalHome.totalAttendance')}</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">{t('studentPortalHome.totalAttendanceHint')}</Typography>
            <Box sx={{ mt: 1 }}>
              <Typography variant="h5" fontWeight={900} color="primary.main">
                {rate}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={Math.min(rate, 100)}
                sx={{ mt: 1, height: 10, borderRadius: 5 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                {t('studentPortalHome.attendanceCaption', { attended, total: totalClasses })}
              </Typography>
            </Box>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ ...cardSx, p: 2 }}>
            <Typography fontWeight={800} gutterBottom>{t('studentPortalHome.upcoming')}</Typography>
            {sessions.slice(0, 4).map((s) => (
              <Box
                key={s.ma_buoi}
                sx={{
                  py: 1,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 1,
                }}
              >
                <Typography variant="body2" fontWeight={600} noWrap>
                  {s.ten_mon}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {s.ngay_hoc} {s.gio_bat_dau}
                </Typography>
              </Box>
            ))}
            {!sessions.length && (
              <Typography variant="body2" color="text.secondary">
                {t('studentPortalHome.emptyUpcoming')}
              </Typography>
            )}
          </Card>
        </Grid>
      </Grid>

      <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>{t('studentPortalHome.quickAccess')}</Typography>
      <Grid container spacing={2}>
        {tiles.map((tile) => (
          <Grid item xs={12} sm={6} md={4} key={tile.path}>
            <Card sx={cardSx}>
              <CardActionArea onClick={() => navigate(tile.path)}>
                <Box sx={{ background: tile.grad, px: 2, py: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                  {tile.icon}
                  <Box>
                    <Typography variant="h6" fontWeight={800} sx={{ color: '#fff' }}>
                      {tile.title}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                      {tile.sub}
                    </Typography>
                  </Box>
                </Box>
                <CardContent sx={{ py: 1.5 }}>
                  <Typography variant="caption" color="primary" fontWeight={700}>
                    {t('studentPortalHome.openPage')}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
