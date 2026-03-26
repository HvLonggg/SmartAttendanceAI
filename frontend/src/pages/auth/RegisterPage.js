import React, { useState, useEffect } from 'react';
import { Box, Button, Card, CardContent, TextField, Typography, Alert, Stack, MenuItem, InputAdornment, IconButton } from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
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
  const [success, setSuccess] = useState(null);
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
    setSuccess(null);
    setBusy(true);
    try {
      const payload = {
        username: role === 'STUDENT' ? null : (username ?? ''),
        password: role === 'STUDENT' ? null : (password ?? ''),
        role: role ?? 'STUDENT',
        ho_ten: hoTen ?? '',
        ma_sv: role === 'STUDENT' ? (maSV || null) : null,
        ma_khoa: role === 'TEACHER' ? maKhoa || null : null,
        chuyen_nganh: role === 'TEACHER' ? chuyenNganh || null : null,
        ma_gv: null,
      };
      const res = await authAPI.register(payload);
      if (role === 'STUDENT') {
        const data = res?.data || {};
        setSuccess(
          `Đã tạo tài khoản sinh viên thành công.\nUsername: ${data.username || '(auto)'}\nMật khẩu mặc định: ${data.password || '(auto)'}\nMaSV: ${data.ma_sv || '(auto)'}`
        );
      } else {
        navigate('/auth/login', { state: { registered: true } });
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      const msg = formatApiError(detail, err.apiMessage || 'Đăng ký thất bại');
      console.error('[Register] status=', err.response?.status, 'body=', err.response?.data, '→', msg);
      setError(String(msg));
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
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Tạo tài khoản theo vai trò (Sinh viên / Giảng viên). Sau khi đăng ký bạn đăng nhập ngay bằng username và mật khẩu — không cần email hay mã OTP.
        </Typography>
        <Card sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <CardContent sx={{ p: 3 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            {success && (
              <Alert severity="success" sx={{ mb: 2, whiteSpace: 'pre-line' }}>
                {success}
              </Alert>
            )}
            <form onSubmit={onSubmit}>
              <Stack spacing={2}>
                {role === 'TEACHER' ? (
                  <TextField
                    label="Tên tài khoản (username)"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                ) : (
                  <TextField
                    label="Tên tài khoản (username)"
                    value="Tự sinh theo Họ và Tên"
                    InputProps={{ readOnly: true }}
                  />
                )}
                <TextField
                  label={role === 'STUDENT' ? 'Họ và tên' : 'Họ và tên giảng viên'}
                  value={hoTen}
                  onChange={(e) => setHoTen(e.target.value)}
                  required
                  helperText={role === 'TEACHER' ? 'Hệ thống sẽ cấp MaGV sau khi bạn chọn khoa/bộ môn' : undefined}
                />
                {role === 'TEACHER' ? (
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
                ) : (
                  <TextField
                    label="Mật khẩu mặc định"
                    value="Tự sinh: TenKhongDau123@ (ví dụ Ánh -> Anh123@)"
                    InputProps={{ readOnly: true }}
                  />
                )}
                <TextField
                  select
                  label="Vai trò"
                  value={role}
                  onChange={(e) => {
                    const next = e.target.value;
                    setRole(next);
                    setMaSV('');
                    setMaKhoa('');
                    setChuyenNganh('');
                  }}
                  required
                >
                  <MenuItem value="STUDENT">Sinh viên (STUDENT)</MenuItem>
                  <MenuItem value="TEACHER">Giảng viên (TEACHER)</MenuItem>
                </TextField>
                {role === 'STUDENT' ? (
                  <TextField
                    label="Mã sinh viên (MaSV)"
                    value={maSV}
                    onChange={(e) => setMaSV(e.target.value)}
                    helperText="Có thể để trống, hệ thống sẽ tự sinh mã sinh viên kế tiếp."
                  />
                ) : (
                  <TextField
                    select
                    label="Khoa / bộ môn giảng dạy"
                    value={maKhoa}
                    onChange={(e) => {
                      setMaKhoa(e.target.value);
                      setChuyenNganh('');
                    }}
                    required
                    helperText="Chọn đúng đơn vị — MaGV sẽ được hệ thống gán tự động (VD: GV000042)."
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
                )}
                {role === 'TEACHER' && (
                  <TextField
                    select
                    label="Ngành / chuyên ngành giảng dạy"
                    value={chuyenNganh}
                    onChange={(e) => setChuyenNganh(e.target.value)}
                    required
                    disabled={!maKhoa}
                    helperText={
                      !maKhoa
                        ? 'Vui lòng chọn khoa trước.'
                        : 'Danh sách ngành lấy theo dữ liệu CSDL của khoa đã chọn.'
                    }
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
                )}
                <Button
                  type="submit"
                  variant="contained"
                  disabled={busy || (role === 'TEACHER' && (!maKhoa || !chuyenNganh))}
                >
                  {busy ? 'Đang xử lý...' : 'Đăng ký'}
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
