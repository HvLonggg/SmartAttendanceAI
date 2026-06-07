"""
Heuristic phát hiện khuôn mặt bị che (khẩu trang, tay, vật cản) trước khi nhận diện.

Dùng landmarks MTCNN + phân tích vùng mắt/miệng trên ảnh đã căn chỉnh 160×160.
Không thay thế model chuyên dụng nhưng đủ cho các trường hợp phổ biến.
"""

from __future__ import annotations

import os
from typing import Optional, Tuple

import cv2
import numpy as np
from PIL import Image

MSG_FACE_MASK = (
    "Phát hiện bạn đang đeo khẩu trang. "
    "Vui lòng tháo khẩu trang để hệ thống nhận diện khuôn mặt."
)

MSG_FACE_OCCLUDED = (
    "Khuôn mặt đang bị che khuất. "
    "Vui lòng không che mặt bằng tay hoặc vật cản khác."
)

MSG_UNKNOWN_FACE_NOT_IN_TRAINING = (
    "Nhận diện được khuôn mặt nhưng người này chưa có trong dữ liệu huấn luyện. "
    "Chỉ sử dụng được với sinh viên đã đăng ký huấn luyện khuôn mặt."
)


def _lap_var(gray: np.ndarray) -> float:
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _region_stats(rgb: np.ndarray) -> Tuple[float, float]:
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    return _lap_var(gray), float(gray.std())


def _is_global_blur_not_mask(upper_lap: float, lower_lap: float) -> bool:
    """
    Mặt xa / mờ toàn cục: cả vùng mắt lẫn miệng đều mất chi tiết — không phải khẩu trang.
    Khẩu trang thật: vùng mắt thường còn nét, chỉ vùng dưới mũi bị che phẳng.
    """
    min_upper = float(os.environ.get("MASK_MIN_UPPER_LAP", "22"))
    if upper_lap < min_upper:
        return True
    if upper_lap < float(os.environ.get("MASK_GLOBAL_BLUR_UPPER", "32")) and lower_lap < float(
        os.environ.get("MASK_GLOBAL_BLUR_LOWER", "16")
    ):
        return True
    return False


def _looks_like_surgical_mask(lower_rgb: np.ndarray, upper_lap: float, lower_lap: float) -> bool:
    """Vùng miệng/cằm phẳng, ít chi tiết hơn vùng mắt — đặc trưng khẩu trang."""
    if _is_global_blur_not_mask(upper_lap, lower_lap):
        return False

    _, lower_std = _region_stats(lower_rgb)
    lap_ratio = lower_lap / (upper_lap + 1e-6)

    if lap_ratio >= float(os.environ.get("MASK_LAP_RATIO_MAX", "0.40")):
        return False
    if lower_std >= float(os.environ.get("MASK_LOWER_STD_MAX", "28")):
        return False

    pixels = lower_rgb.reshape(-1, 3).astype(np.float32)
    color_std = float(np.mean(np.std(pixels, axis=0)))
    if color_std >= float(os.environ.get("MASK_COLOR_STD_MAX", "22")):
        return False

    # Khẩu trang thường có vùng dưới mũi tương đối đồng màu (trắng/xanh/xám).
    channel_std = float(np.std(pixels, axis=0).mean())
    return channel_std < float(os.environ.get("MASK_CHANNEL_STD_MAX", "24"))


def _looks_like_mask_uniform_lower(lower_rgb: np.ndarray, upper_lap: float, lower_lap: float) -> bool:
    """Vải khẩu trang đồng màu — chỉ dùng kèm tỷ lệ lap thấp và mắt còn nét."""
    if _is_global_blur_not_mask(upper_lap, lower_lap):
        return False
    lap_ratio = lower_lap / (upper_lap + 1e-6)
    if lap_ratio >= float(os.environ.get("MASK_UNIFORM_LAP_RATIO_MAX", "0.36")):
        return False
    _, lower_std = _region_stats(lower_rgb)
    if lower_std >= float(os.environ.get("MASK_UNIFORM_STD_MAX", "26")):
        return False
    pixels = lower_rgb.reshape(-1, 3).astype(np.float32)
    return float(np.std(pixels, axis=0).mean()) < float(os.environ.get("MASK_UNIFORM_CHANNEL_STD", "24"))


