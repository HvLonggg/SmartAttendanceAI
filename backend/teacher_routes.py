"""
API dành cho giảng viên: lớp được phân công, CRUD buổi học, danh sách SV lớp mình, thống kê phạm vi lớp.
"""
from datetime import datetime, date, time, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, validator

from database.db_connection import get_connection
from auth_routes import require_role


teacher_router = APIRouter(tags=["teacher"])


def _ma_gv_from_auth(current: Dict[str, Any]) -> str:
    mgv = (current.get("ma_gv") or "").strip()
    if not mgv:
        raise HTTPException(status_code=400, detail="Tài khoản giảng viên chưa gắn MaGV")
    return mgv


def ensure_buoi_hoc_extra_columns() -> None:
    """Bổ sung cột mã xác thực buổi học + thời gian điểm danh (nếu chưa có)."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            IF COL_LENGTH('dbo.BuoiHoc', 'MaXacThucBuoi') IS NULL
                ALTER TABLE dbo.BuoiHoc ADD MaXacThucBuoi NVARCHAR(64) NULL;
            """
        )
        cur.execute(
            """
            IF COL_LENGTH('dbo.BuoiHoc', 'PhutHetHanDungGio') IS NULL
                ALTER TABLE dbo.BuoiHoc ADD PhutHetHanDungGio INT NULL;
            """
        )
        cur.execute(
            """
            IF COL_LENGTH('dbo.BuoiHoc', 'PhutHetHanDiemDanh') IS NULL
                ALTER TABLE dbo.BuoiHoc ADD PhutHetHanDiemDanh INT NULL;
            """
        )
        cur.execute(
            """
            UPDATE dbo.BuoiHoc
            SET PhutHetHanDungGio = COALESCE(PhutHetHanDungGio, 15),
                PhutHetHanDiemDanh = COALESCE(PhutHetHanDiemDanh, 60)
            WHERE PhutHetHanDungGio IS NULL OR PhutHetHanDiemDanh IS NULL;
            """
        )
        cur.execute(
            """
            IF COL_LENGTH('dbo.BuoiHoc', 'MaXacThucBuoi') IS NOT NULL
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'UX_BuoiHoc_MaXacThucBuoi' AND object_id = OBJECT_ID(N'dbo.BuoiHoc')
                )
                BEGIN
                    DECLARE @fd_ux_buoi nvarchar(max);
                    SELECT @fd_ux_buoi = filter_definition FROM sys.indexes
                    WHERE name = N'UX_BuoiHoc_MaXacThucBuoi' AND object_id = OBJECT_ID(N'dbo.BuoiHoc');
                    IF @fd_ux_buoi LIKE N'%LTRIM%' OR @fd_ux_buoi LIKE N'%RTRIM%'
                        DROP INDEX UX_BuoiHoc_MaXacThucBuoi ON dbo.BuoiHoc;
                END
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'UX_BuoiHoc_MaXacThucBuoi' AND object_id = OBJECT_ID(N'dbo.BuoiHoc')
                )
                BEGIN
                    CREATE UNIQUE INDEX UX_BuoiHoc_MaXacThucBuoi ON dbo.BuoiHoc(MaXacThucBuoi)
                    WHERE MaXacThucBuoi IS NOT NULL;
                END
            END
            """
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def ensure_diem_danh_capture_column() -> None:
    """Lưu tên file ảnh chụp lúc điểm danh (nếu có)."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            IF COL_LENGTH('dbo.DiemDanh', 'AnhDiemDanh') IS NULL
                ALTER TABLE dbo.DiemDanh ADD AnhDiemDanh NVARCHAR(500) NULL;
            """
        )
        cur.execute(
            """
            IF COL_LENGTH('dbo.DiemDanh', 'LyDoDiemDanhThuCong') IS NULL
                ALTER TABLE dbo.DiemDanh ADD LyDoDiemDanhThuCong NVARCHAR(255) NULL;
            """
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def _ma_xac_thuc_buoi_format_ok(s: str) -> bool:
    """Phần đầu là chữ cái (Unicode), phần sau chỉ là số; tổng 4–64 ký tự (VD: HL0234)."""
    if len(s) < 4 or len(s) > 64:
        return False
    i = 0
    n = len(s)
    while i < n and s[i].isalpha():
        i += 1
    if i == 0 or i >= n:
        return False
    return s[i:].isdigit()


class TeacherSessionCreate(BaseModel):
    ma_lhp: str
    ngay_hoc: date
    gio_bat_dau: str  # "HH:MM" hoặc "HH:MM:SS"
    ma_xac_thuc_buoi: str = Field(..., max_length=64)
    phut_het_han_dung_gio: int = Field(15, ge=1, le=120)
    phut_het_han_diem_danh: int = Field(60, ge=1, le=600)

    @validator("ma_xac_thuc_buoi")
    def validate_ma_xac_thuc_buoi(cls, v: str) -> str:
        s = (v or "").strip()
        if not _ma_xac_thuc_buoi_format_ok(s):
            raise ValueError(
                "Mã buổi học: phần đầu là chữ cái, phần sau chỉ là số; tối thiểu 4 ký tự, tối đa 64 (VD: HL0234)."
            )
        return s


class TeacherSessionUpdate(BaseModel):
    ngay_hoc: Optional[date] = None
    gio_bat_dau: Optional[str] = None
    ma_xac_thuc_buoi: Optional[str] = None
    phut_het_han_dung_gio: Optional[int] = None
    phut_het_han_diem_danh: Optional[int] = None

    @validator("ma_xac_thuc_buoi")
    def validate_ma_xac_thuc_buoi_patch(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        s = v.strip()
        if s == "":
            return None
        if not _ma_xac_thuc_buoi_format_ok(s):
            raise ValueError(
                "Mã buổi học: phần đầu là chữ cái, phần sau chỉ là số; tối thiểu 4 ký tự (VD: HL0234)."
            )
        return s


class TeacherManualAttendanceItem(BaseModel):
    ma_sv: str
    trang_thai: str = Field(..., max_length=20)
    ly_do: Optional[str] = Field(None, max_length=255)

    @validator("ma_sv")
    def validate_ma_sv(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("Mã sinh viên không được để trống")
        return s

    @validator("trang_thai")
    def validate_trang_thai(cls, v: str) -> str:
        s = (v or "").strip()
        allowed = {"Vắng", "Đúng giờ", "Trễ", "Có mặt"}
        if s not in allowed:
            raise ValueError("Trạng thái không hợp lệ")
        return s

    @validator("ly_do")
    def validate_ly_do(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        return s or None


class TeacherManualAttendanceBulk(BaseModel):
    items: List[TeacherManualAttendanceItem]

    @validator("items")
    def validate_items(cls, v: List[TeacherManualAttendanceItem]) -> List[TeacherManualAttendanceItem]:
        if not v:
            raise ValueError("Danh sách cập nhật trống")
        return v


def _parse_time(s: str) -> time:
    s = (s or "").strip()
    if not s:
        raise HTTPException(status_code=400, detail="Giờ bắt đầu không hợp lệ (định dạng 24h HH:MM)")
    try:
        if len(s.split(":")) == 2:
            hh, mm = s.split(":")
            return time(int(hh), int(mm), 0)
        if len(s.split(":")) == 3:
            hh, mm, ss = s.split(":")
            return time(int(hh), int(mm), int(ss))
    except Exception:
        pass
    raise HTTPException(status_code=400, detail="Giờ bắt đầu không hợp lệ (định dạng 24h HH:MM)")


def _to_hhmmss(t: time) -> str:
    return t.strftime("%H:%M:%S")


def _validate_session_time_window(cursor, ngay_hoc: date, gio_bat_dau: time) -> None:
    """
    Kiểm tra cửa sổ thời gian theo giờ DB (GETDATE):
    - Không trong quá khứ
    - Không vượt quá 3 tháng kể từ hiện tại
    """
    cursor.execute(
        """
        SELECT
            CASE
                WHEN CAST(? AS DATETIME) + CAST(? AS DATETIME) < GETDATE() THEN 1
                ELSE 0
            END AS IsPast,
            CASE
                WHEN CAST(? AS DATETIME) + CAST(? AS DATETIME) > DATEADD(MONTH, 3, GETDATE()) THEN 1
                ELSE 0
            END AS IsTooFar
        """,
        (ngay_hoc, gio_bat_dau, ngay_hoc, gio_bat_dau),
    )
    row = cursor.fetchone()
    is_past = int(row[0] or 0) if row else 0
    is_too_far = int(row[1] or 0) if row else 0
    if is_past:
        raise HTTPException(
            status_code=400,
            detail="Không được tạo buổi học trong quá khứ. Chỉ được tạo từ thời điểm hiện tại trở đi.",
        )
    if is_too_far:
        raise HTTPException(
            status_code=400,
            detail="Không được tạo/cập nhật buổi học vượt quá 3 tháng kể từ hiện tại.",
        )


def _teacher_has_conflict_session(
    cursor,
    ma_gv: str,
    ngay_hoc: date,
    gio_bat_dau: time,
    exclude_ma_buoi: Optional[int] = None,
) -> bool:
    """
    Một buổi học kéo dài cố định 2h30.
    Chặn giảng viên tạo/sửa buổi mới nếu trùng khoảng thời gian với buổi đã có trong ngày.
    """
    cursor.execute(
        """
        SELECT COUNT(*)
        FROM dbo.BuoiHoc bh
        JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
        WHERE bh.NgayHoc = ?
          AND LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(?))
          AND (? IS NULL OR bh.MaBuoi <> ?)
          -- overlap với phiên mới [gio_bat_dau, gio_bat_dau+150p)
          AND (
                CAST(bh.GioBatDau AS DATETIME) < DATEADD(MINUTE, 150, CAST(? AS DATETIME))
            AND DATEADD(MINUTE, 150, CAST(bh.GioBatDau AS DATETIME)) > CAST(? AS DATETIME)
          )
        """,
        (ngay_hoc, ma_gv, exclude_ma_buoi, exclude_ma_buoi, gio_bat_dau, gio_bat_dau),
    )
    return int(cursor.fetchone()[0] or 0) > 0


def _teacher_owns_lhp(cursor, ma_gv: str, ma_lhp: str) -> bool:
    cursor.execute(
        """
        SELECT COUNT(*) FROM dbo.LopHocPhan
        WHERE LTRIM(RTRIM(MaLHP)) = LTRIM(RTRIM(?))
          AND LTRIM(RTRIM(ISNULL(MaGV,''))) = LTRIM(RTRIM(?))
        """,
        (ma_lhp, ma_gv),
    )
    return cursor.fetchone()[0] > 0


def _teacher_owns_buoi(cursor, ma_gv: str, ma_buoi: int) -> bool:
    cursor.execute(
        """
        SELECT COUNT(*)
        FROM dbo.BuoiHoc bh
        JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
        WHERE bh.MaBuoi = ?
          AND LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(?))
        """,
        (ma_buoi, ma_gv),
    )
    return cursor.fetchone()[0] > 0


@teacher_router.get("/my-classes")
async def teacher_my_classes(current=Depends(require_role("TEACHER"))):
    ma_gv = _ma_gv_from_auth(current)
    conn = get_connection()
    cur = conn.cursor()
    try:
        sql_full = """
            SELECT lhp.MaLHP, mh.TenMon, lhp.GiangVien, lhp.MaGV,
                   lhp.MaKhoa, k.TenKhoa, mh.ChuyenNganh
            FROM dbo.LopHocPhan lhp
            JOIN dbo.MonHoc mh ON lhp.MaMon = mh.MaMon
            LEFT JOIN dbo.Khoa k ON k.MaKhoa = COALESCE(lhp.MaKhoa, mh.MaKhoa)
            WHERE LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(?))
            ORDER BY lhp.MaLHP
            """
        sql_basic = """
            SELECT lhp.MaLHP, mh.TenMon, lhp.GiangVien, lhp.MaGV
            FROM dbo.LopHocPhan lhp
            JOIN dbo.MonHoc mh ON lhp.MaMon = mh.MaMon
            WHERE LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(?))
            ORDER BY lhp.MaLHP
            """
        try:
            cur.execute(sql_full, (ma_gv,))
            rows = cur.fetchall()
            return [
                {
                    "ma_lhp": r[0],
                    "ten_mon": r[1],
                    "giang_vien": r[2],
                    "ma_gv": r[3],
                    "ma_khoa": (r[4] or "").strip() or None,
                    "ten_khoa": (r[5] or "").strip() or None,
                    "chuyen_nganh": (r[6] or "").strip() or None,
                }
                for r in rows
            ]
        except Exception:
            cur.execute(sql_basic, (ma_gv,))
            rows = cur.fetchall()
            return [
                {
                    "ma_lhp": r[0],
                    "ten_mon": r[1],
                    "giang_vien": r[2],
                    "ma_gv": r[3],
                    "ma_khoa": None,
                    "ten_khoa": None,
                    "chuyen_nganh": None,
                }
                for r in rows
            ]
    finally:
        cur.close()
        conn.close()


@teacher_router.get("/career-history")
async def teacher_career_history(current=Depends(require_role("TEACHER"))):
    """
    Lịch sử công tác: ngày đăng ký TK, hồ sơ GV, khoa, danh sách lớp học phần được phân công + số buổi đã tạo.
    """
    ma_gv = _ma_gv_from_auth(current)
    uid = current["uid"]
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT nd.CreatedAt, gv.CreatedAt, gv.MaKhoa, k.TenKhoa, gv.HoTen
            FROM dbo.NguoiDung nd
            LEFT JOIN dbo.GiangVien gv ON LTRIM(RTRIM(gv.MaGV)) = LTRIM(RTRIM(?))
            LEFT JOIN dbo.Khoa k ON k.MaKhoa = COALESCE(gv.MaKhoa, nd.MaKhoa)
            WHERE nd.Id = ?
            """,
            (ma_gv, uid),
        )
        row = cur.fetchone()
        ngay_dk = row[0].isoformat() if row and row[0] else None
        ngay_hs = row[1].isoformat() if row and row[1] else None
        ma_khoa = (row[2] or "").strip() or None if row else None
        ten_khoa = (row[3] or "").strip() or None if row else None
        ho_ten_gv = (row[4] or "").strip() or None if row else None

        lop_list: List[Dict[str, Any]] = []
        try:
            cur.execute(
                """
                SELECT
                    lhp.MaLHP,
                    mh.TenMon,
                    mh.MaMon,
                    COALESCE(lhp.MaKhoa, mh.MaKhoa) AS MaKhoaLop,
                    kk.TenKhoa,
                    (SELECT COUNT(*) FROM dbo.BuoiHoc bh WHERE bh.MaLHP = lhp.MaLHP) AS SoBuoiDaTao
                FROM dbo.LopHocPhan lhp
                INNER JOIN dbo.MonHoc mh ON lhp.MaMon = mh.MaMon
                LEFT JOIN dbo.Khoa kk ON kk.MaKhoa = COALESCE(lhp.MaKhoa, mh.MaKhoa)
                WHERE LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(?))
                ORDER BY lhp.MaLHP
                """,
                (ma_gv,),
            )
            for r in cur.fetchall():
                lop_list.append(
                    {
                        "ma_lhp": r[0],
                        "ten_mon": r[1],
                        "ma_mon": r[2],
                        "ma_khoa": (r[3] or "").strip() or None,
                        "ten_khoa": (r[4] or "").strip() or None,
                        "so_buoi_da_tao": int(r[5] or 0),
                    }
                )
        except Exception:
            cur.execute(
                """
                SELECT lhp.MaLHP, mh.TenMon, mh.MaMon,
                    (SELECT COUNT(*) FROM dbo.BuoiHoc bh WHERE bh.MaLHP = lhp.MaLHP) AS SoBuoiDaTao
                FROM dbo.LopHocPhan lhp
                INNER JOIN dbo.MonHoc mh ON lhp.MaMon = mh.MaMon
                WHERE LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(?))
                ORDER BY lhp.MaLHP
                """,
                (ma_gv,),
            )
            for r in cur.fetchall():
                lop_list.append(
                    {
                        "ma_lhp": r[0],
                        "ten_mon": r[1],
                        "ma_mon": r[2],
                        "ma_khoa": None,
                        "ten_khoa": None,
                        "so_buoi_da_tao": int(r[3] or 0),
                    }
                )

        return {
            "ho_ten": ho_ten_gv,
            "ma_gv": ma_gv,
            "ma_khoa": ma_khoa,
            "ten_khoa": ten_khoa,
            "ngay_dang_ky_tai_khoan": ngay_dk,
            "ngay_ho_so_giang_vien": ngay_hs,
            "ngay_bat_dau_cong_tac": ngay_hs or ngay_dk,
            "lop_hoc_phan": lop_list,
            "tong_lop": len(lop_list),
            "tong_buoi_da_tao": sum(x["so_buoi_da_tao"] for x in lop_list),
        }
    finally:
        cur.close()
        conn.close()


@teacher_router.get("/sessions")
async def teacher_list_sessions(current=Depends(require_role("TEACHER")), limit: int = 500):
    ma_gv = _ma_gv_from_auth(current)
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT TOP (?)
                bh.MaBuoi, bh.MaLHP, bh.NgayHoc, bh.GioBatDau,
                bh.MaXacThucBuoi, bh.PhutHetHanDungGio, bh.PhutHetHanDiemDanh,
                mh.TenMon, lhp.GiangVien,
                (SELECT COUNT(*) FROM dbo.DangKyHoc dk WHERE dk.MaLHP = bh.MaLHP) AS SoSVDangKy,
                (SELECT COUNT(*) FROM dbo.DiemDanh dd WHERE dd.MaBuoi = bh.MaBuoi) AS SoLuotDiemDanh
            FROM dbo.BuoiHoc bh
            JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            JOIN dbo.MonHoc mh ON lhp.MaMon = mh.MaMon
            WHERE LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(?))
            ORDER BY bh.MaBuoi DESC, bh.NgayHoc DESC, bh.GioBatDau DESC
            """,
            (limit, ma_gv),
        )
        out = []
        for row in cur.fetchall():
            gio = row[3]
            if gio and not isinstance(gio, str):
                gio = gio.strftime("%H:%M:%S")
            ngay = row[2].isoformat() if row[2] else None
            out.append(
                {
                    "ma_buoi": row[0],
                    "ma_lhp": row[1],
                    "ngay_hoc": ngay,
                    "gio_bat_dau": gio,
                    "ma_xac_thuc_buoi": (row[4] or "").strip() or None,
                    "phut_het_han_dung_gio": row[5],
                    "phut_het_han_diem_danh": row[6],
                    "ten_mon": row[7],
                    "giang_vien": row[8],
                    "so_sv_dang_ky": int(row[9] or 0),
                    "so_luot_diem_danh": int(row[10] or 0),
                }
            )
        return out
    finally:
        cur.close()
        conn.close()


@teacher_router.post("/sessions")
async def teacher_create_session(body: TeacherSessionCreate, current=Depends(require_role("TEACHER"))):
    ma_gv = _ma_gv_from_auth(current)
    ma_lhp = body.ma_lhp.strip()
    code = body.ma_xac_thuc_buoi

    gio = _parse_time(body.gio_bat_dau)

    conn = get_connection()
    cur = conn.cursor()
    try:
        if not _teacher_owns_lhp(cur, ma_gv, ma_lhp):
            raise HTTPException(status_code=403, detail="Bạn không được phân công lớp học phần này")
        _validate_session_time_window(cur, body.ngay_hoc, gio)
        if _teacher_has_conflict_session(cur, ma_gv, body.ngay_hoc, gio):
            raise HTTPException(
                status_code=400,
                detail="Trùng lịch: mỗi buổi kéo dài 2 giờ 30 phút. Bạn không thể tạo buổi mới khi buổi cũ còn trong giờ học.",
            )

        cur.execute(
            "SELECT COUNT(*) FROM dbo.BuoiHoc WHERE LTRIM(RTRIM(MaXacThucBuoi)) = LTRIM(RTRIM(?))",
            (code,),
        )
        if cur.fetchone()[0] > 0:
            raise HTTPException(status_code=400, detail="Mã buổi học đã tồn tại, hãy chọn mã khác")

        cur.execute(
            """
            INSERT INTO dbo.BuoiHoc (MaLHP, NgayHoc, GioBatDau, MaXacThucBuoi, PhutHetHanDungGio, PhutHetHanDiemDanh)
            OUTPUT INSERTED.MaBuoi
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                ma_lhp,
                body.ngay_hoc,
                gio,
                code,
                body.phut_het_han_dung_gio,
                body.phut_het_han_diem_danh,
            ),
        )
        row_out = cur.fetchone()
        raw_id = row_out[0] if row_out else None
        if raw_id is None:
            conn.rollback()
            raise HTTPException(
                status_code=500,
                detail="Không lấy được mã buổi học sau khi tạo. Kiểm tra cột MaBuoi bảng BuoiHoc (IDENTITY hoặc DEFAULT).",
            )
        new_id = int(raw_id)
        # Safety: nếu DB tái sử dụng MaBuoi (legacy/seed data), xóa sạch vết điểm danh cũ.
        cur.execute("DELETE FROM dbo.DiemDanh WHERE MaBuoi = ?", (new_id,))
        conn.commit()
        return {"success": True, "ma_buoi": new_id, "message": "Đã tạo buổi học"}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@teacher_router.patch("/sessions/{ma_buoi}")
async def teacher_update_session(
    ma_buoi: int, body: TeacherSessionUpdate, current=Depends(require_role("TEACHER"))
):
    ma_gv = _ma_gv_from_auth(current)
    conn = get_connection()
    cur = conn.cursor()
    try:
        if not _teacher_owns_buoi(cur, ma_gv, ma_buoi):
            raise HTTPException(status_code=404, detail="Không tìm thấy buổi học hoặc không thuộc phân công của bạn")

        fields = []
        params: List[Any] = []

        cur.execute("SELECT NgayHoc, GioBatDau FROM dbo.BuoiHoc WHERE MaBuoi = ?", (ma_buoi,))
        old_row = cur.fetchone()
        if not old_row:
            raise HTTPException(status_code=404, detail="Không tìm thấy buổi học")
        old_ngay = old_row[0]
        old_gio = old_row[1]
        target_ngay = body.ngay_hoc if body.ngay_hoc is not None else old_ngay
        target_gio = _parse_time(body.gio_bat_dau) if body.gio_bat_dau is not None else old_gio
        if isinstance(target_gio, str):
            target_gio = _parse_time(target_gio)
        _validate_session_time_window(cur, target_ngay, target_gio)
        if _teacher_has_conflict_session(cur, ma_gv, target_ngay, target_gio, exclude_ma_buoi=ma_buoi):
            raise HTTPException(
                status_code=400,
                detail="Trùng lịch: mỗi buổi kéo dài 2 giờ 30 phút. Không thể cập nhật vào khung giờ đang bị chồng lấn.",
            )

        if body.ngay_hoc is not None:
            fields.append("NgayHoc = ?")
            params.append(body.ngay_hoc)
        if body.gio_bat_dau is not None:
            fields.append("GioBatDau = ?")
            params.append(target_gio)
        if body.ma_xac_thuc_buoi is not None:
            code = body.ma_xac_thuc_buoi
            cur.execute(
                """
                SELECT COUNT(*) FROM dbo.BuoiHoc
                WHERE LTRIM(RTRIM(MaXacThucBuoi)) = LTRIM(RTRIM(?)) AND MaBuoi <> ?
                """,
                (code, ma_buoi),
            )
            if cur.fetchone()[0] > 0:
                raise HTTPException(status_code=400, detail="Mã buổi học đã được dùng")
            fields.append("MaXacThucBuoi = ?")
            params.append(code)
        if body.phut_het_han_dung_gio is not None:
            fields.append("PhutHetHanDungGio = ?")
            params.append(body.phut_het_han_dung_gio)
        if body.phut_het_han_diem_danh is not None:
            fields.append("PhutHetHanDiemDanh = ?")
            params.append(body.phut_het_han_diem_danh)

        if not fields:
            return {"success": True, "message": "Không có thay đổi"}

        params.append(ma_buoi)
        sql = f"UPDATE dbo.BuoiHoc SET {', '.join(fields)} WHERE MaBuoi = ?"
        cur.execute(sql, tuple(params))
        conn.commit()
        return {"success": True, "message": "Đã cập nhật buổi học"}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@teacher_router.delete("/sessions/{ma_buoi}")
async def teacher_delete_session(ma_buoi: int, current=Depends(require_role("TEACHER"))):
    ma_gv = _ma_gv_from_auth(current)
    conn = get_connection()
    cur = conn.cursor()
    try:
        if not _teacher_owns_buoi(cur, ma_gv, ma_buoi):
            raise HTTPException(status_code=404, detail="Không tìm thấy buổi học")

        cur.execute("SELECT COUNT(*) FROM dbo.DiemDanh WHERE MaBuoi = ?", (ma_buoi,))
        if cur.fetchone()[0] > 0:
            raise HTTPException(status_code=400, detail="Đã có điểm danh, không xóa được buổi học")

        cur.execute("DELETE FROM dbo.BuoiHoc WHERE MaBuoi = ?", (ma_buoi,))
        conn.commit()
        return {"success": True, "message": "Đã xóa buổi học"}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@teacher_router.get("/sessions/{ma_buoi}/attendance-list")
async def teacher_session_attendance_list(ma_buoi: int, current=Depends(require_role("TEACHER"))):
    ma_gv = _ma_gv_from_auth(current)
    conn = get_connection()
    cur = conn.cursor()
    try:
        if not _teacher_owns_buoi(cur, ma_gv, ma_buoi):
            raise HTTPException(status_code=404, detail="Không tìm thấy buổi học hoặc không thuộc phân công của bạn")

        cur.execute(
            """
            SELECT bh.MaLHP, mh.TenMon, bh.NgayHoc, bh.GioBatDau
            FROM dbo.BuoiHoc bh
            JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            JOIN dbo.MonHoc mh ON lhp.MaMon = mh.MaMon
            WHERE bh.MaBuoi = ?
            """,
            (ma_buoi,),
        )
        session_row = cur.fetchone()
        if not session_row:
            raise HTTPException(status_code=404, detail="Không tìm thấy buổi học")

        gio = session_row[3]
        if gio and not isinstance(gio, str):
            gio = gio.strftime("%H:%M:%S")
        ngay = session_row[2].isoformat() if session_row[2] else None

        cur.execute(
            """
            SELECT
                sv.MaSV,
                sv.HoTen,
                sv.Lop,
                NULLIF(LTRIM(RTRIM(sv.AnhDaiDien)), '') AS AnhDaiDien,
                dd.MaDiemDanh,
                dd.TrangThai,
                dd.NguonQuet,
                dd.ThoiGianQuet,
                dd.LyDoDiemDanhThuCong,
                dd.AnhDiemDanh
            FROM dbo.DangKyHoc dk
            JOIN dbo.SinhVien sv ON dk.MaSV = sv.MaSV
            OUTER APPLY (
                SELECT TOP 1
                    d.MaDiemDanh,
                    d.TrangThai,
                    d.NguonQuet,
                    d.ThoiGianQuet,
                    d.LyDoDiemDanhThuCong,
                    d.AnhDiemDanh
                FROM dbo.DiemDanh d
                WHERE d.MaBuoi = ?
                  AND LTRIM(RTRIM(d.MaSV)) = LTRIM(RTRIM(sv.MaSV))
                ORDER BY d.ThoiGianQuet DESC, d.MaDiemDanh DESC
            ) dd
            WHERE LTRIM(RTRIM(dk.MaLHP)) = LTRIM(RTRIM(?))
            ORDER BY sv.HoTen, sv.MaSV
            """,
            (ma_buoi, session_row[0]),
        )
        students: List[Dict[str, Any]] = []
        for r in cur.fetchall():
            ts = r[7]
            if ts is not None and hasattr(ts, "isoformat"):
                ts = ts.isoformat()
            students.append(
                {
                    "ma_sv": (r[0] or "").strip(),
                    "ho_ten": r[1],
                    "lop": r[2],
                    "anh_dai_dien": (r[3] or "").strip() if r[3] else None,
                    "ma_diem_danh": r[4],
                    "trang_thai": (r[5] or "").strip() if r[5] else None,
                    "nguon_quet": (r[6] or "").strip() if r[6] else None,
                    "thoi_gian_quet": ts,
                    "ly_do_thu_cong": (r[8] or "").strip() if r[8] else None,
                    "co_anh": bool((r[9] or "").strip()) if r[9] else False,
                }
            )

        return {
            "session": {
                "ma_buoi": ma_buoi,
                "ma_lhp": session_row[0],
                "ten_mon": session_row[1],
                "ngay_hoc": ngay,
                "gio_bat_dau": gio,
            },
            "students": students,
        }
    finally:
        cur.close()
        conn.close()


@teacher_router.post("/sessions/{ma_buoi}/manual-attendance")
async def teacher_manual_attendance_update(
    ma_buoi: int,
    body: TeacherManualAttendanceBulk,
    current=Depends(require_role("TEACHER")),
):
    ma_gv = _ma_gv_from_auth(current)
    conn = get_connection()
    cur = conn.cursor()
    try:
        if not _teacher_owns_buoi(cur, ma_gv, ma_buoi):
            raise HTTPException(status_code=404, detail="Không tìm thấy buổi học hoặc không thuộc phân công của bạn")

        cur.execute("SELECT MaLHP FROM dbo.BuoiHoc WHERE MaBuoi = ?", (ma_buoi,))
        row_lhp = cur.fetchone()
        if not row_lhp:
            raise HTTPException(status_code=404, detail="Không tìm thấy buổi học")
        ma_lhp = (row_lhp[0] or "").strip()

        updated = 0
        removed = 0
        for it in body.items:
            ma_sv = it.ma_sv.strip()
            trang_thai = it.trang_thai.strip()
            ly_do = it.ly_do

            cur.execute(
                """
                SELECT COUNT(*) FROM dbo.DangKyHoc
                WHERE LTRIM(RTRIM(MaLHP)) = LTRIM(RTRIM(?))
                  AND LTRIM(RTRIM(MaSV)) = LTRIM(RTRIM(?))
                """,
                (ma_lhp, ma_sv),
            )
            if int(cur.fetchone()[0] or 0) == 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Sinh viên {ma_sv} không thuộc lớp học phần của buổi này",
                )

            cur.execute(
                """
                SELECT TOP 1 MaDiemDanh FROM dbo.DiemDanh
                WHERE MaBuoi = ? AND LTRIM(RTRIM(MaSV)) = LTRIM(RTRIM(?))
                ORDER BY MaDiemDanh DESC
                """,
                (ma_buoi, ma_sv),
            )
            exist = cur.fetchone()

            if trang_thai == "Vắng":
                if exist:
                    cur.execute("DELETE FROM dbo.DiemDanh WHERE MaDiemDanh = ?", (exist[0],))
                    removed += 1
                continue

            if exist:
                cur.execute(
                    """
                    UPDATE dbo.DiemDanh
                    SET TrangThai = ?, NguonQuet = N'MANUAL_TEACHER', ThoiGianQuet = GETDATE(),
                        LyDoDiemDanhThuCong = ?
                    WHERE MaDiemDanh = ?
                    """,
                    (trang_thai, ly_do, exist[0]),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO dbo.DiemDanh
                        (MaSV, MaBuoi, ThoiGianQuet, TrangThai, NguonQuet, AnhDiemDanh, LyDoDiemDanhThuCong)
                    VALUES (?, ?, GETDATE(), ?, N'MANUAL_TEACHER', NULL, ?)
                    """,
                    (ma_sv, ma_buoi, trang_thai, ly_do),
                )
            updated += 1

        conn.commit()
        return {
            "success": True,
            "updated": updated,
            "removed": removed,
            "message": "Đã cập nhật điểm danh thủ công",
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@teacher_router.get("/my-students")
async def teacher_my_students(current=Depends(require_role("TEACHER"))):
    """Sinh viên đã đăng ký các LHP do GV này phụ trách."""
    ma_gv = _ma_gv_from_auth(current)
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT DISTINCT sv.MaSV, sv.HoTen, sv.NgaySinh, sv.GioiTinh, sv.Lop, sv.Khoa, sv.Email, sv.TrangThai,
                   sv.AnhDaiDien
            FROM dbo.SinhVien sv
            INNER JOIN dbo.DangKyHoc dk ON dk.MaSV = sv.MaSV
            INNER JOIN dbo.LopHocPhan lhp ON dk.MaLHP = lhp.MaLHP
            WHERE LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(?))
            ORDER BY sv.HoTen
            """,
            (ma_gv,),
        )
        out = []
        for r in cur.fetchall():
            ns = r[2]
            out.append(
                {
                    "ma_sv": r[0],
                    "ho_ten": r[1],
                    "ngay_sinh": ns.isoformat() if ns else None,
                    "gioi_tinh": r[3],
                    "lop": r[4],
                    "khoa": r[5],
                    "email": r[6],
                    "trang_thai": r[7],
                    "anh_dai_dien": (str(r[8]).strip() if r[8] else None),
                }
            )
        return out
    finally:
        cur.close()
        conn.close()


@teacher_router.get("/students-by-sessions")
async def teacher_students_by_sessions(
    days: int = 90,
    current=Depends(require_role("TEACHER")),
):
    """
    Sinh viên theo từng buổi học (lớp GV phụ trách): môn, ngày giờ buổi,
    trạng thái điểm danh, thời gian quét, có ảnh lưu hay không.
    """
    ma_gv = _ma_gv_from_auth(current)
    days = max(1, min(int(days or 90), 365))

    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT
                bh.MaBuoi,
                bh.MaLHP,
                bh.NgayHoc,
                bh.GioBatDau,
                mh.TenMon,
                sv.MaSV,
                sv.HoTen,
                sv.Lop,
                sv.AnhDaiDien,
                dd.MaDiemDanh,
                dd.ThoiGianQuet,
                dd.TrangThai,
                dd.AnhDiemDanh
            FROM dbo.BuoiHoc bh
            JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            JOIN dbo.MonHoc mh ON lhp.MaMon = mh.MaMon
            JOIN dbo.DangKyHoc dk ON dk.MaLHP = bh.MaLHP
            JOIN dbo.SinhVien sv ON sv.MaSV = dk.MaSV
            LEFT JOIN dbo.DiemDanh dd ON dd.MaBuoi = bh.MaBuoi AND dd.MaSV = sv.MaSV
            WHERE LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(?))
              AND bh.NgayHoc >= DATEADD(day, -?, CAST(GETDATE() AS DATE))
            ORDER BY bh.NgayHoc DESC, bh.GioBatDau DESC, sv.HoTen, sv.MaSV
            """,
            (ma_gv, days),
        )
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    sessions_order: List[int] = []
    sessions_map: Dict[int, Dict[str, Any]] = {}

    for r in rows:
        ma_buoi = int(r[0])
        if ma_buoi not in sessions_map:
            sessions_order.append(ma_buoi)
            ngay = r[2]
            gio = r[3]
            sessions_map[ma_buoi] = {
                "ma_buoi": ma_buoi,
                "ma_lhp": (r[1] or "").strip(),
                "ngay_hoc": ngay.isoformat() if ngay else None,
                "gio_bat_dau": gio.strftime("%H:%M:%S") if gio else None,
                "ten_mon": r[4],
                "students": [],
            }
        ma_dd = r[9]
        anh = r[12]
        co_anh = bool(anh and str(anh).strip())
        sessions_map[ma_buoi]["students"].append(
            {
                "ma_sv": r[5],
                "ho_ten": r[6],
                "lop": r[7],
                "anh_dai_dien": (str(r[8]).strip() if r[8] else None),
                "ma_diem_danh": ma_dd,
                "thoi_gian_quet": r[10].isoformat() if r[10] else None,
                "trang_thai": r[11],
                "co_anh": co_anh,
            }
        )

    return {"sessions": [sessions_map[mid] for mid in sessions_order]}


