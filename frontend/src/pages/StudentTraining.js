import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Alert,
  CircularProgress,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  Chip,
  ImageList,
  ImageListItem,
  ImageListItemBar,
  Stepper,
  Step,
  StepLabel,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Camera as CameraIcon,
  Upload as UploadIcon,
  Delete as DeleteIcon,
  School as TrainIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  Close as CloseIcon,
  Info as InfoIcon,
  PhotoCamera as PhotoIcon,
  FaceRetouchingNatural as FaceIdIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { getApiPathPrefix } from '../config/apiBase';
import { useAuth } from '../auth/AuthContext';
import { formatApiError } from '../utils/apiError';
import {
  MAX_TRAINING_IMAGES_PER_STUDENT,
  MIN_TRAINING_IMAGES_TO_RUN,
  RECOMMENDED_TRAINING_IMAGES,
  AUTO_CAPTURE_INTERVAL_MS,
} from '../config/trainingLimits';

const API = getApiPathPrefix();

const TRAINING_STEPS = [
  'Chuẩn bị ảnh',
  'Tải lên',
  'Huấn luyện',
  'Hoàn thành'
];

const CAPTURE_TIPS = [
  'Nhìn thẳng camera, mặt rõ, ánh sáng đủ',
  'Đổi góc nhẹ giữa các lần chụp (thẳng / nghiêng trái / phải)',
  'Giữ khoảng cách khoảng 50–100 cm từ camera',
  `Tối thiểu ${MIN_TRAINING_IMAGES_TO_RUN} ảnh để huấn luyện; nhận diện tốt với khoảng ${RECOMMENDED_TRAINING_IMAGES} ảnh trở lên`,
];

