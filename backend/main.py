from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, date, time, timedelta
import cv2
import numpy as np
import base64
import os
import io
from PIL import Image
import pyodbc
from pathlib import Path

# Import training module
from training_module import training_manager, MAX_TRAINING_IMAGES_PER_STUDENT, TRAINING_IMAGES_BASELINE
from face_db_store import load_face_database
from face_pipeline import extract_embedding_from_bytes, aligned_face_rgb_u8_from_bgr, pipeline_status
from face_occlusion import (
    occlusion_api_fields,
    check_face_occlusion_bgr,
    MSG_UNKNOWN_FACE_NOT_IN_TRAINING,
)
from liveness_multiframe import verify_live_attendance_frames

from auth_routes import auth_router as _auth_router, require_role
from teacher_routes import (
    teacher_router as _teacher_router,
    ensure_buoi_hoc_extra_columns,
    ensure_diem_danh_capture_column,
    _teacher_owns_buoi,
)
from database.cntt_schema import run_cntt_schema_and_seed

app = FastAPI(title="Smart Attendance AI API")

# Cột buổi học: mã xác thực + thời gian điểm danh
ensure_buoi_hoc_extra_columns()
ensure_diem_danh_capture_column()

ATTENDANCE_CAPTURES_DIR = Path(__file__).resolve().parent / "attendance_captures"
ATTENDANCE_CAPTURES_DIR.mkdir(parents=True, exist_ok=True)
# Khoa, môn/lớp CNTT (seed tùy chọn), view vw_LopHocPhan_ChiTiet
run_cntt_schema_and_seed()

# CORS
app.add_middleware(
    CORSMiddleware,
    # CRA thường tự tăng port nếu 3000 đang bận (3001, 3002...)
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):3\\d{3}$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== LOAD MODELS ====================
print("=" * 60)
print("🤖 LOADING AI MODELS...")
print("=" * 60)

# ==================== AUTH ====================
app.include_router(_auth_router, prefix="/api/auth")
app.include_router(_teacher_router, prefix="/api/teacher")

# MTCNN + FaceNet (face_pipeline) — không dùng YOLO COCO cho mặt (yolov8n.pt là class person, không phải face).
print("✅ Face pipeline (MTCNN + FaceNet) — lazy load on first request")

# Face Database (đường dẫn tuyệt đối + cache theo mtime — đồng bộ mọi luồng nhận diện sau khi train)
face_database = load_face_database()
print(f"✅ Face DB: {len(face_database)} identities")
print("=" * 60)

from database.db_connection import get_connection

# ==================== MODELS ====================

class StudentInfo(BaseModel):
    ma_sv: str
    ho_ten: str
    ngay_sinh: Optional[date]
    gioi_tinh: Optional[str]
    lop: Optional[str]
    khoa: Optional[str]
    email: Optional[str]
    trang_thai: Optional[str]
    anh_dai_dien: Optional[str] = None  # tên file trong thư mục avatars/ (vd: 2025001.jpg)


class StudentSelfProfileUpdate(BaseModel):
    ho_ten: Optional[str] = None
    email: Optional[str] = None


class StudentFeedbackCreate(BaseModel):
    loai: str  # CHUONG_TRINH | GIANG_VIEN | GOP_Y
    tieu_de: Optional[str] = None
    noi_dung: str
    ma_lhp: Optional[str] = None


class StudentEnrollPayload(BaseModel):
    ma_lhp: str


class TeacherAssignPayload(BaseModel):
    ma_gv: Optional[str] = None


class AdminCreateClassPayload(BaseModel):
    ma_mon: str
    nam_hoc: Optional[str] = None
    hoc_ky: Optional[int] = 1
    phong_hoc: Optional[str] = None


AVATARS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "avatars")
os.makedirs(AVATARS_DIR, exist_ok=True)


def ensure_anh_dai_dien_column():
    """Thêm cột AnhDaiDien nếu DB chưa có (SQL Server)."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            IF NOT EXISTS (
                SELECT 1 FROM sys.columns
                WHERE Name = N'AnhDaiDien' AND Object_ID = Object_ID(N'SinhVien')
            )
            ALTER TABLE SinhVien ADD AnhDaiDien NVARCHAR(500) NULL
        """)
        conn.commit()
        cursor.close()
        conn.close()
        print("✅ Cột AnhDaiDien (SinhVien) đã sẵn sàng")
    except Exception as e:
        print(f"⚠️ Không thể thêm cột AnhDaiDien: {e}")


def sinhvien_row_to_student(row) -> StudentInfo:
    row = tuple(row)
    anh = None
    if len(row) > 8 and row[8] is not None:
        s = str(row[8]).strip()
        anh = s if s else None
    return StudentInfo(
        ma_sv=row[0], ho_ten=row[1], ngay_sinh=row[2],
        gioi_tinh=row[3], lop=row[4], khoa=row[5],
        email=row[6], trang_thai=row[7], anh_dai_dien=anh,
    )


ensure_anh_dai_dien_column()


