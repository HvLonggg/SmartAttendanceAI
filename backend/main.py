from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date, time, timedelta
import cv2
import numpy as np
import pickle
import base64
import os
import io
import torch
from facenet_pytorch import InceptionResnetV1
from ultralytics import YOLO
from sklearn.metrics.pairwise import cosine_similarity
import pyodbc

# Import training module
from training_module import training_manager

app = FastAPI(title="Smart Attendance AI API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== LOAD MODELS ====================
print("=" * 60)
print("🤖 LOADING AI MODELS...")
print("=" * 60)

# YOLO
try:
    yolo_model = YOLO("yolov8n.pt")
    print("✅ YOLO loaded")
except:
    yolo_model = None
    print("⚠️ YOLO not loaded")

# FaceNet
try:
    facenet_model = InceptionResnetV1(pretrained='vggface2').eval()
    print("✅ FaceNet loaded")
except:
    facenet_model = None
    exit(1)

# Face Database
def load_face_database():
    """Reload face database"""
    db_path = "models/face_db.pkl"
    if os.path.exists(db_path):
        with open(db_path, "rb") as f:
            return pickle.load(f)
    return {}

face_database = load_face_database()
print(f"✅ Face DB: {len(face_database)} identities")
print("=" * 60)

from database.db_connection import get_connection

# ==================== MODELS ====================

class StudentInfo(BaseModel):
    ma_sv: str
    ho_ten: str
    ngay_sinh: Optional[date]
    gioi_tinh: Optional[str]
    lop: Optional[str]
    khoa: Optional[str]
    email: Optional[str]
    trang_thai: Optional[str]

# ==================== AI FUNCTIONS ====================

def detect_and_align_face(image):
    """Detect face và align để tăng độ chính xác"""
    if yolo_model is None:
        return image
    
    try:
        results = yolo_model(image, verbose=False)
        
        if len(results[0].boxes) > 0:
            box = results[0].boxes.xyxy[0].cpu().numpy()
            x1, y1, x2, y2 = map(int, box)
            
            # Add margin
            h, w = image.shape[:2]
            margin = int((x2 - x1) * 0.2)
            x1 = max(0, x1 - margin)
            y1 = max(0, y1 - margin)
            x2 = min(w, x2 + margin)
            y2 = min(h, y2 + margin)
            
            face = image[y1:y2, x1:x2]
            return face
    except:
        pass
    
    return image

def extract_embedding_high_quality(image_bytes):
    """Extract embedding với độ chính xác cao"""
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return None, "Invalid image"
        
        # Detect and crop face
        face = detect_and_align_face(img)
        
        # Convert to RGB
        face_rgb = cv2.cvtColor(face, cv2.COLOR_BGR2RGB)
        
        # Resize to 160x160
        face_resized = cv2.resize(face_rgb, (160, 160))
        
        # Normalize
        face_tensor = torch.from_numpy(face_resized).permute(2, 0, 1).float()
        face_tensor = face_tensor.unsqueeze(0) / 255.0
        
        # Extract
        with torch.no_grad():
            embedding = facenet_model(face_tensor).cpu().numpy()[0]
        
        return embedding, None
        
    except Exception as e:
        return None, str(e)

def recognize_with_high_accuracy(embedding, threshold=0.65):
    """Nhận diện với độ chính xác cao"""
    global face_database
    
    # Reload database to get latest
    face_database = load_face_database()
    
    if not face_database or embedding is None:
        return "Unknown", 0.0, []
    
    scores = []
    
    for name, db_emb in face_database.items():
        try:
            score = cosine_similarity(
                embedding.reshape(1, -1),
                db_emb.reshape(1, -1)
            )[0][0]
            scores.append((name, score))
        except:
            continue
    
    # Sort by score
    scores.sort(key=lambda x: x[1], reverse=True)
    
    if not scores or scores[0][1] < threshold:
        return "Unknown", scores[0][1] if scores else 0.0, scores[:5]
    
    return scores[0][0], scores[0][1], scores[:5]

# ==================== ENDPOINTS ====================

@app.get("/")
async def root():
    return {
        "message": "Smart Attendance AI API",
        "status": "running",
        "yolo_loaded": yolo_model is not None,
        "facenet_loaded": facenet_model is not None,
        "face_database": {
            "loaded": len(face_database) > 0,
            "count": len(face_database),
            "identities": list(face_database.keys())
        }
    }

# ==================== STUDENT APIs ====================

@app.get("/api/students", response_model=List[StudentInfo])
async def get_all_students():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM SinhVien ORDER BY MaSV")
    rows = cursor.fetchall()
    
    students = []
    for row in rows:
        students.append(StudentInfo(
            ma_sv=row[0], ho_ten=row[1], ngay_sinh=row[2],
            gioi_tinh=row[3], lop=row[4], khoa=row[5],
            email=row[6], trang_thai=row[7]
        ))
    
    cursor.close()
    conn.close()
    return students

@app.get("/api/students/{ma_sv}", response_model=StudentInfo)
async def get_student(ma_sv: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM SinhVien WHERE MaSV = ?", (ma_sv,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Sinh viên không tồn tại")
    
    return StudentInfo(
        ma_sv=row[0], ho_ten=row[1], ngay_sinh=row[2],
        gioi_tinh=row[3], lop=row[4], khoa=row[5],
        email=row[6], trang_thai=row[7]
    )

@app.post("/api/students")
async def create_student(student: StudentInfo):
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            INSERT INTO SinhVien 
            (MaSV, HoTen, NgaySinh, GioiTinh, Lop, Khoa, Email, TrangThai)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            student.ma_sv, student.ho_ten, student.ngay_sinh,
            student.gioi_tinh, student.lop, student.khoa,
            student.email, student.trang_thai or 'Đang học'
        ))
        conn.commit()
        return {"success": True, "message": "Thêm sinh viên thành công"}
    except pyodbc.IntegrityError:
        raise HTTPException(status_code=400, detail="Mã sinh viên đã tồn tại")
    finally:
        cursor.close()
        conn.close()

