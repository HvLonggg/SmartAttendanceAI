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
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { studentPortalAPI, analyticsAPI } from '../../services/api';
import { useAuth } from '../../auth/AuthContext';

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
        setError(e.response?.data?.detail || 'Không tải được dữ liệu cổng sinh viên');
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
      title: 'Buổi học',
      sub: `${todaySessions.length} buổi hôm nay`,
      icon: <CalendarMonthIcon sx={{ fontSize: 40, color: '#fff' }} />,
      path: '/student/sessions',
      grad: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
    },
    {
      title: 'Môn đã đăng ký',
      sub: `${courses.length} lớp học phần`,
      icon: <MenuBookIcon sx={{ fontSize: 40, color: '#fff' }} />,
      path: '/student/courses',
      grad: 'linear-gradient(135deg, #db2777 0%, #f97316 100%)',
    },
    {
      title: 'Hồ sơ của tôi',
      sub: 'Trạng thái, ảnh đại diện, điểm danh',
      icon: <PersonIcon sx={{ fontSize: 40, color: '#fff' }} />,
      path: '/student/profile',
      grad: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
    },
    {
      title: 'Phản hồi & góp ý',
      sub: 'Chương trình, giảng viên',
      icon: <RateReviewIcon sx={{ fontSize: 40, color: '#fff' }} />,
      path: '/student/feedback',
      grad: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
    },
    {
      title: 'Điểm danh Camera',
      sub: 'Nhận diện khuôn mặt',
      icon: <CameraAltIcon sx={{ fontSize: 40, color: '#fff' }} />,
      path: '/attendance',
      grad: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
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
          Xin chào, {user?.ho_ten || user?.username}
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.95, maxWidth: 560 }}>
          Cổng sinh viên — theo dõi lịch học, môn đăng ký, hồ sơ và gửi phản hồi cho nhà trường.
        </Typography>
        <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Chip label={`Mã SV: ${user?.ma_sv || '—'}`} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700 }} />
          <Chip label={`${courses.length} môn`} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff' }} />
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
              <Typography fontWeight={800}>Tổng quan chuyên cần</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Theo các lớp đã đăng ký (ước lượng)
            </Typography>
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
                {attended} / {totalClasses} buổi có mặt
              </Typography>
            </Box>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ ...cardSx, p: 2 }}>
            <Typography fontWeight={800} gutterBottom>
              Sắp tới
            </Typography>
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
                Chưa có buổi học hoặc chưa đăng ký môn.
              </Typography>
            )}
          </Card>
        </Grid>
      </Grid>

      <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>
        Truy cập nhanh
      </Typography>
      <Grid container spacing={2}>
        {tiles.map((t) => (
          <Grid item xs={12} sm={6} md={4} key={t.path}>
            <Card sx={cardSx}>
              <CardActionArea onClick={() => navigate(t.path)}>
                <Box sx={{ background: t.grad, px: 2, py: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                  {t.icon}
                  <Box>
                    <Typography variant="h6" fontWeight={800} sx={{ color: '#fff' }}>
                      {t.title}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                      {t.sub}
                    </Typography>
                  </Box>
                </Box>
                <CardContent sx={{ py: 1.5 }}>
                  <Typography variant="caption" color="primary" fontWeight={700}>
                    Mở trang →
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
