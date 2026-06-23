import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import FaceIcon from '@mui/icons-material/Face';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import MasksIcon from '@mui/icons-material/Masks';
import BackHandIcon from '@mui/icons-material/BackHand';
import GroupsIcon from '@mui/icons-material/Groups';
import { studentPortalAPI, attendanceAPI, recognitionAPI } from '../../services/api';
import { captureSequentialWebcamFrames, buildRecognizeLiveFormData } from '../../utils/liveWebcamCapture';
import { FACE_ID_LIVE_CAPTURE } from '../../config/faceIdLiveCapture';
import { getApiPathPrefix } from '../../config/apiBase';
import { getStudentAvatarSrc } from '../../utils/studentAvatar';
import { formatApiError } from '../../utils/apiError';
import { isSessionScanCodeValid } from '../../utils/sessionScanCode';
import { useI18n } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { buildRecognitionBlockNotice } from '../../utils/recognitionFeedback';
import CameraNoticeOverlay from '../../components/CameraNoticeOverlay';
import {
  getLocalDateISO,
  isSessionInCheckinPicker,
  pickDefaultSessionMaBuoi,
  sortSessionsByStartAsc,
} from '../../utils/studentSessionCheckin';

const API = getApiPathPrefix();

function noticeIconForKind(kind) {
  if (kind === 'mask') return <MasksIcon sx={{ fontSize: 36, color: '#fff' }} />;
  if (kind === 'occluded') return <BackHandIcon sx={{ fontSize: 36, color: '#fff' }} />;
  if (kind === 'unknown_face') return <FaceIcon sx={{ fontSize: 36, color: '#fff' }} />;
  if (kind === 'multiple_faces') return <GroupsIcon sx={{ fontSize: 36, color: '#fff' }} />;
  return <ErrorOutlineIcon sx={{ fontSize: 36, color: '#fff' }} />;
}

