import React, { useState } from 'react';
import { Box, Button, Card, CardContent, TextField, Typography, Alert, Stack, InputAdornment, IconButton } from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../../layouts/AuthLayout';
import { authAPI } from '../../services/api';
import { formatApiError } from '../../utils/apiError';

export default function ResetPasswordEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const email = params.get('email') || '';
  const devOtp = location.state?.dev_otp || null;

  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const onReset = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await authAPI.resetPasswordEmail({ email, otp, new_password: newPassword });
      navigate('/auth/login');
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail, 'Không thể đặt lại mật khẩu'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <Box>
        <Typography variant="h4" fontWeight="800" gutterBottom>
          Đặt lại mật khẩu
        </Typography>
        <Card sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <CardContent sx={{ p: 3 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {devOtp ? 'Nhập mã OTP bên dưới (chế độ dev).' : `OTP đã gửi tới: ${email}`}
            </Typography>
            {devOtp && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Mã OTP (dev): <strong>{devOtp}</strong>
              </Alert>
            )}
            <form onSubmit={onReset}>
              <Stack spacing={2}>
                <TextField label="OTP" value={otp} onChange={(e) => setOtp(e.target.value)} required />
                <TextField
                  label="Mật khẩu mới"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                          onClick={() => setShowPassword((p) => !p)}
                          onMouseDown={(e) => e.preventDefault()}
                          edge="end"
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <Button type="submit" variant="contained" disabled={busy || !email}>
                  {busy ? 'Đang cập nhật...' : 'Xác nhận & Đổi mật khẩu'}
                </Button>
              </Stack>
            </form>
          </CardContent>
        </Card>
      </Box>
    </AuthLayout>
  );
}

