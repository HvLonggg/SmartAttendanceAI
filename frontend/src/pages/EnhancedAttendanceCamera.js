import React, { useState, useEffect, useRef } from 'react';
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
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  LinearProgress,
  Paper,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Camera as CameraIcon,
  Stop as StopIcon,
  CheckCircle as CheckIcon,
  Person as PersonIcon,
  Schedule as ScheduleIcon,
  Warning as WarningIcon,
  Verified as VerifiedIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = 'http://localhost:8000';

function EnhancedAttendanceCamera() {
  const webcamRef = useRef(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [recentAttendance, setRecentAttendance] = useState([]);
  const [recognitionResult, setRecognitionResult] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [autoCapture, setAutoCapture] = useState(true);
  const [captureInterval, setCaptureInterval] = useState(3000);
  const [sessionStats, setSessionStats] = useState({
    total: 0,
    onTime: 0,
    late: 0,
  });

  useEffect(() => {
    fetchTodaySessions();
  }, []);

  useEffect(() => {
    if (selectedSession) {
      fetchSessionAttendance();
    }
  }, [selectedSession]);

  useEffect(() => {
    let intervalId;
    if (isCapturing && autoCapture) {
      intervalId = setInterval(() => {
        captureAndRecognize();
      }, captureInterval);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isCapturing, autoCapture, captureInterval]);

  const fetchTodaySessions = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/sessions/today`);
      setSessions(response.data);
      if (response.data.length > 0) {
        setSelectedSession(response.data[0].ma_buoi);
      }
    } catch (err) {
      setError('Không thể tải danh sách buổi học');
    }
  };

  const fetchSessionAttendance = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/attendance/session/${selectedSession}`);
      setRecentAttendance(response.data);
      
      // Calculate stats
      const onTime = response.data.filter(r => r.trang_thai === 'Đúng giờ').length;
      const late = response.data.filter(r => r.trang_thai === 'Trễ').length;
      
      setSessionStats({
        total: response.data.length,
        onTime: onTime,
        late: late,
      });
    } catch (err) {
      console.error('Error fetching attendance:', err);
    }
  };

  const captureAndRecognize = async () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) return;

    setLoading(true);
    setRecognitionResult(null);

    try {
      // Convert base64 to blob
      const blob = await fetch(imageSrc).then(r => r.blob());
      const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });

      // Call recognition API
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(`${API_URL}/api/recognize`, formData);
      const result = response.data;

      setRecognitionResult(result);

      // If recognized successfully, auto check-in
      if (result.success && selectedSession) {
        try {
          const checkinResponse = await axios.post(
            `${API_URL}/api/attendance/checkin`,
            null,
            {
              params: {
                ma_sv: result.student_info.ma_sv,
                ma_buoi: selectedSession,
              },
            }
          );

          if (checkinResponse.data.success) {
            setSuccess(`✅ ${result.student_info.ho_ten} - ${checkinResponse.data.trang_thai}`);
            fetchSessionAttendance();
            
            // Clear success after 3s
            setTimeout(() => setSuccess(null), 3000);
          } else {
            setError(checkinResponse.data.message);
          }
        } catch (err) {
          if (err.response?.data?.detail) {
            // Already checked in - silent fail
            console.log('Already checked in');
          } else {
            setError('Lỗi khi điểm danh');
          }
        }
      } else if (!result.success) {
        // Show why recognition failed
        if (result.confidence > 0) {
          setError(`Độ tin cậy thấp (${(result.confidence * 100).toFixed(1)}%). Hãy đưa mặt gần camera hơn.`);
        } else {
          setError('Không phát hiện khuôn mặt. Hãy nhìn thẳng vào camera.');
        }
        setTimeout(() => setError(null), 2000);
      }
    } catch (err) {
      console.error('Recognition error:', err);
      setError('Lỗi khi nhận diện');
      setTimeout(() => setError(null), 2000);
    } finally {
      setLoading(false);
    }
  };

  const startCapturing = () => {
    if (!selectedSession) {
      setError('Vui lòng chọn buổi học!');
      return;
    }
    setIsCapturing(true);
    setError(null);
  };

  const stopCapturing = () => {
    setIsCapturing(false);
    setRecognitionResult(null);
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return 'success';
    if (confidence >= 0.65) return 'warning';
    return 'error';
  };

  const getConfidenceLabel = (confidence) => {
    if (confidence >= 0.8) return 'Rất cao';
    if (confidence >= 0.65) return 'Tốt';
    return 'Thấp';
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        Điểm danh bằng Nhận diện Khuôn mặt
      </Typography>

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

      <Grid container spacing={3}>
        {/* Camera Section */}
        <Grid item xs={12} md={8}>
          {/* Session Selection */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={8}>
                  <FormControl fullWidth>
                    <InputLabel>Chọn buổi học</InputLabel>
                    <Select
                      value={selectedSession}
                      onChange={(e) => setSelectedSession(e.target.value)}
                      label="Chọn buổi học"
                      disabled={isCapturing}
                    >
                      {sessions.map((session) => (
                        <MenuItem key={session.ma_buoi} value={session.ma_buoi}>
                          {session.ten_mon} - {session.gio_bat_dau} ({session.giang_vien})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={autoCapture}
                        onChange={(e) => setAutoCapture(e.target.checked)}
                        disabled={isCapturing}
                      />
                    }
                    label="Tự động quét"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Camera Feed */}
          <Card>
            <CardContent>
              <Box
                sx={{
                  position: 'relative',
                  backgroundColor: '#000',
                  borderRadius: 2,
                  overflow: 'hidden',
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
                  style={{ width: '100%', height: 'auto' }}
                />

                {/* Status Overlay */}
                {isCapturing && (
                  <Chip
                    label="ĐANG QUÉT"
                    color="error"
                    size="small"
                    sx={{
                      position: 'absolute',
                      top: 16,
                      right: 16,
                      animation: 'blink 1.5s linear infinite',
                      '@keyframes blink': {
                        '0%, 49%': { opacity: 1 },
                        '50%, 100%': { opacity: 0.3 },
                      },
                    }}
                  />
                )}

                {/* Loading Indicator */}
                {loading && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(0,0,0,0.5)',
                    }}
                  >
                    <CircularProgress size={60} />
                  </Box>
                )}
              </Box>

              {/* Controls */}
              <Box sx={{ mt: 2, display: 'flex', gap: 2, justifyContent: 'center' }}>
                {!isCapturing ? (
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    startIcon={<CameraIcon />}
                    onClick={startCapturing}
                    disabled={!selectedSession}
                  >
                    Bắt đầu điểm danh
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="contained"
                      color="error"
                      size="large"
                      startIcon={<StopIcon />}
                      onClick={stopCapturing}
                    >
                      Dừng lại
                    </Button>
                    
                    {!autoCapture && (
                      <Button
                        variant="outlined"
                        size="large"
                        onClick={captureAndRecognize}
                        disabled={loading}
                      >
                        Chụp thủ công
                      </Button>
                    )}
                  </>
                )}
              </Box>

              {/* Recognition Result */}
              {recognitionResult && (
                <Box sx={{ mt: 3 }}>
                  {recognitionResult.success ? (
                    <Paper sx={{ p: 2, bgcolor: 'success.light' }}>
                      <Grid container spacing={2} alignItems="center">
                        <Grid item>
                          <Avatar sx={{ width: 60, height: 60, bgcolor: 'success.main' }}>
                            <VerifiedIcon sx={{ fontSize: 40 }} />
                          </Avatar>
                        </Grid>
                        
                        <Grid item xs>
                          <Typography variant="h6" fontWeight="bold">
                            {recognitionResult.student_info.ho_ten}
                          </Typography>
                          <Typography variant="body2">
                            MSSV: {recognitionResult.student_info.ma_sv} | 
                            Lớp: {recognitionResult.student_info.lop}
                          </Typography>
                          
                          <Box sx={{ mt: 1 }}>
                            <Chip
                              label={`Độ chính xác: ${(recognitionResult.confidence * 100).toFixed(1)}%`}
                              color={getConfidenceColor(recognitionResult.confidence)}
                              size="small"
                              sx={{ mr: 1 }}
                            />
                            <Chip
                              label={getConfidenceLabel(recognitionResult.confidence)}
                              color={getConfidenceColor(recognitionResult.confidence)}
                              variant="outlined"
                              size="small"
                            />
                          </Box>
                        </Grid>
                      </Grid>

                      {/* Top Matches */}
                      {recognitionResult.top_matches && recognitionResult.top_matches.length > 1 && (
                        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                          <Typography variant="caption" color="text.secondary">
                            Độ tương đồng với các sinh viên khác:
                          </Typography>
                          <Box sx={{ mt: 1 }}>
                            {recognitionResult.top_matches.slice(1, 3).map((match, idx) => (
                              <Box key={idx} sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                                <Typography variant="caption" sx={{ minWidth: 80 }}>
                                  {match.identity}:
                                </Typography>
                                <LinearProgress
                                  variant="determinate"
                                  value={match.score * 100}
                                  sx={{ flexGrow: 1, mx: 1, height: 6 }}
                                />
                                <Typography variant="caption">
                                  {(match.score * 100).toFixed(1)}%
                                </Typography>
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      )}
                    </Paper>
                  ) : (
                    <Alert severity="warning" icon={<WarningIcon />}>
                      <Typography variant="subtitle2" fontWeight="bold">
                        Không nhận diện được
                      </Typography>
                      <Typography variant="body2">
                        {recognitionResult.message}
                      </Typography>
                      {recognitionResult.top_matches && recognitionResult.top_matches.length > 0 && (
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="caption">
                            Gần giống nhất: {recognitionResult.top_matches[0].identity} 
                            ({(recognitionResult.top_matches[0].score * 100).toFixed(1)}%)
                          </Typography>
                        </Box>
                      )}
                    </Alert>
                  )}
                </Box>
              )}

              {/* Instructions */}
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                  💡 Hướng dẫn sử dụng:
                </Typography>
                <ul style={{ marginTop: 4, paddingLeft: 20, marginBottom: 0 }}>
                  <li>Nhìn thẳng vào camera, khuôn mặt rõ ràng</li>
                  <li>Đảm bảo ánh sáng tốt</li>
                  <li>Khoảng cách 50-100cm từ camera</li>
                  <li>Hệ thống tự động quét mỗi {captureInterval/1000} giây</li>
                  <li>Độ chính xác >= 65% mới được chấp nhận</li>
                </ul>
              </Alert>
            </CardContent>
          </Card>
        </Grid>

        {/* Attendance List Section */}
        <Grid item xs={12} md={4}>
          {/* Stats */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Thống kê buổi học
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" color="primary">
                      {sessionStats.total}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Tổng
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" color="success.main">
                      {sessionStats.onTime}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Đúng giờ
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" color="warning.main">
                      {sessionStats.late}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Trễ
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Recent Attendance */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Danh sách điểm danh
              </Typography>

              {recentAttendance.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <PersonIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                  <Typography color="text.secondary">
                    Chưa có sinh viên nào điểm danh
                  </Typography>
                </Box>
              ) : (
                <List sx={{ maxHeight: 500, overflow: 'auto' }}>
                  {recentAttendance.map((item, index) => (
                    <React.Fragment key={item.ma_diem_danh}>
                      <ListItem alignItems="flex-start">
                        <ListItemAvatar>
                          <Avatar
                            sx={{
                              bgcolor: item.trang_thai === 'Đúng giờ' 
                                ? 'success.main' 
                                : 'warning.main',
                            }}
                          >
                            {item.trang_thai === 'Đúng giờ' ? (
                              <CheckIcon />
                            ) : (
                              <ScheduleIcon />
                            )}
                          </Avatar>
                        </ListItemAvatar>
                        
                        <ListItemText
                          primary={
                            <Typography fontWeight={500}>
                              {item.ho_ten}
                            </Typography>
                          }
                          secondary={
                            <>
                              <Typography component="span" variant="body2">
                                {item.ma_sv} - {item.lop}
                              </Typography>
                              <br />
                              <Chip
                                label={item.trang_thai}
                                size="small"
                                color={item.trang_thai === 'Đúng giờ' ? 'success' : 'warning'}
                                sx={{ mt: 0.5, mr: 1 }}
                              />
                              <Typography component="span" variant="caption" color="text.secondary">
                                {new Date(item.thoi_gian_quet).toLocaleTimeString('vi-VN')}
                              </Typography>
                            </>
                          }
                        />
                      </ListItem>
                      {index < recentAttendance.length - 1 && (
                        <Divider variant="inset" component="li" />
                      )}
                    </React.Fragment>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default EnhancedAttendanceCamera;