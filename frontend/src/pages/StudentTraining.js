import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import {
  Box, Card, CardContent, Typography, Button, Grid, Alert,
  CircularProgress, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, LinearProgress, Chip, ImageList, ImageListItem,
  ImageListItemBar, Stepper, Step, StepLabel, Paper, List,
  ListItem, ListItemIcon, ListItemText,
} from '@mui/material';
import {
  ArrowBack as BackIcon, Camera as CameraIcon, Upload as UploadIcon,
  Delete as DeleteIcon, School as TrainIcon, CheckCircle as CheckIcon,
  Warning as WarningIcon, Refresh as RefreshIcon, Close as CloseIcon,
  Info as InfoIcon, PhotoCamera as PhotoIcon,
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
} from '../config/trainingLimits';

const API = getApiPathPrefix();

// Chụp siêu nhanh: 80ms / ảnh (~12 ảnh/giây)
const FAST_CAPTURE_MS = 80;

const TRAINING_STEPS = ['Chuẩn bị ảnh', 'Tải lên', 'Huấn luyện', 'Hoàn thành'];
const CAPTURE_TIPS = [
  'Nhìn thẳng camera, mặt rõ, ánh sáng đủ',
  'Đổi góc nhẹ giữa các lần chụp (thẳng / nghiêng trái / phải)',
  'Giữ khoảng cách khoảng 50–100 cm từ camera',
  `Tối thiểu ${MIN_TRAINING_IMAGES_TO_RUN} ảnh; nhận diện tốt với ${RECOMMENDED_TRAINING_IMAGES}+ ảnh`,
];

