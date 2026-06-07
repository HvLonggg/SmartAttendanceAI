"""
Nạp face_db.pkl với cache theo mtime: mọi luồng nhận diện dùng cùng nguồn,
tự cập nhật ngay khi file embedding thay đổi (train / online learning) mà không cần restart server.
"""
from __future__ import annotations

import os
import pickle
import tempfile
from typing import Any, Dict, Optional

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
FACE_DB_PATH = os.path.join(_BACKEND_DIR, "models", "face_db.pkl")

_cache: Optional[Dict[str, Any]] = None
_mtime: Optional[float] = None


def invalidate_face_database_cache() -> None:
    """Buộc lần gọi load_face_database() tiếp theo đọc lại từ đĩa."""
    global _cache, _mtime
    _cache = None
    _mtime = None


def load_face_database() -> Dict[str, Any]:
    """
    Trả về dict embedding đã train. Đọc lại từ đĩa khi face_db.pkl đổi (mtime),
    để camera / test / định danh GV luôn khớp dữ liệu mới nhất sau khi huấn luyện.
    """
    global _cache, _mtime
    path = FACE_DB_PATH
    if not os.path.exists(path):
        _cache, _mtime = {}, None
        return {}

    try:
        current_mtime = os.path.getmtime(path)
    except OSError:
        invalidate_face_database_cache()
        current_mtime = None

    if _cache is not None and _mtime is not None and current_mtime is not None and _mtime == current_mtime:
        return _cache

    with open(path, "rb") as f:
        _cache = pickle.load(f)
    _mtime = current_mtime if current_mtime is not None else os.path.getmtime(path)
    return _cache


def atomic_pickle_dump(obj: Any, path: str) -> None:
    """Ghi pickle an toàn (tránh đọc giữa chừng khi train đang ghi), rồi xóa cache."""
    directory = os.path.dirname(path) or "."
    fd, tmp_path = tempfile.mkstemp(dir=directory, suffix=".pkl.tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            pickle.dump(obj, f, protocol=pickle.HIGHEST_PROTOCOL)
        os.replace(tmp_path, path)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
    invalidate_face_database_cache()
