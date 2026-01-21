from datetime import datetime, time
from database.db import get_connection


# =========================
# LẤY DANH SÁCH BUỔI HỌC HÔM NAY (CHO FE)
# =========================
def get_today_sessions():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            bh.MaBuoi,
            mh.TenMon,
            bh.GioBatDau,
            lhp.GiangVien,
            bh.NgayHoc
        FROM BuoiHoc bh
        JOIN LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
        JOIN MonHoc mh ON lhp.MaMon = mh.MaMon
        ORDER BY bh.NgayHoc DESC, bh.GioBatDau
    """)

    rows = cursor.fetchall()
    conn.close()

    return [
        {
            "ma_buoi": r[0],
            "ten_mon": r[1],
            "gio_bat_dau": r[2].strftime("%H:%M"),
            "giang_vien": r[3],
            "ngay_hoc": r[4].strftime("%d/%m/%Y")
        }
        for r in rows
    ]


# =========================
# KIỂM TRA ĐÃ ĐIỂM DANH CHƯA
# =========================
def da_diem_danh(ma_sv, ma_buoi):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT COUNT(*)
        FROM DiemDanh
        WHERE MaSV = ? AND MaBuoi = ?
    """, (ma_sv, ma_buoi))

    count = cursor.fetchone()[0]
    conn.close()
    return count > 0


# =========================
# GHI ĐIỂM DANH
# =========================
def ghi_diem_danh(ma_sv, ma_buoi):
    conn = get_connection()
    cursor = conn.cursor()

    # Lấy giờ bắt đầu buổi học
    cursor.execute("""
        SELECT GioBatDau
        FROM BuoiHoc
        WHERE MaBuoi = ?
    """, (ma_buoi,))

    row = cursor.fetchone()
    if not row:
        conn.close()
        return {
            "success": False,
            "message": "Không tìm thấy buổi học"
        }

    gio_bat_dau: time = row[0]
    gio_hien_tai = datetime.now().time()

    trang_thai = "Đúng giờ" if gio_hien_tai <= gio_bat_dau else "Trễ"

    cursor.execute("""
        INSERT INTO DiemDanh (
            MaSV,
            MaBuoi,
            ThoiGianQuet,
            TrangThai,
            NguonQuet
        )
        VALUES (?, ?, GETDATE(), ?, ?)
    """, (
        ma_sv,
        ma_buoi,
        trang_thai,
        "Webcam"
    ))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "trang_thai": trang_thai
    }