function StudentTraining() {
  const { maSV } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const webcamRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── Trạng thái chính ──────────────────────────────────────────────────────
  const [student, setStudent]               = useState(null);
  const [trainingStatus, setTrainingStatus] = useState(null);
  const [loading, setLoading]               = useState(false);
  const [autoCapture, setAutoCapture]       = useState(false);
  const [showCamera, setShowCamera]         = useState(false);
  const [error, setError]                   = useState(null);
  const [success, setSuccess]               = useState(null);
  const [selectedImage, setSelectedImage]   = useState(null);
  const [activeStep, setActiveStep]         = useState(0);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [captureFlash, setCaptureFlash]     = useState(false);

  // ── Nguồn dữ liệu ảnh DUY NHẤT ───────────────────────────────────────────
  // Mỗi phần tử: { filename, size, url, isLocal, localId }
  //   isLocal=true  → ảnh vừa chụp, data URL tạm, chưa confirmed từ server
  //   isLocal=false → ảnh đã lưu trên server
  const [images, setImages] = useState([]);

  // ref để auto-capture đọc length mà không cần deps
  const imagesLenRef = useRef(0);
  useEffect(() => { imagesLenRef.current = images.length; }, [images]);

  // ── Upload queue refs (khai báo đúng chỗ — scope component) ──────────────
  const uploadQueueRef = useRef([]);   // [{ blobUrl, localId }]
  const uploadBusyRef  = useRef(false);

  // ── Auto-capture ref ──────────────────────────────────────────────────────
  const autoCaptureRef = useRef(false);
  autoCaptureRef.current = autoCapture;

  // ── Fetch dữ liệu server ──────────────────────────────────────────────────
  const fetchStudent = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/students/${maSV}`);
      setStudent(res.data);
    } catch {
      setError('Không thể tải thông tin sinh viên');
    }
  }, [maSV]);

  const fetchTrainingImages = useCallback(async () => {
    try {
      const res  = await axios.get(`${API}/training/images/${maSV}`);
      const list = (res.data.images || []).map(img => ({
        filename : img.filename,
        size     : img.size,
        url      : `${API}/training/image/${maSV}/${img.filename}`,
        isLocal  : false,
        localId  : null,
      }));
      // Giữ lại các ảnh local đang pending upload (chưa confirmed)
      setImages(prev => {
        const serverFilenames = new Set(list.map(i => i.filename));
        const stillPending    = prev.filter(img => img.isLocal && !serverFilenames.has(img.filename));
        return [...list, ...stillPending];
      });
      if (list.length >= RECOMMENDED_TRAINING_IMAGES) setActiveStep(1);
      return list.length;
    } catch {
      return null;
    }
  }, [maSV]);

  const fetchTrainingStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/training/status/${maSV}`);
      setTrainingStatus(res.data);
      if (res.data.in_database) setActiveStep(3);
    } catch {}
  }, [maSV]);

  useEffect(() => {
    fetchStudent();
    fetchTrainingImages();
    fetchTrainingStatus();
  }, [maSV, fetchStudent, fetchTrainingImages, fetchTrainingStatus]);

  // ── Upload queue processor ────────────────────────────────────────────────
  const processQueue = useCallback(async () => {
    if (uploadBusyRef.current) return;
    if (uploadQueueRef.current.length === 0) return;

    uploadBusyRef.current = true;

    while (uploadQueueRef.current.length > 0) {
      const { blobUrl, localId } = uploadQueueRef.current.shift();

      try {
        // Chuyển data URL → Blob → FormData
        const fetchRes = await fetch(blobUrl);
        const blob     = await fetchRes.blob();
        const fd       = new FormData();
        fd.append('file', blob, `capture_${localId}.jpg`);

        const response = await axios.post(
          `${API}/training/upload-image/${maSV}`, fd
        );

        const confirmedFilename = response.data?.filename;

        // Thay thế local entry bằng confirmed entry từ server
        setImages(prev => prev.map(img =>
          img.localId === localId
            ? {
                ...img,
                isLocal  : false,
                filename : confirmedFilename ?? img.filename,
                url      : confirmedFilename
                  ? `${API}/training/image/${maSV}/${confirmedFilename}`
                  : img.url,
              }
            : img
        ));
      } catch {
        // Upload thất bại → xóa ảnh local khỏi gallery
        setImages(prev => prev.filter(img => img.localId !== localId));
      }
    }

    uploadBusyRef.current = false;
  }, [maSV]);

  // ── Chụp 1 ảnh ────────────────────────────────────────────────────────────
  const captureOne = useCallback(() => {
    if (!webcamRef.current) return;
    if (imagesLenRef.current >= MAX_TRAINING_IMAGES_PER_STUDENT) {
      setAutoCapture(false);
      return;
    }

    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    const localId = Date.now() + Math.random();

    // 1. Thêm vào gallery NGAY LẬP TỨC (hiện lên trên đầu)
    const newEntry = {
      filename : `capture_${localId}.jpg`,
      size     : 0,
      url      : imageSrc,   // data URL → hiện ngay, không cần server
      isLocal  : true,
      localId,
    };
    setImages(prev => [newEntry, ...prev]);

    // Flash nhẹ
    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 80);

    // 2. Đẩy vào queue upload bất đồng bộ
    uploadQueueRef.current.push({ blobUrl: imageSrc, localId });
    processQueue();
  }, [processQueue]);

  // ── Auto-capture interval ─────────────────────────────────────────────────
  useEffect(() => {
    if (!autoCapture || !showCamera) return;
    const id = setInterval(() => {
      if (!autoCaptureRef.current) { clearInterval(id); return; }
      captureOne();
    }, FAST_CAPTURE_MS);
    return () => clearInterval(id);
    // captureOne intentionally excluded: stable enough via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCapture, showCamera]);

  // ── Dừng auto-capture → fetch server để đồng bộ ──────────────────────────
  const stopAutoCapture = useCallback(() => {
    setAutoCapture(false);
    // Sau khi queue upload xong (~1.2s), fetch lại để đồng bộ server
    setTimeout(() => {
      fetchTrainingImages();
      fetchTrainingStatus();
    }, 1200);
  }, [fetchTrainingImages, fetchTrainingStatus]);

  // ── Upload file từ máy ────────────────────────────────────────────────────
  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files?.length) return;

    const remaining = MAX_TRAINING_IMAGES_PER_STUDENT - images.length;
    if (remaining <= 0) {
      setError(`Đã đạt tối đa ${MAX_TRAINING_IMAGES_PER_STUDENT} ảnh.`);
      event.target.value = '';
      return;
    }

    setLoading(true);
    setError(null);

    const fileList = Array.from(files).slice(0, remaining);
    let ok = 0, fail = 0;

    for (const file of fileList) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        await axios.post(`${API}/training/upload-image/${maSV}`, fd);
        ok++;
      } catch {
        fail++;
      }
    }

    if (ok > 0) {
      setSuccess(`Đã upload ${ok} ảnh!`);
      await fetchTrainingImages();
    }
    if (fail > 0) setError(`${fail} ảnh không upload được.`);

    setLoading(false);
    event.target.value = '';
  };

  // ── Xóa một ảnh ─────────────────────────────────────────────────────────
  const handleDeleteImage = async (filename) => {
    if (!window.confirm('Xóa ảnh này?')) return;
    try {
      await axios.delete(
        `${API}/training/image/${maSV}/${encodeURIComponent(filename)}`
      );
      setImages(prev => prev.filter(img => img.filename !== filename));
      await fetchTrainingStatus();
    } catch (err) {
      console.error(err);
      setError('Lỗi khi xóa ảnh');
    }
  };

  // ── Xóa tất cả ────────────────────────────────────────────────────────────
  const handleDeleteAll = async () => {
    if (!window.confirm(`Xóa tất cả ${images.length} ảnh?`)) return;
    setLoading(true);
    try {
      await axios.delete(`${API}/training/remove/${maSV}`);
      setImages([]);
      setActiveStep(0);
      await fetchTrainingStatus();
    } catch {
      setError('Lỗi khi xóa');
    }
    setLoading(false);
  };

  // ── Huấn luyện ────────────────────────────────────────────────────────────
  const handleTrain = async () => {
    const confirmed = images.filter(img => !img.isLocal);
    if (confirmed.length < MIN_TRAINING_IMAGES_TO_RUN) {
      setError(`Cần ít nhất ${MIN_TRAINING_IMAGES_TO_RUN} ảnh đã lưu. Hiện có ${confirmed.length}.`);
      return;
    }

    setLoading(true);
    setActiveStep(2);
    setTrainingProgress(0);

    const iv = setInterval(() => {
      setTrainingProgress(p => {
        if (p >= 90) { clearInterval(iv); return p; }
        return p + 10;
      });
    }, 500);

    try {
      const res = await axios.post(`${API}/training/train/${maSV}`);
      clearInterval(iv);
      setTrainingProgress(100);

      if (res.data.success) {
        const d         = res.data;
        const processed = Number(d.system_images_counter_added || d.raw_images_count || 0);
        const global    = Number(d.system_images_counter_after || d.total_trained_images_all_students || 0);
        const studentC  = Number(d.student_images_counter_after || 0);
        setSuccess(
          `✅ Huấn luyện thành công! Xử lý ${processed} ảnh. Cộng dồn bạn: ${studentC}. Toàn hệ thống: ${global}.`
        );
        setActiveStep(3);
        await fetchTrainingStatus();
      } else {
        setError(res.data.message);
        setActiveStep(1);
      }
    } catch (err) {
      clearInterval(iv);
      setError(formatApiError(err.response?.data?.detail, 'Lỗi huấn luyện'));
      setActiveStep(1);
    }

    setLoading(false);
    setTimeout(() => setTrainingProgress(0), 2000);
  };

  // ── Render ────────────────────────────────────────────────────────────────
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
          Bạn chỉ huấn luyện cho tài khoản của mình.
        </Alert>
        <Button onClick={() => navigate('/student/profile')} variant="outlined">
          Về hồ sơ của tôi
        </Button>
      </Box>
    );
  }

  const confirmedCount = images.filter(img => !img.isLocal).length;
  const totalCount     = images.length;
  const progressPct    = Math.min((confirmedCount / RECOMMENDED_TRAINING_IMAGES) * 100, 100);
  const isReadyToTrain = confirmedCount >= MIN_TRAINING_IMAGES_TO_RUN;
  const isOptimal      = confirmedCount >= RECOMMENDED_TRAINING_IMAGES;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton
          onClick={() =>
            user?.role === 'STUDENT'
              ? navigate('/student/profile')
              : navigate('/students')
          }
          color="primary"
        >
          <BackIcon />
        </IconButton>
        <Box sx={{ ml: 2 }}>
          <Typography variant="h4" fontWeight="bold">
            Huấn luyện nhận diện – {student.ho_ten}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Mã SV: {student.ma_sv} | Lớp: {student.lop}
          </Typography>
        </Box>
      </Box>

      {error   && <Alert severity="error"   sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Stepper */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stepper activeStep={activeStep}>
            {TRAINING_STEPS.map(label => (
              <Step key={label}><StepLabel>{label}</StepLabel></Step>
            ))}
          </Stepper>
        </CardContent>
      </Card>

      {/* Status */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={3}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h2" color="primary" fontWeight="bold">{totalCount}</Typography>
                <Typography variant="body2" color="text.secondary">Ảnh đã chụp</Typography>
                {totalCount !== confirmedCount && (
                  <Typography variant="caption" color="warning.main">
                    ({confirmedCount} đã lưu, {totalCount - confirmedCount} đang tải…)
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary" display="block">
                  Tối thiểu {MIN_TRAINING_IMAGES_TO_RUN} — tốt nhất {RECOMMENDED_TRAINING_IMAGES}+
                </Typography>
              </Box>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Tiến độ</Typography>
                  <Typography variant="body2" fontWeight="bold">{progressPct.toFixed(0)}%</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={progressPct}
                  sx={{ height: 12, borderRadius: 6 }}
                  color={isOptimal ? 'success' : isReadyToTrain ? 'warning' : 'primary'}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  {isOptimal
                    ? 'Đủ ảnh — có thể huấn luyện ngay'
                    : isReadyToTrain
                    ? `Đủ tối thiểu — nên thêm đến ${RECOMMENDED_TRAINING_IMAGES} ảnh`
                    : `Cần thêm ${MIN_TRAINING_IMAGES_TO_RUN - confirmedCount} ảnh nữa`}
                </Typography>
              </Box>
            </Grid>

            <Grid item xs={12} md={3} sx={{ textAlign: 'center' }}>
              {trainingStatus?.in_database
                ? <Chip label="✅ Đã huấn luyện" color="success" icon={<CheckIcon />}   sx={{ fontSize: '1rem', py: 2 }} />
                : <Chip label="⏳ Chưa huấn luyện" color="warning" icon={<WarningIcon />} sx={{ fontSize: '1rem', py: 2 }} />}
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Button
            fullWidth
            variant={showCamera ? 'outlined' : 'contained'}
            color="primary"
            startIcon={<CameraIcon />}
            onClick={() => setShowCamera(v => !v)}
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
              color={autoCapture ? 'error' : 'success'}
              startIcon={autoCapture ? <CloseIcon /> : <PhotoIcon />}
              onClick={() => (autoCapture ? stopAutoCapture() : setAutoCapture(true))}
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

      {/* Camera */}
      {showCamera && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ maxWidth: { xs: '100%', sm: 440, md: 480 }, mx: 'auto' }}>

              {/* Bộ đếm góc phải */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5, minHeight: 36 }}>
                <Box
                  sx={{
                    display: 'inline-flex', alignItems: 'center', gap: 0.5,
                    bgcolor: autoCapture ? 'error.main' : 'primary.main',
                    color: '#fff', borderRadius: 2, px: 1.5, py: 0.5,
                    fontWeight: 900, fontSize: '1.1rem', letterSpacing: 0.5, boxShadow: 2,
                    ...(autoCapture && {
                      animation: 'blink 1s linear infinite',
                      '@keyframes blink': {
                        '0%,49%': { opacity: 1 },
                        '50%,100%': { opacity: 0.5 },
                      },
                    }),
                  }}
                >
                  📸 {totalCount} / {RECOMMENDED_TRAINING_IMAGES}
                </Box>
              </Box>

              {/* Webcam */}
              <Box
                sx={{
                  position: 'relative', backgroundColor: '#000', borderRadius: 2,
                  overflow: 'hidden', width: '100%', aspectRatio: '16/9',
                  maxHeight: { xs: 280, sm: 300, md: 320 },
                }}
              >
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ width: 1280, height: 720, facingMode: 'user' }}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {captureFlash && (
                  <Box
                    sx={{
                      position: 'absolute', inset: 0,
                      background: 'rgba(16,185,129,0.3)',
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </Box>

              <Box sx={{ minHeight: 56, mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {autoCapture
                  ? (
                    <Typography variant="body2" color="text.secondary" textAlign="center">
                      Đang chụp liên tục — đổi góc nhẹ để đa dạng dữ liệu.
                    </Typography>
                  ) : (
                    <Button
                      variant="contained"
                      color="primary"
                      size="large"
                      startIcon={<CameraIcon />}
                      onClick={captureOne}
                    >
                      Chụp ảnh
                    </Button>
                  )
                }
              </Box>
            </Box>

            <Paper sx={{ mt: 2, p: 2, bgcolor: 'info.light' }}>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>Mẹo chụp ảnh</Typography>
              <List dense>
                {CAPTURE_TIPS.map((tip, i) => (
                  <ListItem key={i}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <InfoIcon fontSize="small" color="info" />
                    </ListItemIcon>
                    <ListItemText primary={tip} primaryTypographyProps={{ variant: 'body2' }} />
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
            <Typography variant="h6" gutterBottom>Đang huấn luyện…</Typography>
            <LinearProgress
              variant="determinate"
              value={trainingProgress}
              sx={{ height: 10, borderRadius: 5 }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {trainingProgress}%
              {' — '}
              {trainingProgress < 30
                ? 'Xử lý ảnh…'
                : trainingProgress < 60
                ? 'Học khuôn mặt…'
                : trainingProgress < 90
                ? 'Lưu model…'
                : 'Hoàn tất'}
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Gallery */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Thư viện ảnh ({totalCount})</Typography>
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
              <Typography variant="h6" color="text.secondary">Chưa có ảnh nào</Typography>
              <Typography variant="body2" color="text.secondary">Chụp hoặc tải ảnh để bắt đầu.</Typography>
            </Box>
          ) : (
            <ImageList cols={4} gap={12}>
              {images.map((img, idx) => (
                <ImageListItem key={img.localId ?? img.filename}>
                  <Box sx={{ position: 'relative' }}>
                    <img
                      src={img.url}
                      alt={img.filename}
                      loading="lazy"
                      style={{
                        width: '100%', height: 160, objectFit: 'cover',
                        borderRadius: 8, cursor: 'pointer',
                        opacity: img.isLocal ? 0.65 : 1,
                        transition: 'opacity 0.3s',
                      }}
                      onClick={() => setSelectedImage(img)}
                    />
                    {/* Spinner khi đang upload */}
                    {img.isLocal && (
                      <Box
                        sx={{
                          position: 'absolute', inset: 0, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          borderRadius: 2, bgcolor: 'rgba(0,0,0,0.25)',
                        }}
                      >
                        <CircularProgress size={28} sx={{ color: '#fff' }} />
                      </Box>
                    )}
                  </Box>
                  <ImageListItemBar
                    title={`Ảnh ${totalCount - idx}`}
                    subtitle={img.isLocal ? 'Đang tải lên…' : `${(img.size / 1024).toFixed(1)} KB`}
                    actionIcon={
                      <IconButton
                        sx={{ color: 'white' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (img.isLocal) {
                            // Xóa ảnh local chưa upload xong khỏi gallery
                            setImages(prev => prev.filter(x => x.localId !== img.localId));
                            return;
                          }
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

      {/* Preview Dialog */}
      <Dialog open={!!selectedImage} onClose={() => setSelectedImage(null)} maxWidth="md" fullWidth>
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
                src={selectedImage.url}
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