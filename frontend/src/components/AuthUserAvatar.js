import React from 'react';
import { Avatar } from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import { useAuthAvatarObjectUrl, getAccountInitialLetter } from '../utils/authAvatar';
import { getStudentAvatarSrc, getStudentInitialLetter } from '../utils/studentAvatar';

/**
 * Avatar tài khoản đăng nhập. Sinh viên: ảnh từ SinhVien (/students/{ma_sv}/avatar).
 * Giáo vụ / admin: NguoiDung.Avatar (blob).
 */
export default function AuthUserAvatar({ sx = {}, imgSx = {} }) {
  const { user, avatarNonce } = useAuth();
  const { objectUrl } = useAuthAvatarObjectUrl(user?.username, user?.avatar, avatarNonce);

  const studentAd = user?.profile?.anh_dai_dien;
  const studentSrc =
    user?.role === 'STUDENT' && user?.ma_sv && studentAd
      ? getStudentAvatarSrc({ ma_sv: user.ma_sv, anh_dai_dien: studentAd }, avatarNonce)
      : null;

  const src = studentSrc || objectUrl || undefined;
  const showStudentLetter = user?.role === 'STUDENT' && !studentSrc && !objectUrl;

  return (
    <Avatar
      src={src}
      alt={user?.ho_ten || user?.username || ''}
      sx={{
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        fontWeight: 800,
        ...sx,
        ...(src ? imgSx : {}),
      }}
    >
      {!src
        ? showStudentLetter
          ? getStudentInitialLetter(user?.ho_ten)
          : getAccountInitialLetter(user?.ho_ten, user?.username)
        : null}
    </Avatar>
  );
}
