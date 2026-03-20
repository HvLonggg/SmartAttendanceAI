import React, { useState } from 'react';
import { Box, Button, Card, CardContent, TextField, Typography, Alert, Stack, InputAdornment, IconButton } from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import AuthLayout from '../../layouts/AuthLayout';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const me = await login({ username, password });
      if (me.role === 'ADMIN') navigate('/analytics');
      else if (me.role === 'TEACHER') navigate('/sessions');
      else navigate('/student');
    } catch (err) {
      setError(err.response?.data?.detail || 'Đăng nhập thất bại');
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
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
                {error.includes('chưa xác thực OTP') && (
                  <Typography variant="body2" component="span" display="block" sx={{ mt: 1 }}>
                    Sau khi đăng ký, bạn cần nhập mã OTP (gửi qua email hoặc hiển thị trên màn hình) tại trang{' '}
                    <Link to="/auth/verify?purpose=register" style={{ fontWeight: 700 }}>
                      Xác thực OTP
                    </Link>
                    {' '}— xác thực xong mới đăng nhập được.
                  </Typography>
                )}
              </Alert>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Dùng tên đăng nhập (username) đã đăng ký — không phải email hay mã SV/MaGV.
            </Typography>
            <form onSubmit={onSubmit}>
              <Stack spacing={2}>
                <TextField
                  label="Tên đăng nhập (username)"
                  placeholder="Nhập username đã đăng ký"
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
              <Typography variant="body2" sx={{ mt: 1 }}>
                Quên mật khẩu?{' '}
                <Link to="/auth/forgot" style={{ fontWeight: 700 }}>
                  Lấy lại
                </Link>
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </AuthLayout>
  );
}

