"""
Script chụp ảnh NHANH từ webcam
Chạy: python quick_capture.py
"""

import cv2
import os
from datetime import datetime

print("=" * 60)
print("📸 QUICK CAPTURE - Chụp ảnh nhanh")
print("=" * 60)

# Input
ma_sv = input("\n👤 Nhập mã sinh viên (VD: 20220035): ").strip()

if not ma_sv:
    print("❌ Mã sinh viên không được để trống!")
    exit(1)

# Create directory
output_dir = f"dataset_raw/{ma_sv}"
os.makedirs(output_dir, exist_ok=True)

print(f"\n📁 Thư mục: {output_dir}")
print(f"📷 Sẽ chụp 15 ảnh")
print("\n⌨️  Nhấn SPACE để chụp, Q để thoát")
print("-" * 60)

input("Nhấn ENTER để bắt đầu...")

# Open camera
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("❌ Không thể mở camera!")
    exit(1)

cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

count = 0
target = 15

print(f"\n🎥 Camera đã mở. Bắt đầu chụp...")

while count < target:
    ret, frame = cap.read()
    
    if not ret:
        break
    
    # Display
    display = frame.copy()
    h, w = display.shape[:2]
    
    # Progress
    cv2.putText(display, f"Captured: {count}/{target}", 
                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
    cv2.putText(display, "Press SPACE to capture", 
                (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    
    # Guide box
    cv2.rectangle(display, (w//4, h//4), (3*w//4, 3*h//4), (0, 255, 0), 2)
    
    cv2.imshow(f'Quick Capture - {ma_sv}', display)
    
    key = cv2.waitKey(1) & 0xFF
    
    if key == ord(' '):
        filename = f"{output_dir}/img_{count+1:03d}.jpg"
        cv2.imwrite(filename, frame)
        count += 1
        print(f"  ✅ [{count}/{target}] Captured")
        
    elif key == ord('q'):
        print("\n⚠️ Đã hủy!")
        break

cap.release()
cv2.destroyAllWindows()

print("\n" + "=" * 60)
print(f"🎉 HOÀN TẤT! Đã chụp {count} ảnh")
print("=" * 60)
print(f"\n📁 Ảnh được lưu tại: {output_dir}")

if count >= 10:
    print("\n✅ Đủ ảnh để train! Chạy tiếp:")
    print("   1. python scripts/crop_face.py")
    print("   2. python scripts/extract_embedding.py")
    print("   3. python main.py")
else:
    print(f"\n⚠️ Chỉ có {count} ảnh (khuyến nghị >= 10)")
    print("   Chạy lại script để chụp thêm!")

print("=" * 60)