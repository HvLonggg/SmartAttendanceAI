import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Paper,
  LinearProgress,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { analyticsAPI } from '../services/api';

function AttendanceProgress({ value, label }) {
  const getColor = (val) => {
    if (val >= 80) return 'success';
    if (val >= 60) return 'warning';
    return 'error';
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body2" fontWeight="bold">
          {value.toFixed(1)}%
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={value}
        color={getColor(value)}
        sx={{ height: 8, borderRadius: 4 }}
      />
    </Box>
  );
}

function AnalyticsReport() {
  const [selectedClass, setSelectedClass] = useState('');
  const [classStats, setClassStats] = useState([]);
  const [loading, setLoading] = useState(false);

  // Sample data - thay bằng API call thực tế
  const trendData = [
    { week: 'Tuần 1', tyLe: 95 },
    { week: 'Tuần 2', tyLe: 92 },
    { week: 'Tuần 3', tyLe: 88 },
    { week: 'Tuần 4', tyLe: 90 },
    { week: 'Tuần 5', tyLe: 87 },
    { week: 'Tuần 6', tyLe: 85 },
  ];

  const behaviorData = [
    { subject: 'Đúng giờ', value: 85 },
    { subject: 'Tương tác', value: 70 },
    { subject: 'Hoàn thành BT', value: 80 },
    { subject: 'Tham gia', value: 90 },
    { subject: 'Chuyên cần', value: 75 },
  ];

  const comparisonData = [
    { lop: 'DCCNTT13.10.1', tyLe: 88 },
    { lop: 'DCCNTT13.10.2', tyLe: 85 },
    { lop: 'DCCNTT13.10.3', tyLe: 92 },
    { lop: 'DCCNTT13.10.4', tyLe: 79 },
    { lop: 'DCCNTT13.10.5', tyLe: 86 },
  ];

  const topStudents = [
    { ma_sv: '20220001', ho_ten: 'Nguyễn Văn A', ty_le: 100, so_buoi: '15/15' },
    { ma_sv: '20220002', ho_ten: 'Trần Thị B', ty_le: 100, so_buoi: '15/15' },
    { ma_sv: '20220003', ho_ten: 'Lê Văn C', ty_le: 93.3, so_buoi: '14/15' },
    { ma_sv: '20220004', ho_ten: 'Phạm Thị D', ty_le: 93.3, so_buoi: '14/15' },
    { ma_sv: '20220005', ho_ten: 'Hoàng Văn E', ty_le: 86.7, so_buoi: '13/15' },
  ];

  const atRiskStudents = [
    { ma_sv: '20220035', ho_ten: 'Hoàng Văn Long', ty_le: 73.3, so_buoi: '11/15', ket_luan: 'Cảnh báo' },
    { ma_sv: '20220036', ho_ten: 'Nguyễn Thị F', ty_le: 66.7, so_buoi: '10/15', ket_luan: 'Nguy cơ cao' },
    { ma_sv: '20220037', ho_ten: 'Trần Văn G', ty_le: 60.0, so_buoi: '9/15', ket_luan: 'Nguy cơ cao' },
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        Báo cáo & Phân tích Chuyên cần
      </Typography>

      {/* Overview Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" variant="body2">
                Tỷ lệ chuyên cần TB
              </Typography>
              <Typography variant="h3" color="primary">
                85.6%
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <TrendingDownIcon color="error" fontSize="small" />
                <Typography variant="body2" color="error" sx={{ ml: 0.5 }}>
                  -2.3% so với tuần trước
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" variant="body2">
                Sinh viên đủ điều kiện
              </Typography>
              <Typography variant="h3" color="success.main">
                293/273
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                90,76% đủ điều kiện dự thi
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" variant="body2">
                Sinh viên nguy cơ
              </Typography>
              <Typography variant="h3" color="error.main">
                20
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Dưới 80% chuyên cần
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" variant="body2">
                Tỷ lệ đi trễ TB
              </Typography>
              <Typography variant="h3" color="warning.main">
                12.4%
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <TrendingUpIcon color="error" fontSize="small" />
                <Typography variant="body2" color="error" sx={{ ml: 0.5 }}>
                  +1.8% so với tuần trước
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Biểu đồ xu hướng */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Xu hướng chuyên cần theo thời gian
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="tyLe"
                    stroke="#1976d2"
                    strokeWidth={3}
                    name="Tỷ lệ chuyên cần (%)"
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
                Phân tích hành vi học tập
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={behaviorData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" />
                  <PolarRadiusAxis domain={[0, 100]} />
                  <Radar
                    name="Điểm"
                    dataKey="value"
                    stroke="#1976d2"
                    fill="#1976d2"
                    fillOpacity={0.6}
                  />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* So sánh lớp */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                So sánh chuyên cần giữa các lớp
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="lop" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="tyLe" fill="#2e7d32" name="Tỷ lệ chuyên cần (%)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Bảng sinh viên */}
      <Grid container spacing={3}>
        {/* Top sinh viên */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                🏆 Top sinh viên xuất sắc
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>STT</TableCell>
                      <TableCell>Mã SV</TableCell>
                      <TableCell>Họ tên</TableCell>
                      <TableCell align="right">Tỷ lệ</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topStudents.map((student, index) => (
                      <TableRow key={student.ma_sv}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>{student.ma_sv}</TableCell>
                        <TableCell>{student.ho_ten}</TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${student.ty_le}%`}
                            color="success"
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Sinh viên cần quan tâm */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                ⚠️ Sinh viên cần quan tâm
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Mã SV</TableCell>
                      <TableCell>Họ tên</TableCell>
                      <TableCell align="right">Tỷ lệ</TableCell>
                      <TableCell>Cảnh báo</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {atRiskStudents.map((student) => (
                      <TableRow key={student.ma_sv}>
                        <TableCell>{student.ma_sv}</TableCell>
                        <TableCell>{student.ho_ten}</TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${student.ty_le}%`}
                            color="error"
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={student.ket_luan}
                            color="warning"
                            size="small"
                            icon={<WarningIcon />}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Khuyến nghị AI */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            🤖 Phân tích & Khuyến nghị từ AI
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" fontWeight="bold">
              Xu hướng chuyên cần:
            </Typography>
            <Typography variant="body2">
              Tỷ lệ chuyên cần có xu hướng giảm nhẹ trong 3 tuần gần đây (-4.5%). 
              Nguyên nhân chính: tăng số lượng sinh viên đi trễ vào buổi sáng (8h-9h).
            </Typography>
          </Alert>

          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" fontWeight="bold">
              Nhóm nguy cơ:
            </Typography>
            <Typography variant="body2">
              8 sinh viên có nguy cơ không đủ điều kiện dự thi. Đề xuất: Gặp gỡ trực tiếp
              để tìm hiểu nguyên nhân và hỗ trợ kịp thời.
            </Typography>
          </Alert>

          <Alert severity="success">
            <Typography variant="subtitle2" fontWeight="bold">
              Điểm tích cực:
            </Typography>
            <Typography variant="body2">
              94.7% sinh viên duy trì chuyên cần tốt. Lớp DCCNTT13.10.3 có tỷ lệ cao nhất (92%), 
              có thể chia sẻ kinh nghiệm quản lý lớp với các lớp khác.
            </Typography>
          </Alert>
        </CardContent>
      </Card>
    </Box>
  );
}

export default AnalyticsReport;