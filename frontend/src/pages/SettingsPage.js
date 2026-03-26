import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Card, CardContent, Typography, Button, Stack, TextField, Alert, MenuItem, Select } from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import AuthUserAvatar from '../components/AuthUserAvatar';
import { authAPI } from '../services/api';
import { formatApiError } from '../utils/apiError';
import { useThemeMode } from '../theme/AppThemeContext';
import { useI18n } from '../i18n/I18nContext';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { mode, setMode } = useThemeMode();
  const { t, localeSelectValue, setLocale } = useI18n();

  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  const onToggleTheme = (nextMode) => {
    setMode(nextMode);
  };

  const onToggleLang = (next) => {
    setLocale(next);
    setSuccess(t('settings.langChanged'));
    setTimeout(() => setSuccess(null), 2200);
  };

  const changePassword = async () => {
    setError(null);
    setSuccess(null);
    setPwdBusy(true);
    try {
      await authAPI.changePassword({
        old_password: oldPassword,
        new_password: newPassword,
      });
      setSuccess(t('settings.pwdSuccess'));
      setTimeout(() => setSuccess(null), 2500);
      setOldPassword('');
      setNewPassword('');
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail, t('settings.pwdFail')));
    } finally {
      setPwdBusy(false);
    }
  };

  const emailDisplay =
    user?.email && !String(user.email).includes('@local.smartattendance')
      ? user.email
      : t('common.none');

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="bold" color="text.primary">
        {t('settings.title')}
      </Typography>

      <Stack spacing={2}>
        <Card>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <AuthUserAvatar sx={{ width: 56, height: 56 }} />
            <Box>
              <Typography variant="h6" fontWeight="bold" color="text.primary">
                {user?.username}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('settings.role')}: <b>{user?.role ? t(`role.${user.role}`) : ''}</b>
                {emailDisplay !== t('common.none') && (
                  <>
                    {' '}
                    • {t('settings.email')}: <b>{emailDisplay}</b>
                  </>
                )}
              </Typography>
            </Box>
            <Box sx={{ flexGrow: 1 }} />
            <Button
              color="error"
              variant="outlined"
              onClick={() => {
                logout();
                navigate('/auth/login');
              }}
            >
              {t('layout.logout')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" gutterBottom color="text.primary">
              {t('settings.appearance')}
            </Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: 'center' }}>
              <Select value={mode} onChange={(e) => onToggleTheme(e.target.value)} size="small">
                <MenuItem value="light">{t('settings.themeLight')}</MenuItem>
                <MenuItem value="dark">{t('settings.themeDark')}</MenuItem>
              </Select>
              <Select value={localeSelectValue} onChange={(e) => onToggleLang(e.target.value)} size="small">
                <MenuItem value="VIE">{t('settings.langVi')}</MenuItem>
                <MenuItem value="ENG">{t('settings.langEn')}</MenuItem>
              </Select>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" gutterBottom color="text.primary">
              {t('settings.changePassword')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('settings.changePasswordHint')}
            </Typography>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            {success && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {success}
              </Alert>
            )}
            <Stack spacing={2} sx={{ maxWidth: 420 }}>
              <TextField
                label={t('settings.currentPassword')}
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                size="small"
              />
              <TextField
                label={t('settings.newPassword')}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                size="small"
              />
              <Button variant="contained" disabled={pwdBusy} onClick={changePassword}>
                {pwdBusy ? t('settings.changing') : t('settings.confirmChange')}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
