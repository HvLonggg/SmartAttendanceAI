import React, { useState } from 'react';
import { Box, Card, CardContent, Typography, Button, Stack, TextField, Alert, Avatar, MenuItem, Select } from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import { authAPI } from '../services/api';

export default function SettingsPage() {
  const { user, logout } = useAuth();

  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('theme_mode') || 'light');
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'VIE');

  const [otpBusy, setOtpBusy] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [pwdBusy, setPwdBusy] = useState(false);

  const onToggleTheme = (mode) => {
    setThemeMode(mode);
    localStorage.setItem('theme_mode', mode);
    window.location.reload();
  };

  const onToggleLang = (next) => {
    setLang(next);
    localStorage.setItem('lang', next);
    setSuccess('Đã đổi ngôn ngữ (chỉ áp dụng ở một số màn hiện tại).');
    setTimeout(() => setSuccess(null), 2000);
  };

  const sendOtp = async () => {
    setError(null);
    setSuccess(null);
    setOtpBusy(true);
    try {
      await authAPI.forgotPassword({ email: user?.email });
      setOtpSent(true);
      setSuccess('Đã gửi OTP. Vui lòng kiểm tra email.');
      setTimeout(() => setSuccess(null), 2500);
    } catch (e) {
      setError(e.response?.data?.detail || 'Không thể gửi OTP');
    } finally {
      setOtpBusy(false);
    }
  };

  const changePassword = async () => {
    setError(null);
    setSuccess(null);
    setPwdBusy(true);
    try {
      await authAPI.resetPasswordEmail({
        email: user?.email,
        otp,
        new_password: newPassword,
      });
      setSuccess('Đổi mật khẩu thành công.');
      setTimeout(() => setSuccess(null), 2500);
      setOtpSent(false);
      setOtp('');
      setNewPassword('');
    } catch (e) {
      setError(e.response?.data?.detail || 'Đổi mật khẩu thất bại');
    } finally {
      setPwdBusy(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        Cài đặt
      </Typography>

      <Stack spacing={2}>
        <Card>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ width: 56, height: 56, bgcolor: 'primary.main', fontWeight: 800 }}>
              {user?.username?.charAt(0)}
            </Avatar>
            <Box>
              <Typography variant="h6" fontWeight="bold">
                {user?.username}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Vai trò: <b>{user?.role}</b> • {user?.email}
              </Typography>
            </Box>
            <Box sx={{ flexGrow: 1 }} />
            <Button color="error" variant="outlined" onClick={logout}>
              Logout
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              Giao diện
            </Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: 'center' }}>
              <Select value={themeMode} onChange={(e) => onToggleTheme(e.target.value)} size="small">
                <MenuItem value="light">Sáng</MenuItem>
                <MenuItem value="dark">Tối</MenuItem>
              </Select>
              <Select value={lang} onChange={(e) => onToggleLang(e.target.value)} size="small">
                <MenuItem value="VIE">VIE</MenuItem>
                <MenuItem value="ENG">ENG</MenuItem>
              </Select>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              Đổi mật khẩu
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

            {!otpSent ? (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Hệ thống sẽ gửi OTP tới email của bạn để xác thực đổi mật khẩu.
                </Typography>
                <Button variant="contained" disabled={otpBusy} onClick={sendOtp}>
                  {otpBusy ? 'Đang gửi...' : 'Gửi OTP'}
                </Button>
              </Box>
            ) : (
              <Stack spacing={2}>
                <TextField label="OTP" value={otp} onChange={(e) => setOtp(e.target.value)} required />
                <TextField
                  label="Mật khẩu mới"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <Button variant="contained" disabled={pwdBusy} onClick={changePassword}>
                  {pwdBusy ? 'Đang cập nhật...' : 'Xác nhận đổi mật khẩu'}
                </Button>
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}