def _detect_face_mask(
    img_bgr: np.ndarray,
    aligned_rgb: np.ndarray,
    upper_lap: float,
    lower_lap: float,
    lower_rgb: np.ndarray,
) -> bool:
    """
    Phát hiện khẩu trang cân bằng:
    - Bỏ qua khi mặt xa/mờ toàn cục (tránh báo nhầm).
    - Chỉ chặn khi có dấu hiệu khẩu trang rõ (vải phẳng dưới mũi + mắt còn nét, hoặc landmark xác nhận).
    """
    if _is_global_blur_not_mask(upper_lap, lower_lap):
        return False

    lap_ratio = lower_lap / (upper_lap + 1e-6)

    if _looks_like_surgical_mask(lower_rgb, upper_lap, lower_lap):
        return True

    landmark = _landmark_mask_hint(img_bgr)
    if landmark and lap_ratio < float(os.environ.get("MASK_LM_CONFIRM_LAP_RATIO", "0.40")):
        return True

    if (
        landmark
        and _looks_like_mask_uniform_lower(lower_rgb, upper_lap, lower_lap)
        and lap_ratio < float(os.environ.get("MASK_LM_UNIFORM_LAP_RATIO", "0.44"))
    ):
        return True

    return False


def _looks_like_hand_or_object_occlusion(rgb: np.ndarray) -> bool:
    """Che một nửa mặt, che mắt, hoặc vật lớn ở giữa."""
    h, w = rgb.shape[:2]
    if h < 80 or w < 80:
        return False

    upper = rgb[int(h * 0.18) : int(h * 0.48), int(w * 0.12) : int(w * 0.88)]
    mid = rgb[int(h * 0.38) : int(h * 0.72), int(w * 0.22) : int(w * 0.78)]
    left = rgb[int(h * 0.15) : int(h * 0.78), int(w * 0.05) : int(w * 0.48)]
    right = rgb[int(h * 0.15) : int(h * 0.78), int(w * 0.52) : int(w * 0.95)]

    upper_lap, upper_std = _region_stats(upper)
    mid_lap, _ = _region_stats(mid)
    left_lap, _ = _region_stats(left)
    right_lap, _ = _region_stats(right)

    side_min = min(left_lap, right_lap)
    side_max = max(left_lap, right_lap)
    side_ratio = side_min / (side_max + 1e-6)

    # Một bên mặt mất chi tiết mạnh (tay che nửa mặt).
    if (
        side_ratio < float(os.environ.get("OCCL_SIDE_RATIO_MAX", "0.28"))
        and side_min < float(os.environ.get("OCCL_SIDE_LAP_MAX", "18"))
        and upper_std > float(os.environ.get("OCCL_UPPER_STD_MIN", "14"))
    ):
        return True

    # Vùng mắt bị che (cả hai bên hoặc giữa mặt quá phẳng).
    if upper_lap < float(os.environ.get("OCCL_EYE_LAP_MAX", "11")):
        return True

    # Tay/vật che vùng giữa (mũi–miệng) trong khi hai bên còn chi tiết.
    if (
        mid_lap < float(os.environ.get("OCCL_MID_LAP_MAX", "9"))
        and side_max > float(os.environ.get("OCCL_MID_SIDE_LAP_MIN", "28"))
    ):
        return True

    return False


