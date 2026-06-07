import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  Alert,
  Stack,
  MenuItem,
  InputAdornment,
  IconButton,
  Link as MuiLink,
  Divider,
  Chip,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import AuthLayout from '../../layouts/AuthLayout';

export default function RegisterPage() {
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('STUDENT');
  const [hoTen, setHoTen] = useState('');
  const [maSV, setMaSV] = useState('');
  const [maKhoa, setMaKhoa] = useState('');
  const [chuyenNganh, setChuyenNganh] = useState('');
  const [khoaList, setKhoaList] = useState([]);

  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authAPI.listKhoaStructure();
        if (!cancelled) {
          const rows = Array.isArray(res.data?.khoa) ? res.data.khoa : [];
          setKhoaList(rows);
        }
      } catch {
        if (!cancelled) setKhoaList([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = {
        username: username ?? '',
        password: password ?? '',
        role: role ?? 'STUDENT',
        ho_ten: hoTen ?? '',
        ma_sv: role === 'STUDENT' ? (maSV || '').trim() || null : null,
        ma_khoa: role === 'TEACHER' ? maKhoa || null : null,
        chuyen_nganh: role === 'TEACHER' ? chuyenNganh || null : null,
        ma_gv: null,
      };
      const res = await authAPI.register(payload);
      navigate('/auth/login', {
        state: {
          registered: true,
          ...(role === 'STUDENT' && res?.data?.ma_sv ? { ma_sv: res.data.ma_sv } : {}),
        },
      });
    } catch (err) {
      const detail = err.response?.data?.detail;
      const msg = formatApiError(detail, err.apiMessage || 'Đăng ký thất bại');
      setError(String(msg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout wide>
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
              Đăng ký tài khoản
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Sinh viên nhập đúng <strong>mã sinh viên</strong> do nhà trường cấp. Giảng viên chọn khoa
              và chuyên ngành phù hợp.
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={onSubmit}>
            <Stack spacing={2.5}>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                  label="Sinh viên"
                  color={role === 'STUDENT' ? 'primary' : 'default'}
                  variant={role === 'STUDENT' ? 'filled' : 'outlined'}
                  onClick={() => {
                    setRole('STUDENT');
                    setMaSV('');
                    setMaKhoa('');
                    setChuyenNganh('');
                  }}
                  sx={{ fontWeight: 600, cursor: 'pointer' }}
                />
                <Chip
                  label="Giảng viên"
                  color={role === 'TEACHER' ? 'primary' : 'default'}
                  variant={role === 'TEACHER' ? 'filled' : 'outlined'}
                  onClick={() => {
                    setRole('TEACHER');
                    setMaSV('');
                    setMaKhoa('');
                    setChuyenNganh('');
                  }}
                  sx={{ fontWeight: 600, cursor: 'pointer' }}
                />
              </Box>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  gap: 2,
                }}
              >
                <TextField
                  label="Tên tài khoản"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  size="medium"
                />
                <TextField
                  label={role === 'STUDENT' ? 'Họ và tên' : 'Họ và tên giảng viên'}
                  value={hoTen}
                  onChange={(e) => setHoTen(e.target.value)}
                  required
                  helperText={
                    role === 'TEACHER'
                      ? 'Hệ thống tự cấp mã giảng viên sau khi chọn khoa.'
                      : 'Nên trùng với họ tên trên hồ sơ.'
                  }
                  autoComplete="name"
                  size="medium"
                />
              </Box>

              <TextField
                label="Mật khẩu"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                inputProps={{ minLength: 6 }}
                helperText="Tối thiểu 6 ký tự"
                autoComplete="new-password"
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

              {role === 'STUDENT' && (
                <TextField
                  label="Mã sinh viên (MaSV)"
                  value={maSV}
                  onChange={(e) => setMaSV(e.target.value)}
                  required
                  autoComplete="off"
                  helperText="Mã do nhà trường cấp."
                  size="medium"
                />
              )}

              {role === 'TEACHER' && (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 2,
                  }}
                >
                  <TextField
                    select
                    label="Khoa / bộ môn giảng dạy"
                    value={maKhoa}
                    onChange={(e) => {
                      setMaKhoa(e.target.value);
                      setChuyenNganh('');
                    }}
                    required
                    helperText="Chọn đơn vị bạn giảng dạy."
                    size="medium"
                  >
                    {khoaList.length === 0 ? (
                      <MenuItem value="" disabled>
                        Đang tải danh sách khoa…
                      </MenuItem>
                    ) : (
                      khoaList.map((k) => (
                        <MenuItem key={k.ma_khoa} value={k.ma_khoa}>
                          {k.ten_khoa} ({k.ma_khoa})
                        </MenuItem>
                      ))
                    )}
                  </TextField>
                  <TextField
                    select
                    label="Ngành / chuyên ngành"
                    value={chuyenNganh}
                    onChange={(e) => setChuyenNganh(e.target.value)}
                    required
                    disabled={!maKhoa}
                    helperText={!maKhoa ? 'Chọn khoa trước.' : 'Theo khoa đã chọn.'}
                    size="medium"
                  >
                    {!maKhoa ? (
                      <MenuItem value="" disabled>
                        Chọn khoa trước
                      </MenuItem>
                    ) : (
                      (khoaList.find((k) => k.ma_khoa === maKhoa)?.chuyen_nganh || []).map((cn) => (
                        <MenuItem key={cn} value={cn}>
                          {cn}
                        </MenuItem>
                      ))
                    )}
                  </TextField>
                </Box>
              )}

              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={
                  busy ||
                  (role === 'TEACHER' && (!maKhoa || !chuyenNganh)) ||
                  (role === 'STUDENT' && !maSV.trim())
                }
                startIcon={<PersonAddIcon />}
                sx={{
                  py: 1.4,
                  borderRadius: 2.5,
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  mt: 0.5,
                }}
              >
                {busy ? 'Đang xử lý...' : 'Đăng ký'}
              </Button>
            </Stack>
          </form>

          <Divider sx={{ my: 3 }} />

          <Typography variant="body2" color="text.secondary" textAlign="center">
            Đã có tài khoản?{' '}
            <MuiLink component={Link} to="/auth/login" fontWeight={700} underline="hover">
              Đăng nhập
            </MuiLink>
          </Typography>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
