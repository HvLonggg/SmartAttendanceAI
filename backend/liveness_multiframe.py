from __future__ import annotations

"""
Kiểm tra 'có vẻ là người thật trước webcam' bằng nhiều khung hình liên tiếp.

Mục tiêu:
- Chặn phần lớn ảnh/video replay trên điện thoại, máy tính bảng, laptop.
- Không quá nhạy để người thật ngồi yên trước webcam vẫn điểm danh được.

Gợi ý chỉnh qua biến môi trường:
  LIVE_MIN_FRAMES          (mặc định 6)    số frame tối thiểu
  LIVE_MAX_FRAMES          (mặc định 8)    số frame tối đa được dùng
  LIVE_MIN_PIXEL_MOTION    (mặc định 0.20)  trung bình |Δpixel| trên ảnh xám 64×64
  LIVE_MAX_PIXEL_MOTION    (mặc định 28)    tránh cắt cảnh / giật mạnh
  LIVE_MAX_FRAME_CORR      (mặc định 0.998) Pearson giữa 2 khung liên tiếp
  LIVE_MIN_LAPLACIAN_VAR   (mặc định 8)     độ nét tối thiểu
  LIVE_SCREEN_MOIRE_MIN    (mặc định 1.30)  nghi ngờ moiré màn hình
  LIVE_SCREEN_BLUE_BIAS    (mặc định 1.18)  lệch kênh xanh đặc trưng LCD/OLED
  LIVE_MIN_FRAME_EMB_SIM   (mặc định 0.55)  cosine giữa các khung (trung bình)
"""

import os
from typing import List, Tuple

import cv2
import numpy as np

from face_pipeline import aligned_face_rgb_u8_from_bgr, extract_embedding_from_bgr
from face_occlusion import check_face_occlusion_bgr

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


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return float(default)
    try:
        return float(raw)
    except ValueError:
        return float(default)


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return int(default)
    try:
        return int(float(raw))
    except ValueError:
        return int(default)


def _debug_enabled() -> bool:
    return os.environ.get("LIVE_DEBUG", "0").strip().lower() in {"1", "true", "yes", "on"}


def _debug_log(tag: str, **metrics) -> None:
    if not _debug_enabled():
        return
    parts = [f"{k}={v}" for k, v in metrics.items()]
    print(f"[LIVE_DEBUG] {tag}: " + ", ".join(parts))


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
    b = rgb[:, :, 2].astype(np.float32)  # RGB: channel 2 = blue
    r = rgb[:, :, 0].astype(np.float32)
    return float(np.mean(b / (r + 8.0)))


def _gray_std_rgb(rgb: np.ndarray) -> float:
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    return float(g.std())



def _flow_rigidity_score_rgb(prev_rgb: np.ndarray, curr_rgb: np.ndarray) -> Tuple[float, float, float]:
    """Trả (rigidity, mean_flow_mag, std_flow_mag) từ optical flow giữa 2 khung liên tiếp."""
    prev = cv2.cvtColor(prev_rgb, cv2.COLOR_RGB2GRAY)
    curr = cv2.cvtColor(curr_rgb, cv2.COLOR_RGB2GRAY)
    prev = cv2.resize(prev, (64, 64), interpolation=cv2.INTER_AREA)
    curr = cv2.resize(curr, (64, 64), interpolation=cv2.INTER_AREA)

    flow = cv2.calcOpticalFlowFarneback(
        prev,
        curr,
        None,
        0.5,
        1,
        8,
        1,
        5,
        1.1,
        0,
    )
    mag = np.sqrt(flow[..., 0] ** 2 + flow[..., 1] ** 2)
    mean_mag = float(np.mean(mag))
    std_mag = float(np.std(mag))
    rigidity = float(mean_mag / (std_mag + 1e-6))
    return rigidity, mean_mag, std_mag


