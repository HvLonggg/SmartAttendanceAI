"""
Script chụp ảnh từ webcam để tạo dataset
Chạy: python scripts/capture_from_webcam.py
"""

import cv2
import os
from datetime import datetime

def capture_images():
    """Chụp ảnh từ webcam"""
    
    print("=" * 60)
    print("📸 CHỤP ẢNH TỪ WEBCAM")
    print("=" * 60)
    
    # Nhập mã sinh viên
    ma_sv = input("\n👤 Nhập mã sinh viên: ").strip()
    
    if not ma_sv:
        print("❌ Mã sinh viên không được để trống!")
        return
    
    # Tạo thư mục
    output_dir = f"dataset_raw/{ma_sv}"
    os.makedirs(output_dir, exist_ok=True)
    
    # Đếm số ảnh hiện có
    existing_images = len([f for f in os.listdir(output_dir) if f.endswith(('.jpg', '.png'))])
    
    print(f"\n📁 Thư mục: {output_dir}")
    print(f"📊 Số ảnh hiện có: {existing_images}")
    
    num_images = int(input("📷 Số ảnh muốn chụp (khuyến nghị 15-20): ").strip() or "15")
    
    print("\n" + "=" * 60)
    print("📝 HƯỚNG DẪN:")
    print("=" * 60)
    print("""
- Nhìn thẳng vào camera
- Thay đổi góc độ: thẳng, nghiêng trái/phải, ngẩng/cúi nhẹ
- Thay đổi biểu cảm: bình thường, cười nhẹ
- Đảm bảo ánh sáng tốt, khuôn mặt rõ ràng

⌨️  PHÍM ĐIỀU KHIỂN:
   SPACE  : Chụp ảnh
   Q      : Thoát
""")
    
    input("Nhấn ENTER để bắt đầu...")
    
    # Mở camera
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("❌ Không thể mở camera!")
        return
    
    # Set resolution
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    count = 0
    
    print(f"\n📸 Bắt đầu chụp {num_images} ảnh...")
    print("=" * 60)
    
    while count < num_images:
        ret, frame = cap.read()
        
        if not ret:
            print("❌ Không thể đọc frame từ camera!")
            break
        
        # Hiển thị
        display_frame = frame.copy()
        
        # Vẽ hướng dẫn
        cv2.putText(display_frame, f"Captured: {count}/{num_images}", 
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        cv2.putText(display_frame, "Press SPACE to capture, Q to quit", 
                    (10, 460), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        
        # Vẽ khung hướng dẫn
        h, w = display_frame.shape[:2]
        cv2.rectangle(display_frame, (w//4, h//4), (3*w//4, 3*h//4), (0, 255, 0), 2)
        
        cv2.imshow(f'Capture Images - {ma_sv}', display_frame)
        
        key = cv2.waitKey(1) & 0xFF
        
        # Chụp ảnh
        if key == ord(' '):
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{output_dir}/img_{existing_images + count + 1:03d}_{timestamp}.jpg"
            cv2.imwrite(filename, frame)
            count += 1
            print(f"  ✅ Chụp {count}/{num_images}: {filename}")
        
        # Thoát
        elif key == ord('q'):
            print("\n⚠️ Đã hủy!")
            break
    
    cap.release()
    cv2.destroyAllWindows()
    
    print("\n" + "=" * 60)
    print(f"🎉 HOÀN TẤT! Đã chụp {count} ảnh")
    print("=" * 60)
    print(f"\n📁 Ảnh được lưu tại: {output_dir}")
    print(f"📊 Tổng số ảnh: {existing_images + count}")
    
    print("\n📝 BƯỚC TIẾP THEO:")
    print("=" * 60)
    print("""
1. Chụp thêm ảnh cho các sinh viên khác (nếu cần):
   >>> python scripts/capture_from_webcam.py

2. Cắt khuôn mặt:
   >>> python scripts/crop_face.py

3. Trích xuất embedding:
   >>> python scripts/extract_embedding.py

4. Khởi động server:
   >>> python main.py
""")

if __name__ == "__main__":
    try:
        capture_images()
    except KeyboardInterrupt:
        print("\n\n⚠️ Đã hủy bởi người dùng")
    except Exception as e:
        print(f"\n❌ Lỗi: {e}")