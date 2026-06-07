"""
Kiểm tra 'có vẻ là người thật trước webcam' bằng nhiều khung hình liên tiếp.

Không thể đạt chống giả mạo 100% (ảnh in, mặt nạ silicon, deepfake, màn hình chất lượng cao…)
nhưng kết hợp:
- đồng nhất embedding giữa các khung (cùng một người thật),
- biến thiên pixel vừa phải (tránh 3 ảnh tĩnh giống hệt / màn hình đứng im),
- độ sắc nét tối thiểu (Laplacian),
- moiré / lệch màu màn hình LCD-OLED,

giúp loại bỏ phần lớn trường hợp chụp ảnh/video hiển thị trên điện thoại/máy tính bảng/laptop.

Chỉnh qua biến môi trường:
  LIVE_MIN_FRAME_EMB_SIM   (mặc định 0.72)  cosine giữa các khung (không chặn cứng)
  LIVE_MIN_PIXEL_MOTION    (mặc định 0.25)  trung bình |Δpixel| trên ảnh xám 64×64 (chỉ dùng tham khảo)
  LIVE_MAX_PIXEL_MOTION    (mặc định 35)    tránh cắt cảnh / giật mạnh
  LIVE_MAX_FRAME_CORR      (mặc định 0.998) Pearson giữa 2 khung liên tiếp — quá cao ≈ ảnh tĩnh
  LIVE_MIN_LAPLACIAN_VAR   (mặc định 8)     độ nét tối thiểu (mặt quá mờ)
  LIVE_SCREEN_MOIRE_MIN    (mặc định 1.32)  nghi ngờ moiré màn hình
  LIVE_SCREEN_BLUE_BIAS    (mặc định 1.20)  lệch kênh xanh đặc trưng màn LCD
"""

from __future__ import annotations

import os
from typing import List, Tuple

import cv2
import numpy as np

from face_pipeline import aligned_face_rgb_u8_from_bgr, extract_embedding_from_bgr
from face_occlusion import check_face_occlusion_bgr

# Thông báo thống nhất khi phát hiện ảnh/video trên thiết bị khác (điểm danh).
ATTENDANCE_SCREEN_BLOCKED_MSG = (
    "Hệ thống không hỗ trợ điểm danh qua ảnh hoặc video hiển thị trên điện thoại, "
    "máy tính bảng hoặc laptop. Vui lòng đứng trực tiếp trước webcam để xác minh danh tính."
)

ATTENDANCE_STATIC_FRAME_MSG = (
    "Phát hiện khung hình tĩnh giống ảnh hiển thị trên màn hình thiết bị. "
    + ATTENDANCE_SCREEN_BLOCKED_MSG
)

ATTENDANCE_BLURRY_FACE_MSG = (
    "Khuôn mặt trên khung hình quá mờ hoặc không đủ chi tiết (thường gặp khi quay ảnh trên màn hình). "
    "Vui lòng tiến gần webcam, tăng ánh sáng và nhìn thẳng camera."
)

ATTENDANCE_NO_FACE_MSG = (
    "Không phát hiện khuôn mặt đủ rõ trên một hoặc nhiều khung hình. "
    "Hãy nhìn thẳng webcam, đủ sáng và không che mặt."
)

ATTENDANCE_TOO_MUCH_MOTION_MSG = (
    "Hình ảnh thay đổi quá mạnh giữa các khung hình. "
    "Vui lòng giữ khuôn mặt ổn định trước camera trong vài giây."
)

ATTENDANCE_NEED_MULTI_FRAME_MSG = (
    "Cần tối thiểu {min_frames} khung hình liên tiếp từ webcam để xác minh người thật. "
    "Không chấp nhận điểm danh bằng một ảnh đơn lẻ."
)


def _laplacian_var_rgb(rgb: np.ndarray) -> float:
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    return float(cv2.Laplacian(g, cv2.CV_64F).var())


