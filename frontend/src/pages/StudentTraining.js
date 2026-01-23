import React, { useState, useEffect, useRef } from 'react';
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
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = 'http://localhost:8000';

function StudentTraining() {
  const { maSV } = useParams();
  const navigate = useNavigate();
  const webcamRef = useRef(null);
  const fileInputRef = useRef(null);
  
  const [student, setStudent] = useState(null);
  const [images, setImages] = useState([]);
  const [trainingStatus, setTrainingStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    fetchStudent();
    fetchTrainingImages();
    fetchTrainingStatus();
  }, [maSV]);

  const fetchStudent = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/students/${maSV}`);
      setStudent(response.data);
    } catch (err) {
      setError('Không thể tải thông tin sinh viên');
    }
  };

  const fetchTrainingImages = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/training/images/${maSV}`);
      setImages(response.data.images || []);
    } catch (err) {
      console.error('Error fetching images:', err);
    }
  };

  const fetchTrainingStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/training/status/${maSV}`);
      setTrainingStatus(response.data);
    } catch (err) {
      console.error('Error fetching status:', err);
    }
  };

  const handleCapture = async () => {
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    setCapturing(true);
    try {
      // Convert base64 to blob
      const blob = await fetch(imageSrc).then(r => r.blob());
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });

      // Upload
      const formData = new FormData();
      formData.append('file', file);

      await axios.post(`${API_URL}/api/training/upload-image/${maSV}`, formData);
      
      setSuccess('Đã chụp và lưu ảnh thành công!');
      fetchTrainingImages();
      fetchTrainingStatus();
    } catch (err) {
      setError('Lỗi khi lưu ảnh');
    } finally {
      setCapturing(false);
    }
  };

  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    try {
      for (let file of files) {
        const formData = new FormData();
        formData.append('file', file);
        await axios.post(`${API_URL}/api/training/upload-image/${maSV}`, formData);
      }
      
      setSuccess(`Đã upload ${files.length} ảnh thành công!`);
      fetchTrainingImages();
      fetchTrainingStatus();
    } catch (err) {
      setError('Lỗi khi upload ảnh');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteImage = async (filename) => {
    if (!window.confirm('Bạn có chắc muốn xóa ảnh này?')) return;

    try {
      await axios.delete(`${API_URL}/api/training/image/${maSV}/${filename}`);
      setSuccess('Đã xóa ảnh');
      fetchTrainingImages();
      fetchTrainingStatus();
    } catch (err) {
      setError('Lỗi khi xóa ảnh');
    }
  };

  const handleTrain = async () => {
    if (images.length < 5) {
      setError('Cần ít nhất 5 ảnh để huấn luyện!');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/training/train/${maSV}`);
      
      if (response.data.success) {
        setSuccess(`Huấn luyện thành công! 
          - Đã xử lý ${response.data.cropped_count} ảnh
          - Tổng ${response.data.total_identities} sinh viên trong hệ thống`);
        fetchTrainingStatus();
      } else {
        setError(response.data.message);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Lỗi khi huấn luyện model');
    } finally {
      setLoading(false);
    }
  };

  if (!student) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={() => navigate('/students')}>
          <BackIcon />
        </IconButton>
        <Typography variant="h4" fontWeight="bold" sx={{ ml: 2 }}>
          Huấn luyện nhận diện - {student.ho_ten}
        </Typography>
      </Box>

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

      {/* Training Status */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h3" color="primary">
                  {images.length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Ảnh đã chụp
                </Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Tiến độ huấn luyện
                </Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={Math.min((images.length / 15) * 100, 100)}
                  sx={{ height: 10, borderRadius: 5 }}
                  color={images.length >= 15 ? 'success' : 'primary'}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                  Khuyến nghị: 15-20 ảnh cho độ chính xác cao
                </Typography>
              </Box>
            </Grid>

            <Grid item xs={12} md={3}>
              <Box sx={{ textAlign: 'center' }}>
                {trainingStatus?.in_database ? (
                  <Chip 
                    label="Đã huấn luyện" 
                    color="success" 
                    icon={<CheckIcon />}
                  />
                ) : (
                  <Chip 
                    label="Chưa huấn luyện" 
                    color="warning"
                    icon={<WarningIcon />}
                  />
                )}
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Button
            fullWidth
            variant="contained"
            color="primary"
            startIcon={<CameraIcon />}
            onClick={() => setShowCamera(!showCamera)}
            size="large"
          >
            {showCamera ? 'Đóng Camera' : 'Chụp ảnh từ Camera'}
          </Button>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={() => fileInputRef.current?.click()}
            size="large"
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

        <Grid item xs={12} sm={4}>
          <Button
            fullWidth
            variant="contained"
            color="success"
            startIcon={<TrainIcon />}
            onClick={handleTrain}
            disabled={images.length < 5 || loading}
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
                videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
                style={{ width: '100%', borderRadius: 8 }}
              />
            </Box>
            
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
            
            <Alert severity="info" sx={{ mt: 2 }}>
              💡 Mẹo chụp ảnh tốt:
              <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                <li>Nhìn thẳng vào camera, khuôn mặt rõ ràng</li>
                <li>Thay đổi góc độ: thẳng, nghiêng trái/phải, ngẩng/cúi nhẹ</li>
                <li>Thay đổi biểu cảm: bình thường, cười</li>
                <li>Ánh sáng tốt, không quá tối hoặc quá sáng</li>
              </ul>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Image Gallery */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Ảnh đã chụp ({images.length})
            </Typography>
            <IconButton onClick={fetchTrainingImages}>
              <RefreshIcon />
            </IconButton>
          </Box>

          {images.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CameraIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
              <Typography color="text.secondary">
                Chưa có ảnh nào. Hãy chụp hoặc upload ảnh để bắt đầu!
              </Typography>
            </Box>
          ) : (
            <ImageList cols={4} gap={8}>
              {images.map((img, index) => (
                <ImageListItem key={index}>
                  <img
                    src={`${API_URL}/api/training/image/${maSV}/${img.filename}`}
                    alt={img.filename}
                    loading="lazy"
                    style={{ height: 200, objectFit: 'cover', cursor: 'pointer' }}
                    onClick={() => setSelectedImage(img)}
                  />
                  <ImageListItemBar
                    title={`Ảnh ${index + 1}`}
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
            <DialogTitle>{selectedImage.filename}</DialogTitle>
            <DialogContent>
              <img
                src={`${API_URL}/api/training/image/${maSV}/${selectedImage.filename}`}
                alt={selectedImage.filename}
                style={{ width: '100%', height: 'auto' }}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedImage(null)}>Đóng</Button>
              <Button 
                color="error" 
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