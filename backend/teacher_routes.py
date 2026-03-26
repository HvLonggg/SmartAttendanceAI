"""
API dành cho giảng viên: lớp được phân công, CRUD buổi học, danh sách SV lớp mình, thống kê phạm vi lớp.
"""
from datetime import datetime, date, time, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

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


class TeacherSessionCreate(BaseModel):
    ma_lhp: str
    ngay_hoc: date
    gio_bat_dau: str  # "HH:MM" hoặc "HH:MM:SS"
    ma_xac_thuc_buoi: str = Field(..., min_length=4, max_length=64)
    phut_het_han_dung_gio: int = Field(15, ge=1, le=120)
    phut_het_han_diem_danh: int = Field(60, ge=1, le=600)


class TeacherSessionUpdate(BaseModel):
    ngay_hoc: Optional[date] = None
    gio_bat_dau: Optional[str] = None
    ma_xac_thuc_buoi: Optional[str] = None
    phut_het_han_dung_gio: Optional[int] = None
    phut_het_han_diem_danh: Optional[int] = None


def _parse_time(s: str) -> time:
    s = (s or "").strip()
    parts = s.split(":")
    if len(parts) >= 2:
        h, m = int(parts[0]), int(parts[1])
        sec = int(parts[2]) if len(parts) > 2 else 0
        return time(h, m, sec)
    raise HTTPException(status_code=400, detail="Giờ bắt đầu không hợp lệ")


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
                mh.TenMon, lhp.GiangVien
            FROM dbo.BuoiHoc bh
            JOIN dbo.LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            JOIN dbo.MonHoc mh ON lhp.MaMon = mh.MaMon
            WHERE LTRIM(RTRIM(ISNULL(lhp.MaGV,''))) = LTRIM(RTRIM(?))
            ORDER BY bh.NgayHoc DESC, bh.GioBatDau DESC
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
    code = body.ma_xac_thuc_buoi.strip()
    if not code:
        raise HTTPException(status_code=400, detail="Mã xác thực buổi học không được trống")

    gio = _parse_time(body.gio_bat_dau)

    conn = get_connection()
    cur = conn.cursor()
    try:
        if not _teacher_owns_lhp(cur, ma_gv, ma_lhp):
            raise HTTPException(status_code=403, detail="Bạn không được phân công lớp học phần này")

        cur.execute(
            "SELECT COUNT(*) FROM dbo.BuoiHoc WHERE LTRIM(RTRIM(MaXacThucBuoi)) = LTRIM(RTRIM(?))",
            (code,),
        )
        if cur.fetchone()[0] > 0:
            raise HTTPException(status_code=400, detail="Mã buổi học đã tồn tại, hãy chọn mã khác")

        cur.execute(
            """
            INSERT INTO dbo.BuoiHoc (MaLHP, NgayHoc, GioBatDau, MaXacThucBuoi, PhutHetHanDungGio, PhutHetHanDiemDanh)
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
        cur.execute("SELECT CAST(SCOPE_IDENTITY() AS INT)")
        new_id = int(cur.fetchone()[0])
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

        if body.ngay_hoc is not None:
            fields.append("NgayHoc = ?")
            params.append(body.ngay_hoc)
        if body.gio_bat_dau is not None:
            fields.append("GioBatDau = ?")
            params.append(_parse_time(body.gio_bat_dau))
        if body.ma_xac_thuc_buoi is not None:
            code = body.ma_xac_thuc_buoi.strip()
            if len(code) < 4:
                raise HTTPException(status_code=400, detail="Mã buổi học tối thiểu 4 ký tự")
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

        return {
            "total_students": total_sv,
            "today_sessions": today_sessions,
            "today_attendance": today_dd,
            "late_rate": late_rate,
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
                     NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) AS TyLe
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
            out.append(
                {
                    "ma_sv": row[0],
                    "ho_ten": row[1],
                    "so_buoi": f"{row[2]}/{row[3]}",
                    "ty_le": float(row[4]) if row[4] else 0,
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
                END AS KetLuan
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
            out.append(
                {
                    "ma_sv": row[0],
                    "ho_ten": row[1],
                    "so_buoi": f"{row[2]}/{row[3]}",
                    "ty_le": float(row[4]) if row[4] else 0,
                    "ket_luan": row[5],
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
