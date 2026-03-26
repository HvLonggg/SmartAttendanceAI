/**
 * FastAPI thường trả detail là string hoặc mảng { loc, msg, type }.
 * React chỉ render được string — luôn dùng hàm này trước khi setState/Alert.
 */
function _oneItem(item) {
  if (item == null) return '';
  if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
    return String(item);
  }
  if (typeof item === 'object') {
    if (item.msg != null && typeof item.msg !== 'object') return String(item.msg);
    if (item.msg != null && typeof item.msg === 'object') return JSON.stringify(item.msg);
    try {
      return JSON.stringify(item);
    } catch {
      return String(item);
    }
  }
  return String(item);
}

export function formatApiError(detail, fallback = 'Có lỗi xảy ra') {
  let out = fallback;
  if (detail == null || detail === '') {
    out = fallback;
  } else if (typeof detail === 'string') {
    out = detail;
  } else if (Array.isArray(detail)) {
    const parts = detail.map(_oneItem).filter(Boolean);
    out = parts.length ? parts.join(' ') : fallback;
  } else if (typeof detail === 'object') {
    if (detail.msg != null) {
      out = _oneItem(detail);
    } else {
      try {
        out = JSON.stringify(detail);
      } catch {
        out = fallback;
      }
    }
  } else {
    out = String(detail);
  }
  return String(out);
}