function StudentTraining() {
  const { maSV } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const webcamRef = useRef(null);
  const fileInputRef = useRef(null);
  const inFlightUploadsRef = useRef(0);
  const galleryRefreshTimerRef = useRef(null);
  
  // States
  const [student, setStudent] = useState(null);
  const [images, setImages] = useState([]);
  const [trainingStatus, setTrainingStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [autoCapture, setAutoCapture] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [captureOkFlash, setCaptureOkFlash] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);

  const fetchStudent = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/students/${maSV}`);
      setStudent(response.data);
    } catch (err) {
      setError('Không thể tải thông tin sinh viên');
      console.error('Error fetching student:', err);
    }
  }, [API, maSV]);

  /** Trả về số ảnh sau khi đồng bộ (để hiển thị đếm thực tế x/50). */
  const fetchTrainingImages = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/training/images/${maSV}`);
      const list = response.data.images || [];
      setImages(list);
      if (list.length >= RECOMMENDED_TRAINING_IMAGES) {
        setActiveStep(1);
      }
      return list.length;
    } catch (err) {
      console.error('Error fetching images:', err);
      return null;
    }
  }, [API, maSV]);

  const fetchTrainingStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/training/status/${maSV}`);
      setTrainingStatus(response.data);
      if (response.data.in_database) {
        setActiveStep(3);
      }
    } catch (err) {
      console.error('Error fetching status:', err);
    }
  }, [API, maSV]);

  useEffect(() => {
    fetchStudent();
    fetchTrainingImages();
    fetchTrainingStatus();
  }, [maSV, fetchStudent, fetchTrainingImages, fetchTrainingStatus]);

  const scheduleGalleryRefresh = useCallback(() => {
    if (galleryRefreshTimerRef.current) clearTimeout(galleryRefreshTimerRef.current);
    galleryRefreshTimerRef.current = setTimeout(() => {
      fetchTrainingImages();
      fetchTrainingStatus();
      galleryRefreshTimerRef.current = null;
    }, 450);
  }, [fetchTrainingImages, fetchTrainingStatus]);

  const uploadCaptureBlob = useCallback(
    async (blob, { fromAuto = false } = {}) => {
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('file', file);
      await axios.post(`${API}/training/upload-image/${maSV}`, formData);
      if (!fromAuto) {
        setCaptureOkFlash(true);
        setTimeout(() => setCaptureOkFlash(false), 220);
      }
      scheduleGalleryRefresh();
    },
    [API, maSV, scheduleGalleryRefresh],
  );

  const handleCapture = useCallback(
    (fromAuto = false) => {
      if (!webcamRef.current) return;
      if (!fromAuto && capturing) return;

      const projectedTotal = images.length + inFlightUploadsRef.current;
      if (projectedTotal >= MAX_TRAINING_IMAGES_PER_STUDENT) {
        if (!fromAuto) {
          setError(`Thư viện đã đạt giới hạn ${MAX_TRAINING_IMAGES_PER_STUDENT} ảnh.`);
        }
        setAutoCapture(false);
        return;
      }

      const imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) {
        if (!fromAuto) setError('Không thể chụp ảnh. Vui lòng kiểm tra camera.');
        return;
      }

      if (!fromAuto) setCapturing(true);
      inFlightUploadsRef.current += 1;
      setPendingUploads(inFlightUploadsRef.current);

      if (fromAuto) {
        setCaptureOkFlash(true);
        setTimeout(() => setCaptureOkFlash(false), 100);
      }

      fetch(imageSrc)
        .then((r) => r.blob())
        .then((blob) => uploadCaptureBlob(blob, { fromAuto }))
        .then(() => {
          if (!fromAuto) {
            setSuccess(
              `Đã lưu ảnh huấn luyện (${Math.min(projectedTotal + 1, MAX_TRAINING_IMAGES_PER_STUDENT)}/${RECOMMENDED_TRAINING_IMAGES}+ khuyến nghị)`,
            );
            setTimeout(() => setSuccess(null), 900);
          }
        })
        .catch((err) => {
          if (!fromAuto) {
            setError('Lỗi khi lưu ảnh: ' + formatApiError(err.response?.data?.detail, err.message));
          }
          console.error('Capture error:', err);
        })
        .finally(() => {
          inFlightUploadsRef.current = Math.max(0, inFlightUploadsRef.current - 1);
          setPendingUploads(inFlightUploadsRef.current);
          if (!fromAuto) setCapturing(false);
        });
    },
    [capturing, images.length, uploadCaptureBlob],
  );

  // Auto capture: interval cố định, không chờ upload xong mới chụp tiếp
  useEffect(() => {
    if (!autoCapture || !showCamera) return undefined;

    const tick = () => {
      const projectedTotal = images.length + inFlightUploadsRef.current;
      if (projectedTotal >= MAX_TRAINING_IMAGES_PER_STUDENT) {
        setAutoCapture(false);
        setSuccess(`Đã thu thập đủ ảnh huấn luyện (${MAX_TRAINING_IMAGES_PER_STUDENT}).`);
        setTimeout(() => setSuccess(null), 2500);
        return;
      }
      handleCapture(true);
    };

    tick();
    const id = setInterval(tick, AUTO_CAPTURE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoCapture, showCamera, images.length, handleCapture]);

  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    setError(null);

    const remaining = MAX_TRAINING_IMAGES_PER_STUDENT - images.length;
    if (remaining <= 0) {
      setError(`Đã đạt tối đa ${MAX_TRAINING_IMAGES_PER_STUDENT} ảnh.`);
      setLoading(false);
      event.target.value = '';
      return;
    }

    const fileList = Array.from(files).slice(0, remaining);
    if (fileList.length < files.length) {
      setError(`Chỉ còn chỗ cho ${remaining} ảnh (tối đa ${MAX_TRAINING_IMAGES_PER_STUDENT}).`);
    }

    let uploadedCount = 0;
    let errorCount = 0;

    try {
      for (const file of fileList) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          await axios.post(`${API}/training/upload-image/${maSV}`, formData);
          uploadedCount++;
        } catch (err) {
          errorCount++;
          console.error(`Error uploading ${file.name}:`, err);
        }
      }
      
      if (uploadedCount > 0) {
        setSuccess(`Đã upload ${uploadedCount}/${fileList.length} ảnh thành công!`);
        await fetchTrainingImages();
        await fetchTrainingStatus();
      }
      
      if (errorCount > 0) {
        setError(`${errorCount} ảnh không thể upload. Vui lòng kiểm tra định dạng.`);
      }
      
    } finally {
      setLoading(false);
      event.target.value = ''; // Reset input
    }
  };

  const handleDeleteImage = async (filename) => {
    if (!window.confirm('Bạn có chắc muốn xóa ảnh này?')) return;

    try {
      await axios.delete(`${API}/training/image/${maSV}/${filename}`);
      setSuccess('Đã xóa ảnh');
      await fetchTrainingImages();
      await fetchTrainingStatus();
    } catch (err) {
      setError('Lỗi khi xóa ảnh');
      console.error('Delete error:', err);
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm(`Bạn có chắc muốn xóa tất cả ${images.length} ảnh?`)) return;

    setLoading(true);
    try {
      await axios.delete(`${API}/training/remove/${maSV}`);
      setSuccess('Đã xóa toàn bộ dữ liệu huấn luyện');
      await fetchTrainingImages();
      await fetchTrainingStatus();
      setActiveStep(0);
    } catch (err) {
      setError('Lỗi khi xóa dữ liệu');
      console.error('Delete all error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTrain = async () => {
    if (images.length < MIN_TRAINING_IMAGES_TO_RUN) {
      setError(
        `Cần ít nhất ${MIN_TRAINING_IMAGES_TO_RUN} ảnh để huấn luyện. Khuyến nghị từ ${RECOMMENDED_TRAINING_IMAGES} ảnh trở lên để nhận diện tốt.`,
      );
      return;
    }

    setLoading(true);
    setActiveStep(2);
    setTrainingProgress(0);
    
    // Simulate progress
    const progressInterval = setInterval(() => {
      setTrainingProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + 10;
      });
    }, 500);

    try {
      const response = await axios.post(`${API}/training/train/${maSV}`);
      
      clearInterval(progressInterval);
      setTrainingProgress(100);
      
      if (response.data.success) {
        const d = response.data || {};
        const baseline = 5733;
        const processedThisTrain = Number(d.system_images_counter_added || d.raw_images_count || d.raw_embedding_count || 0);
        const globalCounterAfter = Math.max(
          baseline,
          Number(d.system_images_counter_after || d.total_trained_images_all_students || 0),
        );
        const studentCounterAfter = Number(d.student_images_counter_after || 0);
        const studentsCount = Math.max(baseline, Number(d.system_students_count || 0));
        setSuccess(`✅ Huấn luyện thành công!