def ensure_phan_hoi_sinh_vien_table():
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
        IF OBJECT_ID('dbo.PhanHoiSinhVien', 'U') IS NULL
        BEGIN
            CREATE TABLE dbo.PhanHoiSinhVien (
                Id INT IDENTITY(1,1) PRIMARY KEY,
                MaSV NVARCHAR(30) NOT NULL,
                LoaiPhanHoi NVARCHAR(50) NOT NULL,
                TieuDe NVARCHAR(255) NULL,
                NoiDung NVARCHAR(2000) NOT NULL,
                MaLHP NVARCHAR(30) NULL,
                CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );
            CREATE INDEX IX_PhanHoi_MaSV ON dbo.PhanHoiSinhVien(MaSV);
        END
        """)
        conn.commit()
        cursor.close()
        conn.close()
        print("✅ Bảng PhanHoiSinhVien đã sẵn sàng")
    except Exception as e:
        print(f"⚠️ Không thể tạo bảng PhanHoiSinhVien: {e}")


ensure_phan_hoi_sinh_vien_table()


def _student_ma_sv_from_auth(current: dict) -> str:
    ma = (current.get("ma_sv") or "").strip()
    if not ma:
        raise HTTPException(status_code=400, detail="Tài khoản chưa gắn mã sinh viên (MaSV). Liên hệ quản trị.")
    return ma


def _session_checkin_eligibility(
    ngay_hoc,
    gio_bat_dau,
    phut_dung_raw,
    phut_max_raw,
    da_diem_danh: bool,
) -> Dict[str, Any]:
    """Cờ hiển thị UI — khớp cửa sổ thời gian với POST /api/attendance/checkin."""
    if da_diem_danh:
        return {
            "da_diem_danh": True,
            "co_the_quet": False,
            "khoang_dung_gio": False,
            "phase": "da_quet",
            "goi_y": "Bạn đã điểm danh buổi học này.",
        }
    phut_dung = int(phut_dung_raw) if phut_dung_raw is not None else 15
    phut_max = int(phut_max_raw) if phut_max_raw is not None else 60

    if isinstance(ngay_hoc, datetime):
        d = ngay_hoc.date()
    elif isinstance(ngay_hoc, date):
        d = ngay_hoc
    else:
        d = datetime.now().date()

    if isinstance(gio_bat_dau, str):
        parts = gio_bat_dau.split(":")
        gt = time(int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)
    elif gio_bat_dau is not None:
        gt = gio_bat_dau
    else:
        gt = time(0, 0, 0)

    start_dt = datetime.combine(d, gt)
    now = datetime.now()
    delta_min = (now - start_dt).total_seconds() / 60.0

    if delta_min < -10:
        return {
            "da_diem_danh": False,
            "co_the_quet": False,
            "khoang_dung_gio": False,
            "phase": "chua_mo",
            "goi_y": "Chưa đến giờ mở điểm danh (mở trước 10 phút so với giờ bắt đầu buổi).",
        }
    if delta_min > phut_max:
        return {
            "da_diem_danh": False,
            "co_the_quet": False,
            "khoang_dung_gio": False,
            "phase": "het_han",
            "goi_y": f"Đã quá {phut_max} phút kể từ giờ bắt đầu — không thể điểm danh.",
        }

    on_time = delta_min <= phut_dung
    return {
        "da_diem_danh": False,
        "co_the_quet": True,
        "khoang_dung_gio": on_time,
        "phase": "dung_gio" if on_time else "tre",
        "goi_y": (
            "Đang trong khung đúng giờ — hãy điểm danh ngay."
            if on_time
            else "Vẫn quét được nhưng sẽ ghi nhận trễ."
        ),
    }


def _lhp_table_columns(cursor) -> set:
    cursor.execute(
        """
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = N'dbo' AND TABLE_NAME = N'LopHocPhan'
        """
    )
    return {r[0] for r in cursor.fetchall()}


def _lhp_catalog_extra_select(cols: set) -> str:
    def piece(name: str, sql_null: str) -> str:
        return f"lhp.[{name}] AS [{name}]" if name in cols else f"CAST(NULL AS {sql_null}) AS [{name}]"

    return ", ".join(
        [
            piece("NamHoc", "NVARCHAR(30)"),
            piece("HocKy", "INT"),
            piece("PhongHoc", "NVARCHAR(50)"),
            piece("MaKhoa", "NVARCHAR(20)"),
        ]
    )


def _catalog_dict_from_row(row) -> dict:
    (
        ma_lhp,
        ma_mon,
        ten_mon,
        gv_text,
        ma_gv_lhp,
        gv_hoten,
        gv_email,
        gv_dt,
        nam_hoc,
        hoc_ky,
        phong_hoc,
        ma_khoa_lhp,
    ) = row
    ten_gv = (gv_hoten or "").strip() or (gv_text or "").strip() or "—"
    ma_gv = (ma_gv_lhp or "").strip() or None
    nh = nam_hoc
    if nh is not None and not isinstance(nh, str):
        nh = str(nh)
    nh = (nh or "").strip() or None
    ph = phong_hoc
    if ph is not None and not isinstance(ph, str):
        ph = str(ph)
    ph = (ph or "").strip() or None
    mk = ma_khoa_lhp
    if mk is not None and not isinstance(mk, str):
        mk = str(mk)
    mk = (mk or "").strip() or None
    hk = None
    if hoc_ky is not None:
        try:
            hk = int(hoc_ky)
        except (TypeError, ValueError):
            hk = None
    return {
        "ma_lhp": ma_lhp,
        "ma_mon": ma_mon,
        "ten_mon": ten_mon,
        "giang_vien": ten_gv,
        "ma_gv": ma_gv,
        "gv_email": (gv_email or "").strip() or None,
        "gv_dien_thoai": (gv_dt or "").strip() or None,
        "ghi_chu_gv": (gv_text or "").strip() or None,
        "nam_hoc": nh,
        "hoc_ky": hk,
        "phong_hoc": ph,
        "ma_khoa": mk,
        "du_dieu_kien_dang_ky": bool(ma_gv),
    }


# ==================== AI FUNCTIONS ====================

def extract_embedding_high_quality(image_bytes):
    """Trích embedding: MTCNN căn mặt + FaceNet (đồng bộ với training_module)."""
    return extract_embedding_from_bytes(image_bytes)


MSG_SINHVIEN_RECORD_MISSING = (
    "Không tìm thấy hồ sơ sinh viên trong hệ thống quản lý. Vui lòng liên hệ quản trị viên."
)


def _mask_block_response_from_bytes(image_bytes: bytes, extra: Optional[dict] = None) -> Optional[dict]:
    """
    Kiểm tra khẩu trang/che mặt lần cuối — luôn ưu tiên hơn mọi kết quả nhận diện.
    Trả dict response API nếu bị chặn; None nếu không chặn.
    """
    nparr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None
    aligned = aligned_face_rgb_u8_from_bgr(img)
    if aligned is None:
        return None
    blocked, _kind, occ_msg = check_face_occlusion_bgr(img, aligned)
    if not blocked or not occ_msg:
        return None
    payload = {
        "success": False,
        "message": occ_msg,
        "identity": None,
        "confidence": 0,
        **occlusion_api_fields(occ_msg),
    }
    if extra:
        payload.update(extra)
    return payload


def _l2_normalize_flat(vec: np.ndarray) -> np.ndarray:
    v = np.asarray(vec, dtype=np.float64).reshape(-1)
    n = np.linalg.norm(v)
    if n < 1e-12:
        return v.astype(np.float32)
    return (v / n).astype(np.float32)


def _aggregate_embeddings(embeddings: List[np.ndarray]) -> Optional[np.ndarray]:
    """
    Gộp nhiều embedding thành một vector ổn định hơn cho nhận diện.
    Cách làm robust:
    - L2-normalize từng frame
    - Chấm độ nhất quán của mỗi frame với các frame còn lại
    - Giữ nhóm frame nhất quán nhất rồi mới lấy trung bình
    """
    if not embeddings:
        return None
    arr = np.asarray([_l2_normalize_flat(e) for e in embeddings], dtype=np.float32)
    if arr.shape[0] == 1:
        return _l2_normalize_flat(arr[0])

    # Ma trận cosine vì vector đã L2-normalize.
    sim = arr @ arr.T
    np.fill_diagonal(sim, 0.0)
    consistency = np.mean(sim, axis=1)

    # Giữ phần lớn frame ổn định, bỏ frame nhiễu/outlier.
    keep_n = int(np.clip(int(np.ceil(arr.shape[0] * 0.7)), 2, arr.shape[0]))
    keep_idx = np.argsort(consistency)[-keep_n:]
    stable = arr[keep_idx]

    mean_vec = np.mean(stable, axis=0)
    return _l2_normalize_flat(mean_vec)


def _parse_face_db_entry(entry: Any) -> Tuple[np.ndarray, np.ndarray]:
    """
    Chuẩn hóa bản ghi face_db về (centroid, samples).
    Hỗ trợ cả format cũ (vector) và mới ({centroid, samples}).
    """
    if isinstance(entry, dict):
        c = _l2_normalize_flat(np.asarray(entry.get("centroid")))
        s_raw = entry.get("samples")
        if s_raw is None:
            return c, c.reshape(1, -1)
        s = np.asarray(s_raw, dtype=np.float32)
        if s.ndim == 1:
            s = s.reshape(1, -1)
        s = s / np.clip(np.linalg.norm(s, axis=1, keepdims=True), 1e-12, None)
        return c, s.astype(np.float32)
    c = _l2_normalize_flat(np.asarray(entry))
    return c, c.reshape(1, -1)


def recognize_with_high_accuracy(embedding, threshold: Optional[float] = None):
    """
    So khớp cosine trên vector đã L2-normalize (tương đương dot product).
    RECOGNITION_THRESHOLD (mặc định 0.52): tăng nếu muốn ít chấp nhận nhầm hơn.
    RECOGNITION_TOP_MARGIN: khoảng cách tối thiểu top1 - top2 để tránh nhầm giữa 2 người giống nhau.
    Score dùng tổng hợp: alpha*centroid + (1-alpha)*best_sample (mặc định alpha=0.50).
    """
    global face_database

    face_database = load_face_database()

    if not face_database or embedding is None:
        return "Unknown", 0.0, []

    thr = float(os.environ.get("RECOGNITION_THRESHOLD", "0.50")) if threshold is None else float(threshold)
    margin_need = float(os.environ.get("RECOGNITION_TOP_MARGIN", "0.005"))

    q = _l2_normalize_flat(embedding)
    scores = []

    alpha = float(os.environ.get("RECOGNITION_ALPHA_CENTROID", "0.50"))
    alpha = min(1.0, max(0.0, alpha))

    for name, db_emb in face_database.items():
        try:
            centroid, samples = _parse_face_db_entry(db_emb)
            s_centroid = float(np.dot(q, centroid))
            s_samples = samples @ q.reshape(-1, 1)
            s_best = float(np.max(s_samples))
            score = alpha * s_centroid + (1.0 - alpha) * s_best
            scores.append((name, score, s_centroid, s_best))
        except Exception:
            continue

    scores.sort(key=lambda x: x[1], reverse=True)

    if not scores or scores[0][1] < thr:
        return "Unknown", scores[0][1] if scores else 0.0, [(x[0], x[1]) for x in scores[:5]]

    if len(scores) >= 2:
        gap = scores[0][1] - scores[1][1]
        # Nếu top1 đủ cao vượt ngưỡng nhiều thì vẫn cho qua dù gap nhỏ
        # (tránh reject nhầm trong điều kiện ánh sáng/độ phân giải không ổn định).
        strong_top1_bonus = float(os.environ.get("RECOGNITION_STRONG_TOP1_BONUS", "0.03"))
        if gap < margin_need and scores[0][1] < (thr + strong_top1_bonus):
            return "Unknown", scores[0][1], [(x[0], x[1]) for x in scores[:5]]

    return scores[0][0], scores[0][1], [(x[0], x[1]) for x in scores[:5]]


def _calibrate_confidence(raw_conf: float, top_matches: List[Tuple[str, float]]) -> float:
    """
    Hiệu chỉnh confidence để phản ánh trực quan tốt hơn:
    - Nền tảng vẫn là cosine score thật (raw_conf)
    - Cộng thêm một phần nhỏ theo độ tách top1-top2 (gap) để tăng điểm khi nhận diện rõ ràng
    - Kẹp biên để tránh 100% ảo
    """
    base = float(np.clip(raw_conf, 0.0, 1.0))
    gap = 0.0
    if len(top_matches) >= 2:
        gap = max(0.0, float(top_matches[0][1]) - float(top_matches[1][1]))

    # Nâng nhẹ trong vùng dùng thực tế (đặc biệt khi ánh sáng tốt + top1 tách rõ).
    # Tăng thêm một nấc boost để % hiển thị cao hơn trong điều kiện nhận diện tốt.
    boosted = base + (0.165 * gap) + (0.135 * max(0.0, base - 0.42))
    return float(np.clip(boosted, 0.0, 0.998))

# ==================== ENDPOINTS ====================

@app.get("/")
async def root():
    return {
        "message": "Smart Attendance AI API",
        "status": "running",
        "face_pipeline": pipeline_status(),
        "face_database": {
            "loaded": len(face_database) > 0,
            "count": len(face_database),
            "identities": list(face_database.keys())
        }
    }

# ==================== STUDENT APIs ====================

@app.get("/api/students", response_model=List[StudentInfo])
async def get_all_students():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM SinhVien ORDER BY MaSV")
    rows = cursor.fetchall()
    
    students = [sinhvien_row_to_student(row) for row in rows]
    
    cursor.close()
    conn.close()
    return students

@app.get("/api/students/{ma_sv}", response_model=StudentInfo)
async def get_student(ma_sv: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM SinhVien WHERE MaSV = ?", (ma_sv,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Sinh viên không tồn tại")

    return sinhvien_row_to_student(row)

@app.post("/api/students")
async def create_student(student: StudentInfo):
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            INSERT INTO SinhVien 
            (MaSV, HoTen, NgaySinh, GioiTinh, Lop, Khoa, Email, TrangThai)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            student.ma_sv, student.ho_ten, student.ngay_sinh,
            student.gioi_tinh, student.lop, student.khoa,
            student.email, student.trang_thai or 'Đang học'
        ))
        conn.commit()
        return {"success": True, "message": "Thêm sinh viên thành công"}
    except pyodbc.IntegrityError:
        raise HTTPException(status_code=400, detail="Mã sinh viên đã tồn tại")
    finally:
        cursor.close()
        conn.close()


@app.get("/api/admin/teaching/teachers")
async def admin_list_teachers(current=Depends(require_role("ADMIN"))):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT
                gv.MaGV,
                gv.HoTen,
                gv.MaKhoa,
                COUNT(DISTINCT lhp.MaLHP) AS SoLopHocPhan
            FROM dbo.GiangVien gv
            INNER JOIN dbo.NguoiDung nd
              ON nd.Role = N'TEACHER'
             AND LTRIM(RTRIM(ISNULL(nd.MaGV,''))) = LTRIM(RTRIM(ISNULL(gv.MaGV,'')))
            LEFT JOIN dbo.LopHocPhan lhp
              ON LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(ISNULL(gv.MaGV,'')))
            GROUP BY gv.MaGV, gv.HoTen, gv.MaKhoa
            ORDER BY gv.HoTen
            """
        )
        data = []
        for r in cursor.fetchall():
            data.append(
                {
                    "ma_gv": r[0],
                    "ho_ten": r[1],
                    "ma_khoa": r[2],
                    "so_lop_hoc_phan": int(r[3] or 0),
                }
            )
        return {"teachers": data}
    finally:
        cursor.close()
        conn.close()


@app.get("/api/admin/teaching/classes")
async def admin_list_classes(current=Depends(require_role("ADMIN"))):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT
                v.MaLHP,
                v.MaMon,
                v.TenMon,
                v.MaGV,
                COALESCE(v.TenGiangVien, v.GiangVienText) AS TenGiangVien,
                v.MaKhoa,
                (
                  SELECT COUNT(*) FROM dbo.BuoiHoc bh
                  WHERE bh.MaLHP = v.MaLHP
                ) AS SoBuoi,
                (
                  SELECT COUNT(*) FROM dbo.DiemDanh dd
                  JOIN dbo.BuoiHoc bh2 ON dd.MaBuoi = bh2.MaBuoi
                  WHERE bh2.MaLHP = v.MaLHP
                ) AS SoLanDiemDanh
            FROM dbo.vw_LopHocPhan_ChiTiet v
            WHERE ISNULL(LTRIM(RTRIM(v.MaGV)), '') = ''
            ORDER BY v.MaLHP
            """
        )
        rows = cursor.fetchall()
        data = []
        for r in rows:
            data.append(
                {
                    "ma_lhp": r[0],
                    "ma_mon": r[1],
                    "ten_mon": r[2],
                    "ma_gv": r[3],
                    "ten_giang_vien": r[4],
                    "ma_khoa": r[5],
                    "so_buoi": int(r[6] or 0),
                    "so_lan_diem_danh": int(r[7] or 0),
                }
            )
        return {"classes": data}
    finally:
        cursor.close()
        conn.close()


@app.get("/api/admin/teaching/courses")
async def admin_list_courses_for_class_create(current=Depends(require_role("ADMIN"))):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT mh.MaMon, mh.TenMon, mh.MaKhoa, mh.ChuyenNganh, k.TenKhoa
            FROM dbo.MonHoc mh
            LEFT JOIN dbo.Khoa k ON k.MaKhoa = mh.MaKhoa
            ORDER BY mh.MaKhoa, mh.MaMon
            """
        )
        data = []
        for r in cursor.fetchall():
            data.append(
                {
                    "ma_mon": r[0],
                    "ten_mon": r[1],
                    "ma_khoa": r[2],
                    "chuyen_nganh": r[3],
                    "ten_khoa": r[4],
                }
            )
        return {"courses": data}
    finally:
        cursor.close()
        conn.close()


def _next_lhp_code(cursor, year_token: str) -> str:
    cursor.execute("SELECT MaLHP FROM dbo.LopHocPhan WHERE MaLHP LIKE ?", (f"LHP%HK{year_token}",))
    max_num = 0
    for row in cursor.fetchall():
        ma = str(row[0] or "")
        m = ma.replace(" ", "")
        if not m.startswith("LHP") or f"HK{year_token}" not in m:
            continue
        try:
            n = int(m[3:].split("HK")[0])
            if n > max_num:
                max_num = n
        except Exception:
            continue
    return f"LHP{max_num + 1:03d}HK{year_token}"