def _looks_like_screen_replay(
    faces_rgb: List[np.ndarray],
    max_corr: float,
    avg_motion: float,
) -> bool:
    """
    Heuristic tổng hợp: ảnh/video trên màn hình thiết bị.

    Không chặn chỉ vì một tín hiệu đơn lẻ.
    Chỉ chặn khi có từ 2 tín hiệu trở lên cùng cho thấy replay.
    """
    if not faces_rgb:
        return False

    moire_thr = _env_float("LIVE_SCREEN_MOIRE_MIN", 1.45)
    blue_thr = _env_float("LIVE_SCREEN_BLUE_BIAS", 1.28)
    blue_corr_thr = _env_float("LIVE_SCREEN_BLUE_CORR", 0.995)

    static_corr_thr = _env_float("LIVE_SCREEN_STATIC_CORR", 0.998)
    static_motion_thr = _env_float("LIVE_SCREEN_STATIC_MOTION", 0.12)

    low_std_thr = _env_float("LIVE_SCREEN_LOW_STD", 32.0)

    moire_scores = [_screen_moire_score_rgb(f) for f in faces_rgb]
    avg_moire = float(np.mean(moire_scores)) if moire_scores else 0.0

    blue_bias_scores = [_blue_channel_bias_rgb(f) for f in faces_rgb]
    blue_bias = float(np.mean(blue_bias_scores)) if blue_bias_scores else 0.0

    gray_stds = [_gray_std_rgb(f) for f in faces_rgb]
    avg_std = float(np.mean(gray_stds)) if gray_stds else 999.0

    signals = 0

    # 1) Moiré màn hình
    if avg_moire >= moire_thr and max_corr >= 0.992:
        signals += 1

    # 2) Lệch màu xanh + khung hình khá ổn định
    if blue_bias >= blue_thr and max_corr >= blue_corr_thr and avg_motion <= 0.80:
        signals += 1

    # 3) Khung hình quá giống nhau + ít biến thiên + độ tương phản thấp
    if (
        max_corr >= static_corr_thr
        and avg_motion <= static_motion_thr
        and avg_std <= low_std_thr
    ):
        signals += 1

    # 4) Gần như ảnh tĩnh nhưng vẫn bị webcam rung nhẹ
    if max_corr >= _env_float("LIVE_MAX_FRAME_CORR", 0.9985
    ) and avg_motion <= _env_float("LIVE_SOFT_MOTION_FLOOR", 0.16):
        signals += 1

    _debug_log(
        "screen_replay",
        signals=signals,
        avg_moire=f"{avg_moire:.3f}",
        blue_bias=f"{blue_bias:.3f}",
        avg_std=f"{avg_std:.3f}",
        avg_motion=f"{avg_motion:.3f}",
        max_corr=f"{max_corr:.5f}",
    )

    return signals >= 2