def _pearson_corr(a: np.ndarray, b: np.ndarray) -> float:
    x = a.astype(np.float64).ravel()
    y = b.astype(np.float64).ravel()
    x = x - x.mean()
    y = y - y.mean()
    denom = float(np.linalg.norm(x) * np.linalg.norm(y) + 1e-8)
    return float(np.dot(x, y) / denom)


def _screen_moire_score_rgb(rgb: np.ndarray) -> float:
    """Điểm cao hơn ≈ nghi ngờ moiré / lưới pixel của màn hình."""
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    g = cv2.resize(g, (128, 128), interpolation=cv2.INTER_AREA)
    f = np.fft.fft2(g.astype(np.float32))
    fshift = np.fft.fftshift(f)
    mag = np.log1p(np.abs(fshift))
    h, w = mag.shape
    cy, cx = h // 2, w // 2
    y, x = np.ogrid[:h, :w]
    r = np.sqrt((y - cy) ** 2 + (x - cx) ** 2)
    outer = r > min(h, w) * 0.22
    inner = r < min(h, w) * 0.06
    ring = mag[outer]
    dc = mag[inner]
    if ring.size == 0 or dc.size == 0:
        return 0.0
    return float(ring.mean() / (dc.mean() + 1e-6))


def _blue_channel_bias_rgb(rgb: np.ndarray) -> float:
    """Màn LCD/OLED thường lệch kênh xanh hơn ánh sáng tự nhiên trên da."""
    b = rgb[:, :, 2].astype(np.float32)
    r = rgb[:, :, 0].astype(np.float32)
    return float(np.mean(b / (r + 8.0)))


def _gray_std_rgb(rgb: np.ndarray) -> float:
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    return float(g.std())


def _looks_like_screen_replay(
    faces_rgb: List[np.ndarray],
    max_corr: float,
    avg_motion: float,
) -> bool:
    """Heuristic tổng hợp: ảnh/video trên màn hình thiết bị."""
    moire_scores = [_screen_moire_score_rgb(f) for f in faces_rgb]
    avg_moire = float(np.mean(moire_scores)) if moire_scores else 0.0
    if avg_moire >= float(os.environ.get("LIVE_SCREEN_MOIRE_MIN", "1.25")):
        return True

    blue_bias = float(np.mean([_blue_channel_bias_rgb(f) for f in faces_rgb]))
    blue_thr = float(os.environ.get("LIVE_SCREEN_BLUE_BIAS", "1.16"))
    if blue_bias >= blue_thr and max_corr >= float(os.environ.get("LIVE_SCREEN_BLUE_CORR", "0.984")):
        return True

    gray_stds = [_gray_std_rgb(f) for f in faces_rgb]
    avg_std = float(np.mean(gray_stds)) if gray_stds else 999.0
    if (
        max_corr >= float(os.environ.get("LIVE_SCREEN_STATIC_CORR", "0.990"))
        and avg_motion < float(os.environ.get("LIVE_SCREEN_STATIC_MOTION", "0.45"))
        and avg_std < float(os.environ.get("LIVE_SCREEN_LOW_STD", "44"))
    ):
        return True

    return False


