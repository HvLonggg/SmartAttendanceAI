import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Button,
  Alert,
  Tooltip,
  IconButton,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { authAPI } from '../services/api';
import { formatApiError } from '../utils/apiError';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';

function PasswordCell({ password, known, hiddenLabel, unknownLabel }) {
  const [show, setShow] = useState(false);
  if (!known || !password) {
    return (
      <Typography variant="body2" color="text.secondary">
        {unknownLabel}
      </Typography>
    );
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, maxWidth: 200 }}>
      <Typography variant="body2" fontFamily="monospace" noWrap sx={{ flex: 1 }}>
        {show ? password : hiddenLabel}
      </Typography>
      <IconButton size="small" onClick={() => setShow((v) => !v)} aria-label="toggle password">
        {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
      </IconButton>
    </Box>
  );
}

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

  const isSelfRow = (r) =>
    String(r?.username || '')
      .trim()
      .toLowerCase() === String(user?.username || '').trim().toLowerCase();

  const toggleLock = async (u) => {
    if (!u || busyUser) return;
    if (isSelfRow(u) && !u.is_locked) return;
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
                  <TableCell>{t('adminUserManagement.table.password')}</TableCell>
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
                      {r.ma_sv && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {r.ma_sv}
                        </Typography>
                      )}
                      {r.ma_gv && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {r.ma_gv}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{r.role}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>
                      <PasswordCell
                        password={r.password_display}
                        known={r.password_known}
                        hiddenLabel={t('adminUserManagement.passwordHidden')}
                        unknownLabel={t('adminUserManagement.passwordUnknown')}
                      />
                    </TableCell>
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
                      <Tooltip
                        title={isSelfRow(r) && !r.is_locked ? t('adminUserManagement.cannotSelfLock') : ''}
                        disableHoverListener={!(isSelfRow(r) && !r.is_locked)}
                        arrow
                      >
                        <span>
                          <Button
                            size="small"
                            variant={r.is_locked ? 'outlined' : 'contained'}
                            color={r.is_locked ? 'success' : 'error'}
                            disabled={
                              busyUser === r.username || (isSelfRow(r) && !r.is_locked)
                            }
                            onClick={() => toggleLock(r)}
                          >
                            {busyUser === r.username
                              ? t('adminUserManagement.actionProcessing')
                              : r.is_locked
                                ? t('adminUserManagement.unlock')
                                : t('adminUserManagement.lock')}
                          </Button>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
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
