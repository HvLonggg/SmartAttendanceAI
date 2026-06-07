import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Avatar,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SchoolIcon from '@mui/icons-material/School';
import PersonIcon from '@mui/icons-material/Person';
import BadgeIcon from '@mui/icons-material/Badge';
import { studentAPI, studentPortalAPI, trainingAPI } from '../../services/api';
import { useAuth } from '../../auth/AuthContext';
import { getApiPathPrefix } from '../../config/apiBase';
import { getStudentAvatarSrc, getStudentInitialLetter } from '../../utils/studentAvatar';
import { formatApiError } from '../../utils/apiError';
import { useI18n } from '../../i18n/I18nContext';

const API = getApiPathPrefix();

function fmtDate(v, dateLocale = 'vi-VN') {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
  try {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(dateLocale);
  } catch {
    // ignore
  }
  return String(v);
}

/** Chỉ xem, không sửa — dùng readOnly thay vì disabled để chữ không bị mờ/xám như MUI disabled */
const readOnlyFieldProps = {
  InputProps: { readOnly: true },
  sx: {
    '& .MuiOutlinedInput-root': {
      bgcolor: 'background.paper',
    },
    '& .MuiOutlinedInput-input': {
      cursor: 'default',
      color: 'text.primary',
      WebkitTextFillColor: 'currentColor',
      opacity: 1,
    },
    '& .MuiInputLabel-root': {
      color: 'text.secondary',
    },
  },
};