def verify_live_attendance_frames(image_bytes_list: List[bytes]) -> Tuple[bool, str]:
    """
    Trả (True, "") nếu qua kiểm tra; (False, thông báo tiếng Việt) nếu không.
    Cần tối thiểu 3 khung (khuyến nghị 3–5).
    """
    min_frames = int(os.environ.get("LIVE_MIN_FRAMES", "3"))
    max_frames = int(os.environ.get("LIVE_MAX_FRAMES", "5"))

    if len(image_bytes_list) < min_frames:
        return False, ATTENDANCE_NEED_MULTI_FRAME_MSG.format(min_frames=min_frames)

    imgs_bgr: List[np.ndarray] = []
    for b in image_bytes_list[:max_frames]:
        arr = np.frombuffer(b, dtype=np.uint8)
        im = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if im is None:
            return False, "Dữ liệu ảnh không hợp lệ. Vui lòng thử quét lại."
        imgs_bgr.append(im)

    min_lap = float(os.environ.get("LIVE_MIN_LAPLACIAN_VAR", "10"))
    faces_rgb: List[np.ndarray] = []
    embs: List[np.ndarray] = []

    for im in imgs_bgr:
        rgb = aligned_face_rgb_u8_from_bgr(im)
        if rgb is None:
            return False, ATTENDANCE_NO_FACE_MSG

        blocked, _kind, occ_msg = check_face_occlusion_bgr(im, rgb)
        if blocked and occ_msg:
            return False, occ_msg

        lv = _laplacian_var_rgb(rgb)
        if lv < min_lap:
            return False, ATTENDANCE_BLURRY_FACE_MSG
        faces_rgb.append(rgb)
        emb, err = extract_embedding_from_bgr(im)
        if emb is None:
            return False, err or "Không trích được đặc trưng khuôn mặt. Vui lòng thử lại."
        embs.append(emb)

    frame_sims: List[float] = []
    for i in range(len(embs)):
        for j in range(i + 1, len(embs)):
            frame_sims.append(float(np.dot(embs[i], embs[j])))

    grays = [
        cv2.resize(cv2.cvtColor(f, cv2.COLOR_RGB2GRAY), (64, 64), interpolation=cv2.INTER_AREA)
        for f in faces_rgb
    ]
    motions: List[float] = []
    corrs: List[float] = []
    for i in range(1, len(grays)):
        motions.append(float(np.mean(np.abs(grays[i].astype(np.float32) - grays[i - 1].astype(np.float32)))))
        corrs.append(_pearson_corr(grays[i - 1], grays[i]))

    avg_motion = float(np.mean(motions)) if motions else 0.0
    max_corr = float(np.max(corrs)) if corrs else 0.0
    min_motion = float(os.environ.get("LIVE_MIN_PIXEL_MOTION", "0.20"))

    max_m = float(os.environ.get("LIVE_MAX_PIXEL_MOTION", "35.0"))
    if avg_motion > max_m:
        return False, ATTENDANCE_TOO_MUCH_MOTION_MSG

    # Khung hình quá tĩnh (ảnh in / màn hình đứng im) — bắt buộc có biến thiên pixel tối thiểu.
    if avg_motion < min_motion:
        return False, ATTENDANCE_STATIC_FRAME_MSG

    if _looks_like_screen_replay(faces_rgb, max_corr, avg_motion):
        return False, ATTENDANCE_SCREEN_BLOCKED_MSG

    abs_dup = float(os.environ.get("LIVE_ABSOLUTE_DUP_CORR", "0.9990"))
    if max_corr > abs_dup and avg_motion < float(os.environ.get("LIVE_DUP_MOTION_MAX", "0.22")):
        return False, ATTENDANCE_STATIC_FRAME_MSG

    soft_dup = float(os.environ.get("LIVE_MAX_FRAME_CORR", "0.996"))
    if max_corr > soft_dup and avg_motion < float(os.environ.get("LIVE_SOFT_MOTION_FLOOR", "0.18")):
        return False, ATTENDANCE_SCREEN_BLOCKED_MSG

    if frame_sims:
        low_sim = min(frame_sims)
        min_emb_sim = float(os.environ.get("LIVE_MIN_FRAME_EMB_SIM", "0.55"))
        if low_sim < min_emb_sim:
            return False, ATTENDANCE_SCREEN_BLOCKED_MSG
        if low_sim < float(os.environ.get("LIVE_STRICT_LOW_SIM", "0.38")) and max_corr > float(
            os.environ.get("LIVE_STRICT_LOW_SIM_CORR", "0.9975")
        ):
            return False, ATTENDANCE_STATIC_FRAME_MSG

    return True, ""
