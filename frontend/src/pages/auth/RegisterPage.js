import React, { useState } from 'react';
import { Box, Button, Card, CardContent, TextField, Typography, Alert, Stack, MenuItem, InputAdornment, IconButton } from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../../services/api';
import AuthLayout from '../../layouts/AuthLayout';

export default function RegisterPage() {
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('STUDENT');
  const [hoTen, setHoTen] = useState('');
  const [maSV, setMaSV] = useState('');
  const [maGV, setMaGV] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [devOtp, setDevOtp] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setDevOtp(null);
    setBusy(true);
    try {
      const { data } = await authAPI.register({
        username,
        password,
        role,
        ho_ten: hoTen,
        ma_sv: role === 'STUDENT' ? maSV : null,
        ma_gv: role === 'TEACHER' ? maGV : null,
        email,
        phone: phone || null,
      });
      if (data.dev_otp) setDevOtp(data.dev_otp);
      navigate(`/auth/verify?purpose=register&username=${encodeURIComponent(username)}`, { state: data.dev_otp ? { dev_otp: data.dev_otp } : undefined });
    } catch (err) {
      setError(err.response?.data?.detail || 'Đăng ký thất bại');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <Box>
        <Typography variant="h4" fontWeight="800" gutterBottom>
          Đăng ký
        </Typography>
        <Card sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <CardContent sx={{ p: 3 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            {devOtp && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Chưa gửi email. Mã OTP (dev): <strong>{devOtp}</strong> — Nhập mã này ở trang xác thực.
              </Alert>
            )}
            <form onSubmit={onSubmit}>
              <Stack spacing={2}>
                <TextField
                  label="Tên tài khoản (username)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <TextField
                  label={role === 'STUDENT' ? 'Họ và tên' : 'Họ và tên giảng viên'}
                  value={hoTen}
                  onChange={(e) => setHoTen(e.target.value)}
                  required
                  helperText={role === 'TEACHER' ? 'Phải trùng với hồ sơ nếu MaGV đã có sẵn trong hệ thống' : undefined}
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
                <TextField
                  select
                  label="Role"
                  value={role}
                  onChange={(e) => {
                    const next = e.target.value;
                    setRole(next);
                    setMaSV('');
                    setMaGV('');
                    setHoTen('');
                  }}
                  required
                >
                  <MenuItem value="STUDENT">STUDENT</MenuItem>
                  <MenuItem value="TEACHER">TEACHER</MenuItem>
                </TextField>
                {role === 'STUDENT' ? (
                  <TextField label="Mã sinh viên (MaSV)" value={maSV} onChange={(e) => setMaSV(e.target.value)} required />
                ) : (
                  <TextField
                    label="Mã giảng viên (MaGV)"
                    value={maGV}
                    onChange={(e) => setMaGV(e.target.value)}
                    required
                    helperText="Mã do bạn đặt (VD: HL001). Nếu mã đã tồn tại, họ tên phải khớp hồ sơ trong CSDL."
                  />
                )}
                <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <TextField label="Số điện thoại (tuỳ chọn)" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Button type="submit" variant="contained" disabled={busy}>
                  {busy ? 'Đang xử lý...' : 'Đăng ký & Gửi OTP'}
                </Button>
              </Stack>
            </form>
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2">
                Đã có tài khoản?{' '}
                <Link to="/auth/login" style={{ fontWeight: 700 }}>
                  Đăng nhập
                </Link>
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </AuthLayout>
  );
}