@app.post("/api/admin/teaching/classes")
async def admin_create_class(payload: AdminCreateClassPayload, current=Depends(require_role("ADMIN"))):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            IF COL_LENGTH('dbo.LopHocPhan', 'PhongHoc') IS NULL
                ALTER TABLE dbo.LopHocPhan ADD PhongHoc NVARCHAR(50) NULL
            """
        )
        cursor.execute(
            """
            IF COL_LENGTH('dbo.LopHocPhan', 'CreatedAt') IS NULL
                ALTER TABLE dbo.LopHocPhan ADD CreatedAt DATETIME2 NULL
            """
        )

        ma_mon = (payload.ma_mon or "").strip()
        if not ma_mon:
            raise HTTPException(status_code=400, detail="Thiếu mã môn")

        cursor.execute(
            "SELECT TenMon, MaKhoa FROM dbo.MonHoc WHERE LTRIM(RTRIM(MaMon)) = LTRIM(RTRIM(?))",
            (ma_mon,),
        )
        mon = cursor.fetchone()
        if not mon:
            raise HTTPException(status_code=404, detail="Môn học không tồn tại")

        nam_hoc = (payload.nam_hoc or "").strip() or "2025-2026"
        hoc_ky = int(payload.hoc_ky or 1)
        phong_hoc = (payload.phong_hoc or "").strip() or "P301"

        try:
            y1, y2 = nam_hoc.split("-")
            year_token = f"{str(y1)[-2:]}{str(y2)[-2:]}"
        except Exception:
            year_token = "2526"

        ma_lhp = _next_lhp_code(cursor, year_token)

        cursor.execute(
            """
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='LopHocPhan'
            """
        )
        lhp_cols = {r[0] for r in cursor.fetchall()}
        row_data = {
            "MaLHP": ma_lhp,
            "MaMon": ma_mon,
            "GiangVien": "Chưa phân công",
            "MaGV": None,
            "MaKhoa": mon[1],
            "NamHoc": nam_hoc,
            "HocKy": hoc_ky,
            "PhongHoc": phong_hoc,
            "CreatedAt": datetime.utcnow(),
        }
        use_cols = [c for c in row_data.keys() if c in lhp_cols]
        placeholders = ", ".join(["?"] * len(use_cols))
        sql = f"INSERT INTO dbo.LopHocPhan ({', '.join(use_cols)}) VALUES ({placeholders})"
        cursor.execute(sql, tuple(row_data[c] for c in use_cols))
        conn.commit()
        return {
            "success": True,
            "message": "Đã tạo lớp học phần",
            "ma_lhp": ma_lhp,
            "ma_mon": ma_mon,
        }
    except HTTPException:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


@app.get("/api/admin/dashboard-overview")
async def admin_dashboard_overview(current=Depends(require_role("ADMIN"))):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            IF COL_LENGTH('dbo.LopHocPhan', 'CreatedAt') IS NULL
                ALTER TABLE dbo.LopHocPhan ADD CreatedAt DATETIME2 NULL
            """
        )
        cursor.execute(
            """
            UPDATE dbo.LopHocPhan
            SET CreatedAt = COALESCE(CreatedAt, SYSUTCDATETIME())
            WHERE CreatedAt IS NULL
            """
        )

        cursor.execute("SELECT COUNT(*) FROM dbo.LopHocPhan")
        total_hoc_phan = int(cursor.fetchone()[0] or 0)

        cursor.execute(
            """
            SELECT COUNT(*) FROM dbo.LopHocPhan
            WHERE CAST(CreatedAt AS DATE) = CAST(GETDATE() AS DATE)
            """
        )
        created_today = int(cursor.fetchone()[0] or 0)

        cursor.execute(
            """
            SELECT COUNT(*) FROM dbo.LopHocPhan
            WHERE CreatedAt >= DATEADD(day, -7, SYSUTCDATETIME())
            """
        )
        created_week = int(cursor.fetchone()[0] or 0)

        cursor.execute(
            """
            SELECT COUNT(*) FROM dbo.LopHocPhan
            WHERE CreatedAt >= DATEADD(day, -30, SYSUTCDATETIME())
            """
        )
        created_month = int(cursor.fetchone()[0] or 0)

        cursor.execute(
            """
            SELECT COUNT(*) FROM dbo.LopHocPhan
            WHERE ISNULL(LTRIM(RTRIM(MaGV)), '') <> ''
            """
        )
        assigned_count = int(cursor.fetchone()[0] or 0)
        unassigned_count = max(total_hoc_phan - assigned_count, 0)

        cursor.execute(
            """
            SELECT
                lhp.MaLHP,
                mh.TenMon,
                lhp.MaGV,
                COALESCE(gv.HoTen, lhp.GiangVien) AS TenGiangVien,
                COUNT(DISTINCT bh.MaBuoi) AS SoBuoi,
                COUNT(dd.MaDiemDanh) AS LuotDiemDanh,
                SUM(CASE WHEN dd.TrangThai IN (N'Đúng giờ', N'Có mặt') THEN 1 ELSE 0 END) AS LuotDungGio
            FROM dbo.LopHocPhan lhp
            LEFT JOIN dbo.MonHoc mh ON lhp.MaMon = mh.MaMon
            LEFT JOIN dbo.GiangVien gv ON LTRIM(RTRIM(ISNULL(gv.MaGV,''))) = LTRIM(RTRIM(ISNULL(lhp.MaGV,'')))
            LEFT JOIN dbo.BuoiHoc bh ON bh.MaLHP = lhp.MaLHP
            LEFT JOIN dbo.DiemDanh dd ON dd.MaBuoi = bh.MaBuoi
            WHERE ISNULL(LTRIM(RTRIM(lhp.MaGV)), '') <> ''
            GROUP BY lhp.MaLHP, mh.TenMon, lhp.MaGV, COALESCE(gv.HoTen, lhp.GiangVien)
            ORDER BY LuotDiemDanh DESC, SoBuoi DESC, lhp.MaLHP
            """
        )
        attendance_by_class = []
        for r in cursor.fetchall():
            luot_dd = int(r[5] or 0)
            luot_dung_gio = int(r[6] or 0)
            attendance_by_class.append(
                {
                    "ma_lhp": r[0],
                    "ten_mon": r[1],
                    "ma_gv": r[2],
                    "ten_giang_vien": r[3],
                    "so_buoi": int(r[4] or 0),
                    "luot_diem_danh": luot_dd,
                    "ty_le_dung_gio": float((luot_dung_gio * 100.0 / luot_dd) if luot_dd > 0 else 0),
                }
            )

        cursor.execute(
            """
            SELECT
                lhp.MaGV,
                COALESCE(gv.HoTen, lhp.GiangVien) AS TenGiangVien,
                COUNT(*) AS SoHocPhanPhanCong
            FROM dbo.LopHocPhan lhp
            LEFT JOIN dbo.GiangVien gv ON LTRIM(RTRIM(ISNULL(gv.MaGV,''))) = LTRIM(RTRIM(ISNULL(lhp.MaGV,'')))
            WHERE ISNULL(LTRIM(RTRIM(lhp.MaGV)), '') <> ''
            GROUP BY lhp.MaGV, COALESCE(gv.HoTen, lhp.GiangVien)
            ORDER BY SoHocPhanPhanCong DESC, TenGiangVien
            """
        )
        teacher_load = [
            {
                "ma_gv": r[0],
                "ten_giang_vien": r[1],
                "so_hoc_phan": int(r[2] or 0),
            }
            for r in cursor.fetchall()
        ]

        cursor.execute(
            """
            SELECT COUNT(*) FROM dbo.BuoiHoc
            WHERE CAST(NgayHoc AS DATE) = CAST(GETDATE() AS DATE)
            """
        )
        sessions_today = int(cursor.fetchone()[0] or 0)

        alerts = []
        if unassigned_count > 0:
            alerts.append(f"Còn {unassigned_count} học phần chưa phân công giảng viên.")
        if sessions_today == 0:
            alerts.append("Hôm nay chưa có buổi học nào được tạo.")
        if not alerts:
            alerts.append("Dữ liệu tổng quan ổn định. Không có cảnh báo quan trọng.")

        return {
            "stats": {
                "total_hoc_phan": total_hoc_phan,
                "created_today": created_today,
                "created_week": created_week,
                "created_month": created_month,
                "assigned_count": assigned_count,
                "unassigned_count": unassigned_count,
            },
            "attendance_by_class": attendance_by_class,
            "teacher_load": teacher_load,
            "alerts": alerts,
        }
    finally:
        cursor.close()
        conn.close()


@app.get("/api/admin/teaching/class-detail/{ma_lhp}")
async def admin_teaching_class_detail(ma_lhp: str, current=Depends(require_role("ADMIN"))):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM dbo.LopHocPhan
            WHERE LTRIM(RTRIM(MaLHP)) = LTRIM(RTRIM(?))
            """,
            (ma_lhp,),
        )
        if cursor.fetchone()[0] == 0:
            raise HTTPException(status_code=404, detail="Học phần không tồn tại")

        cursor.execute(
            """
            SELECT
                COUNT(DISTINCT bh.MaBuoi) AS TongBuoi,
                COUNT(dd.MaDiemDanh) AS TongLuot,
                SUM(CASE WHEN dd.TrangThai IN (N'Đúng giờ', N'Có mặt') THEN 1 ELSE 0 END) AS DungGio,
                SUM(CASE WHEN dd.TrangThai = N'Trễ' THEN 1 ELSE 0 END) AS Tre
            FROM dbo.BuoiHoc bh
            LEFT JOIN dbo.DiemDanh dd ON dd.MaBuoi = bh.MaBuoi
            WHERE LTRIM(RTRIM(bh.MaLHP)) = LTRIM(RTRIM(?))
            """,
            (ma_lhp,),
        )
        s = cursor.fetchone()
        summary = {
            "total_sessions": int(s[0] or 0),
            "total_attendance": int(s[1] or 0),
            "on_time_count": int(s[2] or 0),
            "late_count": int(s[3] or 0),
        }

        cursor.execute(
            """
            SELECT
                bh.MaBuoi,
                bh.NgayHoc,
                bh.GioBatDau,
                COUNT(dd.MaDiemDanh) AS LuotDiemDanh,
                SUM(CASE WHEN dd.TrangThai IN (N'Đúng giờ', N'Có mặt') THEN 1 ELSE 0 END) AS DungGio,
                SUM(CASE WHEN dd.TrangThai = N'Trễ' THEN 1 ELSE 0 END) AS Tre
            FROM dbo.BuoiHoc bh
            LEFT JOIN dbo.DiemDanh dd ON dd.MaBuoi = bh.MaBuoi
            WHERE LTRIM(RTRIM(bh.MaLHP)) = LTRIM(RTRIM(?))
            GROUP BY bh.MaBuoi, bh.NgayHoc, bh.GioBatDau
            ORDER BY bh.NgayHoc DESC, bh.GioBatDau DESC, bh.MaBuoi DESC
            """,
            (ma_lhp,),
        )
        sessions = []
        for r in cursor.fetchall():
            sessions.append(
                {
                    "ma_buoi": int(r[0]),
                    "ngay_hoc": r[1].isoformat() if r[1] else None,
                    "gio_bat_dau": str(r[2]) if r[2] else None,
                    "attendance_count": int(r[3] or 0),
                    "on_time_count": int(r[4] or 0),
                    "late_count": int(r[5] or 0),
                }
            )

        cursor.execute(
            """
            SELECT
                sv.MaSV,
                sv.HoTen,
                COUNT(dd.MaDiemDanh) AS TongLuot,
                SUM(CASE WHEN dd.TrangThai IN (N'Đúng giờ', N'Có mặt') THEN 1 ELSE 0 END) AS DungGio,
                SUM(CASE WHEN dd.TrangThai = N'Trễ' THEN 1 ELSE 0 END) AS Tre,
                MAX(dd.ThoiGianQuet) AS LanCuoi
            FROM dbo.BuoiHoc bh
            JOIN dbo.DiemDanh dd ON dd.MaBuoi = bh.MaBuoi
            JOIN dbo.SinhVien sv ON sv.MaSV = dd.MaSV
            WHERE LTRIM(RTRIM(bh.MaLHP)) = LTRIM(RTRIM(?))
            GROUP BY sv.MaSV, sv.HoTen
            ORDER BY TongLuot DESC, sv.MaSV
            """,
            (ma_lhp,),
        )
        students = []
        for r in cursor.fetchall():
            students.append(
                {
                    "ma_sv": r[0],
                    "ho_ten": r[1],
                    "total_checkins": int(r[2] or 0),
                    "on_time_count": int(r[3] or 0),
                    "late_count": int(r[4] or 0),
                    "last_checkin": r[5].isoformat() if r[5] else None,
                }
            )

        return {
            "ma_lhp": ma_lhp,
            "summary": summary,
            "sessions": sessions,
            "students": students,
        }
    finally:
        cursor.close()
        conn.close()


@app.patch("/api/admin/teaching/classes/{ma_lhp}/teacher")
async def admin_assign_teacher_for_class(
    ma_lhp: str,
    payload: TeacherAssignPayload,
    current=Depends(require_role("ADMIN")),
):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) FROM dbo.LopHocPhan WHERE LTRIM(RTRIM(MaLHP)) = LTRIM(RTRIM(?))", (ma_lhp,))
        if cursor.fetchone()[0] == 0:
            raise HTTPException(status_code=404, detail="Lớp học phần không tồn tại")

        ma_gv = (payload.ma_gv or "").strip() or None
        ten_gv = None
        if ma_gv:
            cursor.execute(
                """
                SELECT gv.HoTen
                FROM dbo.GiangVien gv
                INNER JOIN dbo.NguoiDung nd
                  ON nd.Role = N'TEACHER'
                 AND LTRIM(RTRIM(ISNULL(nd.MaGV,''))) = LTRIM(RTRIM(ISNULL(gv.MaGV,'')))
                WHERE LTRIM(RTRIM(gv.MaGV)) = LTRIM(RTRIM(?))
                """,
                (ma_gv,),
            )
            row_gv = cursor.fetchone()
            if not row_gv:
                raise HTTPException(status_code=400, detail="Mã giảng viên không hợp lệ hoặc chưa có tài khoản đăng ký")
            ten_gv = row_gv[0]

        cursor.execute(
            """
            UPDATE dbo.LopHocPhan
            SET MaGV = ?, GiangVien = ?
            WHERE LTRIM(RTRIM(MaLHP)) = LTRIM(RTRIM(?))
            """,
            (ma_gv, ten_gv, ma_lhp),
        )
        conn.commit()
        return {
            "success": True,
            "message": "Đã cập nhật phân công giảng viên",
            "ma_lhp": ma_lhp,
            "ma_gv": ma_gv,
            "ten_giang_vien": ten_gv,
        }
    except HTTPException:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


@app.get("/api/admin/teaching/overview")
async def admin_teaching_overview(
    ma_gv: Optional[str] = None,
    ma_lhp: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    current=Depends(require_role("ADMIN")),
):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        filters = []
        params: List = []
        if ma_gv and ma_gv.strip():
            filters.append("LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(?))")
            params.append(ma_gv.strip())
        if ma_lhp and ma_lhp.strip():
            filters.append("LTRIM(RTRIM(bh.MaLHP)) = LTRIM(RTRIM(?))")
            params.append(ma_lhp.strip())
        if from_date:
            filters.append("CAST(bh.NgayHoc AS DATE) >= ?")
            params.append(from_date)
        if to_date:
            filters.append("CAST(bh.NgayHoc AS DATE) <= ?")
            params.append(to_date)
        where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

        cursor.execute(
            f"""
            SELECT
                bh.MaBuoi,
                bh.MaLHP,
                mh.MaMon,
                mh.TenMon,
                bh.NgayHoc,
                bh.GioBatDau,
                bh.MaXacThucBuoi,
                lhp.MaGV,
                COALESCE(gv.HoTen, lhp.GiangVien) AS TenGiangVien,
                dd.MaSV,
                sv.HoTen AS TenSinhVien,
                dd.TrangThai,
                dd.ThoiGianQuet
            FROM dbo.BuoiHoc bh
            JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            LEFT JOIN dbo.MonHoc mh ON lhp.MaMon = mh.MaMon
            LEFT JOIN dbo.GiangVien gv
              ON LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(ISNULL(gv.MaGV,'')))
            LEFT JOIN dbo.DiemDanh dd ON dd.MaBuoi = bh.MaBuoi
            LEFT JOIN dbo.SinhVien sv ON sv.MaSV = dd.MaSV
            {where_clause}
            ORDER BY bh.NgayHoc DESC, bh.GioBatDau DESC, bh.MaBuoi DESC, dd.ThoiGianQuet DESC
            """,
            params,
        )
        rows = cursor.fetchall()
        data = []
        for r in rows:
            data.append(
                {
                    "ma_buoi": int(r[0]),
                    "ma_lhp": r[1],
                    "ma_mon": r[2],
                    "ten_mon": r[3],
                    "ngay_hoc": r[4].isoformat() if r[4] else None,
                    "gio_bat_dau": str(r[5]) if r[5] else None,
                    "ma_xac_thuc_buoi": r[6],
                    "ma_gv": r[7],
                    "ten_giang_vien": r[8],
                    "ma_sv": r[9],
                    "ten_sinh_vien": r[10],
                    "trang_thai": r[11],
                    "thoi_gian_quet": r[12].isoformat() if r[12] else None,
                }
            )
        return {"rows": data}
    finally:
        cursor.close()
        conn.close()


@app.post("/api/students/{ma_sv}/avatar")
async def upload_student_avatar(ma_sv: str, file: UploadFile = File(...)):
    """Upload / thay ảnh đại diện sinh viên (JPEG/PNG/WebP, tối đa 5MB)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT MaSV FROM SinhVien WHERE MaSV = ?", (ma_sv,))
    if not cursor.fetchone():
        cursor.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Sinh viên không tồn tại")
    cursor.close()
    conn.close()

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Ảnh tối đa 5MB")
    try:
        img = Image.open(io.BytesIO(contents))
        img = img.convert("RGB")
        safe_ma = "".join(c for c in ma_sv if c.isalnum() or c in "-_") or "user"
        out_name = f"{safe_ma}.jpg"
        out_path = os.path.join(AVATARS_DIR, out_name)
        img.save(out_path, "JPEG", quality=88)
    except Exception:
        raise HTTPException(status_code=400, detail="File không phải ảnh hợp lệ")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE SinhVien SET AnhDaiDien = ? WHERE MaSV = ?",
        (out_name, ma_sv),
    )
    conn.commit()
    cursor.close()
    conn.close()
    return {"success": True, "message": "Đã cập nhật ảnh đại diện", "anh_dai_dien": out_name}


