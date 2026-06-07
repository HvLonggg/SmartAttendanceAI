import React, { useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Grid,
  Paper,
  Switch,
  Typography,
} from '@mui/material';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import FaceRetouchingNaturalIcon from '@mui/icons-material/FaceRetouchingNatural';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import MasksIcon from '@mui/icons-material/Masks';
import BackHandIcon from '@mui/icons-material/BackHand';
import { recognitionAPI } from '../../services/api';
import { getStudentAvatarSrc, getStudentInitialLetter } from '../../utils/studentAvatar';
import { buildRecognitionBlockNotice, getRecognitionBlockFeedback } from '../../utils/recognitionFeedback';
import CameraNoticeOverlay from '../../components/CameraNoticeOverlay';
import { useI18n } from '../../i18n/I18nContext';

const videoConstraints = {
  width: 1280,
  height: 720,
  facingMode: 'user',
};

function noticeIconForKind(kind) {
  if (kind === 'mask') return <MasksIcon sx={{ fontSize: 36, color: '#fff' }} />;
  if (kind === 'occluded') return <BackHandIcon sx={{ fontSize: 36, color: '#fff' }} />;
  if (kind === 'unknown_face') return <FaceRetouchingNaturalIcon sx={{ fontSize: 36, color: '#fff' }} />;
  return <ErrorOutlineIcon sx={{ fontSize: 36, color: '#fff' }} />;
}

