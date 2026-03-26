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
  TextField,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Person as PersonIcon,
  Email as EmailIcon,
  School as SchoolIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Schedule as ScheduleIcon,
  PhotoCamera as PhotoCameraIcon,
  DeleteOutline as DeleteOutlineIcon,
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
import { studentAPI, analyticsAPI, studentPortalAPI } from '../services/api';
import { getStudentAvatarSrc } from '../utils/studentAvatar';
import { formatApiError } from '../utils/apiError';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';

const COLORS = ['#2e7d32', '#ed6c02', '#d32f2f'];

function StudentDetail() {
  const { maSV } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const dateLocale = locale === 'en' ? 'en-US' : 'vi-VN';
  const [student, setStudent] = useState(null);
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(null);
  const [avatarSuccess, setAvatarSuccess] = useState(null);
  const [avatarKey, setAvatarKey] = useState(0); // cache busting
  const [profileHoTen, setProfileHoTen] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);
  const [profileErr, setProfileErr] = useState(null);

  useEffect(() => {
    fetchStudentData();
  }, [maSV]);

  useEffect(() => {
    if (student) {
      setProfileHoTen(student.ho_ten || '');
      setProfileEmail(student.email || '');
    }
  }, [student]);

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
      setError(t('studentDetailPage.loadFail'));
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
          {t('studentDetailPage.backList')}
        </Button>
      </Box>
    );
  }

  if (!student) {
    return (
      <Alert severity="warning">{t('studentDetailPage.notFound')}</Alert>
    );
  }

  if (user?.role === 'STUDENT' && String(maSV) !== String(user?.ma_sv)) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t('studentDetailPage.studentOnlyMessage')}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/student')} variant="outlined">
          {t('studentDetailPage.backStudent')}
        </Button>
      </Box>
    );
  }

  const getAvatarSrc = () => {
    if (!student?.anh_dai_dien) return null;
    return getStudentAvatarSrc(student, avatarKey);
  };

  /** Giảng viên chỉ xem thông tin / chuyên cần, không chỉnh ảnh đại diện */
  const canEditAvatar =
    user?.role === 'ADMIN' ||
    (user?.role === 'STUDENT' && user?.ma_sv === student?.ma_sv);

  const canEditStudentProfile =
    user?.role === 'STUDENT' && String(user?.ma_sv) === String(student?.ma_sv);

  const handleSaveStudentProfile = async () => {
    setProfileErr(null);
    setProfileMsg(null);
    setProfileSaving(true);
    try {
      await studentPortalAPI.updateMyProfile({
        ho_ten: profileHoTen,
        email: profileEmail,
      });
      setProfileMsg(t('studentDetailPage.updateMsg'));
      await fetchStudentData();
    } catch (err) {
      setProfileErr(formatApiError(err.response?.data?.detail, t('studentDetailPage.saveFail')));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError(null);
    setAvatarSuccess(null);
    setAvatarUploading(true);
    try {
      await studentAPI.uploadAvatar(student.ma_sv, file);
      setAvatarSuccess(t('studentDetailPage.avatarUpdated'));
      await fetchStudentData();
      setAvatarKey((k) => k + 1);
    } catch (err) {
      console.error('Upload avatar error:', err);
      setAvatarError(formatApiError(err.response?.data?.detail, t('studentDetailPage.avatarUploadFail')));
    } finally {
      setAvatarUploading(false);
      // reset để chọn lại cùng file vẫn trigger onChange
      e.target.value = '';
    }
  };

  const handleDeleteAvatar = async () => {
    setAvatarError(null);
    setAvatarSuccess(null);
    setAvatarUploading(true);
    try {
      await studentAPI.deleteAvatar(student.ma_sv);
      setAvatarSuccess(t('studentDetailPage.avatarDeleted'));
      await fetchStudentData();
      setAvatarKey((k) => k + 1);
    } catch (err) {
      console.error('Delete avatar error:', err);
      setAvatarError(formatApiError(err.response?.data?.detail, t('studentDetailPage.avatarDeleteFail')));
    } finally {
      setAvatarUploading(false);
    }
  };

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
    { name: t('studentDetailPage.pie.onAttendance'), value: totalAttended },
    { name: t('studentDetailPage.pie.absent'), value: totalClasses - totalAttended },
  ];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(user?.role === 'STUDENT' ? '/student' : '/students')}
          variant="outlined"
          sx={{
            borderWidth: 2,
            borderColor: 'primary.light',
            fontWeight: 700,
            '&:hover': {
              borderWidth: 2,
              borderColor: 'primary.main',
              bgcolor: 'rgba(99,102,241,0.06)',
            },
          }}
        >
          {t('studentDetailPage.back')}
        </Button>
      </Box>

      {/* Thông tin cơ bản */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card
            elevation={0}
            sx={{
              overflow: 'hidden',
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: '0 8px 32px rgba(99,102,241,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <Box
              sx={{
                position: 'relative',
                px: 2.5,
                pt: 3,
                pb: 2.5,
                textAlign: 'center',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 42%, #ec4899 100%)',
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  background:
                    'radial-gradient(ellipse 80% 60% at 50% 120%, rgba(255,255,255,0.22), transparent 55%)',
                  pointerEvents: 'none',
                },
              }}
            >
              <Box sx={{ position: 'relative', zIndex: 1 }}>
                <Avatar
                  src={getAvatarSrc() || undefined}
                  sx={{
                    width: 112,
                    height: 112,
                    margin: '0 auto 14px',
                    bgcolor: 'rgba(255,255,255,0.25)',
                    fontSize: 44,
                    fontWeight: 800,
                    color: '#fff',
                    border: '4px solid rgba(255,255,255,0.95)',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
                  }}
                >
                  {(!student.anh_dai_dien && student.ho_ten?.charAt(0)) || ''}
                </Avatar>

                <Typography
                  variant="h5"
                  fontWeight={800}
                  sx={{ color: '#fff', textShadow: '0 1px 8px rgba(0,0,0,0.15)', mb: 1 }}
                >
                  {student.ho_ten}
                </Typography>
                <Chip
                  label={student.trang_thai || t('studentDetailPage.statusDefault')}
                  size="small"
                  sx={{
                    mb: 2,
                    bgcolor: 'rgba(255,255,255,0.22)',
                    color: '#fff',
                    fontWeight: 600,
                    border: '1px solid rgba(255,255,255,0.35)',
                    '& .MuiChip-label': { px: 1.5 },
                  }}
                />

                {canEditAvatar && (
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: 1,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Button
                      component="label"
                      variant="contained"
                      disabled={avatarUploading}
                      startIcon={<PhotoCameraIcon />}
                      sx={{
                        bgcolor: 'rgba(255,255,255,0.98)',
                        color: '#6366f1',
                        fontWeight: 700,
                        boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
                        transition: 'all 0.25s ease',
                        '&:hover': {
                          bgcolor: '#fff',
                          transform: 'translateY(-2px)',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                        },
                      }}
                    >
                      {student.anh_dai_dien ? t('studentDetailPage.changePhoto') : t('studentDetailPage.uploadPhoto')}
                      <input
                        hidden
                        accept="image/*"
                        type="file"
                        onChange={handleAvatarFileChange}
                      />
                    </Button>
                    <Button
                      variant="outlined"
                      disabled={avatarUploading || !student.anh_dai_dien}
                      onClick={handleDeleteAvatar}
                      startIcon={<DeleteOutlineIcon />}
                      sx={{
                        borderColor: 'rgba(255,255,255,0.7)',
                        color: '#fff',
                        fontWeight: 600,
                        transition: 'all 0.25s ease',
                        '&:hover': {
                          borderColor: '#fff',
                          bgcolor: 'rgba(255,255,255,0.15)',
                          transform: 'translateY(-2px)',
                        },
                        '&.Mui-disabled': {
                          borderColor: 'rgba(255,255,255,0.25)',
                          color: 'rgba(255,255,255,0.45)',
                        },
                      }}
                    >
                      {t('studentDetailPage.removePhoto')}
                    </Button>
                  </Box>
                )}
              </Box>
            </Box>

            {avatarError && (
              <Alert severity="error" sx={{ mx: 2, mt: 1.5 }}>
                {avatarError}
              </Alert>
            )}
            {avatarSuccess && (
              <Alert severity="success" sx={{ mx: 2, mt: 1.5 }}>
                {avatarSuccess}
              </Alert>
            )}

            <CardContent sx={{ pt: 2.5, pb: 2, textAlign: 'left' }}>
              <Divider sx={{ mb: 2 }} />

              <Box sx={{ textAlign: 'left' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <PersonIcon sx={{ mr: 1, color: 'text.secondary' }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {t('studentDetailPage.fieldStudentId')}
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
                      {t('studentDetailPage.fieldClass')}
                    </Typography>
                    <Typography variant="body1" fontWeight={500}>
                      {student.lop || t('studentDetailPage.noStudentInfo')}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <SchoolIcon sx={{ mr: 1, color: 'text.secondary' }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {t('studentDetailPage.fieldFaculty')}
                    </Typography>
                    <Typography variant="body1" fontWeight={500}>
                      {student.khoa || t('studentDetailPage.noStudentInfo')}
                    </Typography>
                  </Box>
                </Box>

                {student.email && (
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <EmailIcon sx={{ mr: 1, color: 'text.secondary' }} />
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                      {t('studentDetailPage.fieldEmail')}
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
                      {t('studentDetailPage.fieldBirthDate')}
                      </Typography>
                      <Typography variant="body1">
                      {new Date(student.ngay_sinh).toLocaleDateString(dateLocale)}
                      </Typography>
                    </Box>
                  </Box>
                )}

                {canEditStudentProfile && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" fontWeight={800} gutterBottom sx={{ color: 'primary.main' }}>
                      {t('studentDetailPage.contactUpdateTitle')}
                    </Typography>
                    {profileErr && (
                      <Alert severity="error" sx={{ mb: 1 }}>
                        {profileErr}
                      </Alert>
                    )}
                    {profileMsg && (
                      <Alert severity="success" sx={{ mb: 1 }}>
                        {profileMsg}
                      </Alert>
                    )}
                    <TextField
                      label={t('studentDetailPage.fullNameLabel')}
                      fullWidth
                      value={profileHoTen}
                      onChange={(e) => setProfileHoTen(e.target.value)}
                      sx={{ mb: 1.5 }}
                      size="small"
                    />
                    <TextField
                      label={t('studentDetailPage.emailLabel')}
                      fullWidth
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      sx={{ mb: 1.5 }}
                      size="small"
                    />
                    <Button variant="contained" onClick={handleSaveStudentProfile} disabled={profileSaving} fullWidth>
                      {profileSaving ? t('studentDetailPage.saving') : t('studentDetailPage.saveChanges')}
                    </Button>
                  </>
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
                    {t('studentDetailPage.overallAttendanceRate')}
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
                    {t('studentDetailPage.totalSessions')}
                  </Typography>
                  <Typography variant="h3" color="primary" fontWeight="bold">
                    {totalClasses}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {t('studentDetailPage.presentCount', { count: totalAttended })}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" variant="body2" gutterBottom>
                    {t('studentDetailPage.eligibleCourses')}
                  </Typography>
                  <Typography variant="h3" color="success.main" fontWeight="bold">
                    {eligibleClasses}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {t('studentDetailPage.eligibleCoursesSuffix', { total: analytics.length })}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" variant="body2" gutterBottom>
                    {t('studentDetailPage.statusTitle')}
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
                    {overallRate >= 80 ? t('studentDetailPage.statusEligible') : t('studentDetailPage.statusIneligible')}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Biểu đồ */}
            <Grid item xs={12} md={8}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {t('studentDetailPage.chartAttendanceByCourseTitle')}
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
                        name={t('studentDetailPage.chartRatioLabel')}
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
                    {t('studentDetailPage.distributionTitle')}
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
                {t('studentDetailPage.detailsTitle')}
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('studentDetailPage.table.courseClassCode')}</TableCell>
                      <TableCell align="center">{t('studentDetailPage.table.presentCount')}</TableCell>
                      <TableCell align="center">{t('studentDetailPage.table.totalCount')}</TableCell>
                      <TableCell align="center">{t('studentDetailPage.table.ratio')}</TableCell>
                      <TableCell align="center">{t('studentDetailPage.table.conclusion')}</TableCell>
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
                    {t('studentDetailPage.emptyAttendance')}
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
                {t('studentDetailPage.warningTitle')}
              </Typography>
              <Typography variant="body2">
                {t('studentDetailPage.warningMessage', { rate: overallRate.toFixed(1) })}
              </Typography>
            </Alert>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}

export default StudentDetail;