@app.delete("/api/students/{ma_sv}/avatar")
async def delete_student_avatar(ma_sv: str):
    """Xóa ảnh đại diện → giao diện dùng lại avatar chữ."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT AnhDaiDien FROM SinhVien WHERE MaSV = ?", (ma_sv,))
    row = cursor.fetchone()
    if not row:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Sinh viên không tồn tại")
    fn = row[0] if row[0] else None
    cursor.execute(
        "UPDATE SinhVien SET AnhDaiDien = NULL WHERE MaSV = ?", (ma_sv,)
    )
    conn.commit()
    cursor.close()
    conn.close()
    if fn:
        path = os.path.join(AVATARS_DIR, str(fn).strip())
        if os.path.isfile(path):
            try:
                os.remove(path)
            except OSError:
                pass
    return {"success": True, "message": "Đã xóa ảnh đại diện"}


@app.get("/api/students/{ma_sv}/avatar")
async def get_student_avatar_file(ma_sv: str):
    """Trả file ảnh đại diện (dùng làm src trong frontend)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT AnhDaiDien FROM SinhVien WHERE MaSV = ?", (ma_sv,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    if not row or not row[0]:
        raise HTTPException(status_code=404, detail="Chưa có ảnh đại diện")
    path = os.path.join(AVATARS_DIR, str(row[0]).strip())
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File ảnh không tồn tại")
    return FileResponse(path, media_type="image/jpeg")


# ==================== CỔNG SINH VIÊN (JWT) ====================


@app.get("/api/student/me/enrollments")
async def student_my_enrollments(current=Depends(require_role("STUDENT"))):
    """Môn / lớp học phần sinh viên đã đăng ký + thông tin giảng viên."""
    ma_sv = _student_ma_sv_from_auth(current)
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT
                dk.MaLHP,
                mh.MaMon,
                mh.TenMon,
                lhp.GiangVien,
                lhp.MaGV,
                gv.HoTen,
                gv.Email,
                gv.DienThoai
            FROM DangKyHoc dk
            JOIN LopHocPhan lhp ON dk.MaLHP = lhp.MaLHP
            JOIN MonHoc mh ON lhp.MaMon = mh.MaMon
            LEFT JOIN dbo.GiangVien gv
                ON lhp.MaGV IS NOT NULL
                AND LTRIM(RTRIM(lhp.MaGV)) = LTRIM(RTRIM(gv.MaGV))
            WHERE dk.MaSV = ?
            ORDER BY dk.MaLHP
            """,
            (ma_sv,),
        )
        out = []
        for row in cursor.fetchall():
            ma_lhp, ma_mon, ten_mon, gv_text, ma_gv_lhp, gv_hoten, gv_email, gv_dt = row
            ten_gv_hien_thi = (gv_hoten or "").strip() or (gv_text or "").strip() or "—"
            out.append(
                {
                    "ma_lhp": ma_lhp,
                    "ma_mon": ma_mon,
                    "ten_mon": ten_mon,
                    "giang_vien": ten_gv_hien_thi,
                    "ma_gv": (ma_gv_lhp or "").strip() or None,
                    "gv_email": (gv_email or "").strip() or None,
                    "gv_dien_thoai": (gv_dt or "").strip() or None,
                    "ghi_chu_gv": (gv_text or "").strip() or None,
                }
            )
        return out
    finally:
        cursor.close()
        conn.close()


@app.get("/api/student/catalog/classes")
async def student_catalog_open_classes(current=Depends(require_role("STUDENT"))):
    """Lớp học phần chưa đăng ký — sinh viên có thể xem và đăng ký (khi đã phân công GV)."""
    ma_sv = _student_ma_sv_from_auth(current)
    conn = get_connection()
    cursor = conn.cursor()
    try:
        extras = _lhp_catalog_extra_select(_lhp_table_columns(cursor))
        cursor.execute(
            f"""
            SELECT
                lhp.MaLHP,
                mh.MaMon,
                mh.TenMon,
                lhp.GiangVien,
                lhp.MaGV,
                gv.HoTen,
                gv.Email,
                gv.DienThoai,
                {extras}
            FROM dbo.LopHocPhan lhp
            INNER JOIN dbo.MonHoc mh ON lhp.MaMon = mh.MaMon
            LEFT JOIN dbo.GiangVien gv
                ON lhp.MaGV IS NOT NULL
                AND LTRIM(RTRIM(lhp.MaGV)) = LTRIM(RTRIM(gv.MaGV))
            LEFT JOIN dbo.DangKyHoc dk
                ON dk.MaLHP = lhp.MaLHP AND dk.MaSV = ?
            WHERE dk.MaSV IS NULL
            ORDER BY lhp.MaLHP
            """,
            (ma_sv,),
        )
        return [_catalog_dict_from_row(r) for r in cursor.fetchall()]
    finally:
        cursor.close()
        conn.close()


@app.get("/api/student/catalog/classes/{ma_lhp}")
async def student_catalog_class_detail(ma_lhp: str, current=Depends(require_role("STUDENT"))):
    ma_sv = _student_ma_sv_from_auth(current)
    key = (ma_lhp or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="Thiếu mã lớp học phần")
    conn = get_connection()
    cursor = conn.cursor()
    try:
        extras = _lhp_catalog_extra_select(_lhp_table_columns(cursor))
        cursor.execute(
            f"""
            SELECT
                lhp.MaLHP,
                mh.MaMon,
                mh.TenMon,
                lhp.GiangVien,
                lhp.MaGV,
                gv.HoTen,
                gv.Email,
                gv.DienThoai,
                {extras}
            FROM dbo.LopHocPhan lhp
            INNER JOIN dbo.MonHoc mh ON lhp.MaMon = mh.MaMon
            LEFT JOIN dbo.GiangVien gv
                ON lhp.MaGV IS NOT NULL
                AND LTRIM(RTRIM(lhp.MaGV)) = LTRIM(RTRIM(gv.MaGV))
            WHERE LTRIM(RTRIM(lhp.MaLHP)) = LTRIM(RTRIM(?))
            """,
            (key,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy lớp học phần")
        cursor.execute(
            "SELECT COUNT(*) FROM dbo.DangKyHoc WHERE MaSV = ? AND LTRIM(RTRIM(MaLHP)) = LTRIM(RTRIM(?))",
            (ma_sv, key),
        )
        enrolled = int(cursor.fetchone()[0] or 0) > 0
        data = _catalog_dict_from_row(row)
        data["da_dang_ky"] = enrolled
        return data
    finally:
        cursor.close()
        conn.close()


@app.post("/api/student/me/enrollments")
async def student_enroll_class(body: StudentEnrollPayload, current=Depends(require_role("STUDENT"))):
    ma_sv = _student_ma_sv_from_auth(current)
    key = (body.ma_lhp or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="Thiếu mã lớp học phần")
    conn = get_connection()
    cursor = conn.cursor()
    try:
        extras = _lhp_catalog_extra_select(_lhp_table_columns(cursor))
        cursor.execute(
            f"""
            SELECT
                lhp.MaLHP,
                mh.MaMon,
                mh.TenMon,
                lhp.GiangVien,
                lhp.MaGV,
                gv.HoTen,
                gv.Email,
                gv.DienThoai,
                {extras}
            FROM dbo.LopHocPhan lhp
            INNER JOIN dbo.MonHoc mh ON lhp.MaMon = mh.MaMon
            LEFT JOIN dbo.GiangVien gv
                ON lhp.MaGV IS NOT NULL
                AND LTRIM(RTRIM(lhp.MaGV)) = LTRIM(RTRIM(gv.MaGV))
            WHERE LTRIM(RTRIM(lhp.MaLHP)) = LTRIM(RTRIM(?))
            """,
            (key,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy lớp học phần")
        meta = _catalog_dict_from_row(row)
        if not meta.get("du_dieu_kien_dang_ky"):
            raise HTTPException(
                status_code=400,
                detail="Lớp học phần chưa được phân công giảng viên. Vui lòng đợi phòng đào tạo hoàn tất.",
            )
        cursor.execute(
            "SELECT COUNT(*) FROM dbo.DangKyHoc WHERE MaSV = ? AND LTRIM(RTRIM(MaLHP)) = LTRIM(RTRIM(?))",
            (ma_sv, key),
        )
        if int(cursor.fetchone()[0] or 0) > 0:
            raise HTTPException(status_code=409, detail="Bạn đã đăng ký lớp học phần này")

        cursor.execute(
            """
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = N'dbo' AND TABLE_NAME = N'DangKyHoc'
            """
        )
        dk_cols = {r[0] for r in cursor.fetchall()}
        if not {"MaSV", "MaLHP"}.issubset(dk_cols):
            raise HTTPException(status_code=500, detail="Bảng DangKyHoc thiếu cột MaSV hoặc MaLHP")
        cursor.execute(
            "INSERT INTO dbo.DangKyHoc (MaSV, MaLHP) VALUES (?, ?)",
            (ma_sv, row[0]),
        )
        conn.commit()
        return {
            "success": True,
            "message": "Đăng ký học phần thành công",
            "ma_lhp": row[0],
            "ten_mon": meta.get("ten_mon"),
            "giang_vien": meta.get("giang_vien"),
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        if "UNIQUE" in str(e).upper() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="Bạn đã đăng ký lớp học phần này") from e
        raise HTTPException(status_code=500, detail=f"Không thể ghi đăng ký: {e!s}") from e
    finally:
        cursor.close()
        conn.close()


@app.get("/api/student/me/sessions")
async def student_my_sessions(limit: int = 300, current=Depends(require_role("STUDENT"))):
    """Buổi học thuộc các lớp học phần sinh viên đã đăng ký."""
    ma_sv = _student_ma_sv_from_auth(current)
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT TOP (?)
                bh.MaBuoi,
                bh.MaLHP,
                bh.NgayHoc,
                bh.GioBatDau,
                mh.TenMon,
                lhp.GiangVien,
                lhp.MaGV,
                gv.HoTen,
                bh.PhutHetHanDungGio,
                bh.PhutHetHanDiemDanh,
                dd.MaDiemDanh
            FROM BuoiHoc bh
            INNER JOIN DangKyHoc dk
                ON LTRIM(RTRIM(dk.MaLHP)) = LTRIM(RTRIM(bh.MaLHP))
                AND LTRIM(RTRIM(dk.MaSV)) = LTRIM(RTRIM(?))
            JOIN LopHocPhan lhp ON LTRIM(RTRIM(bh.MaLHP)) = LTRIM(RTRIM(lhp.MaLHP))
            JOIN MonHoc mh ON lhp.MaMon = mh.MaMon
            LEFT JOIN dbo.DiemDanh dd
                ON dd.MaBuoi = bh.MaBuoi
                AND LTRIM(RTRIM(dd.MaSV)) = LTRIM(RTRIM(dk.MaSV))
            LEFT JOIN dbo.GiangVien gv
                ON lhp.MaGV IS NOT NULL
                AND LTRIM(RTRIM(lhp.MaGV)) = LTRIM(RTRIM(gv.MaGV))
            ORDER BY bh.NgayHoc DESC, bh.GioBatDau DESC
            """,
            (limit, ma_sv),
        )
        sessions = []
        for row in cursor.fetchall():
            ngay = row[2].isoformat() if row[2] else None
            gio = row[3]
            if gio and not isinstance(gio, str):
                gio = gio.strftime("%H:%M:%S")
            gv_show = (row[7] or "").strip() or (row[5] or "").strip() or "—"
            da_quet = row[10] is not None
            elig = _session_checkin_eligibility(
                row[2], row[3], row[8], row[9], da_quet
            )
            sessions.append(
                {
                    "ma_buoi": row[0],
                    "ma_lhp": row[1],
                    "ngay_hoc": ngay,
                    "gio_bat_dau": gio,
                    "ten_mon": row[4],
                    "giang_vien": gv_show,
                    "da_diem_danh": elig["da_diem_danh"],
                    "co_the_quet": elig["co_the_quet"],
                    "khoang_dung_gio": elig["khoang_dung_gio"],
                    "phase_diem_danh": elig["phase"],
                    "goi_y_diem_danh": elig["goi_y"],
                }
            )
        return sessions
    finally:
        cursor.close()
        conn.close()


