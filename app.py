import cv2
import torch
from datetime import time
from ultralytics import YOLO
from facenet_pytorch import InceptionResnetV1

from scripts.recognize import recognize
from database.attendance_service import da_diem_danh, ghi_diem_danh

# ================== LOAD MODELS ==================
yolo = YOLO("yolov8n-face.pt")
facenet = InceptionResnetV1(pretrained="vggface2").eval()

# ================== CAMERA ==================
cap = cv2.VideoCapture(0)

# ================== CONFIG ==================
MA_BUOI = 1
GIO_BAT_DAU = time(7, 30)

# ⚠️ HẠ NGƯỠNG ĐỂ ÉP NHẬN DIỆN
CONF_THRESHOLD = 0.4

# Cache SV đã điểm danh trong phiên
checked_students = set()

print("=== START SMART ATTENDANCE ===")

# ================== MAIN LOOP ==================
while True:
    ret, frame = cap.read()
    if not ret:
        break

    results = yolo(frame, conf=0.5)

    if len(results) == 0:
        cv2.imshow("Smart Attendance AI", frame)
        if cv2.waitKey(1) & 0xFF in [27, ord("q")]:
            break
        continue

    for box in results[0].boxes.xyxy:
        x1, y1, x2, y2 = map(int, box)
        face = frame[y1:y2, x1:x2]

        if face.size == 0:
            continue

        # ===== PREPROCESS =====
        face = cv2.resize(face, (160, 160))
        face = cv2.cvtColor(face, cv2.COLOR_BGR2RGB)
        face = face / 255.0

        face_t = torch.tensor(face).permute(2, 0, 1).unsqueeze(0).float()

        with torch.no_grad():
            emb = facenet(face_t).cpu().numpy()

        # ===== NHẬN DIỆN =====
        name, score = recognize(emb)

        print(f"[DEBUG] Detect: {name} | score={score:.2f}")

        label = "Unknown"
        color = (0, 0, 255)

        # ===== ÉP INSERT DB =====
        if score >= CONF_THRESHOLD:
            ma_sv = name if name != "Unknown" else "TEST_SV"

            if ma_sv not in checked_students:
                if not da_diem_danh(ma_sv, MA_BUOI):
                    print(f"[DB] INSERT DiemDanh: {ma_sv}")
                    ghi_diem_danh(ma_sv, MA_BUOI, GIO_BAT_DAU)

                checked_students.add(ma_sv)

            label = f"{ma_sv} | {score:.2f}"
            color = (0, 255, 0)

        # ===== DRAW =====
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        cv2.putText(
            frame,
            label,
            (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            color,
            2
        )

    cv2.imshow("Smart Attendance AI", frame)

    key = cv2.waitKey(1) & 0xFF
    if key == 27 or key == ord("q"):
        break

# ================== CLEAN ==================
cap.release()
cv2.destroyAllWindows()
print("=== STOP ===")
