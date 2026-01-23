"""
Script test Face Recognition với webcam
Chạy: python test_recognition.py
"""

import cv2
import torch
import numpy as np
import pickle
import os
from facenet_pytorch import InceptionResnetV1
from sklearn.metrics.pairwise import cosine_similarity

print("=" * 60)
print("🔬 TEST FACE RECOGNITION SYSTEM")
print("=" * 60)

# 1. Load model
print("\n📦 Loading FaceNet model...")
model = InceptionResnetV1(pretrained='vggface2').eval()
print("✅ Model loaded!")

# 2. Load face database
face_database = {}
db_path = "models/face_db.pkl"

if os.path.exists(db_path):
    with open(db_path, "rb") as f:
        face_database = pickle.load(f)
    print(f"✅ Face database loaded: {len(face_database)} identities")
    print(f"   Identities: {list(face_database.keys())}")
else:
    print(f"❌ Face database not found at: {db_path}")
    print("\n📝 Hướng dẫn tạo face database:")
    print("   1. Thêm ảnh vào dataset_raw/[MaSV]/")
    print("   2. Chạy: python scripts/crop_face.py")
    print("   3. Chạy: python scripts/extract_embedding.py")
    exit(1)

# 3. Recognition function
def recognize_face(face_embedding, threshold=0.6):
    """Nhận diện khuôn mặt"""
    if not face_database:
        return "Unknown", 0.0
    
    best_score = 0
    identity = "Unknown"
    
    for name, emb in face_database.items():
        score = cosine_similarity(
            face_embedding.reshape(1, -1), 
            emb.reshape(1, -1)
        )[0][0]
        
        if score > best_score:
            best_score = score
            identity = name
    
    if best_score < threshold:
        return "Unknown", best_score
    
    return identity, best_score

# 4. Test với webcam
print("\n📷 Opening webcam...")
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("❌ Cannot open webcam!")
    exit(1)

cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

print("\n" + "=" * 60)
print("🎥 WEBCAM ACTIVE")
print("=" * 60)
print("""
⌨️  CONTROLS:
   SPACE  : Capture and recognize
   Q      : Quit
   
📝 Hướng dẫn:
   - Nhìn thẳng vào camera
   - Khuôn mặt rõ ràng, ánh sáng tốt
   - Nhấn SPACE để nhận diện
""")

frame_count = 0
recognition_results = []

while True:
    ret, frame = cap.read()
    
    if not ret:
        print("❌ Cannot read frame!")
        break
    
    frame_count += 1
    
    # Display
    display_frame = frame.copy()
    h, w = display_frame.shape[:2]
    
    # Draw guide box
    cv2.rectangle(display_frame, 
                  (w//4, h//4), (3*w//4, 3*h//4), 
                  (0, 255, 0), 2)
    
    # Instructions
    cv2.putText(display_frame, "Press SPACE to recognize", 
                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    cv2.putText(display_frame, "Press Q to quit", 
                (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    
    # Show recent results
    if recognition_results:
        y_offset = 100
        for result in recognition_results[-3:]:  # Show last 3
            text = f"{result['identity']} ({result['confidence']:.2%})"
            color = (0, 255, 0) if result['identity'] != "Unknown" else (0, 0, 255)
            cv2.putText(display_frame, text, 
                       (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
            y_offset += 30
    
    cv2.imshow('Face Recognition Test', display_frame)
    
    key = cv2.waitKey(1) & 0xFF
    
    # Recognize
    if key == ord(' '):
        print("\n" + "-" * 60)
        print(f"🔍 Recognizing... (Frame #{frame_count})")
        
        try:
            # Preprocess
            img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            img_resized = cv2.resize(img_rgb, (160, 160))
            img_tensor = torch.from_numpy(img_resized).permute(2, 0, 1).float()
            img_tensor = img_tensor.unsqueeze(0) / 255.0
            
            # Extract embedding
            with torch.no_grad():
                embedding = model(img_tensor).cpu().numpy()[0]
            
            # Recognize
            identity, confidence = recognize_face(embedding)
            
            # Store result
            result = {
                'identity': identity,
                'confidence': confidence,
                'frame': frame_count
            }
            recognition_results.append(result)
            
            # Print result
            if identity != "Unknown":
                print(f"✅ RECOGNIZED: {identity}")
                print(f"   Confidence: {confidence:.2%}")
                
                # Get student info from database
                try:
                    import sys
                    sys.path.append('.')
                    from database.db_connection import get_connection
                    
                    conn = get_connection()
                    cursor = conn.cursor()
                    cursor.execute("SELECT * FROM SinhVien WHERE MaSV = ?", (identity,))
                    row = cursor.fetchone()
                    
                    if row:
                        print(f"   Họ tên: {row[1]}")
                        print(f"   Lớp: {row[4]}")
                        print(f"   Khoa: {row[5]}")
                    else:
                        print(f"   ⚠️ Không tìm thấy thông tin trong database")
                    
                    cursor.close()
                    conn.close()
                except Exception as e:
                    print(f"   ⚠️ Lỗi truy vấn database: {e}")
            else:
                print(f"❌ UNKNOWN FACE")
                print(f"   Best match confidence: {confidence:.2%} (threshold: 60%)")
                print(f"   💡 Tip: Thêm ảnh vào dataset và train lại")
            
        except Exception as e:
            print(f"❌ Recognition error: {e}")
    
    # Quit
    elif key == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()

# Statistics
print("\n" + "=" * 60)
print("📊 STATISTICS")
print("=" * 60)
print(f"Total frames: {frame_count}")
print(f"Recognition attempts: {len(recognition_results)}")

if recognition_results:
    successful = [r for r in recognition_results if r['identity'] != "Unknown"]
    print(f"Successful: {len(successful)} ({len(successful)/len(recognition_results)*100:.1f}%)")
    
    if successful:
        print("\n✅ Recognized identities:")
        identity_counts = {}
        for r in successful:
            identity_counts[r['identity']] = identity_counts.get(r['identity'], 0) + 1
        
        for identity, count in identity_counts.items():
            avg_conf = np.mean([r['confidence'] for r in successful if r['identity'] == identity])
            print(f"   {identity}: {count} times (avg confidence: {avg_conf:.2%})")

print("\n✅ Test completed!")
print("=" * 60)