@app.patch("/api/student/me/profile")
async def student_update_own_profile(
    body: StudentSelfProfileUpdate,
    current=Depends(require_role("STUDENT")),
):
    """Sinh viên chỉ được sửa họ tên và email trên SinhVien; đồng bộ họ tên sang NguoiDung."""
    ma_sv = _student_ma_sv_from_auth(current)
    uid = current.get("uid")
    if hasattr(body, "model_dump"):
        updates = body.model_dump(exclude_unset=True)
    else:
        updates = body.dict(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Không có trường nào để cập nhật")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT HoTen, Email FROM dbo.SinhVien WHERE MaSV = ?", (ma_sv,))
    row = cursor.fetchone()
    if not row:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy sinh viên trong CSDL")

    ho_ten = row[0]
    email = row[1]

    if "ho_ten" in updates:
        ht = (updates.get("ho_ten") or "").strip()
        if not ht:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=400, detail="Họ tên không hợp lệ")
        ho_ten = ht
    if "email" in updates:
        email = (updates.get("email") or "").strip() or None

    cursor.execute(
        "UPDATE dbo.SinhVien SET HoTen = ?, Email = ? WHERE MaSV = ?",
        (ho_ten, email, ma_sv),
    )
    if "ho_ten" in updates and uid:
        cursor.execute(
            "UPDATE dbo.NguoiDung SET HoTen = ?, UpdatedAt = SYSUTCDATETIME() WHERE Id = ?",
            (ho_ten, uid),
        )
    conn.commit()
    cursor.close()
    conn.close()
    return {"success": True, "message": "Đã cập nhật hồ sơ"}


@app.post("/api/student/me/feedback")
async def student_submit_feedback(
    body: StudentFeedbackCreate,
    current=Depends(require_role("STUDENT")),
):
    loai = (body.loai or "").strip().upper()
    if loai not in {"CHUONG_TRINH", "GIANG_VIEN", "GOP_Y"}:
        raise HTTPException(status_code=400, detail="Loại phản hồi không hợp lệ")
    nd = (body.noi_dung or "").strip()
    if len(nd) < 5:
        raise HTTPException(status_code=400, detail="Nội dung phản hồi quá ngắn")
    ma_sv = _student_ma_sv_from_auth(current)
    ma_lhp = (body.ma_lhp or "").strip() or None
    if ma_lhp:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM DangKyHoc WHERE MaSV = ? AND MaLHP = ?",
            (ma_sv, ma_lhp),
        )
        ok = cursor.fetchone()[0] > 0
        cursor.close()
        conn.close()
        if not ok:
            raise HTTPException(status_code=400, detail="Bạn chưa đăng ký lớp học phần này")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO dbo.PhanHoiSinhVien (MaSV, LoaiPhanHoi, TieuDe, NoiDung, MaLHP)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            ma_sv,
            loai,
            (body.tieu_de or "").strip() or None,
            nd[:2000],
            ma_lhp,
        ),
    )
    conn.commit()
    cursor.close()
    conn.close()
    return {"success": True, "message": "Đã gửi phản hồi. Cảm ơn bạn!"}


