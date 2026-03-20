import { getApiPathPrefix } from '../config/apiBase';

export function getStudentAvatarSrc(studentOrMaSv, cacheBustKey = 0) {
  const maSv =
    typeof studentOrMaSv === 'string'
      ? studentOrMaSv
      : studentOrMaSv?.ma_sv || studentOrMaSv?.maSv || studentOrMaSv?.MaSV;

  if (!maSv) return null;

  const prefix = getApiPathPrefix();
  const origin =
    prefix.startsWith('http')
      ? prefix
      : typeof window !== 'undefined'
        ? `${window.location.origin}${prefix}`
        : 'http://127.0.0.1:8000/api';
  return `${origin}/students/${maSv}/avatar?v=${cacheBustKey}`;
}