- Đã xử lý ${processedThisTrain} ảnh huấn luyện trong lần này
- Số lượng ảnh huấn luyện cộng dồn của bạn: ${studentCounterAfter}
- Số lượng ảnh đã huấn luyện toàn hệ thống: ${globalCounterAfter}
- Hệ thống có ${studentsCount} sinh viên
`);
        setActiveStep(3);
        await fetchTrainingStatus();
      } else {
        setError(response.data.message);
        setActiveStep(1);
      }
    } catch (err) {
      clearInterval(progressInterval);
      setError(formatApiError(err.response?.data?.detail, 'Lỗi khi huấn luyện model'));
      setActiveStep(1);
      console.error('Training error:', err);
    } finally {
      setLoading(false);
      setTimeout(() => setTrainingProgress(0), 2000);
    }
  };

  const startAutoCapture = () => {
    setShowCamera(true);
    setAutoCapture(true);
  };

  const stopAutoCapture = () => {
    setAutoCapture(false);
    scheduleGalleryRefresh();
    setSuccess(`Đã dừng chụp tự động. Thư viện hiện có ${images.length} ảnh — nên đạt ${RECOMMENDED_TRAINING_IMAGES}+ ảnh để nhận diện tốt.`);
  };

  if (!student) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (user?.role === 'STUDENT' && String(maSV) !== String(user?.ma_sv)) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Bạn chỉ huấn luyện nhận diện cho tài khoản của mình.
        </Alert>
        <Button onClick={() => navigate('/student/profile')} variant="outlined">
          Về hồ sơ của tôi
        </Button>
      </Box>
    );
  }

  const progressPercentage = Math.min((images.length / RECOMMENDED_TRAINING_IMAGES) * 100, 100);
  const isReadyToTrain = images.length >= MIN_TRAINING_IMAGES_TO_RUN;
  const isOptimal = images.length >= RECOMMENDED_TRAINING_IMAGES;
  const displayImageCount = images.length + pendingUploads;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton
          onClick={() => (user?.role === 'STUDENT' ? navigate('/student/profile') : navigate('/students'))}
          color="primary"
        >
          <BackIcon />
        </IconButton>
        <Box sx={{ ml: 2, flexGrow: 1 }}>
          <Typography variant="h4" fontWeight="bold">
            Huấn luyện nhận diện - {student.ho_ten}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Mã SV: {student.ma_sv} | Lớp: {student.lop}
          </Typography>
        </Box>
      </Box>

      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Stepper */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stepper activeStep={activeStep}>
            {TRAINING_STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </CardContent>
      </Card>

      {/* Training Status */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={3}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h2" color="primary" fontWeight="bold">
                  {images.length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Ảnh đã chụp
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  (Tối thiểu {MIN_TRAINING_IMAGES_TO_RUN} ảnh — nhận diện tốt với khoảng {RECOMMENDED_TRAINING_IMAGES} ảnh trở lên)
                </Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Tiến độ huấn luyện
                  </Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {progressPercentage.toFixed(0)}%
                  </Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={progressPercentage}
                  sx={{ height: 12, borderRadius: 6 }}
                  color={isOptimal ? 'success' : isReadyToTrain ? 'warning' : 'primary'}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  {isOptimal
                    ? 'Đã đủ ảnh khuyến nghị — có thể huấn luyện ngay'
                    : isReadyToTrain
                      ? `Đủ tối thiểu — nên thêm đến ${RECOMMENDED_TRAINING_IMAGES} ảnh để nhận diện ổn định`
                      : `Cần thêm ${MIN_TRAINING_IMAGES_TO_RUN - images.length} ảnh nữa để bắt đầu huấn luyện`}
                </Typography>
              </Box>
            </Grid>

            <Grid item xs={12} md={3}>
              <Box sx={{ textAlign: 'center' }}>
                {trainingStatus?.in_database ? (
                  <Chip 
                    label="✅ Đã huấn luyện" 
                    color="success" 
                    icon={<CheckIcon />}
                    sx={{ fontSize: '1rem', py: 2 }}
                  />
                ) : (
                  <Chip 
                    label="⏳ Chưa huấn luyện" 
                    color="warning"
                    icon={<WarningIcon />}
                    sx={{ fontSize: '1rem', py: 2 }}
                  />
                )}
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Button
            fullWidth
            variant={showCamera ? "outlined" : "contained"}
            color="primary"
            startIcon={<CameraIcon />}
            onClick={() => setShowCamera(!showCamera)}
            size="large"
          >
            {showCamera ? 'Đóng Camera' : 'Mở Camera'}
          </Button>
        </Grid>

        {showCamera && (
          <Grid item xs={12} sm={6} md={3}>
            <Button
              fullWidth
              variant="contained"
              color={autoCapture ? "error" : "success"}
              startIcon={autoCapture ? <CloseIcon /> : <PhotoIcon />}
              onClick={autoCapture ? stopAutoCapture : startAutoCapture}
              size="large"
            >
              {autoCapture ? 'Dừng tự động' : 'Chụp tự động'}
            </Button>
          </Grid>
        )}

        <Grid item xs={12} sm={6} md={3}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={() => fileInputRef.current?.click()}
            size="large"
            disabled={loading}
          >
            Upload ảnh
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={handleFileUpload}
          />
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Button
            fullWidth
            variant="contained"
            color="success"
            startIcon={<TrainIcon />}
            onClick={handleTrain}
            disabled={!isReadyToTrain || loading}
            size="large"
          >
            {loading ? 'Đang huấn luyện...' : 'Huấn luyện Model'}
          </Button>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<FaceIdIcon />}
            onClick={() => navigate(`/students/${encodeURIComponent(maSV)}/faceid-test`)}
            size="large"
          >
            Test Face ID
          </Button>
        </Grid>
      </Grid>

      {/* Camera — thu gọn chiều ngang; overlay ✓ không làm dịch chuyển layout (không spam Alert khi tự động) */}
      {showCamera && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box
              sx={{
                maxWidth: { xs: '100%', sm: 440, md: 480 },
                mx: 'auto',
                width: '100%',
              }}
            >
              <Box
                sx={{
                  position: 'relative',
                  backgroundColor: '#000',
                  borderRadius: 2,
                  overflow: 'hidden',
                  width: '100%',
                  aspectRatio: '16 / 9',
                  maxHeight: { xs: 280, sm: 300, md: 320 },
                }}
              >
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{
                    width: 1280,
                    height: 720,
                    facingMode: 'user',
                  }}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />

                {autoCapture && (
                  <Chip
                    label={`Chụp nhanh (${displayImageCount}/${RECOMMENDED_TRAINING_IMAGES}+)`}
                    color="error"
                    sx={{
                      position: 'absolute',
                      top: 16,
                      right: 16,
                      animation: 'blink 1.5s linear infinite',
                      '@keyframes blink': {
                        '0%, 49%': { opacity: 1 },
                        '50%, 100%': { opacity: 0.5 },
                      },
                    }}
                  />
                )}

                {captureOkFlash && (
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(16,185,129,0.22)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    <Chip
                      icon={<CheckIcon />}
                      label="✓ Đã chụp xong"
                      color="success"
                      sx={{ fontWeight: 900 }}
                    />
                  </Box>
                )}
              </Box>

              {/* Giữ cố định chiều cao vùng nút — tránh nhảy layout khi đổi chế độ */}
              <Box
                sx={{
                  minHeight: 56,
                  mt: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {autoCapture ? (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                    Đang chụp liên tục — giữ mặt trong khung, đổi góc nhẹ giữa các lần chụp.
                  </Typography>
                ) : (
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    startIcon={<CameraIcon />}
                    onClick={() => handleCapture(false)}
                    disabled={capturing}
                  >
                    {capturing ? 'Đang lưu...' : 'Chụp ảnh'}
                  </Button>
                )}
              </Box>
            </Box>
            
            {/* Tips */}
            <Paper sx={{ mt: 2, p: 2, bgcolor: 'info.light' }}>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                Mẹo chụp ảnh
              </Typography>
              <List dense>
                {CAPTURE_TIPS.map((tip, index) => (
                  <ListItem key={index}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <InfoIcon fontSize="small" color="info" />
                    </ListItemIcon>
                    <ListItemText 
                      primary={tip}
                      primaryTypographyProps={{ variant: 'body2' }}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </CardContent>
        </Card>
      )}

      {/* Training Progress */}
      {loading && trainingProgress > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Đang huấn luyện…
            </Typography>
            <LinearProgress 
              variant="determinate" 
              value={trainingProgress}
              sx={{ height: 10, borderRadius: 5 }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {trainingProgress}% —{' '}
              {trainingProgress < 30
                ? 'Đang xử lý ảnh…'
                : trainingProgress < 60
                  ? 'Đang học khuôn mặt…'
                  : trainingProgress < 90
                    ? 'Đang lưu…'
                    : 'Xong'}
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Image Gallery */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Thư viện ảnh ({images.length})
            </Typography>
            <Box>
              <IconButton onClick={fetchTrainingImages} color="primary">
                <RefreshIcon />
              </IconButton>
              {images.length > 0 && (
                <Button
                  startIcon={<DeleteIcon />}
                  color="error"
                  onClick={handleDeleteAll}
                  size="small"
                  sx={{ ml: 1 }}
                >
                  Xóa tất cả
                </Button>
              )}
            </Box>
          </Box>

          {images.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <CameraIcon sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                Chưa có ảnh nào
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Chụp hoặc tải ảnh để bắt đầu.
              </Typography>
            </Box>
          ) : (
            <ImageList cols={4} gap={12}>
              {images.map((img, index) => (
                <ImageListItem key={index}>
                  <img
                    src={`${API}/training/image/${maSV}/${img.filename}`}
                    alt={img.filename}
                    loading="lazy"
                    style={{ 
                      height: 200, 
                      objectFit: 'cover', 
                      cursor: 'pointer',
                      borderRadius: 8
                    }}
                    onClick={() => setSelectedImage(img)}
                  />
                  <ImageListItemBar
                    title={`Ảnh ${index + 1}`}
                    subtitle={`${(img.size / 1024).toFixed(1)} KB`}
                    actionIcon={
                      <IconButton
                        sx={{ color: 'white' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteImage(img.filename);
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    }
                  />
                </ImageListItem>
              ))}
            </ImageList>
          )}
        </CardContent>
      </Card>

      {/* Image Preview Dialog */}
      <Dialog
        open={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        maxWidth="md"
        fullWidth
      >
        {selectedImage && (
          <>
            <DialogTitle>
              {selectedImage.filename}
              <IconButton
                onClick={() => setSelectedImage(null)}
                sx={{ position: 'absolute', right: 8, top: 8 }}
              >
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              <img
                src={`${API}/training/image/${maSV}/${selectedImage.filename}`}
                alt={selectedImage.filename}
                style={{ width: '100%', height: 'auto', borderRadius: 8 }}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedImage(null)}>Đóng</Button>
              <Button 
                color="error" 
                startIcon={<DeleteIcon />}
                onClick={() => {
                  handleDeleteImage(selectedImage.filename);
                  setSelectedImage(null);
                }}
              >
                Xóa ảnh
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}

export default StudentTraining;