import cv2
import torch
import time
from datetime import datetime
from ultralytics import YOLO
from facenet_pytorch import InceptionResnetV1

from scripts.recognize import recognize
# Import đầy đủ các hàm service
from attendance_service import (
    da_diem_danh, 
    ghi_diem_danh, 
    get_current_active_session, 
    is_student_enrolled
)

# ================== LOAD MODELS ==================
yolo = YOLO("yolov8n-face.pt")
facenet = InceptionResnetV1(pretrained="vggface2").eval()

# ================== CAMERA ==================
cap = cv2.VideoCapture(0)

# ================== CONFIG ==================
CONF_THRESHOLD = 0.5

# Biến lưu trạng thái buổi học hiện tại
current_session = None
last_check_time = 0
checked_students = set()

print("=== START SMART ATTENDANCE ===")

while True:
    ret, frame = cap.read()
    if not ret: break

    # --- LOGIC 1: TỰ ĐỘNG CHECK BUỔI HỌC (MỖI 5 GIÂY) ---
    if time.time() - last_check_time > 5:
        session_info = get_current_active_session()
        
        # Nếu phát hiện chuyển đổi phiên (có lớp mới hoặc hết lớp cũ)
        if session_info != current_session:
            current_session = session_info
            checked_students.clear() # Reset danh sách đã điểm danh
            
            if current_session:
                print(f"--> ĐANG HỌC: {current_session['MaLHP']} (ID: {current_session['MaBuoi']})")
            else:
                print("--> HIỆN TẠI KHÔNG CÓ LỊCH HỌC")
        
        last_check_time = time.time()

    # --- LOGIC 2: HIỂN THỊ THÔNG TIN LÊN MÀN HÌNH ---
    if not current_session:
        cv2.putText(frame, "KHONG CO LICH HOC", (50, 50), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        cv2.imshow("Smart Attendance AI", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'): break
        continue
    else:
        info = f"Lop: {current_session['MaLHP']} | ID: {current_session['MaBuoi']}"
        cv2.putText(frame, info, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)

    # --- LOGIC 3: NHẬN DIỆN ---
    results = yolo(frame, conf=0.5, verbose=False)

    if len(results) > 0:
        for box in results[0].boxes.xyxy:
            x1, y1, x2, y2 = map(int, box)
            
            face_img = frame[y1:y2, x1:x2]
            if face_img.size == 0: continue
            
            # Preprocess cho FaceNet
            try:
                face_rez = cv2.resize(face_img, (160, 160))
                face_t = torch.tensor(face_rez).permute(2, 0, 1).unsqueeze(0).float() / 255.0
                
                with torch.no_grad():
                    emb = facenet(face_t).cpu().numpy()
                
                # Gọi hàm nhận diện của bạn
                name, score = recognize(emb)
                
                if score >= CONF_THRESHOLD and name != "Unknown":
                    ma_sv = name
                    
                    # 1. Check xem SV có thuộc lớp này không?
                    if is_student_enrolled(ma_sv, current_session['MaLHP']):
                        
                        # 2. Check đã điểm danh chưa?
                        is_checked = False
                        if ma_sv in checked_students:
                            is_checked = True
                        elif da_diem_danh(ma_sv, current_session['MaBuoi']):
                            checked_students.add(ma_sv)
                            is_checked = True
                        
                        if not is_checked:
                            # Thực hiện điểm danh
                            ghi_diem_danh(ma_sv, current_session['MaBuoi'], current_session['GioBatDau'])
                            checked_students.add(ma_sv)
                            print(f"[SUCCESS] Điểm danh: {ma_sv}")
                        
                        # Vẽ khung XANH (Hợp lệ)
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                        cv2.putText(frame, f"{ma_sv} (OK)", (x1, y1-10), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
                    else:
                        # Vẽ khung VÀNG (Sai lớp)
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
                        cv2.putText(frame, f"{ma_sv} (Wrong Class)", (x1, y1-10), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
                else:
                    # Vẽ khung ĐỎ (Unknown)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)

            except Exception as e:
                pass

    cv2.imshow("Smart Attendance AI", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'): break

cap.release()
cv2.destroyAllWindows()