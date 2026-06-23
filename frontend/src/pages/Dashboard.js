import React, { useState, useEffect, useMemo } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Alert,
  useTheme,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import {
  People as PeopleIcon,
  Event as EventIcon,
  CheckCircle as CheckIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Navigate } from 'react-router-dom';
import { analyticsAPI, teacherAPI, adminTeachingAPI, teacherAttendanceAPI } from '../services/api';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

function StatCard({ title, value, icon, color }) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography color="text.secondary" gutterBottom variant="body2">
              {title}
            </Typography>
            <Typography variant="h4" component="div" color="text.primary" fontWeight="bold">
              {value}
            </Typography>
          </Box>
          <Box
            sx={{
              backgroundColor: color,
              borderRadius: '50%',
              p: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {React.cloneElement(icon, { sx: { color: 'white', fontSize: 40 } })}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const theme = useTheme();
  const [stats, setStats] = useState(null);
  const [adminOverview, setAdminOverview] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [selectedClassDetail, setSelectedClassDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const barChartData = useMemo(() => {
    const rows = stats?.chart_trend_7d;
    if (!Array.isArray(rows)) return [];
    return rows.map((d) => ({
      name: d.name || '',
      coMat: d.coMat ?? 0,
      tre: d.tre ?? 0,
    }));
  }, [stats]);

  const pieChartData = useMemo(() => {
    const rows = stats?.chart_status_7d;
    if (!Array.isArray(rows)) return [];
    return rows.map((x) => ({ name: x.name || '—', value: x.value ?? 0 }));
  }, [stats]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      if (user?.role === 'TEACHER') {
        const response = await teacherAttendanceAPI.getAnalyticsSummary();
        setStats(response.data);
        setAdminOverview(null);
      } else if (user?.role === 'ADMIN') {
        const [response, overviewRes] = await Promise.all([
          analyticsAPI.getDashboardStats(),
          adminTeachingAPI.getDashboardOverview(),
        ]);
        setStats(response.data);
        setAdminOverview(overviewRes.data || null);
      } else {
        const response = await analyticsAPI.getDashboardStats();
        setStats(response.data);
        setAdminOverview(null);
      }
      setError(null);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(t('dashboard.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'STUDENT') return;
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.ma_gv]);

  if (user?.role === 'STUDENT') {
    return <Navigate to="/student" replace />;
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  const openClassDetail = async (maLHP) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    setSelectedClassDetail(null);
    try {
      const res = await adminTeachingAPI.getClassDetail(maLHP);
      setSelectedClassDetail(res.data || null);
    } catch (e) {
      setDetailError('Không tải được chi tiết học phần');
    } finally {
      setDetailLoading(false);
    }
  };

  if (user?.role === 'ADMIN') {
    const s = adminOverview?.stats || {};
    const byClass = adminOverview?.attendance_by_class || [];
    const teacherLoad = adminOverview?.teacher_load || [];
    const alerts = adminOverview?.alerts || [];
    const teacherLoadChart = teacherLoad.map((x) => ({
      name: x.ten_giang_vien || x.ma_gv || '—',
      so_hoc_phan: x.so_hoc_phan || 0,
    }));

    return (
      <Box>
        <Typography variant="h4" fontWeight="bold" gutterBottom color="text.primary">
          Tổng quan
        </Typography>

        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Tổng lớp" value={s.total_hoc_phan || 0} icon={<EventIcon />} color="#1976d2" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Tạo trong ngày" value={s.created_today || 0} icon={<CheckIcon />} color="#2e7d32" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Tạo trong tuần" value={s.created_week || 0} icon={<ScheduleIcon />} color="#ed6c02" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Tạo trong tháng" value={s.created_month || 0} icon={<PeopleIcon />} color="#6d28d9" />
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} md={7}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight="bold" gutterBottom color="text.primary">
                  Số lớp theo giảng viên
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={teacherLoadChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="currentColor" />
                    <YAxis stroke="currentColor" />
                    <Tooltip contentStyle={{ backgroundColor: theme.palette.background.paper }} />
                    <Legend />
                    <Bar dataKey="so_hoc_phan" fill="#6366f1" name="Số lớp" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={5}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight="bold" gutterBottom color="text.primary">
                  Thông báo
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Alert severity="info">Đã phân công: {s.assigned_count || 0} lớp</Alert>
                  <Alert severity={(s.unassigned_count || 0) > 0 ? 'warning' : 'success'}>
                    Chưa phân công: {s.unassigned_count || 0} lớp
                  </Alert>
                  {alerts.length > 0 ? (
                    alerts.map((a, i) => (
                      <Alert
                        key={i}
                        severity={
                          a.includes('chưa phân công') || a.includes('Chưa có')
                            ? 'warning'
                            : a.includes('ổn định')
                              ? 'success'
                              : 'info'
                        }
                      >
                        {a}
                      </Alert>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Chưa có thông báo.
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight="bold" gutterBottom color="text.primary">
                  Điểm danh theo lớp
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Mã lớp</TableCell>
                      <TableCell>Môn học</TableCell>
                      <TableCell>Giảng viên phụ trách</TableCell>
                      <TableCell align="right">Số buổi</TableCell>
                      <TableCell align="right">Lượt điểm danh</TableCell>
                      <TableCell align="right">Tỷ lệ đúng giờ</TableCell>
                      <TableCell align="right">Chi tiết</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {byClass.map((r) => (
                      <TableRow key={r.ma_lhp} hover>
                        <TableCell>{r.ma_lhp}</TableCell>
                        <TableCell>
                          <Typography fontWeight={500}>{r.ten_mon || '—'}</Typography>
                        </TableCell>
                        <TableCell>{r.ten_giang_vien ? `${r.ten_giang_vien} (${r.ma_gv || '—'})` : '—'}</TableCell>
                        <TableCell align="right">{r.so_buoi || 0}</TableCell>
                        <TableCell align="right">{r.luot_diem_danh || 0}</TableCell>
                        <TableCell align="right">{`${(r.ty_le_dung_gio || 0).toFixed(1)}%`}</TableCell>
                        <TableCell align="right">
                          <Button size="small" variant="outlined" onClick={() => openClassDetail(r.ma_lhp)}>
                            Xem
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {byClass.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} align="center">
                          Chưa có dữ liệu học phần được phân công.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="lg" fullWidth>
          <DialogTitle>
            <Typography variant="h6" component="span">
              Chi tiết lớp {selectedClassDetail?.ma_lhp || ''}
            </Typography>
          </DialogTitle>
          <DialogContent dividers>
            {detailLoading && <CircularProgress size={22} />}
            {detailError && <Alert severity="error">{detailError}</Alert>}
            {!detailLoading && !detailError && selectedClassDetail && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Alert severity="info">
                  Tổng buổi: {selectedClassDetail.summary?.total_sessions || 0} | Tổng lượt điểm danh:{' '}
                  {selectedClassDetail.summary?.total_attendance || 0} | Đúng giờ:{' '}
                  {selectedClassDetail.summary?.on_time_count || 0} | Trễ:{' '}
                  {selectedClassDetail.summary?.late_count || 0}
                </Alert>

                <Typography variant="subtitle1" fontWeight="bold">
                  Buổi học
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Mã buổi</TableCell>
                      <TableCell>Ngày học</TableCell>
                      <TableCell>Giờ bắt đầu</TableCell>
                      <TableCell align="right">Lượt điểm danh</TableCell>
                      <TableCell align="right">Đúng giờ</TableCell>
                      <TableCell align="right">Trễ</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(selectedClassDetail.sessions || []).map((s) => (
                      <TableRow key={s.ma_buoi}>
                        <TableCell>{s.ma_buoi}</TableCell>
                        <TableCell>{s.ngay_hoc ? new Date(s.ngay_hoc).toLocaleDateString('vi-VN') : '—'}</TableCell>
                        <TableCell>{s.gio_bat_dau || '—'}</TableCell>
                        <TableCell align="right">{s.attendance_count || 0}</TableCell>
                        <TableCell align="right">{s.on_time_count || 0}</TableCell>
                        <TableCell align="right">{s.late_count || 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Typography variant="subtitle1" fontWeight="bold">
                  Sinh viên đã điểm danh
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Mã SV</TableCell>
                      <TableCell>Họ tên</TableCell>
                      <TableCell align="right">Tổng lượt</TableCell>
                      <TableCell align="right">Đúng giờ</TableCell>
                      <TableCell align="right">Trễ</TableCell>
                      <TableCell>Lần quét cuối</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(selectedClassDetail.students || []).map((s) => (
                      <TableRow key={s.ma_sv}>
                        <TableCell>{s.ma_sv}</TableCell>
                        <TableCell>{s.ho_ten || '—'}</TableCell>
                        <TableCell align="right">{s.total_checkins || 0}</TableCell>
                        <TableCell align="right">{s.on_time_count || 0}</TableCell>
                        <TableCell align="right">{s.late_count || 0}</TableCell>
                        <TableCell>{s.last_checkin ? new Date(s.last_checkin).toLocaleString('vi-VN') : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDetailOpen(false)}>Đóng</Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="bold" color="text.primary">
        {user?.role === 'TEACHER' ? t('dashboard.titleTeacher') : t('dashboard.titleAdmin')}
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title={t('dashboard.totalStudents')}
            value={stats?.total_students || 0}
            icon={<PeopleIcon />}
            color="#1976d2"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title={t('dashboard.todaySessions')}
            value={stats?.today_sessions || 0}
            icon={<EventIcon />}
            color="#2e7d32"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title={t('dashboard.attendanceCount')}
            value={stats?.today_attendance || 0}
            icon={<CheckIcon />}
            color="#ed6c02"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title={t('dashboard.lateRate')}
            value={`${stats?.late_rate?.toFixed(1) || 0}%`}
            icon={<ScheduleIcon />}
            color="#d32f2f"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" gutterBottom color="text.primary">
                {t('dashboard.weekAttendanceTeacher')}
              </Typography>
              {barChartData.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 4 }}>
                  {t('dashboard.chartNoDataWeek')}
                </Typography>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="currentColor" />
                    <YAxis stroke="currentColor" />
                    <Tooltip contentStyle={{ backgroundColor: theme.palette.background.paper }} />
                    <Legend />
                    <Bar dataKey="coMat" fill="#2e7d32" name={t('dashboard.present')} />
                    <Bar dataKey="tre" fill="#ed6c02" name={t('dashboard.late')} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" gutterBottom color="text.primary">
                {t('dashboard.statusDistTeacher')}
              </Typography>
              {pieChartData.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 4 }}>
                  {t('dashboard.chartNoDataStatus')}
                </Typography>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: theme.palette.background.paper }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" gutterBottom color="text.primary">
                {t('dashboard.alerts')}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {Array.isArray(stats?.alerts) && stats.alerts.length > 0 ? (
                  stats.alerts.map((a, i) => (
                    <Alert
                      key={i}
                      severity={
                        a.severity === 'success'
                          ? 'success'
                          : a.severity === 'warning'
                            ? 'warning'
                            : a.severity === 'error'
                              ? 'error'
                              : 'info'
                      }
                    >
                      {a.message}
                    </Alert>
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                    {t('dashboard.teacherNoAlerts')}
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Dashboard;
