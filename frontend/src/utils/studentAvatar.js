import { getApiPathPrefix } from '../config/apiBase';

/** Lấy chữ hiển thị avatar mặc định (thường là chữ cái đầu của họ tên). */
export function getStudentInitialLetter(hoTen) {
  if (!hoTen || typeof hoTen !== 'string') return '?';
  const t = hoTen.trim();
  return t ? t.charAt(0).toUpperCase() : '?';
}

export function getStudentAvatarSrc(studentOrMaSv, cacheBustKey = 0) {
  // Nếu truyền object sinh viên mà không còn ảnh upload → không gắn src (tránh cache ảnh cũ / 404)
  if (studentOrMaSv && typeof studentOrMaSv === 'object' && !(studentOrMaSv instanceof Date)) {
    const ad =
      studentOrMaSv.anh_dai_dien ??
      studentOrMaSv.AnhDaiDien ??
      studentOrMaSv.anhDaiDien;
    if (!ad || String(ad).trim() === '') {
      return null;
    }
  }

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