@teacher_router.get("/analytics/summary")
async def teacher_analytics_summary(current=Depends(require_role("TEACHER"))):
    """Thống kê trong phạm vi lớp của giảng viên."""
    ma_gv = _ma_gv_from_auth(current)
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT COUNT(DISTINCT sv.MaSV)
            FROM dbo.SinhVien sv
            INNER JOIN dbo.DangKyHoc dk ON dk.MaSV = sv.MaSV
            INNER JOIN dbo.LopHocPhan lhp ON dk.MaLHP = lhp.MaLHP
            WHERE LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(?))
            """,
            (ma_gv,),
        )
        total_sv = cur.fetchone()[0]

        cur.execute(
            """
            SELECT COUNT(*)
            FROM dbo.BuoiHoc bh
            JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            WHERE LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(?))
              AND bh.NgayHoc = CAST(GETDATE() AS DATE)
            """,
            (ma_gv,),
        )
        today_sessions = cur.fetchone()[0]

        cur.execute(
            """
            SELECT COUNT(*)
            FROM dbo.DiemDanh dd
            JOIN dbo.BuoiHoc bh ON dd.MaBuoi = bh.MaBuoi
            JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            WHERE LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(?))
              AND bh.NgayHoc = CAST(GETDATE() AS DATE)
            """,
            (ma_gv,),
        )
        today_dd = cur.fetchone()[0]

        cur.execute(
            """
            SELECT ISNULL(
                CAST(SUM(CASE WHEN dd.TrangThai = N'Trễ' THEN 1 ELSE 0 END) AS FLOAT) * 100.0
                / NULLIF(COUNT(*), 0), 0)
            FROM dbo.DiemDanh dd
            JOIN dbo.BuoiHoc bh ON dd.MaBuoi = bh.MaBuoi
            JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            WHERE LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(?))
              AND bh.NgayHoc >= DATEADD(day, -7, CAST(GETDATE() AS DATE))
            """,
            (ma_gv,),
        )
        late_rate = float(cur.fetchone()[0] or 0)

        cur.execute(
            """
            SELECT COUNT(*)
            FROM dbo.LopHocPhan lhp
            WHERE LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(?))
            """,
            (ma_gv,),
        )
        assigned_lhp = int(cur.fetchone()[0] or 0)

        cur.execute(
            f"""
            SELECT
                CAST(bh.NgayHoc AS DATE) AS Ngay,
                COUNT(DISTINCT CASE WHEN dd.TrangThai IN (N'Đúng giờ', N'Có mặt') THEN dd.MaDiemDanh END) AS CoMat,
                COUNT(DISTINCT CASE WHEN dd.TrangThai = N'Trễ' THEN dd.MaDiemDanh END) AS Tre
            FROM dbo.BuoiHoc bh
            JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            LEFT JOIN dbo.DiemDanh dd ON bh.MaBuoi = dd.MaBuoi
            WHERE {_gv_scope_sql()}
              AND bh.NgayHoc >= DATEADD(day, -7, CAST(GETDATE() AS DATE))
              AND bh.NgayHoc <= CAST(GETDATE() AS DATE)
            GROUP BY CAST(bh.NgayHoc AS DATE)
            ORDER BY Ngay
            """,
            (ma_gv,),
        )
        chart_trend = []
        for row in cur.fetchall():
            ngay = row[0].strftime("%d/%m") if row[0] else ""
            chart_trend.append({"name": ngay, "coMat": row[1] or 0, "tre": row[2] or 0})

        cur.execute(
            f"""
            SELECT dd.TrangThai, COUNT(*) AS SoLuong
            FROM dbo.DiemDanh dd
            JOIN dbo.BuoiHoc bh ON dd.MaBuoi = bh.MaBuoi
            JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            WHERE {_gv_scope_sql()}
              AND bh.NgayHoc >= DATEADD(day, -7, CAST(GETDATE() AS DATE))
            GROUP BY dd.TrangThai
            """,
            (ma_gv,),
        )
        chart_status = [{"name": row[0], "value": row[1]} for row in cur.fetchall()]

        alerts: List[Dict[str, str]] = []
        if assigned_lhp == 0:
            alerts.append(
                {
                    "severity": "warning",
                    "message": "Bạn chưa được phân công học phần nào — liên hệ quản trị để được gán lớp.",
                }
            )
        else:
            alerts.append(
                {
                    "severity": "info",
                    "message": f"Bạn đang phụ trách {assigned_lhp} học phần; có {total_sv} sinh viên đã đăng ký các lớp đó.",
                }
            )

        cur.execute(
            f"""
            SELECT bh.MaBuoi, mh.TenMon, bh.MaLHP, bh.GioBatDau,
                   (SELECT COUNT(*) FROM dbo.DiemDanh dd WHERE dd.MaBuoi = bh.MaBuoi) AS NQuet
            FROM dbo.BuoiHoc bh
            JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            JOIN dbo.MonHoc mh ON lhp.MaMon = mh.MaMon
            WHERE {_gv_scope_sql()}
              AND bh.NgayHoc = CAST(GETDATE() AS DATE)
            ORDER BY bh.GioBatDau
            """,
            (ma_gv,),
        )
        today_rows = cur.fetchall()
        if today_rows:
            zero = [r for r in today_rows if int(r[4] or 0) == 0]
            if zero:
                for r in zero[:5]:
                    gio = r[3]
                    if gio and not isinstance(gio, str):
                        gio = gio.strftime("%H:%M")
                    elif isinstance(gio, str):
                        gio = gio[:5]
                    alerts.append(
                        {
                            "severity": "warning",
                            "message": f"Hôm nay — buổi «{r[1]}» ({r[2]}) lúc {gio}: chưa có lượt điểm danh nào.",
                        }
                    )
                if len(zero) > 5:
                    alerts.append(
                        {
                            "severity": "warning",
                            "message": f"Và {len(zero) - 5} buổi hôm nay khác cũng chưa có điểm danh.",
                        }
                    )
            if today_dd > 0:
                alerts.append(
                    {
                        "severity": "success",
                        "message": f"Hôm nay đã ghi nhận {today_dd} lượt điểm danh trên các buổi của bạn.",
                    }
                )
        elif today_sessions == 0 and assigned_lhp > 0:
            alerts.append(
                {
                    "severity": "info",
                    "message": "Hôm nay không có buổi học nào được lên lịch trong các lớp bạn phụ trách.",
                }
            )

        cur.execute(
            f"""
            SELECT TOP 5 sv.HoTen, sv.MaSV, COUNT(*) AS LanTre
            FROM dbo.DiemDanh dd
            JOIN dbo.BuoiHoc bh ON dd.MaBuoi = bh.MaBuoi
            JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            JOIN dbo.SinhVien sv ON dd.MaSV = sv.MaSV
            WHERE {_gv_scope_sql()}
              AND dd.TrangThai = N'Trễ'
              AND bh.NgayHoc >= DATEADD(day, -30, CAST(GETDATE() AS DATE))
            GROUP BY sv.MaSV, sv.HoTen
            HAVING COUNT(*) >= 2
            ORDER BY LanTre DESC
            """,
            (ma_gv,),
        )
        for row in cur.fetchall():
            alerts.append(
                {
                    "severity": "warning",
                    "message": f"Sinh viên {row[0]} ({row[1]}) thường xuyên đi trễ: {int(row[2])} lần trong 30 ngày gần đây.",
                }
            )

        if late_rate >= 25 and today_dd > 0:
            alerts.append(
                {
                    "severity": "warning",
                    "message": f"Tỷ lệ đi trễ 7 ngày qua trong phạm vi lớp bạn là {late_rate:.1f}% — nên nhắc nhở lớp.",
                }
            )

        return {
            "total_students": total_sv,
            "today_sessions": today_sessions,
            "today_attendance": today_dd,
            "late_rate": late_rate,
            "assigned_lhp_count": assigned_lhp,
            "alerts": alerts,
            "chart_trend_7d": chart_trend,
            "chart_status_7d": chart_status,
        }
    finally:
        cur.close()
        conn.close()


def _gv_scope_sql() -> str:
    return "LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(?))"


@teacher_router.get("/analytics/attendance-trend")
async def teacher_attendance_trend(days: int = 7, current=Depends(require_role("TEACHER"))):
    """Xu hướng điểm danh theo ngày — chỉ buổi của LHP do GV phụ trách."""
    ma_gv = _ma_gv_from_auth(current)
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            f"""
            SELECT
                CAST(bh.NgayHoc AS DATE) AS Ngay,
                COUNT(DISTINCT CASE WHEN dd.TrangThai IN (N'Đúng giờ', N'Có mặt') THEN dd.MaDiemDanh END) AS CoMat,
                COUNT(DISTINCT CASE WHEN dd.TrangThai = N'Trễ' THEN dd.MaDiemDanh END) AS Tre,
                COUNT(DISTINCT bh.MaBuoi) AS TongBuoi
            FROM dbo.BuoiHoc bh
            JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            LEFT JOIN dbo.DiemDanh dd ON bh.MaBuoi = dd.MaBuoi
            WHERE {_gv_scope_sql()}
              AND bh.NgayHoc >= DATEADD(day, ?, CAST(GETDATE() AS DATE))
              AND bh.NgayHoc <= CAST(GETDATE() AS DATE)
            GROUP BY CAST(bh.NgayHoc AS DATE)
            ORDER BY Ngay
            """,
            (ma_gv, -days),
        )
        result = []
        for row in cur.fetchall():
            ngay = row[0].strftime("%d/%m") if row[0] else ""
            result.append({"name": ngay, "coMat": row[1] or 0, "tre": row[2] or 0, "vang": 0})
        return result
    finally:
        cur.close()
        conn.close()


@teacher_router.get("/analytics/status-distribution")
async def teacher_status_distribution(current=Depends(require_role("TEACHER"))):
    ma_gv = _ma_gv_from_auth(current)
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            f"""
            SELECT dd.TrangThai, COUNT(*) AS SoLuong
            FROM dbo.DiemDanh dd
            JOIN dbo.BuoiHoc bh ON dd.MaBuoi = bh.MaBuoi
            JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            WHERE {_gv_scope_sql()}
              AND bh.NgayHoc >= DATEADD(day, -7, CAST(GETDATE() AS DATE))
            GROUP BY dd.TrangThai
            """,
            (ma_gv,),
        )
        return [{"name": row[0], "value": row[1]} for row in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


@teacher_router.get("/analytics/top-students")
async def teacher_top_students(limit: int = 5, current=Depends(require_role("TEACHER"))):
    ma_gv = _ma_gv_from_auth(current)
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            f"""
            SELECT TOP (?)
                sv.MaSV,
                sv.HoTen,
                COUNT(DISTINCT dd.MaBuoi) AS SoBuoiCoMat,
                COUNT(DISTINCT bh.MaBuoi) AS TongBuoi,
                CAST(COUNT(DISTINCT dd.MaBuoi) * 100.0 /
                     NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) AS TyLe,
                SUM(CASE WHEN dd.TrangThai IN (N'Đúng giờ', N'Có mặt') THEN 1 ELSE 0 END) AS LanDungGio,
                SUM(CASE WHEN dd.TrangThai = N'Trễ' THEN 1 ELSE 0 END) AS LanTre
            FROM dbo.SinhVien sv
            JOIN dbo.DangKyHoc dk ON sv.MaSV = dk.MaSV
            JOIN dbo.LopHocPhan lhp ON dk.MaLHP = lhp.MaLHP
            JOIN dbo.BuoiHoc bh ON lhp.MaLHP = bh.MaLHP
            LEFT JOIN dbo.DiemDanh dd ON dd.MaSV = sv.MaSV AND dd.MaBuoi = bh.MaBuoi
            WHERE sv.TrangThai = N'Đang học'
              AND {_gv_scope_sql()}
            GROUP BY sv.MaSV, sv.HoTen
            HAVING COUNT(DISTINCT bh.MaBuoi) > 0
            ORDER BY TyLe DESC, SoBuoiCoMat DESC
            """,
            (limit, ma_gv),
        )
        out = []
        for row in cur.fetchall():
            lt = int(row[6] or 0)
            ld = int(row[5] or 0)
            out.append(
                {
                    "ma_sv": row[0],
                    "ho_ten": row[1],
                    "so_buoi": f"{row[2]}/{row[3]}",
                    "ty_le": float(row[4]) if row[4] else 0,
                    "lan_dung_gio": ld,
                    "lan_tre": lt,
                    "ghi_chu_thoi_quen": (
                        f"Đúng giờ/có mặt {ld} lượt, trễ {lt} lượt."
                        if (ld + lt) > 0
                        else "Chưa có lượt điểm danh ghi nhận."
                    ),
                }
            )
        return out
    finally:
        cur.close()
        conn.close()


@teacher_router.get("/analytics/at-risk-students")
async def teacher_at_risk_students(current=Depends(require_role("TEACHER"))):
    ma_gv = _ma_gv_from_auth(current)
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            f"""
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
                END AS KetLuan,
                SUM(CASE WHEN dd.TrangThai IN (N'Đúng giờ', N'Có mặt') THEN 1 ELSE 0 END) AS LanDungGio,
                SUM(CASE WHEN dd.TrangThai = N'Trễ' THEN 1 ELSE 0 END) AS LanTre
            FROM dbo.SinhVien sv
            JOIN dbo.DangKyHoc dk ON sv.MaSV = dk.MaSV
            JOIN dbo.LopHocPhan lhp ON dk.MaLHP = lhp.MaLHP
            JOIN dbo.BuoiHoc bh ON lhp.MaLHP = bh.MaLHP
            LEFT JOIN dbo.DiemDanh dd ON dd.MaSV = sv.MaSV AND dd.MaBuoi = bh.MaBuoi
            WHERE sv.TrangThai = N'Đang học'
              AND {_gv_scope_sql()}
            GROUP BY sv.MaSV, sv.HoTen
            HAVING CAST(COUNT(DISTINCT dd.MaBuoi) * 100.0 /
                   NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) < 80
            ORDER BY TyLe ASC
            """,
            (ma_gv,),
        )
        out = []
        for row in cur.fetchall():
            lt = int(row[7] or 0)
            ld = int(row[6] or 0)
            ty = float(row[4]) if row[4] else 0.0
            habit_parts = [f"Tham gia điểm danh {row[2]}/{row[3]} buổi ({ty:.1f}%)."]
            if lt >= 3 and lt > ld:
                habit_parts.append("Hay đi trễ hơn đúng giờ — cần theo dõi.")
            elif lt >= 2:
                habit_parts.append(f"Có {lt} lượt trễ đã ghi nhận.")
            elif ld > 0 and lt == 0:
                habit_parts.append("Chưa có lượt trễ ghi nhận.")
            out.append(
                {
                    "ma_sv": row[0],
                    "ho_ten": row[1],
                    "so_buoi": f"{row[2]}/{row[3]}",
                    "ty_le": ty,
                    "ket_luan": row[5],
                    "lan_dung_gio": ld,
                    "lan_tre": lt,
                    "thoi_quen_hoc_tap": " ".join(habit_parts),
                }
            )
        return out
    finally:
        cur.close()
        conn.close()


@teacher_router.get("/analytics/class-comparison")
async def teacher_class_comparison(current=Depends(require_role("TEACHER"))):
    ma_gv = _ma_gv_from_auth(current)
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            f"""
            SELECT
                sv.Lop,
                COUNT(DISTINCT dd.MaBuoi) AS SoBuoiCoMat,
                COUNT(DISTINCT bh.MaBuoi) AS TongBuoi,
                CAST(COUNT(DISTINCT dd.MaBuoi) * 100.0 /
                     NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) AS TyLe
            FROM dbo.SinhVien sv
            JOIN dbo.DangKyHoc dk ON sv.MaSV = dk.MaSV
            JOIN dbo.LopHocPhan lhp ON dk.MaLHP = lhp.MaLHP
            JOIN dbo.BuoiHoc bh ON lhp.MaLHP = bh.MaLHP
            LEFT JOIN dbo.DiemDanh dd ON dd.MaSV = sv.MaSV AND dd.MaBuoi = bh.MaBuoi
            WHERE sv.TrangThai = N'Đang học' AND sv.Lop IS NOT NULL
              AND {_gv_scope_sql()}
            GROUP BY sv.Lop
            HAVING COUNT(DISTINCT bh.MaBuoi) > 0
            ORDER BY TyLe DESC
            """,
            (ma_gv,),
        )
        return [{"lop": row[0], "tyLe": float(row[3]) if row[3] else 0} for row in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


@teacher_router.get("/analytics/recent-session-stats")
async def teacher_recent_session_stats(days: int = 14, current=Depends(require_role("TEACHER"))):
    """Theo từng buổi: số SV đăng ký, số đã quét, đúng giờ / trễ / vắng (ước)."""
    ma_gv = _ma_gv_from_auth(current)
    days = max(1, min(int(days or 14), 120))
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            f"""
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
            WHERE {_gv_scope_sql()}
              AND bh.NgayHoc >= DATEADD(day, -?, CAST(GETDATE() AS DATE))
              AND bh.NgayHoc <= CAST(GETDATE() AS DATE)
            GROUP BY bh.MaBuoi, bh.MaLHP, mh.TenMon, bh.NgayHoc, bh.GioBatDau
            ORDER BY bh.NgayHoc DESC, bh.GioBatDau DESC
            """,
            (ma_gv, days),
        )
        out = []
        for row in cur.fetchall():
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
        cur.close()
        conn.close()


@teacher_router.get("/analytics/overview")
async def teacher_analytics_overview(current=Depends(require_role("TEACHER"))):
    """4 ô tổng quan: TB chuyên cần, đủ ĐK, nguy cơ, tỷ lệ trễ (7 ngày)."""
    ma_gv = _ma_gv_from_auth(current)
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            f"""
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
                  AND {_gv_scope_sql()}
                GROUP BY sv.MaSV
                HAVING COUNT(DISTINCT bh.MaBuoi) > 0
            ) sub
            """,
            (ma_gv,),
        )
        avg_cc = float(cur.fetchone()[0] or 0)

        cur.execute(
            f"""
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
                  AND {_gv_scope_sql()}
                GROUP BY sv.MaSV
                HAVING COUNT(DISTINCT bh.MaBuoi) > 0
            ) x
            """,
            (ma_gv,),
        )
        row = cur.fetchone()
        total_tracked = int(row[0] or 0)
        eligible = int(row[1] or 0)
        at_risk = int(row[2] or 0)

        cur.execute(
            f"""
            SELECT ISNULL(
                CAST(SUM(CASE WHEN dd.TrangThai = N'Trễ' THEN 1 ELSE 0 END) AS FLOAT) * 100.0
                / NULLIF(COUNT(*), 0), 0)
            FROM dbo.DiemDanh dd
            JOIN dbo.BuoiHoc bh ON dd.MaBuoi = bh.MaBuoi
            JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            WHERE {_gv_scope_sql()}
              AND bh.NgayHoc >= DATEADD(day, -7, CAST(GETDATE() AS DATE))
            """,
            (ma_gv,),
        )
        late_rate = float(cur.fetchone()[0] or 0)

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
        cur.close()
        conn.close()
