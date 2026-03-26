import React, { useState, useEffect } from 'react';
import { Box, Button, Card, CardContent, TextField, Typography, Alert, Stack } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../../layouts/AuthLayout';
import { authAPI } from '../../services/api';
import { formatApiError } from '../../utils/apiError';

export default function VerifyOtpPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const purpose = params.get('purpose') || 'register';
  const username = params.get('username') || '';
  const devOtpFromState = location.state?.dev_otp || null;

  const [usernameInput, setUsernameInput] = useState(username || '');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [devOtp, setDevOtp] = useState(devOtpFromState);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState(null);

  useEffect(() => {
    if (username) setUsernameInput(username);
  }, [username]);

  const effectiveUsername = (username || usernameInput || '').trim();

  const onResendOtp = async () => {
    if (!effectiveUsername) {
      setError('Vui lòng nhập username đã đăng ký.');
      return;
    }
    setError(null);
    setResendMessage(null);
    setResendBusy(true);
    try {
      const { data } = await authAPI.resendOtp({ username: effectiveUsername, purpose });
      setResendMessage(data.message || 'Đã gửi lại mã OTP.');
      if (data.dev_otp) setDevOtp(data.dev_otp);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail, 'Không gửi lại OTP được'));
    } finally {
      setResendBusy(false);
    }
  };

  const onVerify = async (e) => {
    e.preventDefault();
    setError(null);
    if (!effectiveUsername) {
      setError('Vui lòng nhập username.');
      return;
    }
    setBusy(true);
    try {
      await authAPI.verifyOtp({ username: effectiveUsername, otp, purpose });
      navigate('/auth/login');
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail, 'OTP không đúng'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <Box>
        <Typography variant="h4" fontWeight="800" gutterBottom>
          Xác thực OTP
        </Typography>
        <Card sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {devOtp ? 'Nhập mã OTP bên dưới.' : 'Nhập mã OTP đã gửi vào email. Không nhận được? Bấm "Gửi lại OTP" để nhận mã mới (qua email hoặc hiển thị tại đây nếu chạy dev).'}
            </Typography>
            {devOtp && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Mã OTP: <strong>{devOtp}</strong>
              </Alert>
            )}
            {resendMessage && !devOtp && (
              <Alert severity="success" sx={{ mb: 2 }}>{resendMessage}</Alert>
            )}
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <form onSubmit={onVerify}>
              <Stack spacing={2}>
                <TextField
                  label="Tên đăng nhập (username)"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  disabled={!!username}
                  size="small"
                  helperText={username ? 'Tài khoản cần xác thực' : 'Nhập username đã đăng ký'}
                  required
                />
                <TextField label="Mã OTP" value={otp} onChange={(e) => setOtp(e.target.value)} required placeholder="Nhập 6 số" />
                <Button type="submit" variant="contained" disabled={busy || !effectiveUsername}>
                  {busy ? 'Đang xác thực...' : 'Xác thực'}
                </Button>
                <Button type="button" variant="outlined" onClick={onResendOtp} disabled={resendBusy || !effectiveUsername} fullWidth>
                  {resendBusy ? 'Đang gửi...' : 'Gửi lại OTP'}
                </Button>
              </Stack>
            </form>
          </CardContent>
        </Card>
      </Box>
    </AuthLayout>
  );
}