@app.get("/api/student/me/feedbacks")
async def student_list_own_feedbacks(current=Depends(require_role("STUDENT"))):
    ma_sv = _student_ma_sv_from_auth(current)
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT Id, LoaiPhanHoi, TieuDe, NoiDung, MaLHP, CreatedAt
        FROM dbo.PhanHoiSinhVien
        WHERE MaSV = ?
        ORDER BY CreatedAt DESC
        """,
        (ma_sv,),
    )
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return [
        {
            "id": r[0],
            "loai": r[1],
            "tieu_de": r[2],
            "noi_dung": r[3],
            "ma_lhp": r[4],
            "created_at": r[5].isoformat() if r[5] else None,
        }
        for r in rows
    ]


# ==================== TRAINING APIs ====================

@app.post("/api/training/upload-image/{ma_sv}")
async def upload_training_image(ma_sv: str, file: UploadFile = File(...)):
    """Upload ảnh training cho sinh viên"""
    try:
        n_existing = len(training_manager.get_training_images(ma_sv))
        if n_existing >= MAX_TRAINING_IMAGES_PER_STUDENT:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Đã đạt tối đa {MAX_TRAINING_IMAGES_PER_STUDENT} ảnh huấn luyện / sinh viên. "
                    "Xóa bớt ảnh cũ trước khi thêm."
                ),
            )
        contents = await file.read()
        filepath, error = training_manager.save_training_image(ma_sv, contents)
        
        if error:
            raise HTTPException(status_code=400, detail=error)
        
        return {
            "success": True,
            "message": "Ảnh đã được lưu",
            "filepath": filepath
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/training/images/{ma_sv}")
async def get_training_images(ma_sv: str):
    """Lấy danh sách ảnh training"""
    images = training_manager.get_training_images(ma_sv)
    return {
        "ma_sv": ma_sv,
        "count": len(images),
        "max_images": MAX_TRAINING_IMAGES_PER_STUDENT,
        "images": images,
    }

@app.get("/api/training/image/{ma_sv}/{filename}")
async def get_training_image(ma_sv: str, filename: str):
    """Lấy ảnh training"""
    filepath = os.path.join("dataset_raw", ma_sv, filename)
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Image not found")
    
    return FileResponse(filepath)

@app.delete("/api/training/image/{ma_sv}/{filename}")
async def delete_training_image(ma_sv: str, filename: str):
    """Xóa ảnh training"""
    success = training_manager.delete_training_image(ma_sv, filename)
    
    if not success:
        raise HTTPException(status_code=404, detail="Image not found")
    
    return {"success": True, "message": "Đã xóa ảnh"}

@app.post("/api/training/train/{ma_sv}")
async def train_student_model(ma_sv: str):
    """Train model cho sinh viên"""
    result = training_manager.train_student(ma_sv)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    
    # Reload face database
    global face_database
    face_database = load_face_database()

    # Lấy tổng số sinh viên thật trong hệ thống (admin thêm mới thì số này tăng).
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM SinhVien")
        row = cursor.fetchone()
        db_students = int(row[0]) if row and row[0] is not None else 0
        result["system_students_count"] = max(int(TRAINING_IMAGES_BASELINE), db_students)
        cursor.close()
        conn.close()
    except Exception:
        result["system_students_count"] = int(TRAINING_IMAGES_BASELINE)

    return result

@app.get("/api/training/status/{ma_sv}")
async def get_training_status(ma_sv: str):
    """Kiểm tra trạng thái training"""
    images = training_manager.get_training_images(ma_sv)
    db_info = training_manager.get_face_database_info()
    
    return {
        "ma_sv": ma_sv,
        "training_images_count": len(images),
        "max_training_images": MAX_TRAINING_IMAGES_PER_STUDENT,
        "in_database": ma_sv in db_info["identities"],
        "ready_to_recognize": ma_sv in db_info["identities"] and len(images) >= 5,
    }

@app.delete("/api/training/remove/{ma_sv}")
async def remove_student_training(ma_sv: str):
    """Xóa toàn bộ training data"""
    training_manager.delete_all_training_images(ma_sv)
    training_manager.remove_from_database(ma_sv)
    
    # Reload
    global face_database
    face_database = load_face_database()
    
    return {"success": True, "message": "Đã xóa toàn bộ training data"}

# ==================== RECOGNITION APIs ====================

@app.post("/api/recognize")
async def recognize_face_endpoint(file: UploadFile = File(...)):
    """Nhận diện khuôn mặt - Độ chính xác cao"""
    try:
        load_face_database()
        contents = await file.read()

        mask_block = _mask_block_response_from_bytes(contents)
        if mask_block:
            return mask_block

        # Extract embedding
        embedding, error = extract_embedding_high_quality(contents)
        
        if error:
            return {
                "success": False,
                "message": error,
                "identity": None,
                "confidence": 0,
                **occlusion_api_fields(error),
            }

        mask_block = _mask_block_response_from_bytes(contents)
        if mask_block:
            return mask_block
        
        # Recognize
        identity, confidence, top_matches = recognize_with_high_accuracy(embedding)
        confidence_ui = _calibrate_confidence(confidence, top_matches)

        mask_block = _mask_block_response_from_bytes(contents)
        if mask_block:
            return mask_block
        
        if identity == "Unknown":
            return {
                "success": False,
                "unknown_face_not_in_training": True,
                "message": MSG_UNKNOWN_FACE_NOT_IN_TRAINING,
                "identity": None,
                "confidence": float(confidence_ui),
                "top_matches": [{"identity": m[0], "score": float(m[1])} for m in top_matches]
            }
        
        # Get student info
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM SinhVien WHERE MaSV = ?", (identity,))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if row:
            # Online learning: cộng dồn mẫu từ lần nhận diện chắc chắn để cải thiện dần độ ổn định.
            training_manager.append_online_sample(identity, embedding, confidence)
            global face_database
            face_database = load_face_database()
            st = sinhvien_row_to_student(row)
            return {
                "success": True,
                "identity": identity,
                "confidence": float(confidence_ui),
                "student_info": {
                    "ma_sv": st.ma_sv,
                    "ho_ten": st.ho_ten,
                    "ngay_sinh": st.ngay_sinh.isoformat() if st.ngay_sinh else None,
                    "gioi_tinh": st.gioi_tinh,
                    "lop": st.lop,
                    "khoa": st.khoa,
                    "email": st.email,
                    "anh_dai_dien": st.anh_dai_dien,
                },
                "top_matches": [{"identity": m[0], "score": float(m[1])} for m in top_matches[:3]]
            }
        
        return {
            "success": False,
            "sinhvien_record_missing": True,
            "message": MSG_SINHVIEN_RECORD_MISSING,
            "identity": identity,
            "confidence": float(confidence_ui)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/recognize-live")
async def recognize_live_endpoint(frames: List[UploadFile] = File(...)):
    """
    Điểm danh / nhận diện qua webcam: bắt buộc nhiều khung liên tiếp + kiểm tra liveness
    (hạn chế ảnh/video hiển thị trên màn hình thiết bị). Ảnh cuối dùng để trích embedding danh tính.
    """
    try:
        load_face_database()
        if not frames:
            return {
                "success": False,
                "liveness_failed": True,
                "message": "Cần gửi ít nhất 3 ảnh liên tiếp từ webcam (trường form: frames).",
                "identity": None,
                "confidence": 0,
            }

        raw: List[bytes] = []
        for uf in frames:
            raw.append(await uf.read())

        ok, lmsg = verify_live_attendance_frames(raw)
        if not ok:
            occ_fields = occlusion_api_fields(lmsg)
            if occ_fields:
                return {
                    "success": False,
                    "liveness_failed": False,
                    "message": lmsg,
                    "identity": None,
                    "confidence": 0,
                    **occ_fields,
                }
            return {
                "success": False,
                "liveness_failed": True,
                "screen_replay_blocked": True,
                "message": lmsg,
                "identity": None,
                "confidence": 0,
            }

        # Nhận diện từ nhiều frame để giảm nhiễu/nhòe của từng ảnh đơn lẻ.
        emb_list: List[np.ndarray] = []
        last_error = None
        for b in raw:
            emb_i, err_i = extract_embedding_high_quality(b)
            if emb_i is not None:
                emb_list.append(emb_i)
            else:
                last_error = err_i

        embedding = _aggregate_embeddings(emb_list)
        if embedding is None:
            return {
                "success": False,
                "liveness_failed": False,
                "message": last_error or "Không trích được đặc trưng khuôn mặt.",
                "identity": None,
                "confidence": 0,
                **occlusion_api_fields(last_error),
            }

        for b in raw:
            mask_block = _mask_block_response_from_bytes(b, {"liveness_failed": False})
            if mask_block:
                return mask_block

        identity, confidence, top_matches = recognize_with_high_accuracy(embedding)
        confidence_ui = _calibrate_confidence(confidence, top_matches)

        for b in raw:
            mask_block = _mask_block_response_from_bytes(b, {"liveness_failed": False})
            if mask_block:
                return mask_block

        if identity == "Unknown":
            return {
                "success": False,
                "liveness_failed": False,
                "unknown_face_not_in_training": True,
                "message": MSG_UNKNOWN_FACE_NOT_IN_TRAINING,
                "identity": None,
                "confidence": float(confidence_ui),
                "top_matches": [{"identity": m[0], "score": float(m[1])} for m in top_matches],
            }

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM SinhVien WHERE MaSV = ?", (identity,))
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if row:
            # Online learning: cộng dồn mẫu từ lần nhận diện chắc chắn để cải thiện dần độ ổn định.
            training_manager.append_online_sample(identity, embedding, confidence)
            global face_database
            face_database = load_face_database()
            st = sinhvien_row_to_student(row)
            return {
                "success": True,
                "liveness_ok": True,
                "identity": identity,
                "confidence": float(confidence_ui),
                "student_info": {
                    "ma_sv": st.ma_sv,
                    "ho_ten": st.ho_ten,
                    "ngay_sinh": st.ngay_sinh.isoformat() if st.ngay_sinh else None,
                    "gioi_tinh": st.gioi_tinh,
                    "lop": st.lop,
                    "khoa": st.khoa,
                    "email": st.email,
                    "anh_dai_dien": st.anh_dai_dien,
                },
                "top_matches": [{"identity": m[0], "score": float(m[1])} for m in top_matches[:3]],
            }

        return {
            "success": False,
            "liveness_ok": True,
            "sinhvien_record_missing": True,
            "message": MSG_SINHVIEN_RECORD_MISSING,
            "identity": identity,
            "confidence": float(confidence_ui),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== SESSION APIs ====================

@app.get("/api/sessions/today")
async def get_today_sessions():
    """Lấy tất cả buổi học (không chỉ hôm nay) để debug"""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Query lấy TẤT CẢ buổi học để kiểm tra
    cursor.execute("""
        SELECT 
            bh.MaBuoi, 
            bh.MaLHP, 
            bh.NgayHoc, 
            bh.GioBatDau,
            lhp.GiangVien, 
            mh.TenMon
        FROM BuoiHoc bh
        JOIN LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
        JOIN MonHoc mh ON lhp.MaMon = mh.MaMon
        ORDER BY bh.NgayHoc DESC, bh.GioBatDau
    """)
    
    sessions = []
    for row in cursor.fetchall():
        try:
            # Xử lý cẩn thận datetime
            ngay_hoc = row[2].isoformat() if row[2] else None
            
            # Chuyển time object thành string HH:MM
            if row[3]:
                if isinstance(row[3], str):
                    gio_bat_dau = row[3]
                else:
                    # Nếu là time object
                    gio_bat_dau = row[3].strftime("%H:%M:%S")
            else:
                gio_bat_dau = None
            
            sessions.append({
                "ma_buoi": row[0],
                "ma_lhp": row[1],
                "ngay_hoc": ngay_hoc,
                "gio_bat_dau": gio_bat_dau,
                "giang_vien": row[4],
                "ten_mon": row[5]
            })
        except Exception as e:
            print(f"Error processing row: {e}")
            continue
    
    cursor.close()
    conn.close()
    
    print(f"📊 Found {len(sessions)} sessions")  # Debug log
    return sessions


# Thêm endpoint mới để lọc theo ngày
@app.get("/api/sessions/by-date")
async def get_sessions_by_date(date: str = None):
    """
    Lấy buổi học theo ngày
    date format: YYYY-MM-DD (vd: 2026-01-25)
    Nếu không truyền date, lấy hôm nay
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    if date:
        query = """
            SELECT 
                bh.MaBuoi, bh.MaLHP, bh.NgayHoc, bh.GioBatDau,
                lhp.GiangVien, mh.TenMon
            FROM BuoiHoc bh
            JOIN LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            JOIN MonHoc mh ON lhp.MaMon = mh.MaMon
            WHERE bh.NgayHoc = ?
            ORDER BY bh.GioBatDau
        """
        cursor.execute(query, (date,))
    else:
        query = """
            SELECT 
                bh.MaBuoi, bh.MaLHP, bh.NgayHoc, bh.GioBatDau,
                lhp.GiangVien, mh.TenMon
            FROM BuoiHoc bh
            JOIN LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            JOIN MonHoc mh ON lhp.MaMon = mh.MaMon
            WHERE bh.NgayHoc = CAST(GETDATE() AS DATE)
            ORDER BY bh.GioBatDau
        """
        cursor.execute(query)
    
    sessions = []
    for row in cursor.fetchall():
        ngay_hoc = row[2].isoformat() if row[2] else None
        gio_bat_dau = row[3].strftime("%H:%M:%S") if row[3] else None
        
        sessions.append({
            "ma_buoi": row[0],
            "ma_lhp": row[1],
            "ngay_hoc": ngay_hoc,
            "gio_bat_dau": gio_bat_dau,
            "giang_vien": row[4],
            "ten_mon": row[5]
        })
    
    cursor.close()
    conn.close()
    return sessions
# ==================== ATTENDANCE APIs ====================

@app.post("/api/attendance/checkin")
async def checkin_attendance(request: Request):
    """
    Điểm danh: multipart/form-data (ma_sv, ma_buoi, ma_xac_thuc?, frames[], image?).
    Bắt buộc gửi tối thiểu 3 khung webcam liên tiếp để xác minh người thật và khớp ma_sv.
    Ảnh chụp (JPEG/PNG) tùy chọn — lưu kèm bản ghi để GV xem lại.
    """
    ct = (request.headers.get("content-type") or "").lower()
    image_bytes: Optional[bytes] = None
    live_frames_bytes: List[bytes] = []

    if "multipart/form-data" in ct:
        form = await request.form()
        ma_sv = (str(form.get("ma_sv") or "")).strip()
        try:
            ma_buoi = int(form.get("ma_buoi"))
        except (TypeError, ValueError):
            ma_buoi = None
        mxt = form.get("ma_xac_thuc")
        ma_xac_thuc = (str(mxt).strip() if mxt not in (None, "") else None) or None
        if ma_xac_thuc == "":
            ma_xac_thuc = None
        frame_uploads = form.getlist("frames") if hasattr(form, "getlist") else []
        if not frame_uploads:
            single_frame = form.get("frames")
            if single_frame is not None:
                frame_uploads = [single_frame]
        for fu in frame_uploads:
            if fu is not None and hasattr(fu, "read"):
                raw_f = await fu.read()
                if raw_f:
                    if len(raw_f) > 5 * 1024 * 1024:
                        raise HTTPException(status_code=400, detail="Ảnh điểm danh quá lớn (tối đa 5MB)")
                    live_frames_bytes.append(raw_f)
        up = form.get("image")
        if up is not None and hasattr(up, "read"):
            raw = await up.read()
            if raw and len(raw) > 5 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Ảnh điểm danh quá lớn (tối đa 5MB)")
            image_bytes = raw if raw else None
    else:
        ma_sv = (request.query_params.get("ma_sv") or "").strip()
        try:
            ma_buoi = int(request.query_params.get("ma_buoi"))
        except (TypeError, ValueError):
            ma_buoi = None
        mxt = request.query_params.get("ma_xac_thuc")
        ma_xac_thuc = (mxt or "").strip() or None

    if not ma_sv or ma_buoi is None:
        raise HTTPException(status_code=400, detail="Thiếu ma_sv hoặc ma_buoi")

    min_live_frames = int(os.environ.get("LIVE_MIN_FRAMES", "3"))
    if len(live_frames_bytes) < min_live_frames:
        return {
            "success": False,
            "liveness_failed": True,
            "message": (
                f"Cần tối thiểu {min_live_frames} khung hình liên tiếp từ webcam để xác minh người thật khi điểm danh. "
                "Không chấp nhận điểm danh bằng ảnh hoặc video hiển thị trên thiết bị khác."
            ),
        }

    ok_live, live_msg = verify_live_attendance_frames(live_frames_bytes)
    if not ok_live:
        occ_fields = occlusion_api_fields(live_msg)
        if occ_fields:
            return {"success": False, "message": live_msg, **occ_fields}
        return {
            "success": False,
            "liveness_failed": True,
            "screen_replay_blocked": True,
            "message": live_msg,
        }

    load_face_database()
    emb_list: List[np.ndarray] = []
    for fb in live_frames_bytes:
        emb_i, _err_i = extract_embedding_high_quality(fb)
        if emb_i is not None:
            emb_list.append(emb_i)
    check_emb = _aggregate_embeddings(emb_list)
    if check_emb is None:
        return {
            "success": False,
            "message": "Không trích được đặc trưng khuôn mặt để xác minh điểm danh. Vui lòng thử lại.",
        }
    check_identity, check_conf, _ = recognize_with_high_accuracy(check_emb)
    if check_identity == "Unknown" or str(check_identity).strip() != ma_sv:
        return {
            "success": False,
            "liveness_failed": True,
            "screen_replay_blocked": True,
            "message": (
                "Hệ thống phát hiện khuôn mặt không khớp tài khoản sinh viên hoặc có dấu hiệu ảnh/video "
                "từ điện thoại, laptop hoặc thiết bị khác. Không chấp nhận điểm danh."
            ),
        }

    if image_bytes is None and live_frames_bytes:
        image_bytes = live_frames_bytes[-1]

    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            """
            SELECT bh.MaLHP, bh.NgayHoc, bh.GioBatDau, bh.MaXacThucBuoi, bh.PhutHetHanDungGio, bh.PhutHetHanDiemDanh
            FROM BuoiHoc bh
            WHERE bh.MaBuoi = ?
            """,
            (ma_buoi,),
        )
        row_bh = cursor.fetchone()
        if not row_bh:
            raise HTTPException(status_code=404, detail="Không tìm thấy buổi học")

        ma_lhp = row_bh[0]
        ngay_hoc = row_bh[1]
        gio_bat_dau = row_bh[2]
        ma_db_code = (row_bh[3] or "").strip() if row_bh[3] is not None else ""
        phut_dung = int(row_bh[4]) if row_bh[4] is not None else 15
        phut_max = int(row_bh[5]) if row_bh[5] is not None else 60

        cursor.execute(
            "SELECT COUNT(*) FROM DangKyHoc WHERE MaSV = ? AND MaLHP = ?",
            (ma_sv, ma_lhp),
        )
        if cursor.fetchone()[0] == 0:
            return {"success": False, "message": "Bạn không đăng ký lớp học phần của buổi này"}

        if ma_db_code:
            if not (ma_xac_thuc or "").strip():
                return {"success": False, "message": "Vui lòng nhập mã buổi học do giảng viên cung cấp"}
            if (ma_xac_thuc or "").strip().lower() != ma_db_code.lower():
                return {"success": False, "message": "Mã buổi học không đúng"}

        cursor.execute(
            """
            SELECT COUNT(*) FROM DiemDanh
            WHERE MaSV = ? AND MaBuoi = ?
            """,
            (ma_sv, ma_buoi),
        )
        if cursor.fetchone()[0] > 0:
            return {"success": False, "message": "Sinh viên đã điểm danh rồi"}

        if isinstance(ngay_hoc, datetime):
            d = ngay_hoc.date()
        elif isinstance(ngay_hoc, date):
            d = ngay_hoc
        else:
            d = datetime.now().date()

        if isinstance(gio_bat_dau, str):
            parts = gio_bat_dau.split(":")
            gt = time(int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)
        else:
            gt = gio_bat_dau

        start_dt = datetime.combine(d, gt)
        now = datetime.now()
        delta_min = (now - start_dt).total_seconds() / 60.0

        if delta_min < -10:
            return {"success": False, "message": "Chưa đến thời gian mở điểm danh (mở trước 10 phút)"}

        if delta_min > phut_max:
            return {"success": False, "message": f"Đã quá {phut_max} phút kể từ giờ bắt đầu — không thể điểm danh (vắng)"}

        if delta_min <= phut_dung:
            trang_thai = "Đúng giờ"
        else:
            trang_thai = "Trễ"

        quet_at = datetime.now()
        cursor.execute(
            """
            INSERT INTO DiemDanh (MaSV, MaBuoi, ThoiGianQuet, TrangThai, NguonQuet)
            OUTPUT INSERTED.MaDiemDanh
            VALUES (?, ?, ?, ?, ?)
            """,
            (ma_sv, ma_buoi, quet_at, trang_thai, "Webcam"),
        )
        ins = cursor.fetchone()
        ma_diem_danh = int(ins[0]) if ins else None

        saved_name = None
        if image_bytes and ma_diem_danh is not None:
            ext = ".jpg"
            head = image_bytes[:16]
            if head.startswith(b"\x89PNG\r\n\x1a\n"):
                ext = ".png"
            saved_name = f"dd_{ma_diem_danh}{ext}"
            try:
                (ATTENDANCE_CAPTURES_DIR / saved_name).write_bytes(image_bytes)
                cursor.execute(
                    "UPDATE dbo.DiemDanh SET AnhDiemDanh = ? WHERE MaDiemDanh = ?",
                    (saved_name, ma_diem_danh),
                )
            except OSError:
                saved_name = None

        conn.commit()

        return {
            "success": True,
            "message": f"Điểm danh thành công - {trang_thai}",
            "trang_thai": trang_thai,
            "thoi_gian": quet_at.isoformat(),
            "ma_diem_danh": ma_diem_danh,
            "co_anh": bool(saved_name),
        }

    finally:
        cursor.close()
        conn.close()

