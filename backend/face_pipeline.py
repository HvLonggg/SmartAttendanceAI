"""
Pipeline nhận diện khuôn mặt: MTCNN (phát hiện + căn chỉnh) + InceptionResnetV1 FaceNet.

Trước đây dùng YOLOv8n COCO (yolov8n.pt) — chỉ có class "person", không phải mặt,
nên crop sai toàn thân → embedding kém, dễ nhận nhầm.

MTCNN được thiết kế để ghép với FaceNet trong cùng thư viện facenet-pytorch.
"""

from __future__ import annotations

import os
from typing import Optional, Tuple

import cv2
import numpy as np
import torch
from facenet_pytorch import MTCNN, InceptionResnetV1
from PIL import Image

from face_occlusion import check_face_occlusion_bgr

_device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

_mtcnn: Optional[MTCNN] = None
_facenet: Optional[InceptionResnetV1] = None


def get_device() -> torch.device:
    return _device


def get_mtcnn() -> MTCNN:
    global _mtcnn
    if _mtcnn is None:
        # margin: vùng quanh mặt; min_face_size nhỏ hơn → bắt mặt xa (nhỏ trong khung) tốt hơn
        # factor pyramid nhỏ hơn 0.709 → lưới scale mịn hơn, dễ thấy mặt nhỏ (hơi chậm hơn)
        # thresholds: có thể hạ nhẹ qua env nếu vẫn bỏ sót mặt xa
        _mtcnn = MTCNN(
            image_size=160,
            margin=int(os.environ.get("FACE_CROP_MARGIN", "20")),
            min_face_size=int(os.environ.get("FACE_MIN_SIZE", "12")),
            thresholds=[
                float(os.environ.get("MTCNN_PNET", "0.40")),
                float(os.environ.get("MTCNN_RNET", "0.50")),
                float(os.environ.get("MTCNN_ONET", "0.50")),
            ],
            factor=float(os.environ.get("FACE_PYRAMID_FACTOR", "0.45")),
            post_process=True,
            device=_device,
            keep_all=False,
        )
    return _mtcnn


def get_facenet() -> InceptionResnetV1:
    global _facenet
    if _facenet is None:
        _facenet = InceptionResnetV1(pretrained="vggface2").eval().to(_device)
    return _facenet


def _l2_normalize(vec: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(vec.astype(np.float64))
    if n < 1e-12:
        return vec
    return (vec / n).astype(np.float32)


def _enhance_low_light_bgr(img_bgr: np.ndarray) -> np.ndarray:
    """
    Tăng khả năng phát hiện/nhận diện trong điều kiện tối:
    - CLAHE trên kênh sáng (LAB-L)
    - gamma correction nhẹ để nâng mid-tone
    """
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    l2 = clahe.apply(l)
    lab2 = cv2.merge([l2, a, b])
    out = cv2.cvtColor(lab2, cv2.COLOR_LAB2BGR)

    gamma = float(os.environ.get("FACE_GAMMA", "1.20"))
    if abs(gamma - 1.0) > 1e-6:
        inv = 1.0 / max(gamma, 1e-6)
        table = np.array([(i / 255.0) ** inv * 255 for i in np.arange(0, 256)]).astype("uint8")
        out = cv2.LUT(out, table)
    return out


def _upscale_rgb_capped(rgb: np.ndarray, scale: float) -> np.ndarray:
    """Phóng to ảnh để mặt xa (nhỏ pixel) dễ bị MTCNN bắt; giới hạn cạnh max để không nổ RAM/CPU."""
    if scale <= 1.0:
        return rgb
    h, w = rgb.shape[:2]
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    max_dim = int(os.environ.get("FACE_MAX_UPSCALE_DIM", "3000"))
    m = max(nw, nh)
    if m > max_dim:
        s = max_dim / float(m)
        nw, nh = max(1, int(round(nw * s))), max(1, int(round(nh * s)))
    return cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_CUBIC)


def _mtcnn_align_rgb_tensor(rgb: np.ndarray) -> Optional[torch.Tensor]:
    mtcnn = get_mtcnn()
    aligned = mtcnn(Image.fromarray(rgb))
    if aligned is None:
        return None
    if aligned.ndim == 3:
        aligned = aligned.unsqueeze(0)
    elif aligned.ndim == 4 and aligned.shape[0] > 1:
        aligned = aligned[:1]
    return aligned


