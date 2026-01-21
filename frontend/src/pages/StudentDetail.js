import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Avatar,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Divider,
  Paper,
  LinearProgress,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Person as PersonIcon,
  Email as EmailIcon,
  School as SchoolIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
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
import { studentAPI, analyticsAPI } from '../services/api';

const COLORS = ['#2e7d32', '#ed6c02', '#d32f2f'];

function StudentDetail() {
  const { maSV } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStudentData();
  }, [maSV]);

  const fetchStudentData = async () => {
    try {
      setLoading(true);
      const [studentRes, analyticsRes] = await Promise.all([
        studentAPI.getById(maSV),
        analyticsAPI.getStudentAnalytics(maSV),
      ]);

      setStudent(studentRes.data);
      setAnalytics(analyticsRes.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching student data:', err);
      setError('Không thể tải thông tin sinh viên');
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
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/students')}>
          Quay lại danh sách
        </Button>
      </Box>
    );
  }

  if (!student) {
    return (
      <Alert severity="warning">Không tìm thấy thông tin sinh viên</Alert>
    );
  }

  // Tính toán thống kê
  const totalClasses = analytics.reduce((sum, item) => sum + item.tong_buoi, 0);
  const totalAttended = analytics.reduce((sum, item) => sum + item.so_buoi_co_mat, 0);
  const overallRate = totalClasses > 0 ? (totalAttended / totalClasses) * 100 : 0;
  const eligibleClasses = analytics.filter(item => item.ty_le_chuyen_can >= 80).length;

  // Data cho biểu đồ
  const attendanceData = analytics.map(item => ({
    mon: item.ma_lhp,
    tyLe: item.ty_le_chuyen_can,
  }));

  const pieData = [
    { name: 'Đi học', value: totalAttended },
    { name: 'Vắng', value: totalClasses - totalAttended },
  ];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/students')}
          variant="outlined"
        >
          Quay lại
        </Button>
      </Box>

      {/* Thông tin cơ bản */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar
                sx={{
                  width: 120,
                  height: 120,
                  margin: '0 auto 16px',
                  bgcolor: 'primary.main',
                  fontSize: 48,
                }}
              >
                {student.ho_ten.charAt(0)}
              </Avatar>
              <Typography variant="h5" gutterBottom fontWeight="bold">
                {student.ho_ten}
              </Typography>
              <Chip
                label={student.trang_thai || 'Đang học'}
                color={student.trang_thai === 'Đang học' ? 'success' : 'default'}
                sx={{ mb: 2 }}
              />

              <Divider sx={{ my: 2 }} />

              <Box sx={{ textAlign: 'left' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <PersonIcon sx={{ mr: 1, color: 'text.secondary' }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Mã sinh viên
                    </Typography>
                    <Typography variant="body1" fontWeight={500}>
                      {student.ma_sv}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <SchoolIcon sx={{ mr: 1, color: 'text.secondary' }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Lớp
                    </Typography>
                    <Typography variant="body1" fontWeight={500}>
                      {student.lop || 'Chưa có thông tin'}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <SchoolIcon sx={{ mr: 1, color: 'text.secondary' }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Khoa
                    </Typography>
                    <Typography variant="body1" fontWeight={500}>
                      {student.khoa || 'Chưa có thông tin'}
                    </Typography>
                  </Box>
                </Box>

                {student.email && (
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <EmailIcon sx={{ mr: 1, color: 'text.secondary' }} />
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Email
                      </Typography>
                      <Typography variant="body2">
                        {student.email}
                      </Typography>
                    </Box>
                  </Box>
                )}

                {student.ngay_sinh && (
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <ScheduleIcon sx={{ mr: 1, color: 'text.secondary' }} />
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Ngày sinh
                      </Typography>
                      <Typography variant="body1">
                        {new Date(student.ngay_sinh).toLocaleDateString('vi-VN')}
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Thống kê tổng quan */}
        <Grid item xs={12} md={8}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" variant="body2" gutterBottom>
                    Tỷ lệ chuyên cần
                  </Typography>
                  <Typography variant="h3" color="primary" fontWeight="bold">
                    {overallRate.toFixed(1)}%
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={overallRate}
                    color={overallRate >= 80 ? 'success' : 'error'}
                    sx={{ mt: 1, height: 8, borderRadius: 4 }}
                  />
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" variant="body2" gutterBottom>
                    Tổng buổi học
                  </Typography>
                  <Typography variant="h3" color="primary" fontWeight="bold">
                    {totalClasses}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Có mặt: {totalAttended}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" variant="body2" gutterBottom>
                    Môn đủ ĐK
                  </Typography>
                  <Typography variant="h3" color="success.main" fontWeight="bold">
                    {eligibleClasses}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    / {analytics.length} môn
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" variant="body2" gutterBottom>
                    Tình trạng
                  </Typography>
                  <Typography
                    variant="h4"
                    color={overallRate >= 80 ? 'success.main' : 'error.main'}
                    fontWeight="bold"
                    sx={{ mt: 1 }}
                  >
                    {overallRate >= 80 ? (
                      <CheckIcon sx={{ fontSize: 48 }} />
                    ) : (
                      <CancelIcon sx={{ fontSize: 48 }} />
                    )}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {overallRate >= 80 ? 'Đủ điều kiện' : 'Không đủ ĐK'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Biểu đồ */}
            <Grid item xs={12} md={8}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Tỷ lệ chuyên cần theo môn học
                  </Typography>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={attendanceData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mon" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="tyLe"
                        stroke="#1976d2"
                        strokeWidth={2}
                        name="Tỷ lệ (%)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Phân bố điểm danh
                  </Typography>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Grid>

        {/* Chi tiết từng môn */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Chi tiết chuyên cần theo môn học
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Mã lớp học phần</TableCell>
                      <TableCell align="center">Số buổi có mặt</TableCell>
                      <TableCell align="center">Tổng số buổi</TableCell>
                      <TableCell align="center">Tỷ lệ (%)</TableCell>
                      <TableCell align="center">Kết luận</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {analytics.map((item) => (
                      <TableRow key={item.ma_lhp}>
                        <TableCell>{item.ma_lhp}</TableCell>
                        <TableCell align="center">{item.so_buoi_co_mat}</TableCell>
                        <TableCell align="center">{item.tong_buoi}</TableCell>
                        <TableCell align="center">
                          <Chip
                            label={`${item.ty_le_chuyen_can.toFixed(1)}%`}
                            color={item.ty_le_chuyen_can >= 80 ? 'success' : 'error'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={item.ket_luan}
                            color={item.ket_luan === 'ĐỦ ĐIỀU KIỆN' ? 'success' : 'error'}
                            size="small"
                            icon={
                              item.ket_luan === 'ĐỦ ĐIỀU KIỆN' ? (
                                <CheckIcon />
                              ) : (
                                <CancelIcon />
                              )
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {analytics.length === 0 && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography color="text.secondary">
                    Chưa có dữ liệu chuyên cần
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Cảnh báo */}
        {overallRate < 80 && (
          <Grid item xs={12}>
            <Alert severity="warning" icon={<CancelIcon />}>
              <Typography variant="subtitle2" fontWeight="bold">
                Cảnh báo chuyên cần
              </Typography>
              <Typography variant="body2">
                Sinh viên có nguy cơ không đủ điều kiện dự thi. Tỷ lệ chuyên cần tổng thể:{' '}
                {overallRate.toFixed(1)}% (yêu cầu ≥ 80%). Cần gặp sinh viên để tìm hiểu
                nguyên nhân và hỗ trợ kịp thời.
              </Typography>
            </Alert>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}

export default StudentDetail;