"""
Bổ sung bảng Khoa, cột MaKhoa/ChuyenNganh, seed môn/lớp CNTT và VIEW thống kê.
Chạy từ main.py sau khi kết nối CSDL.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Set

from database.db_connection import get_connection

# Seed dữ liệu demo CNTT (môn học + lớp học phần).
# Mặc định TẮT để tránh tự đẻ dữ liệu khi chạy lại backend.
# Muốn bật thủ công: set SEED_CNTT_DEMO=1
SEED_CNTT_DEMO = os.environ.get("SEED_CNTT_DEMO", "0").strip() not in {"0", "false", "False", "no"}


def _table_exists(conn, table: str) -> bool:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT 1 FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = N'dbo' AND TABLE_NAME = ?
        """,
        (table,),
    )
    return cur.fetchone() is not None


def _cols(conn, table: str) -> Set[str]:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = N'dbo' AND TABLE_NAME = ?
        """,
        (table,),
    )
    return {r[0] for r in cur.fetchall()}


def _insert_row(conn, table: str, row: Dict[str, Any]) -> bool:
    cols = [c for c, v in row.items() if v is not None]
    if not cols:
        return False
    existing = _cols(conn, table)
    use = [c for c in cols if c in existing]
    if not use:
        return False
    vals = [row[c] for c in use]
    ph = ",".join(["?"] * len(use))
    sql = f"INSERT INTO dbo.{table} ({','.join(use)}) VALUES ({ph})"
    cur = conn.cursor()
    try:
        cur.execute(sql, vals)
        return True
    except Exception:
        return False
    finally:
        cur.close()


def ensure_khoa_and_extensions() -> None:
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            IF OBJECT_ID('dbo.Khoa', 'U') IS NULL
            BEGIN
                CREATE TABLE dbo.Khoa (
                    MaKhoa NVARCHAR(20) NOT NULL PRIMARY KEY,
                    TenKhoa NVARCHAR(200) NOT NULL,
                    GhiChu NVARCHAR(500) NULL
                );
            END
            """
        )
        cur.execute("IF COL_LENGTH('dbo.NguoiDung','MaKhoa') IS NULL ALTER TABLE dbo.NguoiDung ADD MaKhoa NVARCHAR(20) NULL")
        cur.execute("IF COL_LENGTH('dbo.GiangVien','MaKhoa') IS NULL ALTER TABLE dbo.GiangVien ADD MaKhoa NVARCHAR(20) NULL")
        cur.execute("IF COL_LENGTH('dbo.LopHocPhan','MaKhoa') IS NULL ALTER TABLE dbo.LopHocPhan ADD MaKhoa NVARCHAR(20) NULL")
        cur.execute("IF COL_LENGTH('dbo.MonHoc','MaKhoa') IS NULL ALTER TABLE dbo.MonHoc ADD MaKhoa NVARCHAR(20) NULL")
        cur.execute(
            "IF COL_LENGTH('dbo.MonHoc','ChuyenNganh') IS NULL ALTER TABLE dbo.MonHoc ADD ChuyenNganh NVARCHAR(120) NULL"
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()


def _merge_khoa_rows(conn) -> None:
    rows = [
        ("CNTT", "Khoa Công nghệ thông tin", "Chương trình đại trà / ngành Công nghệ thông tin"),
        ("KTPM", "Bộ môn Kỹ thuật phần mềm", None),
        ("HTTT", "Bộ môn Hệ thống thông tin", None),
        ("KHMT", "Bộ môn Khoa học máy tính", None),
        ("ATTT", "Bộ môn An toàn thông tin", None),
        ("MMT", "Bộ môn Mạng máy tính & Truyền thông", None),
        ("DL", "Khoa Du lịch", "Quản trị dịch vụ du lịch và lữ hành"),
        ("QTDL", "Bộ môn Quản trị du lịch - lữ hành", None),
        ("KSNH", "Bộ môn Khách sạn - Nhà hàng", None),
        ("TCKT", "Khoa Tài chính - Kế toán", "Tài chính doanh nghiệp, kế toán và kiểm toán"),
        ("KT", "Bộ môn Kế toán", None),
        ("TCNH", "Bộ môn Tài chính - Ngân hàng", None),
    ]
    cur = conn.cursor()
    for mk, tk, gc in rows:
        cur.execute(
            """
            IF NOT EXISTS (SELECT 1 FROM dbo.Khoa WHERE MaKhoa = ?)
                INSERT INTO dbo.Khoa (MaKhoa, TenKhoa, GhiChu) VALUES (?, ?, ?)
            """,
            (mk, mk, tk, gc),
        )
    conn.commit()
    cur.close()


def _seed_mon_hoc_cntt(conn) -> None:
    if "MaMon" not in _cols(conn, "MonHoc"):
        return
    mons: List[tuple] = [
        ("MH001", "Lập trình hướng đối tượng", "CNTT", "Kỹ thuật phần mềm"),
        ("MH002", "Cấu trúc dữ liệu và giải thuật", "CNTT", "Khoa học máy tính"),
        ("MH003", "Cơ sở dữ liệu", "CNTT", "Hệ thống thông tin"),
        ("MH004", "Mạng máy tính", "MMT", "Mạng máy tính"),
        ("MH005", "Hệ điều hành", "KHMT", "Khoa học máy tính"),
        ("MH006", "Phân tích thiết kế hệ thống", "HTTT", "Hệ thống thông tin"),
        ("MH007", "Lập trình Web", "KTPM", "Kỹ thuật phần mềm"),
        ("MH008", "An toàn và bảo mật thông tin", "ATTT", "An toàn thông tin"),
        ("MH009", "Trí tuệ nhân tạo", "KHMT", "Khoa học máy tính"),
        ("MH010", "Đồ án tốt nghiệp", "CNTT", "Công nghệ thông tin"),
        ("MH011", "Phát triển ứng dụng di động", "KTPM", "Kỹ thuật phần mềm"),
        ("MH012", "Big Data & NoSQL", "HTTT", "Hệ thống thông tin"),
        ("MH013", "DevOps & CI/CD", "KTPM", "Kỹ thuật phần mềm"),
        ("MH014", "Mật mã học ứng dụng", "ATTT", "An toàn thông tin"),
        ("MH015", "Quản trị mạng", "MMT", "Mạng máy tính"),
        ("MH016", "Xử lý ảnh số", "KHMT", "Thị giác máy tính"),
        ("MH017", "Trí tuệ nhân tạo ứng dụng", "KHMT", "AI ứng dụng"),
        ("MH018", "Lập trình C", "KTPM", "Nền tảng lập trình"),
        ("MH019", "Lập trình Java", "KTPM", "Phát triển ứng dụng Java"),
        ("MH020", "Lập trình JavaScript", "KTPM", "Phát triển web front-end"),
        ("MH021", "Nghiệp vụ hướng dẫn du lịch", "QTDL", "Hướng dẫn viên du lịch"),
        ("MH022", "Quản trị lữ hành", "QTDL", "Điều hành tour"),
        ("MH023", "Quản trị khách sạn", "KSNH", "Quản trị lưu trú"),
        ("MH024", "Kế toán tài chính", "KT", "Kế toán doanh nghiệp"),
        ("MH025", "Nguyên lý kế toán", "KT", "Kế toán cơ sở"),
        ("MH026", "Tài chính doanh nghiệp", "TCNH", "Tài chính"),
        ("MH027", "Phân tích đầu tư", "TCNH", "Tài chính đầu tư"),
    ]
    cur = conn.cursor()
    mcols = _cols(conn, "MonHoc")
    c_makhoa = "MaKhoa" in mcols
    c_cn = "ChuyenNganh" in mcols
    c_sobuoi = "SoBuoi" in mcols
    c_sotinchi = "SoTinChi" in mcols
    for ma, ten, mk, cn in mons:
        cur.execute("SELECT COUNT(*) FROM dbo.MonHoc WHERE MaMon = ?", (ma,))
        if cur.fetchone()[0] > 0:
            continue
        row: Dict[str, Any] = {"MaMon": ma, "TenMon": ten}
        if c_makhoa:
            row["MaKhoa"] = mk
        if c_cn:
            row["ChuyenNganh"] = cn
        if c_sobuoi:
            row["SoBuoi"] = 15
        if c_sotinchi:
            row["SoTinChi"] = 3
        if not _insert_row(conn, "MonHoc", row):
            print(f"[CNTT] Bỏ qua seed MonHoc {ma}: không insert được (thiếu cột bắt buộc?)")
    conn.commit()
    cur.close()


def _ensure_giang_vien_seed(conn, ma_gv: str, ho_ten: str, ma_khoa: str) -> None:
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM dbo.GiangVien WHERE MaGV = ?", (ma_gv,))
    if cur.fetchone()[0] > 0:
        if "MaKhoa" in _cols(conn, "GiangVien"):
            cur.execute(
                "UPDATE dbo.GiangVien SET MaKhoa = ? WHERE MaGV = ? AND (MaKhoa IS NULL OR MaKhoa = '')",
                (ma_khoa, ma_gv),
            )
        conn.commit()
        cur.close()
        return
    if "MaKhoa" in _cols(conn, "GiangVien"):
        cur.execute(
            """
            INSERT INTO dbo.GiangVien (MaGV, HoTen, TrangThai, MaKhoa)
            VALUES (?, ?, N'Đang dạy', ?)
            """,
            (ma_gv, ho_ten, ma_khoa),
        )
    else:
        cur.execute(
            "INSERT INTO dbo.GiangVien (MaGV, HoTen, TrangThai) VALUES (?, ?, N'Đang dạy')",
            (ma_gv, ho_ten),
        )
    conn.commit()
    cur.close()


def _seed_lop_hoc_phan_demo(conn) -> None:
    lcols = _cols(conn, "LopHocPhan")
    if not {"MaLHP", "MaMon", "GiangVien"}.issubset(lcols):
        return

    teachers = [
        ("GV2025001", "Nguyễn Văn An", "CNTT"),
        ("GV2025002", "Trần Thị Bình", "KTPM"),
        ("GV2025003", "Lê Hoàng Cường", "HTTT"),
        ("GV2025004", "Phạm Minh Dũng", "KHMT"),
        ("GV2025005", "Hoàng Thu Hà", "ATTT"),
        ("GV2025006", "Đỗ Quang Huy", "MMT"),
        ("GV2025007", "Vũ Thị Lan", "CNTT"),
        ("GV2025008", "Bùi Văn Nam", "KTPM"),
        ("GV2025009", "Ngô Mai Hương", "KHMT"),
        ("GV2025010", "Phan Quang Nhật", "KTPM"),
        ("GV2025011", "Trịnh Thu Thảo", "QTDL"),
        ("GV2025012", "Lâm Đức Minh", "KSNH"),
        ("GV2025013", "Đặng Hải Yến", "KT"),
        ("GV2025014", "Hồ Quốc Bảo", "TCNH"),
    ]
    for ma_gv, ten, mk in teachers:
        _ensure_giang_vien_seed(conn, ma_gv, ten, mk)

    lhp_data = [
        ("LHP001HK2526", "MH001", "Nguyễn Văn An", "GV2025001", "CNTT"),
        ("LHP002HK2526", "MH002", "Trần Thị Bình", "GV2025002", "KTPM"),
        ("LHP003HK2526", "MH003", "Lê Hoàng Cường", "GV2025003", "HTTT"),
        ("LHP004HK2526", "MH004", "Đỗ Quang Huy", "GV2025006", "MMT"),
        ("LHP005HK2526", "MH005", "Phạm Minh Dũng", "GV2025004", "KHMT"),
        ("LHP006HK2526", "MH006", "Lê Hoàng Cường", "GV2025003", "HTTT"),
        ("LHP007HK2526", "MH007", "Vũ Thị Lan", "GV2025007", "KTPM"),
        ("LHP008HK2526", "MH008", "Hoàng Thu Hà", "GV2025005", "ATTT"),
        ("LHP009HK2526", "MH009", "Phạm Minh Dũng", "GV2025004", "KHMT"),
        ("LHP010HK2526", "MH010", "Nguyễn Văn An", "GV2025001", "CNTT"),
        ("LHP011HK2526", "MH011", "Bùi Văn Nam", "GV2025008", "KTPM"),
        ("LHP012HK2526", "MH012", "Lê Hoàng Cường", "GV2025003", "HTTT"),
        ("LHP013HK2526", "MH013", "Vũ Thị Lan", "GV2025007", "KTPM"),
        ("LHP014HK2526", "MH014", "Hoàng Thu Hà", "GV2025005", "ATTT"),
        ("LHP015HK2526", "MH015", "Đỗ Quang Huy", "GV2025006", "MMT"),
        ("LHP016HK2526", "MH016", "Ngô Mai Hương", "GV2025009", "KHMT"),
        ("LHP017HK2526", "MH017", "Phạm Minh Dũng", "GV2025004", "KHMT"),
        ("LHP018HK2526", "MH018", "Phan Quang Nhật", "GV2025010", "KTPM"),
        ("LHP019HK2526", "MH019", "Bùi Văn Nam", "GV2025008", "KTPM"),
        ("LHP020HK2526", "MH020", "Vũ Thị Lan", "GV2025007", "KTPM"),
        ("LHP021HK2526", "MH021", "Trịnh Thu Thảo", "GV2025011", "QTDL"),
        ("LHP022HK2526", "MH022", "Trịnh Thu Thảo", "GV2025011", "QTDL"),
        ("LHP023HK2526", "MH023", "Lâm Đức Minh", "GV2025012", "KSNH"),
        ("LHP024HK2526", "MH024", "Đặng Hải Yến", "GV2025013", "KT"),
        ("LHP025HK2526", "MH025", "Đặng Hải Yến", "GV2025013", "KT"),
        ("LHP026HK2526", "MH026", "Hồ Quốc Bảo", "GV2025014", "TCNH"),
        ("LHP027HK2526", "MH027", "Hồ Quốc Bảo", "GV2025014", "TCNH"),
    ]

    cur = conn.cursor()
    for ma_lhp, ma_mon, gv_name, ma_gv, mk in lhp_data:
        cur.execute("SELECT COUNT(*) FROM dbo.LopHocPhan WHERE MaLHP = ?", (ma_lhp,))
        if cur.fetchone()[0] > 0:
            continue
        row: Dict[str, Any] = {
            "MaLHP": ma_lhp,
            "MaMon": ma_mon,
            "GiangVien": gv_name,
            "MaGV": ma_gv,
        }
        if "MaKhoa" in lcols:
            row["MaKhoa"] = mk
        for opt in ("NamHoc", "HocKy", "PhongHoc", "SiSo", "Thu", "Tiet"):
            if opt in lcols and opt not in row:
                if opt == "NamHoc":
                    row["NamHoc"] = "2025-2026"
                elif opt == "HocKy":
                    row["HocKy"] = 1
                elif opt == "PhongHoc":
                    row["PhongHoc"] = "P301"
                elif opt == "SiSo":
                    row["SiSo"] = 45
        if not _insert_row(conn, "LopHocPhan", row):
            pass
    conn.commit()
    cur.close()


def _seed_dang_ky_from_sinh_vien(conn) -> None:
    if not _table_exists(conn, "DangKyHoc"):
        return
    dcols = _cols(conn, "DangKyHoc")
    if "MaSV" not in dcols or "MaLHP" not in dcols:
        return
    cur = conn.cursor()
    cur.execute(
        """
        SELECT TOP 30 MaSV FROM dbo.SinhVien
        WHERE Khoa IS NOT NULL AND (Khoa LIKE N'%CNTT%' OR Khoa LIKE N'%Công nghệ%' OR Khoa LIKE N'%TH%')
        ORDER BY MaSV
        """
    )
    students = [r[0] for r in cur.fetchall()]
    if not students:
        cur.execute("SELECT TOP 20 MaSV FROM dbo.SinhVien ORDER BY MaSV")
        students = [r[0] for r in cur.fetchall()]
    cur.execute(
        "SELECT MaLHP FROM dbo.LopHocPhan WHERE MaLHP LIKE N'LHP%HK2526' ORDER BY MaLHP"
    )
    lhps = [r[0] for r in cur.fetchall()]
    if not lhps:
        cur.close()
        return
    n = len(lhps)
    for i, ma_sv in enumerate(students):
        for k in range(min(4, n)):
            ma_lhp = lhps[(i + k) % n]
            cur.execute(
                "SELECT COUNT(*) FROM dbo.DangKyHoc WHERE MaSV = ? AND MaLHP = ?",
                (ma_sv, ma_lhp),
            )
            if cur.fetchone()[0] > 0:
                continue
            try:
                cur.execute(
                    "INSERT INTO dbo.DangKyHoc (MaSV, MaLHP) VALUES (?, ?)",
                    (ma_sv, ma_lhp),
                )
            except Exception:
                pass
    conn.commit()
    cur.close()


def ensure_cntt_view() -> None:
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            IF OBJECT_ID('dbo.vw_LopHocPhan_ChiTiet', 'V') IS NOT NULL
                DROP VIEW dbo.vw_LopHocPhan_ChiTiet;
            """
        )
        cur.execute(
            """
            CREATE VIEW dbo.vw_LopHocPhan_ChiTiet AS
            SELECT
                lhp.MaLHP,
                lhp.MaMon,
                mh.TenMon,
                mh.ChuyenNganh,
                lhp.MaGV,
                lhp.GiangVien AS GiangVienText,
                gv.HoTen AS TenGiangVien,
                COALESCE(lhp.MaKhoa, mh.MaKhoa, gv.MaKhoa) AS MaKhoa,
                k.TenKhoa,
                lhp.MaKhoa AS MaKhoaLop,
                mh.MaKhoa AS MaKhoaMon,
                gv.MaKhoa AS MaKhoaGV
            FROM dbo.LopHocPhan lhp
            INNER JOIN dbo.MonHoc mh ON lhp.MaMon = mh.MaMon
            LEFT JOIN dbo.GiangVien gv
                ON lhp.MaGV IS NOT NULL
                AND LTRIM(RTRIM(lhp.MaGV)) = LTRIM(RTRIM(gv.MaGV))
            LEFT JOIN dbo.Khoa k
                ON k.MaKhoa = COALESCE(lhp.MaKhoa, mh.MaKhoa, gv.MaKhoa)
            """
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"[CNTT] Không tạo được view vw_LopHocPhan_ChiTiet: {e}")
    finally:
        cur.close()
        conn.close()


def run_cntt_schema_and_seed() -> None:
    try:
        ensure_khoa_and_extensions()
        conn = get_connection()
        try:
            _merge_khoa_rows(conn)
            if SEED_CNTT_DEMO:
                _seed_mon_hoc_cntt(conn)
                _seed_lop_hoc_phan_demo(conn)
                _seed_dang_ky_from_sinh_vien(conn)
        finally:
            conn.close()
        ensure_cntt_view()
        print("✅ Khoa + seed CNTT (nếu bật) + view vw_LopHocPhan_ChiTiet đã sẵn sàng")
    except Exception as e:
        print(f"⚠️ CNTT schema/seed: {e}")
