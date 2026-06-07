import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  Alert,
  Stack,
  InputAdornment,
  IconButton,
  Link as MuiLink,
  Divider,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import LoginIcon from '@mui/icons-material/Login';
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
      <Card
        elevation={0}
        sx={{
          borderRadius: 4,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 20px 60px rgba(79,70,229,0.12)',
          overflow: 'hidden',
        }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Box sx={{ mb: 3 }}>
            <Typography variant="h5" fontWeight={800} gutterBottom>
              Đăng nhập
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Dùng <strong>tên đăng nhập</strong> và <strong>mật khẩu</strong> để truy cập hệ thống.
            </Typography>
          </Box>

          {registeredOk && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setDismissRegMsg(true)}>
              Đăng ký thành công. Đăng nhập bằng tên tài khoản và mật khẩu vừa tạo.
              {location.state?.ma_sv ? (
                <>
                  <br />
                  Mã sinh viên: <strong>{location.state.ma_sv}</strong>
                </>
              ) : null}
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={onSubmit}>
            <Stack spacing={2.5}>
              <TextField
                label="Tên đăng nhập"
                placeholder="Nhập username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                fullWidth
                autoComplete="username"
                size="medium"
              />
              <TextField
                label="Mật khẩu"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                fullWidth
                autoComplete="current-password"
                size="medium"
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
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={busy}
                startIcon={<LoginIcon />}
                sx={{
                  py: 1.4,
                  borderRadius: 2.5,
                  fontSize: '0.95rem',
                  fontWeight: 700,
                }}
              >
                {busy ? 'Đang xử lý...' : 'Đăng nhập'}
              </Button>
            </Stack>
          </form>

          <Divider sx={{ my: 3 }} />

          <Typography variant="body2" color="text.secondary" textAlign="center">
            Chưa có tài khoản?{' '}
            <MuiLink component={Link} to="/auth/register" fontWeight={700} underline="hover">
              Đăng ký ngay
            </MuiLink>
          </Typography>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
