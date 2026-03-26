import React, { useState } from 'react';
import { Box, Button, Card, CardContent, TextField, Typography, Alert, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../../layouts/AuthLayout';
import { authAPI } from '../../services/api';
import { formatApiError } from '../../utils/apiError';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [devOtp, setDevOtp] = useState(null);

  const onSend = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setDevOtp(null);
    setBusy(true);
    try {
      const { data } = await authAPI.forgotPassword({ email });
      setSuccess(data.message || 'Đã gửi OTP. Vui lòng kiểm tra email.');
      if (data.dev_otp) setDevOtp(data.dev_otp);
      navigate(`/auth/reset-password-email?email=${encodeURIComponent(email)}`, { state: data.dev_otp ? { dev_otp: data.dev_otp } : undefined });
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail, 'Không thể gửi OTP'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <Box>
        <Typography variant="h4" fontWeight="800" gutterBottom>
          Quên mật khẩu
        </Typography>
        <Card sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <CardContent sx={{ p: 3 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            {success && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {success}
                {devOtp && <> Mã OTP (dev): <strong>{devOtp}</strong></>}
              </Alert>
            )}
            <form onSubmit={onSend}>
              <Stack spacing={2}>
                <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Button type="submit" variant="contained" disabled={busy || !email}>
                  {busy ? 'Đang gửi OTP...' : 'Gửi OTP'}
                </Button>
              </Stack>
            </form>
          </CardContent>
        </Card>
      </Box>
    </AuthLayout>
  );
}

