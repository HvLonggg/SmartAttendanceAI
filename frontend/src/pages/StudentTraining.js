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
} from '@mui/icons-material';
import axios from 'axios';
import { getApiPathPrefix } from '../config/apiBase';
import { useAuth } from '../auth/AuthContext';

const API = getApiPathPrefix();

const TRAINING_STEPS = [
  'Chuẩn bị ảnh',
  'Tải lên',
  'Huấn luyện',
  'Hoàn thành'
];

const CAPTURE_TIPS = [
  'Nhìn thẳng vào camera, mặt rõ ràng',
  'Thay đổi góc độ: thẳng, nghiêng trái/phải (15-30°)',
  'Thay đổi biểu cảm: bình thường, cười nhẹ',
  'Ánh sáng tốt, không quá tối hoặc quá sáng',
  'Khoảng cách 50-100cm từ camera',
  'Không đeo khẩu trang, kính râm',
  'Chụp ít nhất 15 ảnh cho độ chính xác cao'
];

function StudentTraining() {
  const { maSV } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const webcamRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // States
  const [student, setStudent] = useState(null);
  const [images, setImages] = useState([]);
  const [trainingStatus, setTrainingStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [autoCapture, setAutoCapture] = useState(false);
  const [captureCount, setCaptureCount] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [trainingProgress, setTrainingProgress] = useState(0);

  useEffect(() => {
    fetchStudent();
    fetchTrainingImages();
    fetchTrainingStatus();
  }, [maSV]);

  // Auto capture interval
  useEffect(() => {
    let intervalId;
    if (autoCapture && showCamera) {
      intervalId = setInterval(() => {
        handleCapture();
      }, 2000); // Chụp mỗi 2 giây
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoCapture, showCamera]);

  const fetchStudent = async () => {
    try {
      const response = await axios.get(`${API}/students/${maSV}`);
      setStudent(response.data);
    } catch (err) {
      setError('Không thể tải thông tin sinh viên');
      console.error('Error fetching student:', err);
    }
  };

  const fetchTrainingImages = async () => {
    try {
      const response = await axios.get(`${API}/training/images/${maSV}`);
      setImages(response.data.images || []);
      
      // Cập nhật bước dựa trên số ảnh
      if (response.data.images?.length >= 15) {
        setActiveStep(1);
      }
    } catch (err) {
      console.error('Error fetching images:', err);
    }
  };

  const fetchTrainingStatus = async () => {
    try {
      const response = await axios.get(`${API}/training/status/${maSV}`);
      setTrainingStatus(response.data);
      
      // Cập nhật bước nếu đã huấn luyện
      if (response.data.in_database) {
        setActiveStep(3);
      }
    } catch (err) {
      console.error('Error fetching status:', err);
    }
  };

  const handleCapture = useCallback(async () => {
    if (!webcamRef.current) return;
    
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) {
      setError('Không thể chụp ảnh. Vui lòng kiểm tra camera.');
      return;
    }

    setCapturing(true);
    try {
      const blob = await fetch(imageSrc).then(r => r.blob());
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('file', file);

      await axios.post(`${API}/training/upload-image/${maSV}`, formData);
      
      setCaptureCount(prev => prev + 1);
      setSuccess(`Đã chụp ảnh thứ ${captureCount + 1}!`);
      
      // Tự động tắt success message sau 1s
      setTimeout(() => setSuccess(null), 1000);
      
      await fetchTrainingImages();
      await fetchTrainingStatus();
      
    } catch (err) {
      setError('Lỗi khi lưu ảnh: ' + (err.response?.data?.detail || err.message));
      console.error('Capture error:', err);
    } finally {
      setCapturing(false);
    }
  }, [maSV, captureCount]);

  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    setError(null);
    
    let uploadedCount = 0;
    let errorCount = 0;

    try {
      for (let file of files) {
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
        setSuccess(`Đã upload ${uploadedCount}/${files.length} ảnh thành công!`);
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
      setCaptureCount(0);
    } catch (err) {
      setError('Lỗi khi xóa dữ liệu');
      console.error('Delete all error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTrain = async () => {
    if (images.length < 5) {
      setError('Cần ít nhất 5 ảnh để huấn luyện! (Khuyến nghị: 15-20 ảnh)');
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
        setSuccess(`✅ Huấn luyện thành công! 
          - Đã xử lý ${response.data.cropped_count} ảnh
          - Tổng ${response.data.total_identities} sinh viên trong hệ thống
          - Sinh viên đã sẵn sàng để nhận diện!`);
        setActiveStep(3);
        await fetchTrainingStatus();
      } else {
        setError(response.data.message);
        setActiveStep(1);
      }
    } catch (err) {
      clearInterval(progressInterval);
      setError(err.response?.data?.detail || 'Lỗi khi huấn luyện model');
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
    setCaptureCount(0);
    setSuccess('Bắt đầu chụp tự động. Hãy thay đổi góc nhìn và biểu cảm!');
  };

  const stopAutoCapture = () => {
    setAutoCapture(false);
    setSuccess(`Đã dừng. Đã chụp được ${captureCount} ảnh.`);
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
          Student chỉ có thể huấn luyện nhận diện cho tài khoản của mình.
        </Alert>
        <Button onClick={() => navigate('/dashboard')} variant="outlined">
          Về trang chính
        </Button>
      </Box>
    );
  }

  const progressPercentage = Math.min((images.length / 15) * 100, 100);
  const isReadyToTrain = images.length >= 5;
  const isOptimal = images.length >= 15;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={() => navigate('/students')} color="primary">
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
                  (Tối thiểu: 5 | Khuyến nghị: 15-20)
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
                    ? '✅ Tối ưu! Sẵn sàng huấn luyện với độ chính xác cao'
                    : isReadyToTrain 
                    ? '⚠️ Đủ điều kiện huấn luyện, nhưng nên thêm ảnh'
                    : `❌ Cần thêm ${5 - images.length} ảnh nữa`
                  }
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
      </Grid>

      {/* Camera */}
      {showCamera && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ position: 'relative', backgroundColor: '#000', borderRadius: 2 }}>
              <Webcam
                ref={webcamRef}
                audio={false}
                screenshotFormat="image/jpeg"
                videoConstraints={{ 
                  width: 1280, 
                  height: 720, 
                  facingMode: 'user' 
                }}
                style={{ width: '100%', borderRadius: 8 }}
              />
              
              {autoCapture && (
                <Chip
                  label={`Tự động chụp (${captureCount} ảnh)`}
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
            </Box>
            
            {!autoCapture && (
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  startIcon={<CameraIcon />}
                  onClick={handleCapture}
                  disabled={capturing}
                >
                  {capturing ? 'Đang lưu...' : 'Chụp ảnh'}
                </Button>
              </Box>
            )}
            
            {/* Tips */}
            <Paper sx={{ mt: 2, p: 2, bgcolor: 'info.light' }}>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                💡 Mẹo chụp ảnh tốt:
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
              Đang huấn luyện model...
            </Typography>
            <LinearProgress 
              variant="determinate" 
              value={trainingProgress}
              sx={{ height: 10, borderRadius: 5 }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {trainingProgress}% - {
                trainingProgress < 30 ? 'Đang phát hiện khuôn mặt...' :
                trainingProgress < 60 ? 'Đang trích xuất đặc trưng...' :
                trainingProgress < 90 ? 'Đang lưu vào database...' :
                'Hoàn tất!'
              }
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
                Hãy chụp hoặc upload ảnh để bắt đầu!
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