def aligned_face_tensor_from_bgr(img_bgr: np.ndarray) -> Optional[torch.Tensor]:
    """Tensor (1,3,160,160) đã chuẩn hóa cho FaceNet, hoặc None nếu không thấy mặt."""
    if img_bgr is None or img_bgr.size == 0:
        return None

    # Chuỗi thử: gốc → phóng to (xa hơn trong khung) → tăng sáng + lặp lại
    scales_str = os.environ.get("FACE_DISTANCE_SCALES", "1,1.5,2,2.6,3.2,3.8")
    try:
        scales = [float(x.strip()) for x in scales_str.split(",") if x.strip()]
    except ValueError:
        scales = [1.0, 1.5, 2.0]
    scales = [s for s in scales if s > 0]
    if not scales:
        scales = [1.0]

    def try_chain(bgr_src: np.ndarray) -> Optional[torch.Tensor]:
        rgb0 = cv2.cvtColor(bgr_src, cv2.COLOR_BGR2RGB)
        for sc in scales:
            rgb = _upscale_rgb_capped(rgb0, sc) if sc != 1.0 else rgb0
            t = _mtcnn_align_rgb_tensor(rgb)
            if t is not None:
                return t
        return None

    t = try_chain(img_bgr)
    if t is not None:
        return t
    enh = _enhance_low_light_bgr(img_bgr)
    return try_chain(enh)


def _facenet_standardized_to_rgb_u8(t: torch.Tensor) -> np.ndarray:
    """
    Đảo ngược chuẩn hóa fixed_image_standardization của MTCNN:
    tensor = (pixel - 127.5) / 128.0  →  pixel = tensor * 128.0 + 127.5

    Trước đây nhân * 255 khiến vùng mid-tone bị ép tối (mean ~55 thay vì ~130+).
    """
    arr = t.squeeze(0).permute(1, 2, 0).cpu().detach().numpy()
    return (arr * 128.0 + 127.5).clip(0, 255).astype(np.uint8)


def aligned_face_rgb_u8_from_bgr(img_bgr: np.ndarray) -> Optional[np.ndarray]:
    """Ảnh RGB 160x160 uint8 để lưu file crop (đồng bộ màu/độ sáng với ảnh gốc)."""
    t = aligned_face_tensor_from_bgr(img_bgr)
    if t is None:
        return None
    return _facenet_standardized_to_rgb_u8(t)


def extract_embedding_from_bgr(img_bgr: np.ndarray) -> Tuple[Optional[np.ndarray], Optional[str]]:
    """Trích embedding L2-normalized (512-d) từ ảnh BGR OpenCV."""
    try:
        aligned_rgb = aligned_face_rgb_u8_from_bgr(img_bgr)
        if aligned_rgb is None:
            return None, "Không phát hiện khuôn mặt. Vui lòng nhìn thẳng camera."

        blocked, _kind, occ_msg = check_face_occlusion_bgr(img_bgr, aligned_rgb)
        if blocked and occ_msg:
            return None, occ_msg

        t = aligned_face_tensor_from_bgr(img_bgr)
        if t is None:
            return None, "Không phát hiện khuôn mặt. Vui lòng nhìn thẳng camera."
        model = get_facenet()
        with torch.no_grad():
            t = t.to(_device)
            emb = model(t).cpu().numpy()[0]
        emb = _l2_normalize(emb)
        return emb, None
    except Exception as e:
        return None, str(e)


def extract_embedding_from_bytes(image_bytes: bytes) -> Tuple[Optional[np.ndarray], Optional[str]]:
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None, "Invalid image"
    return extract_embedding_from_bgr(img)


def save_aligned_face_jpg(img_bgr: np.ndarray, path_out: str) -> bool:
    """Lưu crop đã căn chỉnh 160x160 (BGR) — dùng khi huấn luyện embedding."""
    rgb = aligned_face_rgb_u8_from_bgr(img_bgr)
    if rgb is None:
        return False
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    return cv2.imwrite(path_out, bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])


def pipeline_status() -> dict:
    return {
        "device": str(_device),
        "mtcnn_ready": True,
        "facenet_ready": True,
        "face_detector": "MTCNN",
        "face_min_size": int(os.environ.get("FACE_MIN_SIZE", "14")),
        "face_pyramid_factor": float(os.environ.get("FACE_PYRAMID_FACTOR", "0.55")),
        "face_distance_scales": os.environ.get("FACE_DISTANCE_SCALES", "1,1.5,2,2.6,3.2,3.8"),
        "note": "YOLO COCO (yolov8n.pt) is not used for faces; use MTCNN for detection/alignment.",
    }
