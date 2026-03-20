import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Table, TableHead, TableRow, TableCell, TableBody, Chip, Button, Alert } from '@mui/material';
import { authAPI } from '../services/api';
import { useAuth } from '../auth/AuthContext';

export default function AdminUserManagement() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyUser, setBusyUser] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authAPI.adminListUsers();
      setRows(res.data.users || []);
    } catch (e) {
      setError(e.response?.data?.detail || 'Không thể tải danh sách người dùng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleLock = async (u) => {
    if (!u || busyUser) return;
    setBusyUser(u.username);
    setError(null);
    try {
      await authAPI.setUserLock(u.username, !u.is_locked, 'Được cập nhật bởi admin');
      await fetchUsers();
    } catch (e) {
      setError(e.response?.data?.detail || 'Không thể cập nhật khóa tài khoản');
    } finally {
      setBusyUser(null);
    }
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Quản lý tài khoản (Admin)
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Đang đăng nhập: <b>{user?.username}</b>
          </Typography>

          {loading ? (
            <Typography>Đang tải...</Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Username</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Verified</TableCell>
                  <TableCell>Locked</TableCell>
                  <TableCell>Thao tác</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.username}>
                    <TableCell sx={{ fontWeight: 700 }}>{r.username}</TableCell>
                    <TableCell>{r.role}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>
                      <Chip
                        label={r.is_verified ? 'Đã xác thực' : 'Chưa xác thực'}
                        size="small"
                        color={r.is_verified ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={r.is_locked ? 'Đang khóa' : 'Đang hoạt động'}
                        size="small"
                        color={r.is_locked ? 'error' : 'success'}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        variant={r.is_locked ? 'outlined' : 'contained'}
                        color={r.is_locked ? 'success' : 'error'}
                        disabled={busyUser === r.username}
                        onClick={() => toggleLock(r)}
                      >
                        {busyUser === r.username ? 'Đang xử lý...' : r.is_locked ? 'Mở khóa' : 'Khóa'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      Không có dữ liệu
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

