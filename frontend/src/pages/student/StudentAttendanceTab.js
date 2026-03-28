import React, { useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import axios from 'axios';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Alert,
  CircularProgress,
  Button,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  TextField,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Divider,
  Avatar,
  Paper,
} from '@mui/material';
import CameraIcon from '@mui/icons-material/CameraAlt';
import StopIcon from '@mui/icons-material/Stop';
import PersonIcon from '@mui/icons-material/Person';
import ScheduleIcon from '@mui/icons-material/Schedule';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { studentPortalAPI, attendanceAPI } from '../../services/api';
import { getApiPathPrefix } from '../../config/apiBase';
import { getStudentAvatarSrc } from '../../utils/studentAvatar';
import { formatApiError } from '../../utils/apiError';
import { isSessionScanCodeValid } from '../../utils/sessionScanCode';
import { useI18n } from '../../i18n/I18nContext';

const API = getApiPathPrefix();

export default function StudentAttendanceTab() {
  const { t } = useI18n();
  const webcamRef = useRef(null);

  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [recentAttendance, setRecentAttendance] = useState([]);

  const [isCapturing, setIsCapturing] = useState(false);
  const [autoCapture, setAutoCapture] = useState(true);
  const [captureInterval, setCaptureInterval] = useState(3000);

  const [recognitionResult, setRecognitionResult] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  const [sessionStats, setSessionStats] = useState({ total: 0, onTime: 0, late: 0 });
  const [avatarKey, setAvatarKey] = useState(0);
  const [maXacThuc, setMaXacThuc] = useState('');

  const todayStr = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data } = await studentPortalAPI.getMySessions();
        const today = (data || []).filter((s) => (s.ngay_hoc || '').slice(0, 10) === todayStr);
        if (!ok) return;
        setSessions(today);
        setSelectedSession(today?.[0]?.ma_buoi || '');
      } catch (e) {
        if (!ok) return;
        setError(formatApiError(e.response?.data?.detail, t('studentAttendanceTab.loadTodaySessionsFail')));
      } finally {
        if (ok) setLoading(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, [todayStr]);

  useEffect(() => {
    if (!selectedSession) return;
    let ok = true;
    (async () => {
      try {
        const response = await axios.get(`${API}/attendance/session/${selectedSession}`);
        if (!ok) return;
        setRecentAttendance(response.data || []);

        const onTime = (response.data || []).filter((r) => r.trang_thai === 'Đúng giờ').length;
        const late = (response.data || []).filter((r) => r.trang_thai === 'Trễ').length;
        setSessionStats({ total: (response.data || []).length, onTime, late });
      } catch (e) {
        if (!ok) return;
        setError(t('studentAttendanceTab.loadAttendanceFail'));
      }
    })();
    return () => {
      ok = false;
    };
  }, [selectedSession]);

  useEffect(() => {
    let intervalId;
    if (isCapturing && autoCapture && selectedSession) {
      intervalId = setInterval(() => {
        captureAndRecognize();
      }, captureInterval);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCapturing, autoCapture, captureInterval, selectedSession]);

  const captureAndRecognize = async () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) return;

    setLoading(true);
    setRecognitionResult(null);
    setError(null);

    try {
      const blob = await fetch(imageSrc).then((r) => r.blob());
      const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(`${API}/recognize`, formData);
      const result = response.data;
      setRecognitionResult(result);

      if (result?.success && selectedSession) {
        const codeTrim = maXacThuc.trim();
        if (codeTrim && !isSessionScanCodeValid(codeTrim)) {
          setError(t('studentAttendanceTab.scanCodeFormatError'));
          setLoading(false);
          return;
        }
        // Auto check-in
        const checkinResponse = await attendanceAPI.checkin(
          result.student_info.ma_sv,
          selectedSession,
          codeTrim || undefined,
        );

        if (checkinResponse.data.success) {
          setSuccess(
            t('enhancedAttendanceCamera.successCheckin', {
              name: result.student_info.ho_ten,
              status: checkinResponse.data.trang_thai,
            })
          );
          fetchAttendanceAfterCheckin();
          setAvatarKey((k) => k + 1);
          setTimeout(() => setSuccess(null), 3000);
        } else {
          setError(checkinResponse.data.message || t('studentAttendanceTab.checkinFail'));
        }
      } else if (!result?.success) {
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
    } catch (e) {
      setError(e.response?.data?.message || t('studentAttendanceTab.errorRecognize'));
      setTimeout(() => setError(null), 2500);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendanceAfterCheckin = async () => {
    try {
      const response = await axios.get(`${API}/attendance/session/${selectedSession}`);
      setRecentAttendance(response.data || []);
      const onTime = (response.data || []).filter((r) => r.trang_thai === 'Đúng giờ').length;
      const late = (response.data || []).filter((r) => r.trang_thai === 'Trễ').length;
      setSessionStats({ total: (response.data || []).length, onTime, late });
    } catch {
      // ignore
    }
  };

  const startCapturing = () => {
    if (!selectedSession) {
      setError(t('enhancedAttendanceCamera.errorSelectSession'));
      return;
    }
    setIsCapturing(true);
    setError(null);
    setSuccess(null);
  };

  const stopCapturing = () => {
    setIsCapturing(false);
    setRecognitionResult(null);
  };

  if (loading && !sessions.length) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h5" fontWeight={900} gutterBottom>
                {t('studentAttendanceTab.title')}
              </Typography>

              {sessions.length === 0 ? (
                <Alert severity="info">
                  {t('studentAttendanceTab.noTodaySessions')}
                </Alert>
              ) : (
                <>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={8}>
                      <FormControl fullWidth size="small">
                      <InputLabel>{t('enhancedAttendanceCamera.selectSession')}</InputLabel>
                        <Select
                          value={selectedSession}
                          onChange={(e) => setSelectedSession(e.target.value)}
                        label={t('enhancedAttendanceCamera.selectSession')}
                          disabled={isCapturing}
                        >
                          {sessions.map((s) => (
                            <MenuItem key={s.ma_buoi} value={s.ma_buoi}>
                              {s.ten_mon} - {s.gio_bat_dau} ({s.giang_vien})
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        size="small"
                        label={t('studentAttendanceTab.scanCodeLabel')}
                        value={maXacThuc}
                        onChange={(e) => setMaXacThuc(e.target.value)}
                        disabled={isCapturing}
                        helperText={t('studentAttendanceTab.scanCodeHelper')}
                      />
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

                  {error && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                      {error}
                    </Alert>
                  )}
                  {success && (
                    <Alert severity="success" sx={{ mt: 2 }}>
                      {success}
                    </Alert>
                  )}

                  {recognitionResult?.success && (
                    <Alert severity="success" sx={{ mt: 2 }}>
                      {t('studentAttendanceTab.recognizedPrefix')}: <b>{recognitionResult.student_info?.ho_ten}</b> •{' '}
                      {t('studentAttendanceTab.confidenceLabel')}: {(recognitionResult.confidence * 100).toFixed(1)}%
                    </Alert>
                  )}

                  <Box sx={{ mt: 2, position: 'relative', background: '#000', borderRadius: 2, overflow: 'hidden' }}>
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

                    {loading && (
                      <Box
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'rgba(0,0,0,0.45)',
                        }}
                      >
                        <CircularProgress size={60} />
                      </Box>
                    )}
                  </Box>

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
                      <Button
                        variant="contained"
                        color="error"
                        size="large"
                        startIcon={<StopIcon />}
                        onClick={stopCapturing}
                      >
                        {t('enhancedAttendanceCamera.stopAttendance')}
                      </Button>
                    )}
                  </Box>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={900} gutterBottom>
                {t('enhancedAttendanceCamera.statTitle')}
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={4}>
                  <Typography variant="h4" color="primary.main" fontWeight={900}>
                    {sessionStats.total}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('enhancedAttendanceCamera.total')}
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="h4" color="success.main" fontWeight={900}>
                    {sessionStats.onTime}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('enhancedAttendanceCamera.onTime')}
                  </Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="h4" color="warning.main" fontWeight={900}>
                    {sessionStats.late}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('enhancedAttendanceCamera.late')}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={900} gutterBottom>
                {t('studentAttendanceTab.attendanceListTitle')}
              </Typography>

              {recentAttendance.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <PersonIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                  <Typography color="text.secondary">{t('studentAttendanceTab.emptyAttendance')}</Typography>
                </Box>
              ) : (
                <List sx={{ maxHeight: 420, overflow: 'auto' }}>
                  {recentAttendance.map((item, idx) => (
                    <React.Fragment key={item.ma_diem_danh || idx}>
                      <ListItem alignItems="flex-start">
                        <ListItemAvatar>
                          <Avatar
                            src={item.anh_dai_dien ? getStudentAvatarSrc(item, avatarKey) : undefined}
                            sx={{
                              bgcolor:
                                item.trang_thai === 'Đúng giờ' ? 'success.main' : 'warning.main',
                            }}
                          >
                            {!item.anh_dai_dien ? (item.trang_thai === 'Đúng giờ' ? <CheckCircleIcon /> : <ScheduleIcon />) : null}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={<Typography fontWeight={700}>{item.ho_ten}</Typography>}
                          secondary={
                            <>
                              <Typography variant="body2" color="text.secondary">
                                {item.ma_sv} - {item.lop}
                              </Typography>
                              <Chip
                                label={item.trang_thai}
                                size="small"
                                color={item.trang_thai === 'Đúng giờ' ? 'success' : 'warning'}
                                sx={{ mt: 0.5 }}
                              />
                            </>
                          }
                        />
                      </ListItem>
                      {idx < recentAttendance.length - 1 && <Divider variant="inset" component="li" />}
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