export default function TeacherStudentVerifyPage() {
  const { t } = useI18n();
  const webcamRef = useRef(null);
  const inFlightRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [autoIdentify, setAutoIdentify] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [avatarKey, setAvatarKey] = useState(0);
  const [lockedIdentity, setLockedIdentity] = useState('');
  const [cameraNotice, setCameraNotice] = useState(null);
  const [blockAutoScan, setBlockAutoScan] = useState(false);

  const isNoFaceMessage = (msg) => {
    const x = String(msg || '').toLowerCase();
    return (
      x.includes('no face') ||
      x.includes('không thấy') ||
      x.includes('khuôn mặt') ||
      x.includes('không trích')
    );
  };

  const dismissCameraNotice = () => {
    setCameraNotice(null);
    setBlockAutoScan(false);
    setError(null);
  };

  const showBlockingNotice = (payload) => {
    setCameraNotice(payload);
    setBlockAutoScan(true);
    setResult(null);
    setError(null);
  };

  const runVerify = async ({ keepResult = false } = {}) => {
    if (inFlightRef.current || blockAutoScan || cameraNotice) return;
    inFlightRef.current = true;
    setRunning(true);
    if (!autoIdentify) setError(null);
    if (!keepResult) setResult(null);
    try {
      const imageSrc = webcamRef.current?.getScreenshot?.();
      if (!imageSrc) {
        if (!lockedIdentity) {
          setError(t('teacherStudentVerifyPage.noScreenshot'));
        }
        return;
      }

      const blob = await fetch(imageSrc).then((r) => r.blob());
      const file = new File([blob], 'teacher_verify.jpg', { type: 'image/jpeg' });
      const res = await recognitionAPI.recognizeFace(file);
      const data = res.data || {};
      const identifiedMa = String(data?.student_info?.ma_sv || '').trim();

      const blockNotice = buildRecognitionBlockNotice(
        data,
        t,
        t('teacherStudentVerifyPage.overlayDismiss')
      );
      if (blockNotice) {
        if (!lockedIdentity) {
          showBlockingNotice({
            ...blockNotice,
            icon: noticeIconForKind(blockNotice.kind),
          });
        }
        return;
      }

      if (data.success && identifiedMa) {
        if (identifiedMa !== lockedIdentity) {
          setResult(data);
          setAvatarKey((k) => k + 1);
          setLockedIdentity(identifiedMa);
        }
        setError(null);
        return;
      }

      const msg = data.message || t('teacherStudentVerifyPage.notRecognized');
      const noFace = isNoFaceMessage(msg);

      if (lockedIdentity && noFace) {
        setLockedIdentity('');
        setResult(null);
        showBlockingNotice({
          variant: 'info',
          icon: <FaceRetouchingNaturalIcon sx={{ fontSize: 36, color: '#fff' }} />,
          title: t('teacherStudentVerifyPage.overlayTitleNoFace'),
          message: t('teacherStudentVerifyPage.noFaceAfterLock'),
          actionLabel: t('teacherStudentVerifyPage.overlayDismiss'),
        });
        return;
      }

      if (!lockedIdentity) {
        const blockFeedback = getRecognitionBlockFeedback(data, t);
        if (blockFeedback) {
          showBlockingNotice({
            variant: 'warning',
            icon: noticeIconForKind(blockFeedback.kind),
            title: blockFeedback.title,
            message: blockFeedback.message,
            actionLabel: t('teacherStudentVerifyPage.overlayDismiss'),
          });
        } else {
          setError(msg);
        }
      }
    } catch (e) {
      if (!lockedIdentity) {
        setError(e?.response?.data?.detail || e?.apiMessage || e?.message || t('teacherStudentVerifyPage.requestError'));
      }
    } finally {
      setRunning(false);
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!autoIdentify || blockAutoScan || cameraNotice) return undefined;
    let alive = true;
    let timer = null;

    const tick = async () => {
      if (!alive) return;
      await runVerify({ keepResult: true });
      if (!alive) return;
      timer = setTimeout(tick, 420);
    };
    tick();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoIdentify, lockedIdentity, blockAutoScan, cameraNotice]);

  const si = result?.student_info;
  const avatarSrc = si ? getStudentAvatarSrc(si, avatarKey) : null;

  return (
    <Box sx={{ maxWidth: 980, mx: 'auto', px: 2, pb: 4 }}>
      <Typography variant="h4" fontWeight={900} sx={{ mb: 1 }}>
        {t('teacherStudentVerifyPage.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('teacherStudentVerifyPage.guidance')}
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              borderRadius: 4,
              overflow: 'hidden',
              border: '1px solid',
              borderColor: 'divider',
              height: '100%',
            }}
          >
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
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
                      ...(cameraNotice
                        ? { filter: 'blur(2.2px)', opacity: 0.7 }
                        : {}),
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
                    actionLabel={cameraNotice?.actionLabel || t('teacherStudentVerifyPage.overlayDismiss')}
                    onDismiss={dismissCameraNotice}
                  />
                </Box>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={autoIdentify}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setAutoIdentify(next);
                        if (!next) {
                          setLockedIdentity('');
                        }
                      }}
                      disabled={(running && !autoIdentify) || Boolean(cameraNotice)}
                    />
                  }
                  label={t('teacherStudentVerifyPage.autoIdentify')}
                />
                {result?.success ? (
                  <Chip color="success" icon={<VerifiedUserIcon />} label={t('teacherStudentVerifyPage.chipOk')} size="small" />
                ) : (
                  <Chip color="warning" icon={<ErrorOutlineIcon />} label={t('teacherStudentVerifyPage.chipIdle')} size="small" />
                )}
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant="contained"
                  size="large"
                  disabled={running || autoIdentify || Boolean(cameraNotice)}
                  onClick={() => runVerify()}
                  sx={{
                    px: 4,
                    py: 1.2,
                    borderRadius: 99,
                    background: 'linear-gradient(135deg,#06b6d4,#3b82f6)',
                    fontWeight: 800,
                  }}
                  startIcon={running ? <CircularProgress size={18} color="inherit" /> : <VerifiedUserIcon />}
                >
                  {running ? t('teacherStudentVerifyPage.btnRunning') : t('teacherStudentVerifyPage.btnVerify')}
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
              {t('teacherStudentVerifyPage.resultTitle')}
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
                      borderColor: 'success.main',
                      boxShadow: '0 8px 24px rgba(16,185,129,0.25)',
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
                      color="success"
                      icon={<VerifiedUserIcon />}
                      label={t('teacherStudentVerifyPage.verifiedSchool')}
                      sx={{ mt: 1, fontWeight: 700 }}
                    />
                  </Box>
                </Box>

                <Grid container spacing={1.5}>
                  {[
                    { label: t('teacherStudentVerifyPage.fieldDob'), value: si.ngay_sinh || '—' },
                    { label: t('teacherStudentVerifyPage.fieldGender'), value: si.gioi_tinh || '—' },
                    { label: t('teacherStudentVerifyPage.fieldClass'), value: si.lop || '—' },
                    { label: t('teacherStudentVerifyPage.fieldFaculty'), value: si.khoa || '—' },
                    { label: t('teacherStudentVerifyPage.fieldEmail'), value: si.email || '—' },
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
                    {t('teacherStudentVerifyPage.emptyState')}
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
