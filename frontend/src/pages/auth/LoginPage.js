import React, { useState } from 'react';
import { Box, Button, Card, CardContent, TextField, Typography, Alert, Stack, InputAdornment, IconButton } from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { formatApiError } from '../../utils/apiError';
import AuthLayout from '../../layouts/AuthLayout';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [dismissRegMsg, setDismissRegMsg] = useState(false);
  const registeredOk = location.state?.registered === true && !dismissRegMsg;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const me = await login({ username, password });
      const role = (me?.role && String(me.role).toUpperCase()) || '';
      if (role === 'ADMIN') navigate('/analytics', { replace: true });
      else if (role === 'TEACHER') navigate('/dashboard', { replace: true });
      else if (role === 'STUDENT') navigate('/student', { replace: true });
      else navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail, 'Đăng nhập thất bại'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <Box>
        <Typography variant="h4" fontWeight="800" gutterBottom>
          Đăng nhập
        </Typography>
        <Card sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <CardContent sx={{ p: 3 }}>
            {registeredOk && (
              <Alert severity="success" sx={{ mb: 2 }} onClose={() => setDismissRegMsg(true)}>
                Đăng ký thành công. Hãy đăng nhập bằng username và mật khẩu vừa tạo.
              </Alert>
            )}
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Dùng <strong>username</strong> và <strong>mật khẩu</strong> đã đăng ký (không dùng email hay mã SV/MaGV để đăng nhập).
            </Typography>
            <form onSubmit={onSubmit}>
              <Stack spacing={2}>
                <TextField
                  label="Tên đăng nhập (username)"
                  placeholder="Nhập username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <TextField
                  label="Mật khẩu"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                <Button type="submit" variant="contained" disabled={busy}>
                  {busy ? 'Đang xử lý...' : 'Đăng nhập'}
                </Button>
              </Stack>
            </form>
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2">
                Chưa có tài khoản?{' '}
                <Link to="/auth/register" style={{ fontWeight: 700 }}>
                  Đăng ký
                </Link>
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </AuthLayout>
  );
}
