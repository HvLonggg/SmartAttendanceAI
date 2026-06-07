import React, { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Webcam from 'react-webcam';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  CircularProgress,
  Grid,
  IconButton,
  Paper,
  Typography,
  Chip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FaceRetouchingNaturalIcon from '@mui/icons-material/FaceRetouchingNatural';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MasksIcon from '@mui/icons-material/Masks';
import BackHandIcon from '@mui/icons-material/BackHand';
import { recognitionAPI } from '../services/api';
import { buildRecognitionBlockNotice } from '../utils/recognitionFeedback';
import CameraNoticeOverlay from '../components/CameraNoticeOverlay';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { getStudentAvatarSrc, getStudentInitialLetter } from '../utils/studentAvatar';

const videoConstraints = {
  width: 1280,
  height: 720,
  facingMode: 'user',
};

export default function FaceIdTestPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { maSV } = useParams();
  const { user } = useAuth();
  const webcamRef = useRef(null);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [avatarKey, setAvatarKey] = useState(0);
  const [cameraNotice, setCameraNotice] = useState(null);

  const noticeIconForKind = (kind) => {
    if (kind === 'mask') return <MasksIcon sx={{ fontSize: 36, color: '#fff' }} />;
    if (kind === 'occluded') return <BackHandIcon sx={{ fontSize: 36, color: '#fff' }} />;
    if (kind === 'unknown_face') return <FaceRetouchingNaturalIcon sx={{ fontSize: 36, color: '#fff' }} />;
    return <ErrorOutlineIcon sx={{ fontSize: 36, color: '#fff' }} />;
  };

  const isOwner = useMemo(() => {
    if (!user) return false;
    if (user.role !== 'STUDENT') return true;
    return String(user.ma_sv || '') === String(maSV || '');
  }, [user, maSV]);

  const doFaceIdTest = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setCameraNotice(null);
    try {
      const imageSrc = webcamRef.current?.getScreenshot?.();
      if (!imageSrc) {
        setError('Không lấy được hình từ webcam. Vui lòng kiểm tra quyền truy cập camera.');
        return;
      }

      const blob = await fetch(imageSrc).then((r) => r.blob());
      const file = new File([blob], 'faceid_test.jpg', { type: 'image/jpeg' });
      const res = await recognitionAPI.recognizeFace(file);
      const data = res.data || {};
      setResult(data);
      if (data?.success) setAvatarKey((k) => k + 1);
      if (!data.success) {
        const blockNotice = buildRecognitionBlockNotice(data, t, 'Đã hiểu');
        if (blockNotice) {
          setCameraNotice({
            ...blockNotice,
            icon: noticeIconForKind(blockNotice.kind),
          });
        } else {
          setError(data.message || 'Không xác thực được khuôn mặt. Vui lòng thử lại.');
        }
      }
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || 'Lỗi khi kiểm tra Face ID.');
    } finally {
      setRunning(false);
    }
  };

  const matchedCurrentStudent =
    result?.success && String(result?.student_info?.ma_sv || '') === String(maSV || '');
  const si = result?.student_info;
  const avatarSrc = si ? getStudentAvatarSrc(si, avatarKey) : null;

  return (
    <Box sx={{ maxWidth: 980, mx: 'auto', px: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => navigate(-1)} color="primary">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" fontWeight={900}>
          Face ID Test
        </Typography>
      </Box>

      {!isOwner && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Bạn chỉ được test khuôn mặt cho đúng tài khoản của mình.
        </Alert>
      )}

      <Alert severity="info" icon={<InfoOutlinedIcon />} sx={{ mb: 2 }}>
        Chế độ kiểm thử cho phép nhận diện trực tiếp hoặc qua ảnh trên điện thoại/thiết bị khác.
        Điểm danh chính thức vẫn yêu cầu khuôn mặt trực tiếp trước webcam.
      </Alert>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 4, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Đưa mặt vào khung tròn hoặc giơ ảnh trên điện thoại vào camera, nhìn thẳng ống kính,
                giữ khoảng cách khoảng 50–80 cm rồi bấm xác thực.
              </Typography>

              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                <Box sx={{ position: 'relative' }}>
                <Box
                  sx={{
                    position: 'relative',
                    width: { xs: 280, md: 340 },
                    height: { xs: 280, md: 340 },
                    borderRadius: '50%',
                    overflow: 'hidden',
                    backgroundColor: '#0f172a',
                    border: '3px solid rgba(56,189,248,0.85)',
                    boxShadow: '0 0 0 10px rgba(56,189,248,0.08), 0 0 40px rgba(56,189,248,0.35)',
                    transition: 'filter 0.25s ease, opacity 0.25s ease',
                    ...(cameraNotice ? { filter: 'blur(2.2px)', opacity: 0.7 } : {}),
                  }}
                >
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    mirrored
                    screenshotFormat="image/jpeg"
                    videoConstraints={videoConstraints}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      pointerEvents: 'none',
                      '&::after': running
                        ? {
                            content: '""',
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: '-20%',
                            height: 4,
                            background: 'linear-gradient(90deg, transparent, #67e8f9, transparent)',
                            boxShadow: '0 0 18px #67e8f9',
                            animation: 'scanLine 1.6s linear infinite',
                          }
                        : {},
                      '@keyframes scanLine': {
                        '0%': { top: '-10%' },
                        '100%': { top: '110%' },
                      },
                    }}
                  />
                </Box>
                <CameraNoticeOverlay
                  open={Boolean(cameraNotice)}
                  variant={cameraNotice?.variant || 'warning'}
                  icon={cameraNotice?.icon}
                  title={cameraNotice?.title}
                  message={cameraNotice?.message}
                  actionLabel={cameraNotice?.actionLabel || 'Đã hiểu'}
                  onDismiss={() => setCameraNotice(null)}
                />
                </Box>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <Chip icon={<FaceRetouchingNaturalIcon />} label={`Mã SV kiểm tra: ${maSV}`} />
                {result?.success ? (
                  <Chip color="success" icon={<VerifiedUserIcon />} label="Nhận diện thành công" />
                ) : (
                  <Chip color="warning" icon={<ErrorOutlineIcon />} label="Chưa xác thực" />
                )}
              </Box>

              {result?.success && (
                <Alert severity={matchedCurrentStudent ? 'success' : 'warning'} sx={{ mb: 2 }}>
                  {matchedCurrentStudent
                    ? `Kiểm thử thành công. Nhận diện: ${result.student_info?.ho_ten} (${result.student_info?.ma_sv}).`
                    : `Nhận diện được: ${result.student_info?.ho_ten} (${result.student_info?.ma_sv}) — không khớp tài khoản đang kiểm tra.`}
                </Alert>
              )}

              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant="contained"
                  size="large"
                  disabled={running || !isOwner || Boolean(cameraNotice)}
                  onClick={doFaceIdTest}
                  sx={{
                    px: 4,
                    py: 1.2,
                    borderRadius: 99,
                    background: 'linear-gradient(135deg,#06b6d4,#3b82f6)',
                    fontWeight: 800,
                  }}
                  startIcon={running ? <CircularProgress size={18} color="inherit" /> : <VerifiedUserIcon />}
                >
                  {running ? 'Đang xác thực...' : 'Xác thực Face ID'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, md: 3 },
              borderRadius: 4,
              border: '1px solid',
              borderColor: 'divider',
              minHeight: 380,
              background:
                result?.success && si
                  ? 'linear-gradient(145deg, rgba(16,185,129,0.06), rgba(99,102,241,0.04))'
                  : 'background.paper',
            }}
          >
            <Typography variant="subtitle1" fontWeight={800} gutterBottom>
              Kết quả định danh
            </Typography>
            <Divider sx={{ mb: 2 }} />

            {error && !cameraNotice && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {result?.success && si ? (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                  <Avatar
                    src={avatarSrc || undefined}
                    alt={si.ho_ten}
                    sx={{
                      width: 88,
                      height: 88,
                      fontSize: '2rem',
                      fontWeight: 800,
                      border: '3px solid',
                      borderColor: matchedCurrentStudent ? 'success.main' : 'warning.main',
                      boxShadow: matchedCurrentStudent
                        ? '0 8px 24px rgba(16,185,129,0.25)'
                        : '0 8px 24px rgba(245,158,11,0.25)',
                    }}
                  >
                    {!avatarSrc ? getStudentInitialLetter(si.ho_ten) : null}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <Typography variant="h6" fontWeight={900}>
                      {si.ho_ten}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {si.ma_sv}
                    </Typography>
                    <Chip
                      size="small"
                      color={matchedCurrentStudent ? 'success' : 'warning'}
                      icon={<VerifiedUserIcon />}
                      label={matchedCurrentStudent ? 'Đúng tài khoản sinh viên' : 'Không khớp tài khoản sinh viên'}
                      sx={{ mt: 1, fontWeight: 700 }}
                    />
                  </Box>
                </Box>

                <Grid container spacing={1.5}>
                  {[
                    { label: 'Ngày sinh', value: si.ngay_sinh || '—' },
                    { label: 'Giới tính', value: si.gioi_tinh || '—' },
                    { label: 'Lớp', value: si.lop || '—' },
                    { label: 'Khoa', value: si.khoa || '—' },
                    { label: 'Email', value: si.email || '—' },
                  ].map((row) => (
                    <Grid item xs={12} sm={6} key={row.label}>
                      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {row.label}
                        </Typography>
                        <Typography variant="body2" fontWeight={700}>
                          {row.value}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            ) : (
              !error && !cameraNotice && (
                <Box sx={{ py: 6, textAlign: 'center' }}>
                  <FaceRetouchingNaturalIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary" variant="body2">
                    Chưa có dữ liệu định danh. Bấm «Xác thực Face ID» để kiểm tra mô hình nhận diện.
                  </Typography>
                </Box>
              )
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
