import React from 'react';
import { Avatar } from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import { useAuthAvatarObjectUrl, getAccountInitialLetter } from '../utils/authAvatar';

/**
 * Avatar tài khoản đăng nhập (NguoiDung.Avatar) — đồng bộ mọi nơi (sidebar, Cài đặt, hồ sơ…).
 */
export default function AuthUserAvatar({ sx = {}, imgSx = {} }) {
  const { user, avatarNonce } = useAuth();
  const { objectUrl } = useAuthAvatarObjectUrl(user?.username, user?.avatar, avatarNonce);

  return (
    <Avatar
      src={objectUrl || undefined}
      alt={user?.ho_ten || user?.username || ''}
      sx={{
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        fontWeight: 800,
        ...sx,
        ...(objectUrl ? imgSx : {}),
      }}
    >
      {!objectUrl ? getAccountInitialLetter(user?.ho_ten, user?.username) : null}
    </Avatar>
  );
}
