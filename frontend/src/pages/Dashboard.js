import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Alert,
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
import { analyticsAPI } from '../services/api';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

function StatCard({ title, value, icon, color }) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography color="textSecondary" gutterBottom variant="body2">
              {title}
            </Typography>
            <Typography variant="h4" component="div">
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
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await analyticsAPI.getDashboardStats();
      setStats(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Không thể tải dữ liệu dashboard');
    } finally {
      setLoading(false);
    }
  };

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

  // Sample data for charts (would come from API in production)
  const attendanceData = [
    { name: 'Thứ 2', coMat: 45, vang: 5 },
    { name: 'Thứ 3', coMat: 48, vang: 2 },
    { name: 'Thứ 4', coMat: 47, vang: 3 },
    { name: 'Thứ 5', coMat: 46, vang: 4 },
    { name: 'Thứ 6', coMat: 44, vang: 6 },
  ];

  const statusData = [
    { name: 'Đúng giờ', value: 75 },
    { name: 'Trễ', value: 20 },
    { name: 'Vắng', value: 5 },
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        Dashboard Tổng quan
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Tổng Sinh viên"
            value={stats?.total_students || 0}
            icon={<PeopleIcon />}
            color="#1976d2"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Buổi học hôm nay"
            value={stats?.today_sessions || 0}
            icon={<EventIcon />}
            color="#2e7d32"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Lượt điểm danh"
            value={stats?.today_attendance || 0}
            icon={<CheckIcon />}
            color="#ed6c02"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Tỷ lệ đi trễ"
            value={`${stats?.late_rate?.toFixed(1) || 0}%`}
            icon={<ScheduleIcon />}
            color="#d32f2f"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Biểu đồ cột - Chuyên cần theo ngày */}
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Thống kê chuyên cần tuần này
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={attendanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="coMat" fill="#2e7d32" name="Có mặt" />
                  <Bar dataKey="vang" fill="#d32f2f" name="Vắng" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Biểu đồ tròn - Trạng thái điểm danh */}
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Phân bố trạng thái
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Thông báo nhanh */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Thông báo & Cảnh báo
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Alert severity="warning">
                  5 sinh viên có tỷ lệ chuyên cần dưới 80% - Nguy cơ không đủ điều kiện dự thi
                </Alert>
                <Alert severity="info">
                  Buổi học tiếp theo: Lập trình Web - 14:00 - Phòng A101
                </Alert>
                <Alert severity="success">
                  Hệ thống hoạt động bình thường. Độ chính xác nhận diện: 98.5%
                </Alert>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Dashboard;