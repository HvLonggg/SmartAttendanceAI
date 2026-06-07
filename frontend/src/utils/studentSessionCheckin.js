/**
 * Logic đồng bộ với backend `_session_checkin_eligibility` (main.py).
 */

/** Ngày theo múi giờ trình duyệt (YYYY-MM-DD). Tránh lệch với `toISOString()` (UTC) khiến buổi “hôm nay” biến mất trên tab điểm danh. */
export function getLocalDateISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseSessionStartMinutes(gioBatDau) {
  if (gioBatDau == null || gioBatDau === '') return 0;
  const p = String(gioBatDau).split(':').map((x) => parseInt(x, 10) || 0);
  return p[0] * 60 + (p[1] || 0);
}

/** Sắp xếp buổi theo ngày + giờ bắt đầu tăng dần (cùng ngày: buổi sáng trước buổi chiều). */
export function sortSessionsByStartAsc(list) {
  return [...(list || [])].sort((a, b) => {
    const da = (a.ngay_hoc || '').slice(0, 10);
    const db = (b.ngay_hoc || '').slice(0, 10);
    if (da !== db) return da.localeCompare(db);
    return parseSessionStartMinutes(a.gio_bat_dau) - parseSessionStartMinutes(b.gio_bat_dau);
  });
}

/** Coi là đã điểm danh (chỉ true/1; tránh chuỗi truthy lạ). */
export function isSessionAlreadyCheckedIn(s) {
  if (!s) return false;
  const v = s.da_diem_danh;
  return v === true || v === 1;
}

/** Buổi còn hiện trong ô chọn điểm danh: đã điểm danh hoặc hết cửa sổ thì không hiện. */
export function isSessionInCheckinPicker(s) {
  if (!s) return false;
  if (isSessionAlreadyCheckedIn(s)) return false;
  // Yêu cầu nghiệp vụ: chỉ hiển thị buổi đang mở quét đúng khung giờ hiện tại.
  return Boolean(s.co_the_quet);
}

/** Ưu tiên URL (nếu hợp lệ), rồi buổi đang mở quét, rồi buổi chưa mở cửa, rồi còn lại. */
export function pickDefaultSessionMaBuoi(pickerSessions, urlMaBuoi) {
  const list = pickerSessions || [];
  if (!list.length) return '';
  const u = urlMaBuoi != null && String(urlMaBuoi).trim() !== '' ? String(urlMaBuoi).trim() : '';
  if (u && list.some((s) => String(s.ma_buoi) === u)) return u;
  const open = list.find((x) => x.co_the_quet);
  if (open) return String(open.ma_buoi);
  const wait = list.find((x) => x.phase_diem_danh === 'chua_mo');
  if (wait) return String(wait.ma_buoi);
  return String(list[0].ma_buoi);
}
