import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  Chip,
  Avatar,
  Divider,
  Button,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Stack,
} from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';
import BadgeIcon from '@mui/icons-material/Badge';
import { useAuth } from '../../auth/AuthContext';
import { authAPI } from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { useAuthAvatarObjectUrl, getAccountInitialLetter } from '../../utils/authAvatar';
import { useI18n } from '../../i18n/I18nContext';

/** Trường chỉ đọc — chữ rõ, không kiểu disabled xám */
const readOnlyFieldProps = {
  InputProps: { readOnly: true },
  sx: {
    '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' },
    '& .MuiOutlinedInput-input': {
      cursor: 'default',
      color: 'text.primary',
      WebkitTextFillColor: 'currentColor',
      opacity: 1,
    },
    '& .MuiInputLabel-root': { color: 'text.secondary' },
  },
};

/** Email hệ thống tạm (chưa nhập email nhà trường) hoặc trống */
function isPlaceholderOrInternalEmail(email) {
  if (email == null || String(email).trim() === '') return true;
  return String(email).toLowerCase().includes('@local.smartattendance');
}

/** Gợi ý email theo họ tên: ten.nguyen@eaut.edu.vn */
function suggestEautEmail(hoTen, username) {
  const raw = (hoTen || username || 'user').trim();
  const ascii = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.');
  const base = ascii || 'user';
  return `${base}@eaut.edu.vn`;
}

/**
 * Hồ sơ giảng viên — ảnh đại diện, email & SĐT.
 */
