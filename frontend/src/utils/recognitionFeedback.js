/**
 * Phản hồi thống nhất cho mọi camera nhận diện (liveness, khẩu trang, che mặt).
 */

const FALLBACK = {
  occlusionMaskTitle: 'Phát hiện đeo khẩu trang',
  occlusionMaskMessage:
    'Phát hiện bạn đang đeo khẩu trang. Vui lòng tháo khẩu trang để hệ thống nhận diện khuôn mặt.',
  occlusionBlockedTitle: 'Khuôn mặt bị che khuất',
  occlusionBlockedMessage:
    'Khuôn mặt đang bị che khuất. Vui lòng không che mặt bằng tay hoặc vật cản khác.',
  livenessBlockedTitle: 'Không hỗ trợ điểm danh qua ảnh trên thiết bị',
  livenessBlockedMessage:
    'Hệ thống không hỗ trợ điểm danh qua ảnh hoặc video hiển thị trên điện thoại, máy tính bảng hoặc laptop. Vui lòng đứng trực tiếp trước webcam để xác minh danh tính.',
  unknownFaceTitle: 'Khuôn mặt chưa có trong dữ liệu huấn luyện',
  unknownFaceMessage:
    'Nhận diện được khuôn mặt nhưng người này chưa có trong dữ liệu huấn luyện. Chỉ sử dụng được với sinh viên đã đăng ký huấn luyện khuôn mặt.',
};

function tr(t, key, fallback) {
  if (typeof t === 'function') {
    const v = t(`recognitionFeedback.${key}`);
    if (v && v !== `recognitionFeedback.${key}`) return v;
  }
  return FALLBACK[key] || '';
}

/**
 * @param {object|null|undefined} result - payload từ /recognize hoặc /recognize-live
 * @param {function} [t] - hàm dịch useI18n
 * @returns {{ kind: string, title: string, message: string, formatted: string } | null}
 */
function isLegacyUnknownMessage(msg) {
  const x = String(msg || '').toLowerCase();
  return (
    x.includes('không nhận diện được') ||
    x.includes('not recognized') ||
    x.includes('không có trong database')
  );
}

export function getRecognitionBlockFeedback(result, t) {
  if (!result) return null;

  if (result.occlusion_blocked) {
    const isMask = result.occlusion_type === 'mask';
    const title = isMask
      ? tr(t, 'occlusionMaskTitle')
      : tr(t, 'occlusionBlockedTitle');
    const message =
      result.message ||
      (isMask ? tr(t, 'occlusionMaskMessage') : tr(t, 'occlusionBlockedMessage'));
    return {
      kind: isMask ? 'mask' : 'occluded',
      title,
      message,
      formatted: `${title}. ${message}`,
    };
  }

  if (result.liveness_failed) {
    const title = tr(t, 'livenessBlockedTitle');
    const message = result.message || tr(t, 'livenessBlockedMessage');
    return {
      kind: 'liveness',
      title,
      message,
      formatted: `${title}. ${message}`,
    };
  }

  if (result.unknown_face_not_in_training) {
    const title = tr(t, 'unknownFaceTitle');
    const message = result.message || tr(t, 'unknownFaceMessage');
    return {
      kind: 'unknown_face',
      title,
      message,
      formatted: `${title}. ${message}`,
    };
  }

  if (!result.success && isLegacyUnknownMessage(result.message)) {
    const title = tr(t, 'unknownFaceTitle');
    const message = tr(t, 'unknownFaceMessage');
    return {
      kind: 'unknown_face',
      title,
      message,
      formatted: `${title}. ${message}`,
    };
  }

  return null;
}

export function formatRecognitionBlockFeedback(feedback) {
  return feedback?.formatted || null;
}

/**
 * Tạo payload overlay camera thống nhất từ kết quả API nhận diện.
 * @param {object|null|undefined} result
 * @param {function} [t]
 * @param {string} [dismissLabel]
 * @returns {{ kind: string, variant: string, title: string, message: string, actionLabel: string } | null}
 */
export function buildRecognitionBlockNotice(result, t, dismissLabel = 'Đã hiểu') {
  const feedback = getRecognitionBlockFeedback(result, t);
  if (!feedback) return null;
  return {
    kind: feedback.kind,
    variant: 'warning',
    title: feedback.title,
    message: feedback.message,
    actionLabel: dismissLabel,
  };
}
