"""
Script setup hoàn chỉnh hệ thống
Chạy: python setup_complete.py
"""

import os
import subprocess
import sys

def run_command(command, description):
    """Chạy command với output đẹp"""
    print("\n" + "=" * 60)
    print(f"🔄 {description}")
    print("=" * 60)
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=False,
            text=True
        )
        print(f"✅ {description} - HOÀN TẤT")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} - LỖI")
        print(f"   Error: {e}")
        return False

def check_file(filepath, name):
    """Kiểm tra file tồn tại"""
    exists = os.path.exists(filepath)
    status = "✅" if exists else "❌"
    print(f"   {status} {name}: {filepath}")
    return exists

def main():
    print("=" * 60)
    print("🚀 SETUP COMPLETE - Smart Attendance AI")
    print("=" * 60)
    print("\nScript này sẽ setup toàn bộ hệ thống:")
    print("1. ✅ Kiểm tra môi trường")
    print("2. 📊 Thêm dữ liệu vào database")
    print("3. 📸 Hướng dẫn chụp ảnh")
    print("4. 🤖 Train AI model")
    print("5. 🚀 Sẵn sàng chạy")
    
    input("\nNhấn ENTER để bắt đầu...")
    
    # 1. Check environment
    print("\n" + "=" * 60)
    print("1️⃣ KIỂM TRA MÔI TRƯỜNG")
    print("=" * 60)
    
    print("\n📦 Checking Python packages...")
    required_packages = [
        'fastapi', 'uvicorn', 'pyodbc', 'opencv-python',
        'torch', 'facenet-pytorch', 'scikit-learn', 'numpy'
    ]
    
    missing = []
    for package in required_packages:
        try:
            __import__(package.replace('-', '_'))
            print(f"   ✅ {package}")
        except ImportError:
            print(f"   ❌ {package} - MISSING")
            missing.append(package)
    
    if missing:
        print(f"\n⚠️ Thiếu {len(missing)} packages!")
        print("   Chạy: pip install -r requirements.txt")
        return
    
    print("\n📁 Checking directories...")
    dirs = ['models', 'dataset_raw', 'dataset_cropped']
    for d in dirs:
        if not os.path.exists(d):
            os.makedirs(d)
            print(f"   ✅ Created: {d}/")
        else:
            print(f"   ✅ Exists: {d}/")
    
    # 2. Check database
    print("\n" + "=" * 60)
    print("2️⃣ KIỂM TRA DATABASE")
    print("=" * 60)
    
    try:
        from database.db_connection import get_connection
        conn = get_connection()
        cursor = conn.cursor()
        
        # Check tables
        cursor.execute("SELECT COUNT(*) FROM SinhVien")
        sv_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM BuoiHoc WHERE NgayHoc = CAST(GETDATE() AS DATE)")
        session_count = cursor.fetchone()[0]
        
        cursor.close()
        conn.close()
        
        print(f"   ✅ Database connected")
        print(f"   📊 Sinh viên: {sv_count}")
        print(f"   📅 Buổi học hôm nay: {session_count}")
        
        if session_count == 0:
            print("\n⚠️ Chưa có buổi học hôm nay!")
            print("   Chạy SQL script: database/insert_real_data.sql")
            response = input("\n   Bạn đã chạy SQL script chưa? (y/n): ")
            if response.lower() != 'y':
                print("   ℹ️  Vui lòng chạy SQL script trước!")
                return
        
    except Exception as e:
        print(f"   ❌ Database error: {e}")
        print("\n   📝 Hướng dẫn:")
        print("   1. Mở SQL Server Management Studio")
        print("   2. Chạy file: database/insert_real_data.sql")
        return
    
    # 3. Check face data
    print("\n" + "=" * 60)
    print("3️⃣ KIỂM TRA FACE DATA")
    print("=" * 60)
    
    face_db_exists = check_file("models/face_db.pkl", "Face Database")
    
    if not face_db_exists:
        print("\n⚠️ Chưa có Face Database!")
        print("\n📸 CẦN CHỤP ẢNH KHUÔN MẶT:")
        print("   Để hệ thống nhận diện được, bạn cần:")
        print("   1. Chụp 10-15 ảnh cho mỗi sinh viên")
        print("   2. Ảnh rõ ràng, góc độ đa dạng")
        print("   3. Tên folder = Mã SV")
        
        response = input("\n   Bạn muốn chụp ảnh ngay bây giờ? (y/n): ")
        
        if response.lower() == 'y':
            print("\n   ℹ️  Chạy script chụp ảnh:")
            print("   >>> python quick_capture.py")
            print("\n   Sau khi chụp xong, chạy lại:")
            print("   >>> python setup_complete.py")
            return
        else:
            print("\n   📝 Hướng dẫn thủ công:")
            print("   1. Tạo folder: dataset_raw/[MaSV]/")
            print("   2. Thêm 10-15 ảnh vào mỗi folder")
            print("   3. Chạy: python scripts/crop_face.py")
            print("   4. Chạy: python scripts/extract_embedding.py")
            return
    
    # 4. Check cropped and embeddings
    dataset_cropped = os.path.exists("dataset_cropped") and len(os.listdir("dataset_cropped")) > 0
    
    if face_db_exists:
        import pickle
        with open("models/face_db.pkl", "rb") as f:
            face_db = pickle.load(f)
        
        print(f"\n   ✅ Face Database có {len(face_db)} identities:")
        for identity in face_db.keys():
            print(f"      - {identity}")
        
        # Verify with database
        try:
            from database.db_connection import get_connection
            conn = get_connection()
            cursor = conn.cursor()
            
            not_found = []
            for ma_sv in face_db.keys():
                cursor.execute("SELECT HoTen FROM SinhVien WHERE MaSV = ?", (ma_sv,))
                row = cursor.fetchone()
                if row:
                    print(f"      ✅ {ma_sv} - {row[0]}")
                else:
                    print(f"      ⚠️ {ma_sv} - Không tìm thấy trong DB")
                    not_found.append(ma_sv)
            
            cursor.close()
            conn.close()
            
            if not_found:
                print(f"\n   ⚠️ {len(not_found)} mã SV không có trong database")
                print("      Cần thêm vào database hoặc xóa khỏi face_db")
        except Exception as e:
            print(f"   ⚠️ Không thể verify: {e}")
    
    # 5. Final check
    print("\n" + "=" * 60)
    print("4️⃣ KIỂM TRA CUỐI CÙNG")
    print("=" * 60)
    
    all_ready = True
    
    checks = [
        (sv_count > 0, "Database có sinh viên"),
        (session_count > 0, "Có buổi học hôm nay"),
        (face_db_exists, "Face Database tồn tại"),
        (len(face_db) > 0, "Có identity trong Face DB"),
    ]
    
    for status, desc in checks:
        symbol = "✅" if status else "❌"
        print(f"   {symbol} {desc}")
        if not status:
            all_ready = False
    
    # 6. Result
    print("\n" + "=" * 60)
    if all_ready:
        print("🎉 HỆ THỐNG SẴN SÀNG!")
        print("=" * 60)
        print("\n📝 BƯỚC TIẾP THEO:")
        print("   1. Mở Terminal 1:")
        print("      cd backend")
        print("      python main.py")
        print("")
        print("   2. Mở Terminal 2:")
        print("      cd frontend")
        print("      npm start")
        print("")
        print("   3. Truy cập: http://localhost:3000")
        print("   4. Vào /attendance để test điểm danh!")
        print("")
        print("🧪 TEST NHANH:")
        print("   python test_recognition.py")
    else:
        print("⚠️ HỆ THỐNG CHƯA SẴN SÀNG")
        print("=" * 60)
        print("\nVui lòng hoàn thành các bước thiếu ở trên!")
    
    print("=" * 60)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️ Đã hủy bởi người dùng")
    except Exception as e:
        print(f"\n❌ Lỗi: {e}")
        import traceback
        traceback.print_exc()