export default function StudentProfilePage() {
  const navigate = useNavigate();
  const { user, refreshUser, avatarNonce } = useAuth();
  const ma_sv = user?.ma_sv;
  const { t, locale } = useI18n();
  const dateLocale = locale === 'en' ? 'en-US' : 'vi-VN';

  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [student, setStudent] = useState(null);

  const [profileHoTen, setProfileHoTen] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);
  const [profileErr, setProfileErr] = useState(null);

  const [trainStatus, setTrainStatus] = useState(null);
  const [trainImages, setTrainImages] = useState([]);
  const [trainLoading, setTrainLoading] = useState(false);

  const trainingReadyChip = useMemo(() => {
    if (!trainStatus) return null;
    if (trainStatus.in_database) {
      return (
        <Chip
          color="success"
          icon={<span>✓</span>}
          label={t('studentProfilePage.trainingStatus.trained')}
        />
      );
    }
    if (trainStatus.ready_to_recognize) {
      return <Chip color="warning" label={t('studentProfilePage.trainingStatus.ready')} />;
    }
    return <Chip color="warning" label={t('studentProfilePage.trainingStatus.notReady')} />;
  }, [trainStatus, t]);

  const loadAll = async () => {
    if (!ma_sv) {
      setLoading(false);
      setError(t('studentProfilePage.noMaSv'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [studentRes] = await Promise.all([studentAPI.getById(ma_sv)]);
      setStudent(studentRes.data);
      setProfileHoTen(studentRes.data?.ho_ten || '');
      setProfileEmail(studentRes.data?.email || '');
      setTrainLoading(true);
      const [imgsRes, statusRes] = await Promise.all([trainingAPI.getImages(ma_sv), trainingAPI.getStatus(ma_sv)]);
      setTrainImages(imgsRes.data?.images || []);
      setTrainStatus(statusRes.data || null);
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail, t('studentProfilePage.loadFail')));
    } finally {
      setLoading(false);
      setTrainLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ma_sv]);

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setError(null);
      await studentAPI.uploadAvatar(ma_sv, file);
      await loadAll();
      await refreshUser();
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail, t('studentProfilePage.uploadAvatarFail')));
    } finally {
      e.target.value = '';
    }
  };

  const handleDeleteAvatar = async () => {
    try {
      setError(null);
      await studentAPI.deleteAvatar(ma_sv);
      await loadAll();
      await refreshUser();
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail, t('studentProfilePage.deleteAvatarFail')));
    }
  };

  const handleSaveProfile = async () => {
    setProfileErr(null);
    setProfileMsg(null);
    setProfileSaving(true);
    try {
      await studentPortalAPI.updateMyProfile({
        ho_ten: profileHoTen,
        email: profileEmail || null,
      });
      setProfileMsg(t('studentProfilePage.updateMsg'));
      await refreshUser();
      await loadAll();
    } catch (err) {
      setProfileErr(formatApiError(err.response?.data?.detail, t('studentProfilePage.saveFail')));
    } finally {
      setProfileSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button variant="outlined" onClick={() => navigate('/student')}>
          {t('studentProfilePage.back')}
        </Button>
      </Box>
    );
  }

  const avatarSrc = getStudentAvatarSrc(student, avatarNonce);
  const hasUploadedAvatar = Boolean(student?.anh_dai_dien);

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 1.5, md: 2.5 } }}>
      <Typography
        variant="h4"
        fontWeight={900}
        gutterBottom
        sx={{ background: 'linear-gradient(90deg,#059669,#6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
      >
        {t('studentProfilePage.title')}
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Avatar
                  src={avatarSrc || undefined}
                  alt={student?.ho_ten || 'Avatar'}
                  sx={{
                    width: 110,
                    height: 110,
                    mb: 1.5,
                    fontSize: '2.75rem',
                    fontWeight: 800,
                    ...(hasUploadedAvatar
                      ? {
                          bgcolor: 'grey.200',
                          border: '4px solid rgba(99,102,241,0.35)',
                          boxShadow: '0 12px 40px rgba(99,102,241,0.22)',
                        }
                      : {
                          bgcolor: 'primary.main',
                          color: 'primary.contrastText',
                          border: '4px solid',
                          borderColor: 'primary.dark',
                          boxShadow: '0 10px 28px rgba(25, 118, 210, 0.45)',
                        }),
                  }}
                >
                  {!hasUploadedAvatar ? getStudentInitialLetter(student?.ho_ten) : null}
                </Avatar>

                <Typography variant="h6" fontWeight={900} sx={{ textAlign: 'center' }}>
                  {student?.ho_ten}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 1 }}>
                  {student?.ma_sv} · {student?.lop || '—'}
                </Typography>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ mb: 1 }}>
                <Chip
                  icon={<PersonIcon />}
                  label={t('studentProfilePage.usernameChip', { username: user?.username })}
                  variant="outlined"
                  sx={{ width: '100%', justifyContent: 'center' }}
                />
              </Box>

              <Box
                sx={{
                  display: 'flex',
                  gap: 1,
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                {hasUploadedAvatar ? (
                  <>
                    <Button
                      variant="contained"
                      startIcon={<PhotoCameraIcon />}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={trainLoading}
                      fullWidth
                    >
                      {t('studentProfilePage.changePhoto')}
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<DeleteOutlineIcon />}
                      onClick={handleDeleteAvatar}
                      fullWidth
                    >
                      {t('studentProfilePage.removePhoto')}
                    </Button>
                  </>
                ) : (
                  <Tooltip title={t('studentProfilePage.addPhotoTooltip')} placement="top">
                    <span>
                      <IconButton
                        color="primary"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={trainLoading}
                        aria-label={t('studentProfilePage.addPhotoTooltip')}
                        sx={{
                          border: '2px dashed',
                          borderColor: 'primary.main',
                          borderRadius: 2,
                          width: 56,
                          height: 56,
                          bgcolor: 'action.hover',
                          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                          '&:hover': {
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            borderStyle: 'solid',
                            transform: 'scale(1.06)',
                            boxShadow: 2,
                          },
                        }}
                      >
                        <AddIcon sx={{ fontSize: 32 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
              </Box>
              <input hidden ref={fileInputRef} accept="image/*" type="file" onChange={handleAvatarFileChange} />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card sx={{ borderRadius: 3, mb: 2 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={900} gutterBottom>
                {t('studentProfilePage.sectionStudentInfoTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('studentProfilePage.sectionStudentInfoHint')}
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label={t('studentProfilePage.fieldStudentCode')}
                    value={student?.ma_sv || ''}
                    fullWidth
                    size="small"
                    {...readOnlyFieldProps}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label={t('studentProfilePage.fieldClass')} value={student?.lop || '—'} fullWidth size="small" {...readOnlyFieldProps} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label={t('studentProfilePage.fieldFaculty')} value={student?.khoa || '—'} fullWidth size="small" {...readOnlyFieldProps} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label={t('studentProfilePage.fieldBirthDate')}
                    value={fmtDate(student?.ngay_sinh, dateLocale)}
                    fullWidth
                    size="small"
                    {...readOnlyFieldProps}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label={t('studentProfilePage.fieldGender')} value={student?.gioi_tinh || '—'} fullWidth size="small" {...readOnlyFieldProps} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label={t('studentProfilePage.fieldStatus')} value={student?.trang_thai || '—'} fullWidth size="small" {...readOnlyFieldProps} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label={t('studentProfilePage.fieldDbEmail')}
                    value={student?.email?.trim() ? student.email : '—'}
                    fullWidth
                    size="small"
                    helperText={t('studentProfilePage.dbEmailHelper')}
                    FormHelperTextProps={{ sx: { opacity: 1, color: 'text.secondary' } }}
                    {...readOnlyFieldProps}
                  />
                </Grid>
              </Grid>

              <Divider sx={{ my: 3 }} />

              <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                {t('studentProfilePage.editSectionTitleShort')}
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    label={t('studentProfilePage.editFullName')}
                    value={profileHoTen}
                    onChange={(e) => setProfileHoTen(e.target.value)}
                    size="small"
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    label={t('studentProfilePage.editEmail')}
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    size="small"
                    fullWidth
                  />
                </Grid>
                {profileErr && (
                  <Grid item xs={12}>
                    <Alert severity="error">{profileErr}</Alert>
                  </Grid>
                )}
                {profileMsg && (
                  <Grid item xs={12}>
                    <Alert severity="success">{profileMsg}</Alert>
                  </Grid>
                )}
                <Grid item xs={12}>
                  <Button variant="contained" onClick={handleSaveProfile} disabled={profileSaving}>
                    {profileSaving ? t('studentProfilePage.saving') : t('studentProfilePage.saveChanges')}
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card sx={{ borderRadius: 3, mb: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SchoolIcon color="primary" />
                  <Typography variant="h6" fontWeight={900}>
                        {t('studentProfilePage.trainingDataTitle')}
                  </Typography>
                </Box>
                {trainingReadyChip}
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'action.hover' }}>
                    <Typography variant="caption" color="text.secondary">
                      {t('studentProfilePage.trainingImagesCaptured')}
                    </Typography>
                    <Typography variant="h4" fontWeight={900} color="primary.main">
                      {trainStatus?.training_images_count ?? 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('studentProfilePage.trainingImagesMin')}
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12} md={8}>
                  <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'action.hover' }}>
                    <Typography variant="caption" color="text.secondary">
                      {t('studentProfilePage.trainingLibraryTitle')}
                    </Typography>
                    <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {trainImages.slice(0, 8).map((img) => (
                        <Box
                          key={img.filename}
                          sx={{
                            width: 86,
                            height: 70,
                            borderRadius: 2,
                            overflow: 'hidden',
                            border: '1px solid rgba(99,102,241,0.18)',
                            bgcolor: '#f8fafc',
                          }}
                        >
                          <img
                            src={`${API}/training/image/${ma_sv}/${img.filename}`}
                            alt={img.filename}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </Box>
                      ))}
                      {trainImages.length === 0 && (
                        <Typography variant="body2" color="text.secondary">
                          {t('studentProfilePage.trainingEmpty')}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </Grid>
              </Grid>

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 2 }}>
                <Button
                  variant="contained"
                  onClick={() => navigate(`/students/${encodeURIComponent(ma_sv)}/training`)}
                  startIcon={<BadgeIcon />}
                >
                  {t('studentProfilePage.openTrainingButton')}
                </Button>
                <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  {t('studentProfilePage.openTrainingHint')}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
