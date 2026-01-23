"""
Script tạo dữ liệu thực cho hệ thống
Chạy: python create_real_data.py
"""

import sys
sys.path.append('.')

from database.db_connection import get_connection
from datetime import datetime, timedelta
import random

def create_real_data():
    """Tạo dữ liệu thực cho hệ thống"""
    
    print("=" * 60)
    print("📊 TẠO DỮ LIỆU THỰC CHO HỆ THỐNG")
    print("=" * 60)
    
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # 1. Thêm Môn học
        print("\n📚 1. Thêm môn học...")
        mon_hoc = [
            ('IT001', 'Lập trình Web', 15, 45),
            ('IT002', 'Cơ sở dữ liệu', 15, 45),
            ('IT003', 'Trí tuệ nhân tạo', 15, 45),
            ('IT004', 'Thị giác máy tính', 15, 45),
        ]
        
        for mh in mon_hoc:
            try:
                cursor.execute("""
                    IF NOT EXISTS (SELECT 1 FROM MonHoc WHERE MaMon = ?)
                    INSERT INTO MonHoc (MaMon, TenMon, SoBuoi, SoTiet)
                    VALUES (?, ?, ?, ?)
                """, (mh[0], mh[0], mh[1], mh[2], mh[3]))
                print(f"   ✅ {mh[1]}")
            except:
                print(f"   ⚠️ {mh[1]} đã tồn tại")
        
        # 2. Thêm Lớp học phần
        print("\n🏫 2. Thêm lớp học phần...")
        lop_hoc_phan = [
            ('LHP001', 'IT001', 'HK1', '2024-2025', 'TS. Lê Đức Huy', '07:00:00', '09:30:00'),
            ('LHP002', 'IT002', 'HK1', '2024-2025', 'ThS. Lê Trung Thực', '09:45:00', '12:15:00'),
            ('LHP003', 'IT003', 'HK1', '2024-2025', 'TS. Nguyễn Văn A', '13:00:00', '15:30:00'),
        ]
        
        for lhp in lop_hoc_phan:
            try:
                cursor.execute("""
                    IF NOT EXISTS (SELECT 1 FROM LopHocPhan WHERE MaLHP = ?)
                    INSERT INTO LopHocPhan (MaLHP, MaMon, HocKy, NamHoc, GiangVien, GioBatDau, GioKetThuc)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (lhp[0], lhp[0], lhp[1], lhp[2], lhp[3], lhp[4], lhp[5], lhp[6]))
                print(f"   ✅ {lhp[0]} - {lhp[4]}")
            except:
                print(f"   ⚠️ {lhp[0]} đã tồn tại")
        
        # 3. Kiểm tra sinh viên
        print("\n👥 3. Kiểm tra sinh viên...")
        cursor.execute("SELECT COUNT(*) FROM SinhVien")
        sv_count = cursor.fetchone()[0]
        print(f"   📊 Tổng số sinh viên: {sv_count}")
        
        if sv_count == 0:
            print("   ⚠️ Chưa có sinh viên nào!")
            print("   💡 Vui lòng thêm sinh viên qua giao diện web")
        
        # 4. Đăng ký học tất cả sinh viên vào 3 lớp
        print("\n📝 4. Đăng ký học cho sinh viên...")
        cursor.execute("SELECT MaSV FROM SinhVien")
        sinh_vien = cursor.fetchall()
        
        dang_ky_count = 0
        for sv in sinh_vien:
            ma_sv = sv[0]
            for lhp in lop_hoc_phan[:3]:
                ma_lhp = lhp[0]
                try:
                    cursor.execute("""
                        IF NOT EXISTS (SELECT 1 FROM DangKyHoc WHERE MaSV = ? AND MaLHP = ?)
                        INSERT INTO DangKyHoc (MaSV, MaLHP) VALUES (?, ?)
                    """, (ma_sv, ma_lhp, ma_sv, ma_lhp))
                    dang_ky_count += 1
                except:
                    pass
        
        print(f"   ✅ Đã đăng ký {dang_ky_count} lượt")
        
        # 5. Xóa dữ liệu điểm danh cũ
        print("\n🗑️  5. Xóa dữ liệu cũ...")
        cursor.execute("DELETE FROM DiemDanh")
        cursor.execute("DELETE FROM BuoiHoc")
        print("   ✅ Đã xóa dữ liệu cũ")
        
        # 6. Tạo buổi học
        print("\n📅 6. Tạo buổi học...")
        
        today = datetime.now().date()
        buoi_count = 0
        
        # Tạo buổi học HÔM NAY
        for lhp in lop_hoc_phan[:3]:
            cursor.execute("""
                INSERT INTO BuoiHoc (MaLHP, NgayHoc, GioBatDau)
                VALUES (?, ?, ?)
            """, (lhp[0], today, lhp[5]))
            buoi_count += 1
        
        print(f"   ✅ Buổi học HÔM NAY: {buoi_count}")
        
        # Tạo buổi học cho 2 tuần trước (để có dữ liệu lịch sử)
        for i in range(1, 11):
            ngay_hoc = today - timedelta(days=i)
            
            # Chỉ tạo cho ngày trong tuần
            if ngay_hoc.weekday() < 5:  # 0-4 = Mon-Fri
                for lhp in lop_hoc_phan[:3]:
                    cursor.execute("""
                        INSERT INTO BuoiHoc (MaLHP, NgayHoc, GioBatDau)
                        VALUES (?, ?, ?)
                    """, (lhp[0], ngay_hoc, lhp[5]))
                    buoi_count += 1
        
        cursor.execute("SELECT COUNT(*) FROM BuoiHoc")
        total_buoi = cursor.fetchone()[0]
        print(f"   ✅ Tổng số buổi học: {total_buoi}")
        
        # 7. Tạo dữ liệu điểm danh mẫu (CHỈ cho các buổi ĐÃ QUA)
        print("\n✅ 7. Tạo dữ liệu điểm danh...")
        
        cursor.execute("""
            SELECT bh.MaBuoi, bh.MaLHP, bh.NgayHoc, bh.GioBatDau
            FROM BuoiHoc bh
            WHERE bh.NgayHoc < ?
        """, (today,))
        
        buoi_da_qua = cursor.fetchall()
        dd_count = 0
        
        for buoi in buoi_da_qua:
            ma_buoi = buoi[0]
            ma_lhp = buoi[1]
            ngay_hoc = buoi[2]
            gio_bat_dau = buoi[3]
            
            # Lấy sinh viên đăng ký lớp này
            cursor.execute("""
                SELECT MaSV FROM DangKyHoc WHERE MaLHP = ?
            """, (ma_lhp,))
            
            sv_list = cursor.fetchall()
            
            for sv in sv_list:
                ma_sv = sv[0]
                
                # 85% có mặt
                if random.random() < 0.85:
                    # Tạo thời gian quét
                    gio_bat_dau_dt = datetime.combine(ngay_hoc, gio_bat_dau)
                    
                    # 75% đúng giờ, 25% trễ
                    if random.random() < 0.75:
                        minutes_before = random.randint(0, 10)
                        thoi_gian_quet = gio_bat_dau_dt - timedelta(minutes=minutes_before)
                        trang_thai = "Đúng giờ"
                    else:
                        minutes_late = random.randint(5, 20)
                        thoi_gian_quet = gio_bat_dau_dt + timedelta(minutes=minutes_late)
                        trang_thai = "Trễ"
                    
                    cursor.execute("""
                        INSERT INTO DiemDanh (MaSV, MaBuoi, ThoiGianQuet, TrangThai, NguonQuet)
                        VALUES (?, ?, ?, ?, N'Webcam')
                    """, (ma_sv, ma_buoi, thoi_gian_quet, trang_thai))
                    dd_count += 1
        
        print(f"   ✅ Đã tạo {dd_count} lượt điểm danh")
        
        # Commit
        conn.commit()
        
        # 8. Thống kê
        print("\n" + "=" * 60)
        print("📊 THỐNG KÊ DỮ LIỆU")
        print("=" * 60)
        
        cursor.execute("SELECT COUNT(*) FROM MonHoc")
        print(f"Môn học: {cursor.fetchone()[0]}")
        
        cursor.execute("SELECT COUNT(*) FROM LopHocPhan")
        print(f"Lớp học phần: {cursor.fetchone()[0]}")
        
        cursor.execute("SELECT COUNT(*) FROM SinhVien")
        print(f"Sinh viên: {cursor.fetchone()[0]}")
        
        cursor.execute("SELECT COUNT(*) FROM BuoiHoc")
        print(f"Buổi học: {cursor.fetchone()[0]}")
        
        cursor.execute("SELECT COUNT(*) FROM BuoiHoc WHERE NgayHoc = ?", (today,))
        print(f"Buổi học HÔM NAY: {cursor.fetchone()[0]}")
        
        cursor.execute("SELECT COUNT(*) FROM DiemDanh")
        print(f"Lượt điểm danh: {cursor.fetchone()[0]}")
        
        # Hiển thị buổi học hôm nay
        print("\n" + "=" * 60)
        print("📅 BUỔI HỌC HÔM NAY (Sẵn sàng điểm danh)")
        print("=" * 60)
        
        cursor.execute("""
            SELECT 
                bh.MaBuoi,
                mh.TenMon,
                lhp.GiangVien,
                CONVERT(VARCHAR, bh.GioBatDau, 108) as GioBatDau
            FROM BuoiHoc bh
            JOIN LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            JOIN MonHoc mh ON lhp.MaMon = mh.MaMon
            WHERE bh.NgayHoc = ?
            ORDER BY bh.GioBatDau
        """, (today,))
        
        sessions = cursor.fetchall()
        for s in sessions:
            print(f"  [{s[0]}] {s[1]} - {s[2]} | {s[3]}")
        
        print("\n" + "=" * 60)
        print("✅ HOÀN TẤT! DỮ LIỆU ĐÃ SẴN SÀNG")
        print("=" * 60)
        print("\n📝 BƯỚC TIẾP THEO:")
        print("1. Chụp ảnh khuôn mặt: python quick_capture.py")
        print("2. Crop faces: python scripts/crop_face.py")
        print("3. Extract embeddings: python scripts/extract_embedding.py")
        print("4. Chạy backend: python main.py")
        print("5. Test: http://localhost:3000/attendance")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ LỖI: {e}")
        conn.rollback()
        import traceback
        traceback.print_exc()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    create_real_data()