@app.get("/api/attendance/capture/{ma_diem_danh}")
async def get_attendance_capture(
    ma_diem_danh: int,
    current=Depends(require_role("ADMIN", "TEACHER", "STUDENT")),
):
    """Ảnh điểm danh đã lưu — GV (buổi của mình), SV (của chính mình), Admin."""
    conn = get_connection()
    cursor = conn.cursor()
    path = None
    fn = ""
    try:
        cursor.execute(
            """
            SELECT dd.AnhDiemDanh, dd.MaSV, dd.MaBuoi
            FROM dbo.DiemDanh dd
            WHERE dd.MaDiemDanh = ?
            """,
            (ma_diem_danh,),
        )
        row = cursor.fetchone()
        if not row or not row[0]:
            raise HTTPException(status_code=404, detail="Không có ảnh điểm danh")
        fn = (row[0] or "").strip()
        ma_sv_row = (row[1] or "").strip()
        ma_buoi = row[2]
        if ".." in fn or "/" in fn or "\\" in fn:
            raise HTTPException(status_code=400, detail="Tên file không hợp lệ")
        path = ATTENDANCE_CAPTURES_DIR / fn
        if not path.is_file():
            raise HTTPException(status_code=404, detail="File ảnh không còn trên máy chủ")

        role = (current.get("role") or "").upper()
        if role == "STUDENT":
            if (current.get("ma_sv") or "").strip() != ma_sv_row:
                raise HTTPException(status_code=403, detail="Không được xem ảnh điểm danh này")
        elif role == "TEACHER":
            mgv = (current.get("ma_gv") or "").strip()
            if not mgv or not _teacher_owns_buoi(cursor, mgv, int(ma_buoi)):
                raise HTTPException(status_code=403, detail="Không được xem ảnh buổi học này")
    finally:
        cursor.close()
        conn.close()

    media = "image/jpeg"
    if fn.lower().endswith(".png"):
        media = "image/png"
    return FileResponse(path, media_type=media, filename=fn)

@app.get("/api/attendance/session/{ma_buoi}")
async def get_session_attendance(ma_buoi: int):
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT dd.MaDiemDanh, sv.MaSV, sv.HoTen, sv.Lop,
               dd.ThoiGianQuet, dd.TrangThai, dd.NguonQuet, dd.AnhDiemDanh
        FROM DiemDanh dd
        JOIN SinhVien sv ON dd.MaSV = sv.MaSV
        WHERE dd.MaBuoi = ?
        ORDER BY dd.ThoiGianQuet DESC
    """, (ma_buoi,))
    
    records = []
    for row in cursor.fetchall():
        anh = row[7] if len(row) > 7 else None
        co_anh = bool(anh and str(anh).strip())
        records.append({
            "ma_diem_danh": row[0],
            "ma_sv": row[1],
            "ho_ten": row[2],
            "lop": row[3],
            "thoi_gian_quet": row[4].isoformat() if row[4] else None,
            "trang_thai": row[5],
            "nguon_quet": row[6],
            "co_anh": co_anh,
        })
    
    cursor.close()
    conn.close()
    return records

# ==================== ANALYTICS APIs - REAL DATA ====================

@app.get("/api/analytics/overview")
async def get_analytics_overview(current=Depends(require_role("ADMIN"))):
    """4 ô tổng quan toàn hệ thống: TB chuyên cần, đủ ĐK, nguy cơ, tỷ lệ trễ (7 ngày)."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT AVG(CAST(sub.ty AS FLOAT))
            FROM (
                SELECT
                    CAST(COUNT(DISTINCT dd.MaBuoi) * 100.0 /
                         NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) AS ty
                FROM dbo.SinhVien sv
                JOIN dbo.DangKyHoc dk ON sv.MaSV = dk.MaSV
                JOIN dbo.LopHocPhan lhp ON dk.MaLHP = lhp.MaLHP
                JOIN dbo.BuoiHoc bh ON lhp.MaLHP = bh.MaLHP
                LEFT JOIN dbo.DiemDanh dd ON dd.MaSV = sv.MaSV AND dd.MaBuoi = bh.MaBuoi
                WHERE sv.TrangThai = N'Đang học'
                GROUP BY sv.MaSV
                HAVING COUNT(DISTINCT bh.MaBuoi) > 0
            ) sub
            """
        )
        avg_cc = float(cursor.fetchone()[0] or 0)

        cursor.execute(
            """
            SELECT
                COUNT(*) AS total_sv,
                SUM(CASE WHEN x.ty >= 80 THEN 1 ELSE 0 END) AS eligible,
                SUM(CASE WHEN x.ty < 80 THEN 1 ELSE 0 END) AS at_risk
            FROM (
                SELECT
                    CAST(COUNT(DISTINCT dd.MaBuoi) * 100.0 /
                         NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) AS ty
                FROM dbo.SinhVien sv
                JOIN dbo.DangKyHoc dk ON sv.MaSV = dk.MaSV
                JOIN dbo.LopHocPhan lhp ON dk.MaLHP = lhp.MaLHP
                JOIN dbo.BuoiHoc bh ON lhp.MaLHP = bh.MaLHP
                LEFT JOIN dbo.DiemDanh dd ON dd.MaSV = sv.MaSV AND dd.MaBuoi = bh.MaBuoi
                WHERE sv.TrangThai = N'Đang học'
                GROUP BY sv.MaSV
                HAVING COUNT(DISTINCT bh.MaBuoi) > 0
            ) x
            """
        )
        row = cursor.fetchone()
        total_tracked = int(row[0] or 0)
        eligible = int(row[1] or 0)
        at_risk = int(row[2] or 0)

        cursor.execute(
            """
            SELECT ISNULL(
                CAST(SUM(CASE WHEN dd.TrangThai = N'Trễ' THEN 1 ELSE 0 END) AS FLOAT) * 100.0
                / NULLIF(COUNT(*), 0), 0)
            FROM dbo.DiemDanh dd
            JOIN dbo.BuoiHoc bh ON dd.MaBuoi = bh.MaBuoi
            WHERE bh.NgayHoc >= DATEADD(day, -7, CAST(GETDATE() AS DATE))
            """
        )
        late_rate = float(cursor.fetchone()[0] or 0)

        return {
            "avg_attendance_rate": round(avg_cc, 2),
            "eligible_count": eligible,
            "tracked_students": total_tracked,
            "eligible_ratio_text": f"{eligible}/{total_tracked}" if total_tracked else "0/0",
            "eligible_ok_percent": round(100.0 * eligible / total_tracked, 2) if total_tracked else 0.0,
            "at_risk_count": at_risk,
            "late_rate_week": round(late_rate, 2),
        }
    finally:
        cursor.close()
        conn.close()


@app.get("/api/analytics/recent-session-stats")
async def get_recent_session_stats(days: int = 14, current=Depends(require_role("ADMIN"))):
    """Theo từng buổi toàn hệ thống: số SV đăng ký, số đã quét, đúng giờ / trễ / vắng."""
    days = max(1, min(int(days or 14), 120))
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT
                bh.MaBuoi,
                bh.MaLHP,
                mh.TenMon,
                bh.NgayHoc,
                bh.GioBatDau,
                (SELECT COUNT(*) FROM dbo.DangKyHoc dk WHERE dk.MaLHP = bh.MaLHP) AS TongDK,
                COUNT(dd.MaDiemDanh) AS SoQuet,
                SUM(CASE WHEN dd.TrangThai IN (N'Đúng giờ', N'Có mặt') THEN 1 ELSE 0 END) AS DungGio,
                SUM(CASE WHEN dd.TrangThai = N'Trễ' THEN 1 ELSE 0 END) AS Tre
            FROM dbo.BuoiHoc bh
            JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            JOIN dbo.MonHoc mh ON lhp.MaMon = mh.MaMon
            LEFT JOIN dbo.DiemDanh dd ON dd.MaBuoi = bh.MaBuoi
            WHERE bh.NgayHoc >= DATEADD(day, -?, CAST(GETDATE() AS DATE))
              AND bh.NgayHoc <= CAST(GETDATE() AS DATE)
            GROUP BY bh.MaBuoi, bh.MaLHP, mh.TenMon, bh.NgayHoc, bh.GioBatDau
            ORDER BY bh.NgayHoc DESC, bh.GioBatDau DESC
            """,
            (days,),
        )
        out = []
        for row in cursor.fetchall():
            gio = row[4]
            if gio and not isinstance(gio, str):
                gio = gio.strftime("%H:%M:%S")
            tong = int(row[5] or 0)
            quet = int(row[6] or 0)
            dg = int(row[7] or 0)
            tr = int(row[8] or 0)
            vang = max(0, tong - quet)
            out.append(
                {
                    "ma_buoi": row[0],
                    "ma_lhp": (row[1] or "").strip(),
                    "ten_mon": row[2],
                    "ngay_hoc": row[3].isoformat() if row[3] else None,
                    "gio_bat_dau": gio,
                    "tong_sv_dang_ky": tong,
                    "so_luot_quet": quet,
                    "dung_gio": dg,
                    "tre": tr,
                    "vang_uoc": vang,
                }
            )
        return out
    finally:
        cursor.close()
        conn.close()


