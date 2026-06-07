import React, { useState, useRef, useEffect, useCallback } from 'react';
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
} from '@mui/material';
import {
  Camera as CameraIcon,
  Stop as StopIcon,
  CheckCircle as CheckIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { recognitionAPI, attendanceAPI, CameraWebSocket } from '../services/api';
import { getStudentAvatarSrc } from '../utils/studentAvatar';
import { captureSequentialWebcamFrames, buildRecognizeLiveFormData } from '../utils/liveWebcamCapture';
import { getRecognitionBlockFeedback } from '../utils/recognitionFeedback';
import { useI18n } from '../i18n/I18nContext';

const videoConstraints = {
  width: 640,
  height: 480,
  facingMode: 'user',
};

function AttendanceCamera() {
  const { t } = useI18n();
  const webcamRef = useRef(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [recentAttendance, setRecentAttendance] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [avatarKey, setAvatarKey] = useState(0);
  const wsRef = useRef(null);

  useEffect(() => {
    fetchTodaySessions();
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
    };
  }, []);

  const fetchTodaySessions = async () => {
    try {
      const response = await attendanceAPI.getTodaySessions();
      setSessions(response.data);
      if (response.data.length > 0) {
        setSelectedSession(response.data[0].ma_buoi);
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setError('Không thể tải danh sách buổi học');
    }
  };

  const capture = useCallback(async () => {
    if (!webcamRef.current?.getScreenshot?.()) return;

    setLoading(true);
    try {
      const blobs = await captureSequentialWebcamFrames(webcamRef, { count: 3, gapMs: 280 });
      const response = await recognitionAPI.recognizeLiveFrames(buildRecognizeLiveFormData(blobs));
      const result = response.data;

      setRecognitionResult(result);

      const blockFeedback = getRecognitionBlockFeedback(result, t);
      if (blockFeedback) {
        setError(blockFeedback.formatted);
        return;
      }

      if (result.success && selectedSession) {
        const last = blobs[blobs.length - 1];
        const snap = new File([last], 'capture.jpg', { type: 'image/jpeg' });
        const checkinResponse = await attendanceAPI.checkin(
          result.student_info.ma_sv,
          selectedSession,
          undefined,
          snap,
        );

        if (checkinResponse.data.success) {
          // Thêm vào danh sách điểm danh gần đây
          setRecentAttendance(prev => [{
            ...result.student_info,
            trang_thai: checkinResponse.data.trang_thai,
            thoi_gian: new Date().toLocaleTimeString('vi-VN'),
            timestamp: Date.now(),
          }, ...prev.slice(0, 9)]);
          setAvatarKey((k) => k + 1);
        } else {
          setError(checkinResponse.data.message);
        }
      }
    } catch (err) {
      console.error('Recognition error:', err);
      setError('Có lỗi xảy ra khi nhận diện khuôn mặt');
    } finally {
      setLoading(false);
    }
  }, [selectedSession]);

  const startContinuousCapture = () => {
    setIsCapturing(true);
    setError(null);
    
    // Khởi tạo WebSocket connection cho real-time
    wsRef.current = new CameraWebSocket(
      (data) => {
        // Xử lý kết quả real-time từ WebSocket
        if (data.identity !== 'Unknown') {
          console.log('Real-time recognition:', data);
        }
      },
      (error) => {
        console.error('WebSocket error:', error);
      }
    );
    wsRef.current.connect();
  };

  const stopContinuousCapture = () => {
    setIsCapturing(false);
    if (wsRef.current) {
      wsRef.current.disconnect();
    }
  };

  // Tự động chụp khi đang capturing
  useEffect(() => {
    let intervalId;
    if (isCapturing) {
      intervalId = setInterval(() => {
        capture();
      }, 3000); // Chụp mỗi 3 giây
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isCapturing, capture]);

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        Điểm danh bằng Camera
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Camera Feed */}
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Box sx={{ mb: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Chọn buổi học</InputLabel>
                  <Select
                    value={selectedSession}
                    onChange={(e) => setSelectedSession(e.target.value)}
                    label="Chọn buổi học"
                  >
                    {sessions.map((session) => (
                      <MenuItem key={session.ma_buoi} value={session.ma_buoi}>
                        {session.ten_mon} - {session.gio_bat_dau} ({session.giang_vien})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Box
                  sx={{
                    position: 'relative',
                    width: { xs: 260, sm: 310, md: 350 },
                    height: { xs: 260, sm: 310, md: 350 },
                    backgroundColor: '#000',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    border: '3px solid rgba(56,189,248,0.8)',
                    boxShadow: '0 0 0 10px rgba(56,189,248,0.08), 0 0 40px rgba(56,189,248,0.35)',
                  }}
                >
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    videoConstraints={videoConstraints}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />

                  {isCapturing && (
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                        '&::after': {
                          content: '""',
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: '-20%',
                          height: 4,
                          background: 'linear-gradient(90deg, transparent, #67e8f9, transparent)',
                          boxShadow: '0 0 18px #67e8f9',
                          animation: 'faceScanLineLegacy 1.6s linear infinite',
                        },
                        '@keyframes faceScanLineLegacy': {
                          '0%': { top: '-10%' },
                          '100%': { top: '110%' },
                        },
                      }}
                    />
                  )}
                
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
                      <CircularProgress color="primary" />
                    </Box>
                  )}

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
                </Box>
              </Box>

              <Box sx={{ mt: 2, display: 'flex', gap: 2, justifyContent: 'center' }}>
                {!isCapturing ? (
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    startIcon={<CameraIcon />}
                    onClick={startContinuousCapture}
                    disabled={!selectedSession}
                  >
                    Bắt đầu điểm danh
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    color="error"
                    size="large"
                    startIcon={<StopIcon />}
                    onClick={stopContinuousCapture}
                  >
                    Dừng điểm danh
                  </Button>
                )}
                
                <Button
                  variant="outlined"
                  size="large"
                  onClick={capture}
                  disabled={isCapturing || !selectedSession}
                >
                  Chụp thủ công
                </Button>
              </Box>

              {/* Kết quả nhận diện */}
              {recognitionResult && (
                <Box sx={{ mt: 3 }}>
                  {recognitionResult.success ? (
                    <Alert severity="success" icon={<CheckIcon />}>
                      <Typography variant="h6">
                        {recognitionResult.student_info.ho_ten}
                      </Typography>
                      <Typography variant="body2">
                        MSSV: {recognitionResult.student_info.ma_sv} | 
                        Lớp: {recognitionResult.student_info.lop} |
                        Độ tin cậy: {(recognitionResult.confidence * 100).toFixed(1)}%
                      </Typography>
                    </Alert>
                  ) : (
                    <Alert severity="warning">
                      {recognitionResult.message || 'Không nhận diện được khuôn mặt'}
                    </Alert>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Danh sách điểm danh gần đây */}
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Điểm danh gần đây
              </Typography>
              
              {recentAttendance.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <PersonIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                  <Typography color="text.secondary">
                    Chưa có sinh viên nào điểm danh
                  </Typography>
                </Box>
              ) : (
                <List>
                  {recentAttendance.map((item, index) => (
                    <React.Fragment key={item.timestamp}>
                      <ListItem>
                        <ListItemAvatar>
                          <Avatar
                            src={item.anh_dai_dien ? getStudentAvatarSrc(item, avatarKey) : undefined}
                            sx={{
                              bgcolor: item.trang_thai === 'Đúng giờ' ? 'success.main' : 'warning.main',
                            }}
                          >
                            {!item.anh_dai_dien ? (item.ho_ten?.charAt(0) || <PersonIcon />) : null}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={item.ho_ten}
                          secondary={
                            <>
                              {item.ma_sv} - {item.lop}
                              <br />
                              <Chip
                                label={item.trang_thai}
                                size="small"
                                color={item.trang_thai === 'Đúng giờ' ? 'success' : 'warning'}
                                sx={{ mt: 0.5 }}
                              />
                              {' '}
                              <Typography component="span" variant="caption">
                                {item.thoi_gian}
                              </Typography>
                            </>
                          }
                        />
                      </ListItem>
                      {index < recentAttendance.length - 1 && <Divider variant="inset" component="li" />}
                    </React.Fragment>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>

          {/* Thống kê nhanh */}
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Thống kê buổi học
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h3" color="success.main">
                      {recentAttendance.filter(r => r.trang_thai === 'Đúng giờ').length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Đúng giờ
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h3" color="warning.main">
                      {recentAttendance.filter(r => r.trang_thai === 'Trễ').length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Đi trễ
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default AttendanceCamera;
