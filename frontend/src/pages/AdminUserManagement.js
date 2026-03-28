import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Table, TableHead, TableRow, TableCell, TableBody, Chip, Button, Alert } from '@mui/material';
import { authAPI } from '../services/api';
import { formatApiError } from '../utils/apiError';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';

export default function AdminUserManagement() {
  const { user } = useAuth();
  const { t } = useI18n();
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
      setError(formatApiError(e.response?.data?.detail, t('adminUserManagement.loadFail')));
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
      setError(formatApiError(e.response?.data?.detail, t('adminUserManagement.updateLockFail')));
    } finally {
      setBusyUser(null);
    }
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        {t('adminUserManagement.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('adminUserManagement.subtitle')}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('adminUserManagement.loggedIn', { username: user?.username })}
          </Typography>

          {loading ? (
            <Typography color="text.secondary" variant="body2">
              {t('adminUserManagement.loading')}
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('adminUserManagement.table.username')}</TableCell>
                  <TableCell>{t('adminUserManagement.table.role')}</TableCell>
                  <TableCell>{t('adminUserManagement.table.email')}</TableCell>
                  <TableCell>{t('adminUserManagement.table.verified')}</TableCell>
                  <TableCell>{t('adminUserManagement.table.locked')}</TableCell>
                  <TableCell>{t('adminUserManagement.table.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.username} hover>
                    <TableCell>
                      <Typography fontWeight={500}>{r.username}</Typography>
                    </TableCell>
                    <TableCell>{r.role}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>
                      <Chip
                        label={r.is_verified ? t('adminUserManagement.verifiedYes') : t('adminUserManagement.verifiedNo')}
                        size="small"
                        color={r.is_verified ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={r.is_locked ? t('adminUserManagement.lockedYes') : t('adminUserManagement.lockedNo')}
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
                        {busyUser === r.username
                          ? t('adminUserManagement.actionProcessing')
                          : r.is_locked
                            ? t('adminUserManagement.unlock')
                            : t('adminUserManagement.lock')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      {t('adminUserManagement.empty')}
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

