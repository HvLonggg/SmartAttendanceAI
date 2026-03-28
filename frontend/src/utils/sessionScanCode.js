/**
 * Mã buổi học / mã quét: ít nhất một chữ cái ở đầu, phần còn lại chỉ là chữ số (VD: HL0234, A1234).
 * Độ dài 4–64 ký tự (khớp backend).
 */
export function isSessionScanCodeValid(s) {
  const t = String(s || '').trim();
  if (t.length < 4 || t.length > 64) return false;
  return /^[\p{L}]+[0-9]+$/u.test(t);
}