export default function StudentAttendanceTab() {
  const { t } = useI18n();
  const { user, avatarNonce } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const webcamRef = useRef(null);
  const scanInFlightRef = useRef(false);

  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [recentAttendance, setRecentAttendance] = useState([]);

  const [isCapturing, setIsCapturing] = useState(false);
  const [autoCapture, setAutoCapture] = useState(true);

  const [recognitionResult, setRecognitionResult] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  const [sessionStats, setSessionStats] = useState({ total: 0, onTime: 0, late: 0 });
  const [avatarKey, setAvatarKey] = useState(0);
  const [maXacThuc, setMaXacThuc] = useState('');

  const [cameraNotice, setCameraNotice] = useState(null);
  /** Khi true, interval tự động không chạy (đang hiện thông báo chặn hoặc đang xử lý). */
  const [blockAutoScan, setBlockAutoScan] = useState(false);

  const myMaSv = (user?.ma_sv || '').trim();
  const alreadyCheckedInThisSession = myMaSv
    ? recentAttendance.some((r) => (r.ma_sv || '').trim() === myMaSv)
    : false;

  const selectedSessionMeta = sessions.find((s) => String(s.ma_buoi) === String(selectedSession));

  const pickerSessions = useMemo(
    () => sessions.filter(isSessionInCheckinPicker),
    [sessions]
  );

  const repairSelectedAfterSessionsUpdate = useCallback((sortedToday) => {
    const picker = sortedToday.filter(isSessionInCheckinPicker);
    setSelectedSession((prev) => {
      if (!picker.length) return '';
      if (prev && picker.some((s) => String(s.ma_buoi) === String(prev))) return prev;
      return pickDefaultSessionMaBuoi(picker, null);
    });
  }, []);

  const refreshTodaySessions = useCallback(async () => {
    const td = getLocalDateISO();
    const { data } = await studentPortalAPI.getMySessions();
    const today = (data || []).filter((s) => (s.ngay_hoc || '').slice(0, 10) === td);
    const sorted = sortSessionsByStartAsc(today);
    setSessions(sorted);
    repairSelectedAfterSessionsUpdate(sorted);
  }, [repairSelectedAfterSessionsUpdate]);

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        setInitialLoad(true);
        setError(null);
        const { data } = await studentPortalAPI.getMySessions();
        if (!ok) return;
        const td = getLocalDateISO();
        const today = sortSessionsByStartAsc(
          (data || []).filter((s) => (s.ngay_hoc || '').slice(0, 10) === td)
        );
        setSessions(today);
        const picker = today.filter(isSessionInCheckinPicker);
        const fromUrl = searchParams.get('ma_buoi');
        if (fromUrl) {
          const next = new URLSearchParams(searchParams);
          next.delete('ma_buoi');
          setSearchParams(next, { replace: true });
        }
        setSelectedSession(pickDefaultSessionMaBuoi(picker, fromUrl));
      } catch (e) {
        if (!ok) return;
        setError(formatApiError(e.response?.data?.detail, t('studentAttendanceTab.loadTodaySessionsFail')));
      } finally {
        if (ok) {
          setInitialLoad(false);
        }
      }
    })();
    return () => {
      ok = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        await refreshTodaySessions();
      } catch {
        // im lặng — tránh làm phiền khi poll
      }
    };
    const id = setInterval(() => {
      if (cancelled || document.visibilityState === 'hidden') return;
      tick();
    }, 45000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshTodaySessions]);

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
      } catch {
        if (!ok) return;
        setError(t('studentAttendanceTab.loadAttendanceFail'));
      }
    })();
    return () => {
      ok = false;
    };
  }, [selectedSession]);

  const dismissCameraNotice = useCallback(() => {
    setCameraNotice(null);
    setBlockAutoScan(false);
  }, []);

  const showBlockingNotice = useCallback(
    (payload) => {
      setCameraNotice(payload);
      setBlockAutoScan(true);
      setIsCapturing(false);
      setRecognitionResult(null);
    },
    []
  );

  useEffect(() => {
    let intervalId;
    if (isCapturing && autoCapture && selectedSession && !blockAutoScan && !cameraNotice) {
      intervalId = setInterval(() => {
        captureAndRecognize();
      }, 1400);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCapturing, autoCapture, selectedSession, blockAutoScan, cameraNotice]);

  const buildRecognitionNotice = (result) => {
    if (result?.confidence > 0) {
      return {
        variant: 'warning',
        icon: <FaceIcon sx={{ fontSize: 36, color: '#fff' }} />,
        title: t('studentAttendanceTab.overlayTitleAdjust'),
        message: t('studentAttendanceTab.overlayMsgLowConfidence', {
          percent: (result.confidence * 100).toFixed(1),
        }),
        actionLabel: t('studentAttendanceTab.overlayDismiss'),
      };
    }
    return {
      variant: 'info',
      icon: <WbSunnyOutlinedIcon sx={{ fontSize: 36, color: '#fff' }} />,
      title: t('studentAttendanceTab.overlayTitleFace'),
      message: t('studentAttendanceTab.overlayMsgNoFace'),
      actionLabel: t('studentAttendanceTab.overlayDismiss'),
    };
  };

  const validateScanCodeBeforeScan = () => {
    const codeTrim = maXacThuc.trim();
    if (!codeTrim) {
      showBlockingNotice({
        variant: 'warning',
        icon: <ErrorOutlineIcon sx={{ fontSize: 36, color: '#fff' }} />,
        title: t('studentAttendanceTab.overlayTitleCode'),
        message: t('studentAttendanceTab.scanCodeRequired'),
        actionLabel: t('studentAttendanceTab.overlayDismiss'),
      });
      return null;
    }
    if (!isSessionScanCodeValid(codeTrim)) {
      showBlockingNotice({
        variant: 'warning',
        icon: <ErrorOutlineIcon sx={{ fontSize: 36, color: '#fff' }} />,
        title: t('studentAttendanceTab.overlayTitleCode'),
        message: t('studentAttendanceTab.scanCodeFormatError'),
        actionLabel: t('studentAttendanceTab.overlayDismiss'),
      });
      return null;
    }
    return codeTrim;
  };

  const captureAndRecognize = async () => {
    if (scanInFlightRef.current) return;
    if (blockAutoScan || cameraNotice) return;
    if (!webcamRef.current?.getScreenshot?.()) return;
    const codeTrim = validateScanCodeBeforeScan();
    if (!codeTrim) return;

    const metaScan = sessions.find((s) => String(s.ma_buoi) === String(selectedSession));
    if (metaScan && !metaScan.co_the_quet) {
      if (metaScan.phase_diem_danh === 'chua_mo') {
        showBlockingNotice({
          variant: 'info',
          icon: <ScheduleIcon sx={{ fontSize: 36, color: '#fff' }} />,
          title: t('studentAttendanceTab.overlayTitleNotOpen'),
          message: metaScan.goi_y_diem_danh || t('studentAttendanceTab.overlayMsgNotOpen'),
          actionLabel: t('studentAttendanceTab.overlayDismiss'),
        });
      } else {
        showBlockingNotice({
          variant: 'warning',
          icon: <ErrorOutlineIcon sx={{ fontSize: 36, color: '#fff' }} />,
          title: t('studentAttendanceTab.overlayTitleCheckinFail'),
          message: metaScan.goi_y_diem_danh || t('studentAttendanceTab.errorWindowClosed'),
          actionLabel: t('studentAttendanceTab.overlayDismiss'),
        });
      }
      return;
    }

    scanInFlightRef.current = true;
    setLoading(true);
    setRecognitionResult(null);
    setError(null);
    setSuccess(null);

    try {
      let blobs;
      try {
        blobs = await captureSequentialWebcamFrames(webcamRef, { count: 3, gapMs: 420 });
      } catch {
        setError(t('studentAttendanceTab.liveCaptureFail'));
        setLoading(false);
        scanInFlightRef.current = false;
        return;
      }

      const liveFd = buildRecognizeLiveFormData(blobs);
      const response = await recognitionAPI.recognizeLiveFrames(liveFd);
      const result = response.data;
      setRecognitionResult(result);

      const blockNotice = buildRecognitionBlockNotice(result, t, t('studentAttendanceTab.overlayDismiss'));
      if (blockNotice) {
        showBlockingNotice({
          ...blockNotice,
          icon: noticeIconForKind(blockNotice.kind),
        });
        setLoading(false);
        scanInFlightRef.current = false;
        return;
      }

      const lastBlob = blobs[blobs.length - 1];
      const file = new File([lastBlob], 'capture.jpg', { type: 'image/jpeg' });

      if (result?.success && selectedSession) {
        if (myMaSv && String(result.student_info?.ma_sv || '').trim() !== myMaSv) {
          showBlockingNotice({
            variant: 'warning',
            icon: <ErrorOutlineIcon sx={{ fontSize: 36, color: '#fff' }} />,
            title: t('studentAttendanceTab.overlayTitleCheckinFail'),
            message: t('studentAttendanceTab.errorNotYourFace'),
            actionLabel: t('studentAttendanceTab.overlayDismiss'),
          });
          setLoading(false);
          return;
        }
        const checkinResponse = await attendanceAPI.checkin(
          result.student_info.ma_sv,
          selectedSession,
          codeTrim,
          file,
          blobs,
        );

        const checkinBlock = buildRecognitionBlockNotice(
          checkinResponse.data,
          t,
          t('studentAttendanceTab.overlayDismiss')
        );
        if (checkinBlock) {
          showBlockingNotice({
            ...checkinBlock,
            icon: noticeIconForKind(checkinBlock.kind),
          });
          setLoading(false);
          scanInFlightRef.current = false;
          return;
        }

        if (checkinResponse.data.success) {
          const status = checkinResponse.data.trang_thai;
          const course = selectedSessionMeta?.ten_mon || '';
          setSuccess(
            t('enhancedAttendanceCamera.successCheckin', {
              name: result.student_info.ho_ten,
              status,
            })
          );
          await fetchAttendanceAfterCheckin();
          try {
            await refreshTodaySessions();
          } catch {
            // ignore
          }
          setAvatarKey((k) => k + 1);
          setIsCapturing(false);
          setBlockAutoScan(true);
          setCameraNotice({
            variant: 'success',
            icon: <CheckCircleIcon sx={{ fontSize: 40, color: '#fff' }} />,
            title: t('studentAttendanceTab.overlayTitleSuccess'),
            message: t('studentAttendanceTab.overlayMsgSuccess', { course, status }),
            actionLabel: t('studentAttendanceTab.overlayDismiss'),
          });
        } else {
          const msg = checkinResponse.data.message || t('studentAttendanceTab.checkinFail');
          showBlockingNotice({
            variant: 'warning',
            icon: <ErrorOutlineIcon sx={{ fontSize: 36, color: '#fff' }} />,
            title: t('studentAttendanceTab.overlayTitleCheckinFail'),
            message: msg,
            actionLabel: t('studentAttendanceTab.overlayDismiss'),
          });
        }
      } else if (!result?.success) {
        const n = buildRecognitionNotice(result);
        showBlockingNotice({
          ...n,
        });
      }
    } catch (e) {
      const apiMsg = e.response?.data?.detail || e.response?.data?.message;
      const text =
        typeof apiMsg === 'string'
          ? apiMsg
          : formatApiError(apiMsg, t('studentAttendanceTab.errorRecognize'));
      showBlockingNotice({
        variant: 'info',
        icon: <ErrorOutlineIcon sx={{ fontSize: 36, color: '#fff' }} />,
        title: t('studentAttendanceTab.overlayTitleNetwork'),
        message: text,
        actionLabel: t('studentAttendanceTab.overlayDismiss'),
      });
    } finally {
      setLoading(false);
      scanInFlightRef.current = false;
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
    if (selectedSessionMeta?.phase_diem_danh === 'chua_mo') {
      showBlockingNotice({
        variant: 'info',
        icon: <ScheduleIcon sx={{ fontSize: 36, color: '#fff' }} />,
        title: t('studentAttendanceTab.overlayTitleNotOpen'),
        message: selectedSessionMeta.goi_y_diem_danh || t('studentAttendanceTab.overlayMsgNotOpen'),
        actionLabel: t('studentAttendanceTab.overlayDismiss'),
      });
      setBlockAutoScan(true);
      return;
    }
    if (selectedSessionMeta && !selectedSessionMeta.co_the_quet) {
      showBlockingNotice({
        variant: 'warning',
        icon: <ErrorOutlineIcon sx={{ fontSize: 36, color: '#fff' }} />,
        title: t('studentAttendanceTab.overlayTitleCheckinFail'),
        message: selectedSessionMeta.goi_y_diem_danh || t('studentAttendanceTab.errorWindowClosed'),
        actionLabel: t('studentAttendanceTab.overlayDismiss'),
      });
      setBlockAutoScan(true);
      return;
    }
    if (alreadyCheckedInThisSession) {
      setCameraNotice({
        variant: 'success',
        icon: <CheckCircleIcon sx={{ fontSize: 40, color: '#fff' }} />,
        title: t('studentAttendanceTab.overlayTitleAlready'),
        message: t('studentAttendanceTab.overlayMsgAlready'),
        actionLabel: t('studentAttendanceTab.overlayDismiss'),
      });
      setBlockAutoScan(true);
      return;
    }
    const codeTrim = validateScanCodeBeforeScan();
    if (!codeTrim) return;
    dismissCameraNotice();
    setIsCapturing(true);
    setError(null);
    setSuccess(null);
    setRecognitionResult(null);
    setBlockAutoScan(false);
  };

  const stopCapturing = () => {
    setIsCapturing(false);
    setRecognitionResult(null);
    setBlockAutoScan(false);
  };

  const handleDismissOverlay = () => {
    setSuccess(null);
    dismissCameraNotice();
  };

  if (initialLoad && !sessions.length) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
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
              <Alert severity="info" sx={{ mb: 2 }} icon={false}>
                {t('studentAttendanceTab.livenessHint')}
              </Alert>

              {sessions.length === 0 ? (
                <Alert severity="info">{t('studentAttendanceTab.noTodaySessions')}</Alert>
              ) : pickerSessions.length === 0 ? (
                <Alert severity="success" icon={<CheckCircleIcon />}>
                  {t('studentAttendanceTab.allDoneOrClosedToday')}
                </Alert>
              ) : (
                <>
                  {error && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                      {error}
                    </Alert>
                  )}
                  {success && !cameraNotice && (
                    <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
                      {success}
                    </Alert>
                  )}
                  {alreadyCheckedInThisSession && selectedSessionMeta?.co_the_quet && (
                    <Alert severity="success" sx={{ mb: 2 }}>
                      {t('studentAttendanceTab.hintAlreadyInList')}
                    </Alert>
                  )}
                  {selectedSessionMeta?.phase_diem_danh === 'chua_mo' && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                      {selectedSessionMeta.goi_y_diem_danh || t('studentAttendanceTab.overlayMsgNotOpen')}
                    </Alert>
                  )}
                  {selectedSessionMeta?.co_the_quet && !selectedSessionMeta.khoang_dung_gio && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      {selectedSessionMeta.goi_y_diem_danh || t('studentAttendanceTab.pickerOpenLate')}
                    </Alert>
                  )}

                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={8}>
                      <FormControl fullWidth size="small">
                        <InputLabel>{t('enhancedAttendanceCamera.selectSession')}</InputLabel>
                        <Select
                          value={pickerSessions.some((s) => String(s.ma_buoi) === String(selectedSession)) ? selectedSession : ''}
                          onChange={(e) => setSelectedSession(e.target.value)}
                          label={t('enhancedAttendanceCamera.selectSession')}
                          disabled={isCapturing}
                          displayEmpty
                          renderValue={(val) => {
                            const s = pickerSessions.find((x) => String(x.ma_buoi) === String(val));
                            if (!s) return '';
                            const tm = s.gio_bat_dau;
                            const gShort = typeof tm === 'string' && tm.length >= 5 ? tm.slice(0, 5) : tm;
                            return `${s.ten_mon} · ${gShort || '—'}`;
                          }}
                        >
                          {pickerSessions.map((s) => {
                            let statusLabel = '';
                            if (s.co_the_quet && s.khoang_dung_gio) statusLabel = t('studentAttendanceTab.pickerOpenOnTime');
                            else if (s.co_the_quet) statusLabel = t('studentAttendanceTab.pickerOpenLate');
                            else if (s.phase_diem_danh === 'chua_mo') statusLabel = t('studentAttendanceTab.pickerNotYetOpen');
                            return (
                              <MenuItem key={s.ma_buoi} value={String(s.ma_buoi)}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', py: 0.25 }}>
                                  <Typography variant="body2" fontWeight={700}>
                                    {s.ten_mon} · {s.gio_bat_dau?.slice(0, 5) || s.gio_bat_dau}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {s.giang_vien}
                                    {statusLabel ? ` · ${statusLabel}` : ''}
                                  </Typography>
                                </Box>
                              </MenuItem>
                            );
                          })}
                        </Select>
                      </FormControl>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                        {t('studentAttendanceTab.pickerHint')}
                      </Typography>
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

                  {recognitionResult?.success && !cameraNotice && (
                    <Alert severity="success" sx={{ mt: 2 }}>
                      {t('studentAttendanceTab.recognizedPrefix')}:{' '}
                      <b>{recognitionResult.student_info?.ho_ten}</b> •{' '}
                      {t('studentAttendanceTab.confidenceLabel')}:{' '}
                      {(recognitionResult.confidence * 100).toFixed(1)}%
                    </Alert>
                  )}

                  <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                    <Box sx={{ position: 'relative' }}>
                    <Box
                      sx={{
                        position: 'relative',
                        width: { xs: 250, sm: 300, md: 335 },
                        height: { xs: 250, sm: 300, md: 335 },
                        borderRadius: '50%',
                        overflow: 'hidden',
                        background: '#0f172a',
                        border: '3px solid rgba(56,189,248,0.8)',
                        boxShadow: '0 0 0 10px rgba(56,189,248,0.08), 0 0 40px rgba(56,189,248,0.35)',
                        transition: 'filter 0.25s ease, opacity 0.25s ease',
                        ...(cameraNotice
                          ? {
                              filter: 'blur(2.2px)',
                              opacity: 0.7,
                            }
                          : {}),
                      }}
                    >
                      <Box
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          transition: 'filter 0.25s ease, opacity 0.25s ease',
                          ...(cameraNotice
                            ? {
                                filter: 'blur(9px)',
                                opacity: 0.62,
                              }
                            : {}),
                        }}
                      >
                        <Webcam
                          ref={webcamRef}
                          audio={false}
                          screenshotFormat="image/jpeg"
                          videoConstraints={{
                            width: { ideal: 1280, min: 640 },
                            height: { ideal: 720, min: 480 },
                            facingMode: 'user',
                          }}
                          style={{ width: '108%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </Box>

                      {isCapturing && !cameraNotice && (
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
                              animation: 'faceScanLine 3.2s linear infinite',
                            },
                            '@keyframes faceScanLine': {
                              '0%': { top: '-10%' },
                              '100%': { top: '110%' },
                            },
                          }}
                        />
                      )}

                      {loading && !cameraNotice && (
                        <Box
                          sx={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 5,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'rgba(15,23,42,0.5)',
                          }}
                        >
                          <CircularProgress size={56} sx={{ color: 'primary.light' }} />
                        </Box>
                      )}

                    </Box>
                    <CameraNoticeOverlay
                      open={Boolean(cameraNotice)}
                      variant={cameraNotice?.variant || 'info'}
                      icon={cameraNotice?.icon}
                      title={cameraNotice?.title}
                      message={cameraNotice?.message}
                      actionLabel={cameraNotice?.actionLabel || t('studentAttendanceTab.overlayDismiss')}
                      onDismiss={handleDismissOverlay}
                    />
                    </Box>
                  </Box>

                  <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
                    {!isCapturing ? (
                      <Button
                        variant="contained"
                        color="primary"
                        size="large"
                        startIcon={<CameraIcon />}
                        onClick={startCapturing}
                        disabled={
                          !selectedSession ||
                          alreadyCheckedInThisSession ||
                          Boolean(selectedSessionMeta && !selectedSessionMeta.co_the_quet)
                        }
                        sx={{ fontWeight: 800, px: 3, borderRadius: 2 }}
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
                          sx={{ fontWeight: 800, px: 3, borderRadius: 2 }}
                        >
                          {t('enhancedAttendanceCamera.stopAttendance')}
                        </Button>
                        {!autoCapture && (
                          <Button
                            variant="contained"
                            color="secondary"
                            size="large"
                            startIcon={<TouchAppIcon />}
                            onClick={() => captureAndRecognize()}
                            disabled={
                              loading ||
                              Boolean(cameraNotice) ||
                              Boolean(selectedSessionMeta && !selectedSessionMeta.co_the_quet)
                            }
                            sx={{ fontWeight: 800, px: 3, borderRadius: 2 }}
                          >
                            {t('studentAttendanceTab.scanNow')}
                          </Button>
                        )}
                      </>
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
                  {recentAttendance.map((item, idx) => {
                    const rowMa = (item.ma_sv || '').trim();
                    const bust =
                      myMaSv && rowMa && rowMa === myMaSv ? Math.max(avatarKey, avatarNonce) : avatarKey;
                    return (
                    <React.Fragment key={item.ma_diem_danh || idx}>
                      <ListItem alignItems="flex-start">
                        <ListItemAvatar>
                          <Avatar
                            src={item.anh_dai_dien ? getStudentAvatarSrc(item, bust) : undefined}
                            sx={{
                              bgcolor:
                                item.trang_thai === 'Đúng giờ' ? 'success.main' : 'warning.main',
                            }}
                          >
                            {!item.anh_dai_dien ? (
                              item.trang_thai === 'Đúng giờ' ? (
                                <CheckCircleIcon />
                              ) : (
                                <ScheduleIcon />
                              )
                            ) : null}
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
                    );
                  })}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