# ==================== TRAINING APIs ====================

@app.post("/api/training/upload-image/{ma_sv}")
async def upload_training_image(ma_sv: str, file: UploadFile = File(...)):
    """Upload ảnh training cho sinh viên"""
    try:
        contents = await file.read()
        filepath, error = training_manager.save_training_image(ma_sv, contents)
        
        if error:
            raise HTTPException(status_code=400, detail=error)
        
        return {
            "success": True,
            "message": "Ảnh đã được lưu",
            "filepath": filepath
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/training/images/{ma_sv}")
async def get_training_images(ma_sv: str):
    """Lấy danh sách ảnh training"""
    images = training_manager.get_training_images(ma_sv)
    return {
        "ma_sv": ma_sv,
        "count": len(images),
        "images": images
    }

@app.get("/api/training/image/{ma_sv}/{filename}")
async def get_training_image(ma_sv: str, filename: str):
    """Lấy ảnh training"""
    filepath = os.path.join("dataset_raw", ma_sv, filename)
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Image not found")
    
    return FileResponse(filepath)

@app.delete("/api/training/image/{ma_sv}/{filename}")
async def delete_training_image(ma_sv: str, filename: str):
    """Xóa ảnh training"""
    success = training_manager.delete_training_image(ma_sv, filename)
    
    if not success:
        raise HTTPException(status_code=404, detail="Image not found")
    
    return {"success": True, "message": "Đã xóa ảnh"}

@app.post("/api/training/train/{ma_sv}")
async def train_student_model(ma_sv: str):
    """Train model cho sinh viên"""
    result = training_manager.train_student(ma_sv)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    
    # Reload face database
    global face_database
    face_database = load_face_database()
    
    return result

@app.get("/api/training/status/{ma_sv}")
async def get_training_status(ma_sv: str):
    """Kiểm tra trạng thái training"""
    images = training_manager.get_training_images(ma_sv)
    db_info = training_manager.get_face_database_info()
    
    return {
        "ma_sv": ma_sv,
        "training_images_count": len(images),
        "in_database": ma_sv in db_info["identities"],
        "ready_to_recognize": ma_sv in db_info["identities"] and len(images) >= 5
    }

@app.delete("/api/training/remove/{ma_sv}")
async def remove_student_training(ma_sv: str):
    """Xóa toàn bộ training data"""
    training_manager.delete_all_training_images(ma_sv)
    training_manager.remove_from_database(ma_sv)
    
    # Reload
    global face_database
    face_database = load_face_database()
    
    return {"success": True, "message": "Đã xóa toàn bộ training data"}

# ==================== RECOGNITION APIs ====================

@app.post("/api/recognize")
async def recognize_face_endpoint(file: UploadFile = File(...)):
    """Nhận diện khuôn mặt - Độ chính xác cao"""
    try:
        contents = await file.read()
        
        # Extract embedding
        embedding, error = extract_embedding_high_quality(contents)
        
        if error:
            return {
                "success": False,
                "message": error,
                "identity": None,
                "confidence": 0
            }
        
        # Recognize
        identity, confidence, top_matches = recognize_with_high_accuracy(embedding)
        
        if identity == "Unknown":
            return {
                "success": False,
                "message": "Không nhận diện được",
                "identity": None,
                "confidence": confidence,
                "top_matches": [{"identity": m[0], "score": float(m[1])} for m in top_matches]
            }
        
        # Get student info
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM SinhVien WHERE MaSV = ?", (identity,))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if row:
            return {
                "success": True,
                "identity": identity,
                "confidence": float(confidence),
                "student_info": {
                    "ma_sv": row[0],
                    "ho_ten": row[1],
                    "ngay_sinh": row[2].isoformat() if row[2] else None,
                    "gioi_tinh": row[3],
                    "lop": row[4],
                    "khoa": row[5],
                    "email": row[6]
                },
                "top_matches": [{"identity": m[0], "score": float(m[1])} for m in top_matches[:3]]
            }
        
        return {
            "success": False,
            "message": "Nhận diện được nhưng không có trong database",
            "identity": identity,
            "confidence": float(confidence)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== SESSION APIs ====================

@app.get("/api/sessions/today")
async def get_today_sessions():
    """Lấy tất cả buổi học (không chỉ hôm nay) để debug"""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Query lấy TẤT CẢ buổi học để kiểm tra
    cursor.execute("""
        SELECT 
            bh.MaBuoi, 
            bh.MaLHP, 
            bh.NgayHoc, 
            bh.GioBatDau,
            lhp.GiangVien, 
            mh.TenMon
        FROM BuoiHoc bh
        JOIN LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
        JOIN MonHoc mh ON lhp.MaMon = mh.MaMon
        ORDER BY bh.NgayHoc DESC, bh.GioBatDau
    """)
    
    sessions = []
    for row in cursor.fetchall():
        try:
            # Xử lý cẩn thận datetime
            ngay_hoc = row[2].isoformat() if row[2] else None
            
            # Chuyển time object thành string HH:MM
            if row[3]:
                if isinstance(row[3], str):
                    gio_bat_dau = row[3]
                else:
                    # Nếu là time object
                    gio_bat_dau = row[3].strftime("%H:%M:%S")
            else:
                gio_bat_dau = None
            
            sessions.append({
                "ma_buoi": row[0],
                "ma_lhp": row[1],
                "ngay_hoc": ngay_hoc,
                "gio_bat_dau": gio_bat_dau,
                "giang_vien": row[4],
                "ten_mon": row[5]
            })
        except Exception as e:
            print(f"Error processing row: {e}")
            continue
    
    cursor.close()
    conn.close()
    
    print(f"📊 Found {len(sessions)} sessions")  # Debug log
    return sessions


# Thêm endpoint mới để lọc theo ngày
@app.get("/api/sessions/by-date")
async def get_sessions_by_date(date: str = None):
    """
    Lấy buổi học theo ngày
    date format: YYYY-MM-DD (vd: 2026-01-25)
    Nếu không truyền date, lấy hôm nay
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    if date:
        query = """
            SELECT 
                bh.MaBuoi, bh.MaLHP, bh.NgayHoc, bh.GioBatDau,
                lhp.GiangVien, mh.TenMon
            FROM BuoiHoc bh
            JOIN LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            JOIN MonHoc mh ON lhp.MaMon = mh.MaMon
            WHERE bh.NgayHoc = ?
            ORDER BY bh.GioBatDau
        """
        cursor.execute(query, (date,))
    else:
        query = """
            SELECT 
                bh.MaBuoi, bh.MaLHP, bh.NgayHoc, bh.GioBatDau,
                lhp.GiangVien, mh.TenMon
            FROM BuoiHoc bh
            JOIN LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            JOIN MonHoc mh ON lhp.MaMon = mh.MaMon
            WHERE bh.NgayHoc = CAST(GETDATE() AS DATE)
            ORDER BY bh.GioBatDau
        """
        cursor.execute(query)
    
    sessions = []
    for row in cursor.fetchall():
        ngay_hoc = row[2].isoformat() if row[2] else None
        gio_bat_dau = row[3].strftime("%H:%M:%S") if row[3] else None
        
        sessions.append({
            "ma_buoi": row[0],
            "ma_lhp": row[1],
            "ngay_hoc": ngay_hoc,
            "gio_bat_dau": gio_bat_dau,
            "giang_vien": row[4],
            "ten_mon": row[5]
        })
    
    cursor.close()
    conn.close()
    return sessions
# ==================== ATTENDANCE APIs ====================

@app.post("/api/attendance/checkin")
async def checkin_attendance(ma_sv: str, ma_buoi: int):
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Check đã điểm danh chưa
        cursor.execute("""
            SELECT COUNT(*) FROM DiemDanh 
            WHERE MaSV = ? AND MaBuoi = ?
        """, (ma_sv, ma_buoi))
        
        if cursor.fetchone()[0] > 0:
            return {
                "success": False,
                "message": "Sinh viên đã điểm danh rồi"
            }
        
        # Lấy giờ bắt đầu
        cursor.execute("SELECT GioBatDau FROM BuoiHoc WHERE MaBuoi = ?", (ma_buoi,))
        result = cursor.fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Không tìm thấy buổi học")
        
        gio_bat_dau = result[0]
        gio_hien_tai = datetime.now().time()
        
        # Xác định trạng thái
        gio_bat_dau_dt = datetime.combine(datetime.today(), gio_bat_dau)
        gio_cho_phep = (gio_bat_dau_dt + timedelta(minutes=15)).time()
        
        if gio_hien_tai <= gio_bat_dau:
            trang_thai = "Đúng giờ"
        elif gio_hien_tai <= gio_cho_phep:
            trang_thai = "Trễ"
        else:
            trang_thai = "Trễ"
        
        # Ghi điểm danh
        cursor.execute("""
            INSERT INTO DiemDanh (MaSV, MaBuoi, ThoiGianQuet, TrangThai, NguonQuet)
            VALUES (?, ?, ?, ?, ?)
        """, (ma_sv, ma_buoi, datetime.now(), trang_thai, "Webcam"))
        
        conn.commit()
        
        return {
            "success": True,
            "message": f"Điểm danh thành công - {trang_thai}",
            "trang_thai": trang_thai,
            "thoi_gian": datetime.now().isoformat()
        }
        
    finally:
        cursor.close()
        conn.close()

@app.get("/api/attendance/session/{ma_buoi}")
async def get_session_attendance(ma_buoi: int):
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT dd.MaDiemDanh, sv.MaSV, sv.HoTen, sv.Lop,
               dd.ThoiGianQuet, dd.TrangThai, dd.NguonQuet
        FROM DiemDanh dd
        JOIN SinhVien sv ON dd.MaSV = sv.MaSV
        WHERE dd.MaBuoi = ?
        ORDER BY dd.ThoiGianQuet DESC
    """, (ma_buoi,))
    
    records = []
    for row in cursor.fetchall():
        records.append({
            "ma_diem_danh": row[0],
            "ma_sv": row[1],
            "ho_ten": row[2],
            "lop": row[3],
            "thoi_gian_quet": row[4].isoformat() if row[4] else None,
            "trang_thai": row[5],
            "nguon_quet": row[6]
        })
    
    cursor.close()
    conn.close()
    return records

# ==================== ANALYTICS APIs - REAL DATA ====================

@app.get("/api/analytics/dashboard")
async def get_dashboard_stats():
    """Lấy thống kê tổng quan cho dashboard"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Tổng số sinh viên đang học
        cursor.execute("""
            SELECT COUNT(*) FROM SinhVien 
            WHERE TrangThai = N'Đang học'
        """)
        total_students = cursor.fetchone()[0]
        
        # Số buổi học hôm nay
        cursor.execute("""
            SELECT COUNT(*) FROM BuoiHoc 
            WHERE NgayHoc = CAST(GETDATE() AS DATE)
        """)
        today_sessions = cursor.fetchone()[0]
        
        # Số lượt điểm danh hôm nay
        cursor.execute("""
            SELECT COUNT(*) FROM DiemDanh dd
            JOIN BuoiHoc bh ON dd.MaBuoi = bh.MaBuoi
            WHERE bh.NgayHoc = CAST(GETDATE() AS DATE)
        """)
        today_attendance = cursor.fetchone()[0]
        
        # Tỷ lệ đi trễ hôm nay
        cursor.execute("""
            SELECT 
                ISNULL(
                    CAST(COUNT(CASE WHEN dd.TrangThai = N'Trễ' THEN 1 END) AS FLOAT) * 100.0 / 
                    NULLIF(COUNT(*), 0), 
                    0
                ) AS TyLeTre
            FROM DiemDanh dd
            JOIN BuoiHoc bh ON dd.MaBuoi = bh.MaBuoi
            WHERE bh.NgayHoc = CAST(GETDATE() AS DATE)
        """)
        late_rate = cursor.fetchone()[0] or 0
        
        return {
            "total_students": total_students,
            "today_sessions": today_sessions,
            "today_attendance": today_attendance,
            "late_rate": float(late_rate)
        }
        
    finally:
        cursor.close()
        conn.close()


@app.get("/api/analytics/attendance-trend")
async def get_attendance_trend(days: int = 7):
    """Lấy xu hướng điểm danh theo ngày"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT 
                CAST(bh.NgayHoc AS DATE) AS Ngay,
                COUNT(DISTINCT CASE WHEN dd.TrangThai IN (N'Đúng giờ', N'Có mặt') THEN dd.MaDiemDanh END) AS CoMat,
                COUNT(DISTINCT CASE WHEN dd.TrangThai = N'Trễ' THEN dd.MaDiemDanh END) AS Tre,
                COUNT(DISTINCT bh.MaBuoi) AS TongBuoi
            FROM BuoiHoc bh
            LEFT JOIN DiemDanh dd ON bh.MaBuoi = dd.MaBuoi
            WHERE bh.NgayHoc >= DATEADD(day, ?, CAST(GETDATE() AS DATE))
                AND bh.NgayHoc <= CAST(GETDATE() AS DATE)
            GROUP BY CAST(bh.NgayHoc AS DATE)
            ORDER BY Ngay
        """, (-days,))
        
        rows = cursor.fetchall()
        
        result = []
        for row in rows:
            ngay = row[0].strftime("%d/%m") if row[0] else ""
            result.append({
                "name": ngay,
                "coMat": row[1],
                "tre": row[2],
                "vang": 0  # Có thể tính toán nếu cần
            })
        
        return result
        
    finally:
        cursor.close()
        conn.close()


@app.get("/api/analytics/status-distribution")
async def get_status_distribution():
    """Phân bố trạng thái điểm danh"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT 
                dd.TrangThai,
                COUNT(*) AS SoLuong
            FROM DiemDanh dd
            JOIN BuoiHoc bh ON dd.MaBuoi = bh.MaBuoi
            WHERE bh.NgayHoc >= DATEADD(day, -7, GETDATE())
            GROUP BY dd.TrangThai
        """)
        
        rows = cursor.fetchall()
        
        result = []
        for row in rows:
            result.append({
                "name": row[0],
                "value": row[1]
            })
        
        return result
        
    finally:
        cursor.close()
        conn.close()


@app.get("/api/analytics/top-students")
async def get_top_students(limit: int = 5):
    """Lấy danh sách sinh viên xuất sắc"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT TOP (?) 
                sv.MaSV,
                sv.HoTen,
                COUNT(DISTINCT dd.MaBuoi) AS SoBuoiCoMat,
                COUNT(DISTINCT bh.MaBuoi) AS TongBuoi,
                CAST(COUNT(DISTINCT dd.MaBuoi) * 100.0 / 
                     NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) AS TyLe
            FROM SinhVien sv
            JOIN DangKyHoc dk ON sv.MaSV = dk.MaSV
            JOIN LopHocPhan lhp ON dk.MaLHP = lhp.MaLHP
            JOIN BuoiHoc bh ON lhp.MaLHP = bh.MaLHP
            LEFT JOIN DiemDanh dd ON dd.MaSV = sv.MaSV AND dd.MaBuoi = bh.MaBuoi
            WHERE sv.TrangThai = N'Đang học'
            GROUP BY sv.MaSV, sv.HoTen
            HAVING COUNT(DISTINCT bh.MaBuoi) > 0
            ORDER BY TyLe DESC, SoBuoiCoMat DESC
        """, (limit,))
        
        rows = cursor.fetchall()
        
        result = []
        for row in rows:
            result.append({
                "ma_sv": row[0],
                "ho_ten": row[1],
                "so_buoi": f"{row[2]}/{row[3]}",
                "ty_le": float(row[4]) if row[4] else 0
            })
        
        return result
        
    finally:
        cursor.close()
        conn.close()


@app.get("/api/analytics/at-risk-students")
async def get_at_risk_students():
    """Lấy danh sách sinh viên nguy cơ"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT 
                sv.MaSV,
                sv.HoTen,
                COUNT(DISTINCT dd.MaBuoi) AS SoBuoiCoMat,
                COUNT(DISTINCT bh.MaBuoi) AS TongBuoi,
                CAST(COUNT(DISTINCT dd.MaBuoi) * 100.0 / 
                     NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) AS TyLe,
                CASE 
                    WHEN CAST(COUNT(DISTINCT dd.MaBuoi) * 100.0 / 
                         NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) < 60 
                    THEN N'Nguy cơ cao'
                    WHEN CAST(COUNT(DISTINCT dd.MaBuoi) * 100.0 / 
                         NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) < 80 
                    THEN N'Cảnh báo'
                    ELSE N'Bình thường'
                END AS KetLuan
            FROM SinhVien sv
            JOIN DangKyHoc dk ON sv.MaSV = dk.MaSV
            JOIN LopHocPhan lhp ON dk.MaLHP = lhp.MaLHP
            JOIN BuoiHoc bh ON lhp.MaLHP = bh.MaLHP
            LEFT JOIN DiemDanh dd ON dd.MaSV = sv.MaSV AND dd.MaBuoi = bh.MaBuoi
            WHERE sv.TrangThai = N'Đang học'
            GROUP BY sv.MaSV, sv.HoTen
            HAVING CAST(COUNT(DISTINCT dd.MaBuoi) * 100.0 / 
                   NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) < 80
            ORDER BY TyLe ASC
        """)
        
        rows = cursor.fetchall()
        
        result = []
        for row in rows:
            result.append({
                "ma_sv": row[0],
                "ho_ten": row[1],
                "so_buoi": f"{row[2]}/{row[3]}",
                "ty_le": float(row[4]) if row[4] else 0,
                "ket_luan": row[5]
            })
        
        return result
        
    finally:
        cursor.close()
        conn.close()


@app.get("/api/analytics/class-comparison")
async def get_class_comparison():
    """So sánh chuyên cần giữa các lớp"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT 
                sv.Lop,
                COUNT(DISTINCT dd.MaBuoi) AS SoBuoiCoMat,
                COUNT(DISTINCT bh.MaBuoi) AS TongBuoi,
                CAST(COUNT(DISTINCT dd.MaBuoi) * 100.0 / 
                     NULLIF(COUNT(DISTINCT bh.MaBuoi), 0) AS DECIMAL(5,2)) AS TyLe
            FROM SinhVien sv
            JOIN DangKyHoc dk ON sv.MaSV = dk.MaSV
            JOIN LopHocPhan lhp ON dk.MaLHP = lhp.MaLHP
            JOIN BuoiHoc bh ON lhp.MaLHP = bh.MaLHP
            LEFT JOIN DiemDanh dd ON dd.MaSV = sv.MaSV AND dd.MaBuoi = bh.MaBuoi
            WHERE sv.TrangThai = N'Đang học' AND sv.Lop IS NOT NULL
            GROUP BY sv.Lop
            HAVING COUNT(DISTINCT bh.MaBuoi) > 0
            ORDER BY TyLe DESC
        """)
        
        rows = cursor.fetchall()
        
        result = []
        for row in rows:
            result.append({
                "lop": row[0],
                "tyLe": float(row[3]) if row[3] else 0
            })
        
        return result
        
    finally:
        cursor.close()
        conn.close()


@app.get("/api/analytics/student/{ma_sv}")
async def get_student_analytics(ma_sv: str):
    """Lấy phân tích chi tiết cho 1 sinh viên"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT * FROM VW_DieuKienDuThi 
            WHERE MaSV = ?
        """, (ma_sv,))
        
        stats = []
        for row in cursor.fetchall():
            stats.append({
                "ma_sv": row[0],
                "ho_ten": row[1],
                "ma_lhp": row[2],
                "so_buoi_co_mat": row[3],
                "tong_buoi": row[4],
                "ty_le_chuyen_can": float(row[5]),
                "ket_luan": row[6]
            })
        
        return stats
        
    finally:
        cursor.close()
        conn.close()


@app.get("/api/analytics/recent-activities")
async def get_recent_activities(limit: int = 10):
    """Lấy hoạt động điểm danh gần đây"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT TOP (?)
                dd.MaDiemDanh,
                sv.MaSV,
                sv.HoTen,
                dd.ThoiGianQuet,
                dd.TrangThai,
                mh.TenMon,
                bh.NgayHoc
            FROM DiemDanh dd
            JOIN SinhVien sv ON dd.MaSV = sv.MaSV
            JOIN BuoiHoc bh ON dd.MaBuoi = bh.MaBuoi
            JOIN LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
            JOIN MonHoc mh ON lhp.MaMon = mh.MaMon
            ORDER BY dd.ThoiGianQuet DESC
        """, (limit,))
        
        rows = cursor.fetchall()
        
        result = []
        for row in rows:
            result.append({
                "ma_diem_danh": row[0],
                "ma_sv": row[1],
                "ho_ten": row[2],
                "thoi_gian": row[3].isoformat() if row[3] else None,
                "trang_thai": row[4],
                "mon_hoc": row[5],
                "ngay_hoc": row[6].isoformat() if row[6] else None
            })
        
        return result
        
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    import uvicorn
    print("\n" + "=" * 60)
    print("🚀 SMART ATTENDANCE AI - COMPLETE SYSTEM")
    print("=" * 60)
    print("📍 Server: http://localhost:8000")
    print("📚 Docs: http://localhost:8000/docs")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8000)