export default function TeacherProfilePage() {
  const { t } = useI18n();
  const { user, refreshUser, avatarNonce } = useAuth();
  const fileInputRef = useRef(null);
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [editingContact, setEditingContact] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);
  const [profileErr, setProfileErr] = useState(null);

  const hasSavedContact = user ? !isPlaceholderOrInternalEmail(user.email) : false;
  const suggestedEmail = suggestEautEmail(user?.ho_ten, user?.username);

  useEffect(() => {
    if (!user) return;
    if (isPlaceholderOrInternalEmail(user.email)) {
      setProfileEmail('');
    } else {
      setProfileEmail(user.email ?? '');
    }
    setProfilePhone(user.phone ?? '');
    setEditingContact(false);
  }, [user]);

  const hasAvatar = Boolean(user?.avatar && String(user.avatar).trim());
  const { objectUrl: avatarObjectUrl, loading: avatarLoading } = useAuthAvatarObjectUrl(
    user?.username,
    user?.avatar,
    avatarNonce
  );
  const initialLetter = getAccountInitialLetter(user?.ho_ten, user?.username);

  const contactReadOnly = hasSavedContact && !editingContact;

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileErr(null);
    setAvatarBusy(true);
    try {
      await authAPI.uploadTeacherAvatar(file);
      await refreshUser();
    } catch (err) {
      setProfileErr(formatApiError(err.response?.data?.detail, t('teacherProfile.avatarUploadFail')));
    } finally {
      setAvatarBusy(false);
      e.target.value = '';
    }
  };

  const handleDeleteAvatar = async () => {
    setProfileErr(null);
    setAvatarBusy(true);
    try {
      await authAPI.deleteTeacherAvatar();
      await refreshUser();
    } catch (err) {
      setProfileErr(formatApiError(err.response?.data?.detail, t('teacherProfile.avatarDeleteFail')));
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleCancelContactEdit = () => {
    if (!user) return;
    if (isPlaceholderOrInternalEmail(user.email)) {
      setProfileEmail('');
    } else {
      setProfileEmail(user.email ?? '');
    }
    setProfilePhone(user.phone ?? '');
    setEditingContact(false);
    setProfileErr(null);
  };

  const handleSaveProfile = async () => {
    setProfileErr(null);
    setProfileMsg(null);
    setProfileSaving(true);
    try {
      await authAPI.updateTeacherProfile({
        email: profileEmail.trim(),
        phone: profilePhone.trim() || null,
      });
      setProfileMsg(t('teacherProfile.contactUpdated'));
      setEditingContact(false);
      await refreshUser();
    } catch (err) {
      setProfileErr(formatApiError(err.response?.data?.detail, t('teacherProfile.saveFail')));
    } finally {
      setProfileSaving(false);
    }
  };

  if (!user) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  const saveDisabled =
    profileSaving ||
    (hasSavedContact && !editingContact) ||
    !String(profileEmail).trim();

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 1.5, md: 2.5 } }}>
      <Typography
        variant="h4"
        fontWeight={900}
        gutterBottom
        sx={{
          background: 'linear-gradient(90deg,#4f46e5,#7c3aed,#db2777)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {t('teacherProfile.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('teacherProfile.intro')}
      </Typography>

      {profileMsg && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setProfileMsg(null)}>
          {profileMsg}
        </Alert>
      )}
      {profileErr && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setProfileErr(null)}>
          {profileErr}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Box sx={{ position: 'relative', mb: 1.5 }}>
                  <Avatar
                    src={avatarObjectUrl || undefined}
                    alt={user?.ho_ten || 'Avatar'}
                    sx={{
                      width: 110,
                      height: 110,
                      fontSize: '2.75rem',
                      fontWeight: 800,
                      ...(avatarObjectUrl
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
                    {!avatarObjectUrl ? initialLetter : null}
                  </Avatar>
                  {hasAvatar && avatarLoading && !avatarObjectUrl && (
                    <CircularProgress
                      size={28}
                      thickness={4}
                      sx={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        marginLeft: '-14px',
                        marginTop: '-14px',
                      }}
                    />
                  )}
                </Box>

                <Typography variant="h6" fontWeight={900} sx={{ textAlign: 'center' }}>
                  {user?.ho_ten || user?.username}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 1 }}>
                  {user?.ma_gv ? `${t('teacherProfile.maGv')}: ${user.ma_gv}` : t('common.none')} ·{' '}
                  {user?.ten_khoa || user?.profile?.ten_khoa || t('teacherProfile.facultyUnknown')}
                </Typography>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ mb: 1 }}>
                <Chip
                  icon={<PersonIcon />}
                  label={`${t('teacherProfile.chipUsername')}: ${user?.username}`}
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
                {hasAvatar ? (
                  <>
                    <Button
                      variant="contained"
                      startIcon={<PhotoCameraIcon />}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={avatarBusy}
                      fullWidth
                    >
                      {t('teacherProfile.changePhoto')}
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteOutlineIcon />}
                      onClick={handleDeleteAvatar}
                      disabled={avatarBusy}
                      fullWidth
                    >
                      {t('teacherProfile.removePhoto')}
                    </Button>
                  </>
                ) : (
                  <Tooltip title={t('teacherProfile.addPhotoTooltip')} placement="top">
                    <span>
                      <IconButton
                        color="primary"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={avatarBusy}
                        aria-label={t('teacherProfile.addPhotoTooltip')}
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <BadgeIcon color="primary" />
                <Typography variant="h6" fontWeight={900}>
                  {t('teacherProfile.accountInfo')}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('teacherProfile.accountInfoHint')}
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField label={t('common.username')} value={user?.username || ''} fullWidth size="small" {...readOnlyFieldProps} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label={t('teacherProfile.teacherCode')} value={user?.ma_gv || t('common.none')} fullWidth size="small" {...readOnlyFieldProps} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label={t('teacherProfile.faculty')}
                    value={user?.ten_khoa || user?.profile?.ten_khoa || t('common.none')}
                    fullWidth
                    size="small"
                    {...readOnlyFieldProps}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label={t('teacherProfile.facultyCode')} value={user?.ma_khoa || user?.profile?.ma_khoa || t('common.none')} fullWidth size="small" {...readOnlyFieldProps} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label={t('common.fullName')} value={user?.ho_ten || t('common.none')} fullWidth size="small" {...readOnlyFieldProps} />
                </Grid>
              </Grid>

              <Divider sx={{ my: 3 }} />

              <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                {t('teacherProfile.contact')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {hasSavedContact ? t('teacherProfile.contactHintSaved') : t('teacherProfile.contactHintNew')}
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label={t('common.email')}
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    fullWidth
                    size="small"
                    type="email"
                    autoComplete="email"
                    placeholder={!contactReadOnly ? suggestedEmail : undefined}
                    {...(contactReadOnly ? readOnlyFieldProps : {})}
                    {...(!contactReadOnly
                      ? {
                          sx: {
                            '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' },
                            '& input::placeholder': {
                              opacity: 0.55,
                              color: 'text.secondary',
                            },
                          },
                        }
                      : {})}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label={t('common.phone')}
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    fullWidth
                    size="small"
                    autoComplete="tel"
                    placeholder={!contactReadOnly ? t('teacherProfile.phonePlaceholder') : undefined}
                    {...(contactReadOnly ? readOnlyFieldProps : {})}
                    {...(!contactReadOnly
                      ? {
                          sx: {
                            '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' },
                            '& input::placeholder': {
                              opacity: 0.55,
                              color: 'text.secondary',
                            },
                          },
                        }
                      : {})}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {hasSavedContact && (
                      <>
                        {!editingContact ? (
                          <Button
                            variant="outlined"
                            startIcon={<EditIcon />}
                            onClick={() => {
                              setEditingContact(true);
                              setProfileErr(null);
                            }}
                            disabled={profileSaving}
                          >
                            {t('common.edit')}
                          </Button>
                        ) : (
                          <Button variant="outlined" color="inherit" onClick={handleCancelContactEdit} disabled={profileSaving}>
                            {t('common.cancel')}
                          </Button>
                        )}
                      </>
                    )}
                    <Button
                      variant="contained"
                      startIcon={profileSaving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                      onClick={handleSaveProfile}
                      disabled={saveDisabled}
                    >
                      {profileSaving ? t('common.saving') : t('common.save')}
                    </Button>
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