@app.get("/api/analytics/dashboard")
async def get_dashboard_stats():
    """Lấy thống kê tổng quan cho dashboard"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Tổng số sinh viên đang học
        cursor.execute("""
            SELECT COUNT(*) FROM SinhVien 
            WHERE TrangThai = N'Đang học'
        """)
        total_students = cursor.fetchone()[0]
        
        # Số buổi học hôm nay
        cursor.execute("""
            SELECT COUNT(*) FROM BuoiHoc 
            WHERE NgayHoc = CAST(GETDATE() AS DATE)
        """)
        today_sessions = cursor.fetchone()[0]
        
        # Số lượt điểm danh hôm nay
        cursor.execute("""
            SELECT COUNT(*) FROM DiemDanh dd
            JOIN BuoiHoc bh ON dd.MaBuoi = bh.MaBuoi
            WHERE bh.NgayHoc = CAST(GETDATE() AS DATE)
        """)
        today_attendance = cursor.fetchone()[0]
        
        # Tỷ lệ đi trễ hôm nay
        cursor.execute("""
            SELECT 
                ISNULL(
                    CAST(COUNT(CASE WHEN dd.TrangThai = N'Trễ' THEN 1 END) AS FLOAT) * 100.0 / 
                    NULLIF(COUNT(*), 0), 
                    0
                ) AS TyLeTre
            FROM DiemDanh dd
            JOIN BuoiHoc bh ON dd.MaBuoi = bh.MaBuoi
            WHERE bh.NgayHoc = CAST(GETDATE() AS DATE)
        """)
        late_rate = cursor.fetchone()[0] or 0
        
        return {
            "total_students": total_students,
            "today_sessions": today_sessions,
            "today_attendance": today_attendance,
            "late_rate": float(late_rate)
        }
        
    finally:
        cursor.close()
        conn.close()


@app.get("/api/analytics/attendance-trend")
async def get_attendance_trend(days: int = 7):
    """Lấy xu hướng điểm danh theo ngày"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT 
                CAST(bh.NgayHoc AS DATE) AS Ngay,
                COUNT(DISTINCT CASE WHEN dd.TrangThai IN (N'Đúng giờ', N'Có mặt') THEN dd.MaDiemDanh END) AS CoMat,
                COUNT(DISTINCT CASE WHEN dd.TrangThai = N'Trễ' THEN dd.MaDiemDanh END) AS Tre,
                COUNT(DISTINCT bh.MaBuoi) AS TongBuoi
            FROM BuoiHoc bh
            LEFT JOIN DiemDanh dd ON bh.MaBuoi = dd.MaBuoi
            WHERE bh.NgayHoc >= DATEADD(day, ?, CAST(GETDATE() AS DATE))
                AND bh.NgayHoc <= CAST(GETDATE() AS DATE)
            GROUP BY CAST(bh.NgayHoc AS DATE)
            ORDER BY Ngay
        """, (-days,))
        
        rows = cursor.fetchall()
        
        result = []
        for row in rows:
            ngay = row[0].strftime("%d/%m") if row[0] else ""
            result.append({
                "name": ngay,
                "coMat": row[1],
                "tre": row[2],
                "vang": 0  # Có thể tính toán nếu cần
            })
        
        return result
        
    finally:
        cursor.close()
        conn.close()


@app.get("/api/analytics/status-distribution")
async def get_status_distribution():
    """Phân bố trạng thái điểm danh"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT 
                dd.TrangThai,
                COUNT(*) AS SoLuong
            FROM DiemDanh dd
            JOIN BuoiHoc bh ON dd.MaBuoi = bh.MaBuoi
            WHERE bh.NgayHoc >= DATEADD(day, -7, GETDATE())
            GROUP BY dd.TrangThai
        """)
        
        rows = cursor.fetchall()
        
        result = []
        for row in rows:
            result.append({
                "name": row[0],
                "value": row[1]
            })
        
        return result
        
    finally:
        cursor.close()
        conn.close()


@app.get("/api/analytics/top-students")
async def get_top_students(limit: int = 5):
    """Lấy danh sách sinh viên xuất sắc"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT TOP (?) 
                sv.MaSV,
                sv.HoTen,
                COUNT(DISTINCT dd.MaBuoi) AS SoBuoiCoMat,
                COUNT(DISTINCT bh.MaBuoi) AS TongBuoi,
                CAST(COUNT(DISTINCT dd.MaBuoi) * 100.0 / 
                     NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) AS TyLe
            FROM SinhVien sv
            JOIN DangKyHoc dk ON sv.MaSV = dk.MaSV
            JOIN LopHocPhan lhp ON dk.MaLHP = lhp.MaLHP
            JOIN BuoiHoc bh ON lhp.MaLHP = bh.MaLHP
            LEFT JOIN DiemDanh dd ON dd.MaSV = sv.MaSV AND dd.MaBuoi = bh.MaBuoi
            WHERE sv.TrangThai = N'Đang học'
            GROUP BY sv.MaSV, sv.HoTen
            HAVING COUNT(DISTINCT bh.MaBuoi) > 0
            ORDER BY TyLe DESC, SoBuoiCoMat DESC
        """, (limit,))
        
        rows = cursor.fetchall()
        
        result = []
        for row in rows:
            result.append({
                "ma_sv": row[0],
                "ho_ten": row[1],
                "so_buoi": f"{row[2]}/{row[3]}",
                "ty_le": float(row[4]) if row[4] else 0
            })
        
        return result
        
    finally:
        cursor.close()
        conn.close()


@app.get("/api/analytics/at-risk-students")
async def get_at_risk_students():
    """Lấy danh sách sinh viên nguy cơ"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT 
                sv.MaSV,
                sv.HoTen,
                COUNT(DISTINCT dd.MaBuoi) AS SoBuoiCoMat,
                COUNT(DISTINCT bh.MaBuoi) AS TongBuoi,
                CAST(COUNT(DISTINCT dd.MaBuoi) * 100.0 / 
                     NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) AS TyLe,
                CASE 
                    WHEN CAST(COUNT(DISTINCT dd.MaBuoi) * 100.0 / 
                         NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) < 60 
                    THEN N'Nguy cơ cao'
                    WHEN CAST(COUNT(DISTINCT dd.MaBuoi) * 100.0 / 
                         NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) < 80 
                    THEN N'Cảnh báo'
                    ELSE N'Bình thường'
                END AS KetLuan
            FROM SinhVien sv
            JOIN DangKyHoc dk ON sv.MaSV = dk.MaSV
            JOIN LopHocPhan lhp ON dk.MaLHP = lhp.MaLHP
            JOIN BuoiHoc bh ON lhp.MaLHP = bh.MaLHP
            LEFT JOIN DiemDanh dd ON dd.MaSV = sv.MaSV AND dd.MaBuoi = bh.MaBuoi
            WHERE sv.TrangThai = N'Đang học'
            GROUP BY sv.MaSV, sv.HoTen
            HAVING CAST(COUNT(DISTINCT dd.MaBuoi) * 100.0 / 
                   NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) < 80
            ORDER BY TyLe ASC
        """)
        
        rows = cursor.fetchall()
        
        result = []
        for row in rows:
            result.append({
                "ma_sv": row[0],
                "ho_ten": row[1],
                "so_buoi": f"{row[2]}/{row[3]}",
                "ty_le": float(row[4]) if row[4] else 0,
                "ket_luan": row[5]
            })
        
        return result
        
    finally:
        cursor.close()
        conn.close()


@app.get("/api/analytics/class-comparison")
async def get_class_comparison():
    """So sánh chuyên cần giữa các lớp"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT 
                sv.Lop,
                COUNT(DISTINCT dd.MaBuoi) AS SoBuoiCoMat,
                COUNT(DISTINCT bh.MaBuoi) AS TongBuoi,
                CAST(COUNT(DISTINCT dd.MaBuoi) * 100.0 / 
                     NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) AS TyLe
            FROM SinhVien sv
            JOIN DangKyHoc dk ON sv.MaSV = dk.MaSV
            JOIN LopHocPhan lhp ON dk.MaLHP = lhp.MaLHP
            JOIN BuoiHoc bh ON lhp.MaLHP = bh.MaLHP
            LEFT JOIN DiemDanh dd ON dd.MaSV = sv.MaSV AND dd.MaBuoi = bh.MaBuoi
            WHERE sv.TrangThai = N'Đang học' AND sv.Lop IS NOT NULL
            GROUP BY sv.Lop
            HAVING COUNT(DISTINCT bh.MaBuoi) > 0
            ORDER BY TyLe DESC
        """)
        
        rows = cursor.fetchall()
        
        result = []
        for row in rows:
            result.append({
                "lop": row[0],
                "tyLe": float(row[3]) if row[3] else 0
            })
        
        return result
        
    finally:
        cursor.close()
        conn.close()


@app.get("/api/analytics/student/{ma_sv}")
async def get_student_analytics(ma_sv: str):
    """Lấy phân tích chi tiết cho 1 sinh viên"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT * FROM VW_DieuKienDuThi 
            WHERE MaSV = ?
        """, (ma_sv,))
        
        stats = []
        for row in cursor.fetchall():
            stats.append({
                "ma_sv": row[0],
                "ho_ten": row[1],
                "ma_lhp": row[2],
                "so_buoi_co_mat": row[3],
                "tong_buoi": row[4],
                "ty_le_chuyen_can": float(row[5]),
                "ket_luan": row[6]
            })
        
        return stats
        
    finally:
        cursor.close()
        conn.close()


@app.get("/api/analytics/recent-activities")
async def get_recent_activities(limit: int = 10):
    """Lấy hoạt động điểm danh gần đây"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT TOP (?)
                dd.MaDiemDanh,
                sv.MaSV,
                sv.HoTen,
                dd.ThoiGianQuet,
                dd.TrangThai,
                mh.TenMon,
                bh.NgayHoc
            FROM DiemDanh dd
            JOIN SinhVien sv ON dd.MaSV = sv.MaSV
            JOIN BuoiHoc bh ON dd.MaBuoi = bh.MaBuoi
            JOIN LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            JOIN MonHoc mh ON lhp.MaMon = mh.MaMon
            ORDER BY dd.ThoiGianQuet DESC
        """, (limit,))
        
        rows = cursor.fetchall()
        
        result = []
        for row in rows:
            result.append({
                "ma_diem_danh": row[0],
                "ma_sv": row[1],
                "ho_ten": row[2],
                "thoi_gian": row[3].isoformat() if row[3] else None,
                "trang_thai": row[4],
                "mon_hoc": row[5],
                "ngay_hoc": row[6].isoformat() if row[6] else None
            })
        
        return result
        
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    import socket
    import sys
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    # Kiểm tra cổng trước khi load — tránh log lỗi 10048 khó hiểu
    test = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        test.bind(("0.0.0.0", port))
    except OSError as e:
        test.close()
        print("\n" + "=" * 60)
        print("❌ KHÔNG THỂ MỞ CỔNG", port, f"({e.winerror if hasattr(e, 'winerror') else e})")
        print("=" * 60)
        print("Nguyên nhân: cổng đã có process khác đang dùng (thường là backend đã chạy sẵn).")
        print("")
        print("Cách xử lý:")
        print("  1) Nếu API đã chạy — KHÔNG cần mở thêm: mở http://localhost:8000/docs kiểm tra.")
        print("  2) Muốn chạy lại — tắt process cũ (PowerShell):")
        print(f"     netstat -ano | findstr :{port}")
        print("     taskkill /PID <số_PID_cột_cuối> /F")
        print(f"  3) Hoặc chạy cổng khác (nhớ set frontend REACT_APP_API_URL cho đúng cổng):")
        print(f"     set PORT=8001 && python main.py")
        print("=" * 60 + "\n")
        sys.exit(1)
    test.close()

    print("\n" + "=" * 60)
    print("🚀 SMART ATTENDANCE AI - COMPLETE SYSTEM")
    print("=" * 60)
    print(f"📍 Server: http://localhost:{port}")
    print(f"📚 Docs: http://localhost:{port}/docs")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=port)