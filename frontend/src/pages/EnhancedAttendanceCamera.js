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
import { attendanceAPI, recognitionAPI } from '../services/api';
import { captureSequentialWebcamFrames, buildRecognizeLiveFormData } from '../utils/liveWebcamCapture';
import { FACE_ID_LIVE_CAPTURE } from '../config/faceIdLiveCapture';
import { getStudentAvatarSrc } from '../utils/studentAvatar';
import { formatApiError } from '../utils/apiError';
import { getApiPathPrefix } from '../config/apiBase';
import { getRecognitionBlockFeedback } from '../utils/recognitionFeedback';
import { useI18n } from '../i18n/I18nContext';

const API = getApiPathPrefix();

function EnhancedAttendanceCamera() {
  const { t, locale } = useI18n();
  const dateTimeLocale = locale === 'en' ? 'en-US' : 'vi-VN';
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
  const [avatarKey, setAvatarKey] = useState(0);
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
      const response = await axios.get(`${API}/sessions/today`);
      setSessions(response.data);
      if (response.data.length > 0) {
        setSelectedSession(response.data[0].ma_buoi);
      }
    } catch (err) {
      setError(t('enhancedAttendanceCamera.errorLoadSessions'));
    }
  };

  const fetchSessionAttendance = async () => {
    try {
      const response = await axios.get(`${API}/attendance/session/${selectedSession}`);
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
    if (!webcamRef.current?.getScreenshot?.()) return;

    setLoading(true);
    setRecognitionResult(null);

    try {
      let blobs;
      try {
        blobs = await captureSequentialWebcamFrames(webcamRef, {
          count: FACE_ID_LIVE_CAPTURE.count,
          gapMs: FACE_ID_LIVE_CAPTURE.gapMs,
        });
      } catch {
        setError(t('studentAttendanceTab.liveCaptureFail'));
        setLoading(false);
        return;
      }

      const response = await recognitionAPI.recognizeLiveFrames(buildRecognizeLiveFormData(blobs));
      const result = response.data;

      setRecognitionResult(result);

      const blockFeedback = getRecognitionBlockFeedback(result, t);
      if (blockFeedback) {
        setError(blockFeedback.formatted);
        setTimeout(() => setError(null), 8000);
        setLoading(false);
        return;
      }

      const lastBlob = blobs[blobs.length - 1];
      const file = new File([lastBlob], 'capture.jpg', { type: 'image/jpeg' });

      // If recognized successfully, auto check-in
      if (result.success && selectedSession) {
        try {
          const checkinResponse = await attendanceAPI.checkin(
            result.student_info.ma_sv,
            selectedSession,
            undefined,
            file,
            blobs,
          );

          if (checkinResponse.data.success) {
            setSuccess(
              t('enhancedAttendanceCamera.successCheckin', {
                name: result.student_info.ho_ten,
                status: checkinResponse.data.trang_thai,
              })
            );
            fetchSessionAttendance();
            setAvatarKey((k) => k + 1);
            
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
            setError(formatApiError(err.response?.data?.detail, t('enhancedAttendanceCamera.errorRecognize')));
          }
        }
      } else if (!result.success) {
        // Show why recognition failed
        if (result.confidence > 0) {
          setError(
            t('enhancedAttendanceCamera.errorLowConfidence', {
              percent: (result.confidence * 100).toFixed(1),
            })
          );
        } else {
          setError(t('enhancedAttendanceCamera.errorNoFace'));
        }
        setTimeout(() => setError(null), 2000);
      }
    } catch (err) {
      console.error('Recognition error:', err);
      setError(t('enhancedAttendanceCamera.errorRecognize'));
      setTimeout(() => setError(null), 2000);
    } finally {
      setLoading(false);
    }
  };

  const startCapturing = () => {
    if (!selectedSession) {
      setError(t('enhancedAttendanceCamera.errorSelectSession'));
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
    if (confidence >= 0.8) return t('enhancedAttendanceCamera.confidenceVeryHigh');
    if (confidence >= 0.65) return t('enhancedAttendanceCamera.confidenceGood');
    return t('enhancedAttendanceCamera.confidenceLow');
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        {t('enhancedAttendanceCamera.title')}
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
                    <InputLabel>{t('enhancedAttendanceCamera.selectSession')}</InputLabel>
                    <Select
                      value={selectedSession}
                      onChange={(e) => setSelectedSession(e.target.value)}
                      label={t('enhancedAttendanceCamera.selectSession')}
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
                    label={t('enhancedAttendanceCamera.autoScan')}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Camera Feed */}
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Box
                  sx={{
                    position: 'relative',
                    width: { xs: 270, sm: 320, md: 360 },
                    height: { xs: 270, sm: 320, md: 360 },
                    borderRadius: '50%',
                    overflow: 'hidden',
                    backgroundColor: '#000',
                    border: '3px solid rgba(56,189,248,0.8)',
                    boxShadow: '0 0 0 10px rgba(56,189,248,0.08), 0 0 40px rgba(56,189,248,0.35)',
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
                          animation: 'faceScanLineEnhanced 1.6s linear infinite',
                        },
                        '@keyframes faceScanLineEnhanced': {
                          '0%': { top: '-10%' },
                          '100%': { top: '110%' },
                        },
                      }}
                    />
                  )}

                  {/* Status Overlay */}
                  {isCapturing && (
                    <Chip
                      label={t('enhancedAttendanceCamera.statusScanning')}
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
                    {t('enhancedAttendanceCamera.startAttendance')}
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
                      {t('enhancedAttendanceCamera.stopAttendance')}
                    </Button>
                    
                    {!autoCapture && (
                      <Button
                        variant="outlined"
                        size="large"
                        onClick={captureAndRecognize}
                        disabled={loading}
                      >
                        {t('enhancedAttendanceCamera.manualCapture')}
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
                          <Avatar
                            src={
                              recognitionResult.student_info?.anh_dai_dien
                                ? getStudentAvatarSrc(recognitionResult.student_info, avatarKey)
                                : undefined
                            }
                            sx={{ width: 60, height: 60, bgcolor: 'success.main' }}
                          >
                            {recognitionResult.student_info?.anh_dai_dien
                              ? null
                              : (recognitionResult.student_info?.ho_ten?.charAt(0) || <VerifiedIcon sx={{ fontSize: 40 }} />)}
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
                              label={t('enhancedAttendanceCamera.confidenceLabel', {
                                percent: (recognitionResult.confidence * 100).toFixed(1),
                              })}
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
                            {t('enhancedAttendanceCamera.topMatchesLabel')}
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
                        {t('enhancedAttendanceCamera.notRecognizedTitle')}
                      </Typography>
                      <Typography variant="body2">
                        {recognitionResult.message}
                      </Typography>
                      {recognitionResult.top_matches && recognitionResult.top_matches.length > 0 && (
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="caption">
                            {t('enhancedAttendanceCamera.closestMatch', {
                              identity: recognitionResult.top_matches[0].identity,
                              percent: (recognitionResult.top_matches[0].score * 100).toFixed(1),
                            })}
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
                  💡 {t('enhancedAttendanceCamera.instructionsTitle')}
                </Typography>
                <ul style={{ marginTop: 4, paddingLeft: 20, marginBottom: 0 }}>
                  <li>{t('enhancedAttendanceCamera.uiLookHint')}</li>
                  <li>{t('enhancedAttendanceCamera.uiLightHint')}</li>
                  <li>{t('enhancedAttendanceCamera.uiLeftHint')}</li>
                  <li>{t('enhancedAttendanceCamera.uiAntiSpoofHint')}</li>
                  <li>{t('enhancedAttendanceCamera.uiAutoHint', { seconds: captureInterval / 1000 })}</li>
                  <li>{t('enhancedAttendanceCamera.uiAcceptHint')}</li>
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
              <Typography variant="h6" gutterBottom>{t('enhancedAttendanceCamera.statTitle')}</Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" color="primary">
                      {sessionStats.total}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('enhancedAttendanceCamera.total')}
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" color="success.main">
                      {sessionStats.onTime}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('enhancedAttendanceCamera.onTime')}
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" color="warning.main">
                      {sessionStats.late}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('enhancedAttendanceCamera.late')}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Recent Attendance */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>{t('enhancedAttendanceCamera.attendanceListTitle')}</Typography>

              {recentAttendance.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <PersonIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                  <Typography color="text.secondary">{t('enhancedAttendanceCamera.emptyAttendance')}</Typography>
                </Box>
              ) : (
                <List sx={{ maxHeight: 500, overflow: 'auto' }}>
                  {recentAttendance.map((item, index) => (
                    <React.Fragment key={item.ma_diem_danh}>
                      <ListItem alignItems="flex-start">
                        <ListItemAvatar>
                          <Avatar
                            src={item.anh_dai_dien ? getStudentAvatarSrc(item, avatarKey) : undefined}
                            sx={{
                              bgcolor: item.trang_thai === 'Đúng giờ' 
                                ? 'success.main' 
                                : 'warning.main',
                            }}
                          >
                            {!item.anh_dai_dien
                              ? (item.ho_ten?.charAt(0) || (item.trang_thai === 'Đúng giờ' ? <CheckIcon /> : <ScheduleIcon />))
                              : null}
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
                                {new Date(item.thoi_gian_quet).toLocaleTimeString(dateTimeLocale)}
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