def _landmark_mask_hint(img_bgr: np.ndarray) -> bool:
    """Landmarks: vùng dưới mũi phẳng bất thường so với vùng quanh mắt."""
    try:
        from face_pipeline import get_mtcnn

        mtcnn = get_mtcnn()
        rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        boxes, probs, points = mtcnn.detect(Image.fromarray(rgb), landmarks=True)
        if boxes is None or points is None:
            return False
        if isinstance(boxes, np.ndarray) and boxes.dtype == object:
            if boxes is None or (hasattr(boxes, "size") and boxes.size == 0):
                return False
            box = boxes[0] if boxes[0] is not None else None
            pts = points[0][0] if points[0] is not None else None
        else:
            box = boxes
            pts = points[0] if points is not None and len(points) else None

        if box is None or pts is None or len(pts) < 5:
            return False

        pts = np.asarray(pts, dtype=np.float32)
        left_eye, right_eye, nose, mouth_l, mouth_r = pts[:5]

        h, w = rgb.shape[:2]
        eye_y = int(np.clip((left_eye[1] + right_eye[1]) / 2, 0, h - 1))
        nose_y = int(np.clip(nose[1], 0, h - 1))
        chin_y = int(np.clip(box[3], 0, h - 1))
        if chin_y <= nose_y + 8:
            return False

        eye_patch = rgb[
            max(0, eye_y - 18) : min(h, eye_y + 18),
            max(0, int(min(left_eye[0], right_eye[0]) - 20)) : min(w, int(max(left_eye[0], right_eye[0]) + 20)),
        ]
        mouth_patch = rgb[
            nose_y : min(h, chin_y),
            max(0, int(min(mouth_l[0], mouth_r[0]) - 12)) : min(w, int(max(mouth_l[0], mouth_r[0]) + 12)),
        ]
        if eye_patch.size == 0 or mouth_patch.size == 0:
            return False

        eye_lap = _lap_var(cv2.cvtColor(eye_patch, cv2.COLOR_RGB2GRAY))
        mouth_lap = _lap_var(cv2.cvtColor(mouth_patch, cv2.COLOR_RGB2GRAY))
        ratio = mouth_lap / (eye_lap + 1e-6)
        # Mắt phải đủ nét — nếu cả mắt cũng mờ thì là xa/mờ chứ không phải khẩu trang.
        if eye_lap < float(os.environ.get("MASK_LM_MIN_EYE_LAP", "20")):
            return False
        return ratio < float(os.environ.get("MASK_LM_LAP_RATIO_MAX", "0.36"))
    except Exception:
        return False


def occlusion_api_fields(error_message: Optional[str]) -> dict:
    """Trả dict fields API khi message là khẩu trang hoặc che khuất."""
    if not error_message:
        return {}
    msg = str(error_message).strip()
    if msg == MSG_FACE_MASK or "khẩu trang" in msg.lower():
        return {"occlusion_blocked": True, "occlusion_type": "mask"}
    if msg == MSG_FACE_OCCLUDED or "che khuất" in msg.lower():
        return {"occlusion_blocked": True, "occlusion_type": "occluded"}
    return {}


def is_occlusion_message(error_message: Optional[str]) -> bool:
    return bool(occlusion_api_fields(error_message))


def check_face_occlusion_bgr(
    img_bgr: np.ndarray,
    aligned_rgb: np.ndarray,
) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Trả (blocked, kind, message).
    kind: 'mask' | 'occluded' | None
    """
    if aligned_rgb is None or aligned_rgb.size == 0:
        return False, None, None

    h, w = aligned_rgb.shape[:2]
    upper = aligned_rgb[int(h * 0.12) : int(h * 0.46), :]
    lower = aligned_rgb[int(h * 0.58) : int(h * 0.92), :]

    upper_lap, _ = _region_stats(upper)
    lower_lap, _ = _region_stats(lower)

    if _detect_face_mask(img_bgr, aligned_rgb, upper_lap, lower_lap, lower):
        return True, "mask", MSG_FACE_MASK

    if _looks_like_hand_or_object_occlusion(aligned_rgb):
        return True, "occluded", MSG_FACE_OCCLUDED

    return False, None, None