def verify_live_attendance_frames(image_bytes_list: List[bytes]) -> Tuple[bool, str]:
    """
    Trả (True, "") nếu qua kiểm tra; (False, thông báo tiếng Việt) nếu không.

    Quy tắc:
    - Bắt buộc nhiều frame liên tiếp.
    - Không chấp nhận ảnh đơn lẻ.
    - Chặn replay màn hình/ảnh in bằng nhiều heuristic, nhưng vẫn ưu tiên không chặn oan webcam thật.
    """
    min_frames = _env_int("LIVE_MIN_FRAMES", 3)
    max_frames = _env_int("LIVE_MAX_FRAMES", 5)

    if len(image_bytes_list) < min_frames:
        return False, ATTENDANCE_NEED_MULTI_FRAME_MSG.format(min_frames=min_frames)

    imgs_bgr: List[np.ndarray] = []
    for b in image_bytes_list[:max_frames]:
        arr = np.frombuffer(b, dtype=np.uint8)
        im = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if im is None:
            return False, "Dữ liệu ảnh không hợp lệ. Vui lòng thử quét lại."
        imgs_bgr.append(im)

    min_lap = _env_float("LIVE_MIN_LAPLACIAN_VAR", 8.0)
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
            _debug_log("blurry", laplacian=f"{lv:.3f}", min_lap=f"{min_lap:.3f}")
            return False, ATTENDANCE_BLURRY_FACE_MSG

        emb, err = extract_embedding_from_bgr(im)
        if emb is None:
            return False, err or "Không trích được đặc trưng khuôn mặt. Vui lòng thử lại."

        faces_rgb.append(rgb)
        embs.append(np.asarray(emb, dtype=np.float32))

    if len(faces_rgb) < min_frames or len(embs) < min_frames:
        return False, ATTENDANCE_NEED_MULTI_FRAME_MSG.format(min_frames=min_frames)

    # Pairwise similarity giữa các embedding.
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
    min_motion = _env_float("LIVE_MIN_PIXEL_MOTION", 0.12)
    max_m = _env_float("LIVE_MAX_PIXEL_MOTION", 28.0)
    abs_dup = _env_float("LIVE_ABSOLUTE_DUP_CORR", 0.9992)
    soft_dup = _env_float("LIVE_MAX_FRAME_CORR", 0.9992)
    dup_motion_max = _env_float("LIVE_DUP_MOTION_MAX", 0.12)
    soft_motion_floor = _env_float("LIVE_SOFT_MOTION_FLOOR", 0.18)
    min_emb_sim = _env_float("LIVE_MIN_FRAME_EMB_SIM", 0.55)
    strict_low_sim = _env_float("LIVE_STRICT_LOW_SIM", 0.44)
    strict_low_sim_corr = _env_float("LIVE_STRICT_LOW_SIM_CORR", 0.9982)

    _debug_log(
        "metrics",
        avg_motion=f"{avg_motion:.3f}",
        max_corr=f"{max_corr:.5f}",
        min_motion=f"{min_motion:.3f}",
        max_m=f"{max_m:.1f}",
        abs_dup=f"{abs_dup:.5f}",
        soft_dup=f"{soft_dup:.5f}",
        min_emb_sim=f"{min_emb_sim:.3f}",
        frame_sims_count=len(frame_sims),
    )

    if avg_motion > max_m:
        _debug_log("too_much_motion", avg_motion=f"{avg_motion:.3f}", max_m=f"{max_m:.3f}")
        return False, ATTENDANCE_TOO_MUCH_MOTION_MSG

    # Ảnh gần như lặp y hệt giữa các frame liên tiếp.
    if max_corr > abs_dup and avg_motion <= dup_motion_max:
        _debug_log("static_frame_abs_dup", avg_motion=f"{avg_motion:.3f}", max_corr=f"{max_corr:.5f}")
        return False, ATTENDANCE_STATIC_FRAME_MSG

    if max_corr > soft_dup and avg_motion <= soft_motion_floor:
        _debug_log("screen_block_soft_dup", avg_motion=f"{avg_motion:.3f}", max_corr=f"{max_corr:.5f}")
        return False, ATTENDANCE_SCREEN_BLOCKED_MSG

    if _looks_like_screen_replay(faces_rgb, max_corr, avg_motion):
        return False, ATTENDANCE_SCREEN_BLOCKED_MSG

    # Dùng trung bình/percentile thay vì min để tránh một cặp frame lệch nhẹ làm false positive.
    if frame_sims:
        frame_sims_arr = np.asarray(frame_sims, dtype=np.float32)
        mean_sim = float(np.mean(frame_sims_arr))
        p20_sim = float(np.percentile(frame_sims_arr, 20))
        _debug_log(
            "embeddings",
            mean_sim=f"{mean_sim:.3f}",
            p20_sim=f"{p20_sim:.3f}",
        )

        if mean_sim < min_emb_sim and max_corr >= soft_dup:
            return False, ATTENDANCE_SCREEN_BLOCKED_MSG

        if p20_sim < strict_low_sim and max_corr > strict_low_sim_corr and avg_motion <= soft_motion_floor:
            return False, ATTENDANCE_STATIC_FRAME_MSG

        # Nếu các frame quá giống nhau nhưng lại gần như không có biến thiên,
        # vẫn cho chặn để tránh ảnh dựng đứng yên trên thiết bị khác.
        if avg_motion < min_motion and max_corr >= soft_dup and p20_sim < (min_emb_sim + 0.04):
            return False, ATTENDANCE_STATIC_FRAME_MSG

    return True, ""


