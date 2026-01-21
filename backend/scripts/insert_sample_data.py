"""
Script thêm dữ liệu mẫu vào database
Chạy: python scripts/insert_sample_data.py
"""

import sys
sys.path.append('.')

from database.db_connection import get_connection
from datetime import datetime, timedelta

def insert_sample_data():
    """Thêm dữ liệu mẫu vào database"""
    conn = get_connection()
    cursor = conn.cursor()
    
    print("🔄 Bắt đầu thêm dữ liệu mẫu...")
    
    try:
        # 1. Thêm Môn học
        print("\n📚 Thêm môn học...")
        mon_hoc = [
            ('IT001', 'Lập trình Web', 15, 45),
            ('IT002', 'Cơ sở dữ liệu', 15, 45),
            ('IT003', 'Trí tuệ nhân tạo', 15, 45),
            ('IT004', 'Mạng máy tính', 15, 45),
            ('IT005', 'Phân tích thiết kế hệ thống', 15, 45),
        ]
        
        for mh in mon_hoc:
            try:
                cursor.execute("""
                    IF NOT EXISTS (SELECT 1 FROM MonHoc WHERE MaMon = ?)
                    INSERT INTO MonHoc (MaMon, TenMon, SoBuoi, SoTiet)
                    VALUES (?, ?, ?, ?)
                """, (mh[0], mh[0], mh[1], mh[2], mh[3]))
                print(f"  ✅ Thêm môn: {mh[1]}")
            except:
                print(f"  ⚠️ Môn {mh[1]} đã tồn tại")
        
        # 2. Thêm Lớp học phần
        print("\n🏫 Thêm lớp học phần...")
        lop_hoc_phan = [
            ('LHP001', 'IT001', 'HK1', '2024-2025', 'TS. Nguyễn Văn A', '07:00:00', '09:30:00'),
            ('LHP002', 'IT002', 'HK1', '2024-2025', 'TS. Trần Thị B', '09:45:00', '12:15:00'),
            ('LHP003', 'IT003', 'HK1', '2024-2025', 'ThS. Lê Văn C', '13:00:00', '15:30:00'),
            ('LHP004', 'IT004', 'HK1', '2024-2025', 'TS. Phạm Thị D', '15:45:00', '18:15:00'),
        ]
        
        for lhp in lop_hoc_phan:
            try:
                cursor.execute("""
                    IF NOT EXISTS (SELECT 1 FROM LopHocPhan WHERE MaLHP = ?)
                    INSERT INTO LopHocPhan (MaLHP, MaMon, HocKy, NamHoc, GiangVien, GioBatDau, GioKetThuc)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (lhp[0], lhp[0], lhp[1], lhp[2], lhp[3], lhp[4], lhp[5], lhp[6]))
                print(f"  ✅ Thêm lớp: {lhp[0]} - {lhp[4]}")
            except:
                print(f"  ⚠️ Lớp {lhp[0]} đã tồn tại")
        
        # 3. Thêm Sinh viên (nếu chưa có)
        print("\n👥 Thêm sinh viên mẫu...")
        sinh_vien = [
            ('20220001', 'Nguyễn Văn A', '2004-01-15', 'Nam', 'DCCNTT13.10.1', 'Công nghệ thông tin', '20220001@eaut.edu.vn'),
            ('20220002', 'Trần Thị B', '2004-02-20', 'Nữ', 'DCCNTT13.10.1', 'Công nghệ thông tin', '20220002@eaut.edu.vn'),
            ('20220003', 'Lê Văn C', '2004-03-10', 'Nam', 'DCCNTT13.10.1', 'Công nghệ thông tin', '20220003@eaut.edu.vn'),
            ('20220034', 'Hoàng Quang Huy', '2004-05-15', 'Nam', 'DCCNTT13.10.1', 'Công nghệ thông tin', '20220034@eaut.edu.vn'),
            ('20220035', 'Hoàng Văn Long', '2004-06-20', 'Nam', 'DCCNTT13.10.1', 'Công nghệ thông tin', '20220035@eaut.edu.vn'),
            ('20222902', 'Nguyễn Thùy Dung', '2004-07-25', 'Nữ', 'DCCNTT13.10.15', 'Công nghệ thông tin', '20222902@eaut.edu.vn'),
        ]
        
        for sv in sinh_vien:
            try:
                cursor.execute("""
                    IF NOT EXISTS (SELECT 1 FROM SinhVien WHERE MaSV = ?)
                    INSERT INTO SinhVien (MaSV, HoTen, NgaySinh, GioiTinh, Lop, Khoa, Email, TrangThai)
                    VALUES (?, ?, ?, ?, ?, ?, ?, N'Đang học')
                """, (sv[0], sv[0], sv[1], sv[2], sv[3], sv[4], sv[5], sv[6]))
                print(f"  ✅ Thêm SV: {sv[1]} ({sv[0]})")
            except:
                print(f"  ⚠️ SV {sv[1]} đã tồn tại")
        
        # 4. Đăng ký học
        print("\n📝 Đăng ký học cho sinh viên...")
        for sv in sinh_vien:
            ma_sv = sv[0]
            # Đăng ký 3 lớp đầu tiên
            for lhp in lop_hoc_phan[:3]:
                ma_lhp = lhp[0]
                try:
                    cursor.execute("""
                        IF NOT EXISTS (SELECT 1 FROM DangKyHoc WHERE MaSV = ? AND MaLHP = ?)
                        INSERT INTO DangKyHoc (MaSV, MaLHP) VALUES (?, ?)
                    """, (ma_sv, ma_lhp, ma_sv, ma_lhp))
                except:
                    pass
        print("  ✅ Đăng ký học hoàn tất")
        
        # 5. Tạo buổi học
        print("\n📅 Tạo buổi học...")
        
        # Tạo buổi học cho 2 tuần gần đây
        today = datetime.now().date()
        
        for lhp in lop_hoc_phan[:3]:
            ma_lhp = lhp[0]
            gio_bat_dau = lhp[5]
            
            # Tạo 10 buổi học (2 tuần, mỗi tuần 5 buổi)
            for i in range(10):
                ngay_hoc = today - timedelta(days=14-i)
                
                try:
                    cursor.execute("""
                        IF NOT EXISTS (
                            SELECT 1 FROM BuoiHoc 
                            WHERE MaLHP = ? AND NgayHoc = ?
                        )
                        INSERT INTO BuoiHoc (MaLHP, NgayHoc, GioBatDau)
                        VALUES (?, ?, ?)
                    """, (ma_lhp, ngay_hoc, ma_lhp, ngay_hoc, gio_bat_dau))
                except:
                    pass
        
        print("  ✅ Tạo buổi học hoàn tất")
        
        # 6. Tạo dữ liệu điểm danh
        print("\n✅ Tạo dữ liệu điểm danh...")
        
        # Lấy danh sách buổi học
        cursor.execute("""
            SELECT MaBuoi, MaLHP, NgayHoc, GioBatDau 
            FROM BuoiHoc 
            ORDER BY NgayHoc DESC
        """)
        buoi_hoc_list = cursor.fetchall()
        
        import random
        
        for buoi in buoi_hoc_list:
            ma_buoi = buoi[0]
            ma_lhp = buoi[1]
            ngay_hoc = buoi[2]
            gio_bat_dau = buoi[3]
            
            # Lấy danh sách sinh viên đăng ký lớp này
            cursor.execute("""
                SELECT MaSV FROM DangKyHoc WHERE MaLHP = ?
            """, (ma_lhp,))
            sinh_vien_dk = cursor.fetchall()
            
            for sv in sinh_vien_dk:
                ma_sv = sv[0]
                
                # 90% có mặt, 10% vắng
                if random.random() < 0.9:
                    # Tạo thời gian quét ngẫu nhiên
                    gio_bat_dau_dt = datetime.combine(ngay_hoc, gio_bat_dau)
                    
                    # 70% đúng giờ, 30% trễ
                    if random.random() < 0.7:
                        # Đúng giờ: trước hoặc đúng giờ bắt đầu
                        minutes_before = random.randint(0, 10)
                        thoi_gian_quet = gio_bat_dau_dt - timedelta(minutes=minutes_before)
                        trang_thai = "Đúng giờ"
                    else:
                        # Trễ: sau giờ bắt đầu 5-20 phút
                        minutes_late = random.randint(5, 20)
                        thoi_gian_quet = gio_bat_dau_dt + timedelta(minutes=minutes_late)
                        trang_thai = "Trễ"
                    
                    try:
                        cursor.execute("""
                            IF NOT EXISTS (
                                SELECT 1 FROM DiemDanh 
                                WHERE MaSV = ? AND MaBuoi = ?
                            )
                            INSERT INTO DiemDanh (MaSV, MaBuoi, ThoiGianQuet, TrangThai, NguonQuet)
                            VALUES (?, ?, ?, ?, N'Webcam')
                        """, (ma_sv, ma_buoi, ma_sv, ma_buoi, thoi_gian_quet, trang_thai))
                    except:
                        pass
        
        print("  ✅ Dữ liệu điểm danh hoàn tất")
        
        # Commit tất cả
        conn.commit()
        
        print("\n" + "="*50)
        print("🎉 HOÀN TẤT! Dữ liệu mẫu đã được thêm vào database")
        print("="*50)
        
        # Thống kê
        cursor.execute("SELECT COUNT(*) FROM SinhVien")
        print(f"📊 Tổng số sinh viên: {cursor.fetchone()[0]}")
        
        cursor.execute("SELECT COUNT(*) FROM MonHoc")
        print(f"📚 Tổng số môn học: {cursor.fetchone()[0]}")
        
        cursor.execute("SELECT COUNT(*) FROM BuoiHoc")
        print(f"📅 Tổng số buổi học: {cursor.fetchone()[0]}")
        
        cursor.execute("SELECT COUNT(*) FROM DiemDanh")
        print(f"✅ Tổng số lượt điểm danh: {cursor.fetchone()[0]}")
        
        print("="*50)
        
    except Exception as e:
        print(f"\n❌ Lỗi: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    insert_sample_data()