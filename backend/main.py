from fastapi import FastAPI, HTTPException, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date, time
import cv2
import numpy as np
import pickle
import base64
import os
from database.db_connection import get_connection
import torch
from facenet_pytorch import InceptionResnetV1
from sklearn.metrics.pairwise import cosine_similarity
import pyodbc

app = FastAPI(title="Smart Attendance AI API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load FaceNet model
print("🔄 Loading FaceNet model...")
model = InceptionResnetV1(pretrained='vggface2').eval()
print("✅ FaceNet model loaded successfully!")

# Load face database
face_database = {}
if os.path.exists("models/face_db.pkl"):
    try:
        with open("models/face_db.pkl", "rb") as f:
            face_database = pickle.load(f)
        print(f"✅ Loaded face database with {len(face_database)} identities")
    except Exception as e:
        print(f"⚠️ Error loading face database: {e}")
else:
    print("⚠️ face_db.pkl not found. Please run extract_embedding.py first.")

# Pydantic models
class StudentInfo(BaseModel):
    ma_sv: str
    ho_ten: str
    ngay_sinh: Optional[date]
    gioi_tinh: Optional[str]
    lop: Optional[str]
    khoa: Optional[str]
    email: Optional[str]
    trang_thai: Optional[str]

class SessionCreate(BaseModel):
    ma_lhp: str
    ngay_hoc: date
    gio_bat_dau: time

# Recognition function
def recognize_face(face_embedding, threshold=0.6):
    """Nhận diện khuôn mặt từ embedding"""
    if not face_database:
        return "Unknown", 0.0
    
    best_score = 0
    identity = "Unknown"

    for name, emb in face_database.items():
        score = cosine_similarity(face_embedding.reshape(1, -1), emb.reshape(1, -1))[0][0]
        if score > best_score:
            best_score = score
            identity = name

    if best_score < threshold:
        return "Unknown", best_score
    
    return identity, best_score

# ==================== ROOT ====================

@app.get("/")
async def root():
    return {
        "message": "Smart Attendance AI API", 
        "status": "running",
        "face_database_loaded": len(face_database) > 0,
        "identities_count": len(face_database)
    }

# ==================== STUDENT ENDPOINTS ====================

@app.get("/api/students", response_model=List[StudentInfo])
async def get_all_students():
    """Lấy danh sách tất cả sinh viên"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM SinhVien ORDER BY MaSV")
    rows = cursor.fetchall()
    
    students = []
    for row in rows:
        students.append(StudentInfo(
            ma_sv=row[0],
            ho_ten=row[1],
            ngay_sinh=row[2],
            gioi_tinh=row[3],
            lop=row[4],
            khoa=row[5],
            email=row[6],
            trang_thai=row[7]
        ))
    
    cursor.close()
    conn.close()
    return students

@app.get("/api/students/{ma_sv}", response_model=StudentInfo)
async def get_student(ma_sv: str):
    """Lấy thông tin sinh viên theo mã"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM SinhVien WHERE MaSV = ?", (ma_sv,))
    row = cursor.fetchone()
    
    if not row:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Sinh viên không tồn tại")
    
    student = StudentInfo(
        ma_sv=row[0],
        ho_ten=row[1],
        ngay_sinh=row[2],
        gioi_tinh=row[3],
        lop=row[4],
        khoa=row[5],
        email=row[6],
        trang_thai=row[7]
    )
    
    cursor.close()
    conn.close()
    return student

@app.post("/api/students")
async def create_student(student: StudentInfo):
    """Thêm sinh viên mới"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            INSERT INTO SinhVien 
            (MaSV, HoTen, NgaySinh, GioiTinh, Lop, Khoa, Email, TrangThai)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            student.ma_sv,
            student.ho_ten,
            student.ngay_sinh,
            student.gioi_tinh,
            student.lop,
            student.khoa,
            student.email,
            student.trang_thai or 'Đang học'
        ))
        conn.commit()
        cursor.close()
        conn.close()
        return {"success": True, "message": "Thêm sinh viên thành công", "ma_sv": student.ma_sv}
    except pyodbc.IntegrityError:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=400, detail="Mã sinh viên đã tồn tại")

@app.put("/api/students/{ma_sv}")
async def update_student(ma_sv: str, student: StudentInfo):
    """Cập nhật thông tin sinh viên"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            UPDATE SinhVien 
            SET HoTen = ?, NgaySinh = ?, GioiTinh = ?, 
                Lop = ?, Khoa = ?, Email = ?, TrangThai = ?
            WHERE MaSV = ?
        """, (
            student.ho_ten,
            student.ngay_sinh,
            student.gioi_tinh,
            student.lop,
            student.khoa,
            student.email,
            student.trang_thai,
            ma_sv
        ))
        conn.commit()
        
        if cursor.rowcount == 0:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Sinh viên không tồn tại")
        
        cursor.close()
        conn.close()
        return {"success": True, "message": "Cập nhật sinh viên thành công"}
    except Exception as e:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/students/{ma_sv}")
async def delete_student(ma_sv: str):
    """Xóa sinh viên"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("DELETE FROM SinhVien WHERE MaSV = ?", (ma_sv,))
        conn.commit()
        
        if cursor.rowcount == 0:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Sinh viên không tồn tại")
        
        cursor.close()
        conn.close()
        return {"success": True, "message": "Xóa sinh viên thành công"}
    except Exception as e:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

# ==================== FACE RECOGNITION ENDPOINTS ====================

@app.post("/api/recognize")
async def recognize_face_endpoint(file: UploadFile = File(...)):
    """Nhận diện khuôn mặt từ ảnh upload"""
    try:
        # Read image
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image")
        
        # Resize và preprocess
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img_resized = cv2.resize(img, (160, 160))
        img_tensor = torch.from_numpy(img_resized).permute(2, 0, 1).float()
        img_tensor = img_tensor.unsqueeze(0) / 255.0
        
        # Extract embedding
        with torch.no_grad():
            embedding = model(img_tensor).cpu().numpy()
        
        # Recognize
        identity, score = recognize_face(embedding[0])
        
        if identity == "Unknown":
            return {
                "success": False,
                "message": "Không nhận diện được khuôn mặt hoặc chưa có trong database",
                "identity": None,
                "confidence": float(score)
            }
        
        # Lấy thông tin sinh viên
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
                "confidence": float(score),
                "student_info": {
                    "ma_sv": row[0],
                    "ho_ten": row[1],
                    "lop": row[4],
                    "khoa": row[5]
                }
            }
        
        return {
            "success": False,
            "message": "Nhận diện được nhưng không tìm thấy thông tin trong database",
            "identity": identity,
            "confidence": float(score)
        }
    
    except Exception as e:
        print(f"Recognition error: {e}")
        raise HTTPException(status_code=500, detail=f"Error during recognition: {str(e)}")

@app.get("/api/face-database/status")
async def get_face_database_status():
    """Kiểm tra trạng thái face database"""
    return {
        "loaded": len(face_database) > 0,
        "identities_count": len(face_database),
        "identities": list(face_database.keys())
    }

# ==================== SESSION ENDPOINTS ====================

@app.get("/api/sessions/today")
async def get_today_sessions():
    """Lấy danh sách buổi học hôm nay"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT bh.MaBuoi, bh.MaLHP, bh.NgayHoc, bh.GioBatDau,
               lhp.GiangVien, mh.TenMon
        FROM BuoiHoc bh
        JOIN LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
        JOIN MonHoc mh ON lhp.MaMon = mh.MaMon
        WHERE bh.NgayHoc = CAST(GETDATE() AS DATE)
        ORDER BY bh.GioBatDau
    """)
    
    sessions = []
    for row in cursor.fetchall():
        sessions.append({
            "ma_buoi": row[0],
            "ma_lhp": row[1],
            "ngay_hoc": row[2].isoformat() if row[2] else None,
            "gio_bat_dau": str(row[3]) if row[3] else None,
            "giang_vien": row[4],
            "ten_mon": row[5]
        })
    
    cursor.close()
    conn.close()
    return sessions

@app.post("/api/sessions")
async def create_session(session: SessionCreate):
    """Tạo buổi học mới"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            INSERT INTO BuoiHoc (MaLHP, NgayHoc, GioBatDau)
            VALUES (?, ?, ?)
        """, (session.ma_lhp, session.ngay_hoc, session.gio_bat_dau))
        conn.commit()
        
        cursor.execute("SELECT @@IDENTITY AS MaBuoi")
        ma_buoi = cursor.fetchone()[0]
        
        cursor.close()
        conn.close()
        return {"success": True, "message": "Tạo buổi học thành công", "ma_buoi": ma_buoi}
    except Exception as e:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions")
async def get_all_sessions():
    """Lấy tất cả buổi học"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT bh.MaBuoi, bh.MaLHP, bh.NgayHoc, bh.GioBatDau,
               lhp.GiangVien, mh.TenMon
        FROM BuoiHoc bh
        JOIN LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
        JOIN MonHoc mh ON lhp.MaMon = mh.MaMon
        ORDER BY bh.NgayHoc DESC, bh.GioBatDau DESC
    """)
    
    sessions = []
    for row in cursor.fetchall():
        sessions.append({
            "ma_buoi": row[0],
            "ma_lhp": row[1],
            "ngay_hoc": row[2].isoformat() if row[2] else None,
            "gio_bat_dau": str(row[3]) if row[3] else None,
            "giang_vien": row[4],
            "ten_mon": row[5]
        })
    
    cursor.close()
    conn.close()
    return sessions

# ==================== ATTENDANCE ENDPOINTS ====================

@app.post("/api/attendance/checkin")
async def checkin_attendance(ma_sv: str, ma_buoi: int):
    """Điểm danh sinh viên"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Kiểm tra đã điểm danh chưa
        cursor.execute("""
            SELECT COUNT(*) FROM DiemDanh 
            WHERE MaSV = ? AND MaBuoi = ?
        """, (ma_sv, ma_buoi))
        
        if cursor.fetchone()[0] > 0:
            cursor.close()
            conn.close()
            return {
                "success": False,
                "message": "Sinh viên đã điểm danh rồi"
            }
        
        # Lấy giờ bắt đầu buổi học
        cursor.execute("""
            SELECT GioBatDau FROM BuoiHoc WHERE MaBuoi = ?
        """, (ma_buoi,))
        
        result = cursor.fetchone()
        if not result:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Không tìm thấy buổi học")
        
        gio_bat_dau = result[0]
        gio_hien_tai = datetime.now().time()
        
        # Xác định trạng thái (cho phép trễ 15 phút)
        from datetime import timedelta
        gio_bat_dau_datetime = datetime.combine(datetime.today(), gio_bat_dau)
        gio_cho_phep = (gio_bat_dau_datetime + timedelta(minutes=15)).time()
        
        if gio_hien_tai <= gio_bat_dau:
            trang_thai = "Đúng giờ"
        elif gio_hien_tai <= gio_cho_phep:
            trang_thai = "Trễ"
        else:
            trang_thai = "Trễ"
        
        # Ghi điểm danh
        cursor.execute("""
            INSERT INTO DiemDanh
            (MaSV, MaBuoi, ThoiGianQuet, TrangThai, NguonQuet)
            VALUES (?, ?, ?, ?, ?)
        """, (ma_sv, ma_buoi, datetime.now(), trang_thai, "Webcam"))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return {
            "success": True,
            "message": f"Điểm danh thành công - {trang_thai}",
            "trang_thai": trang_thai,
            "thoi_gian": datetime.now().isoformat()
        }
    
    except Exception as e:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/attendance/session/{ma_buoi}")
async def get_session_attendance(ma_buoi: int):
    """Lấy danh sách điểm danh của một buổi học"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT 
            dd.MaDiemDanh,
            sv.MaSV,
            sv.HoTen,
            sv.Lop,
            dd.ThoiGianQuet,
            dd.TrangThai,
            dd.NguonQuet
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

@app.get("/api/attendance/student/{ma_sv}")
async def get_student_attendance_history(ma_sv: str, limit: int = 50):
    """Lấy lịch sử điểm danh của sinh viên"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT TOP (?) 
            dd.MaDiemDanh,
            dd.MaBuoi,
            bh.NgayHoc,
            bh.GioBatDau,
            mh.TenMon,
            lhp.GiangVien,
            dd.ThoiGianQuet,
            dd.TrangThai
        FROM DiemDanh dd
        JOIN BuoiHoc bh ON dd.MaBuoi = bh.MaBuoi
        JOIN LopHocPhan lhp ON bh.MaLHP = lhp.MaLHP
        JOIN MonHoc mh ON lhp.MaMon = mh.MaMon
        WHERE dd.MaSV = ?
        ORDER BY dd.ThoiGianQuet DESC
    """, (limit, ma_sv))
    
    records = []
    for row in cursor.fetchall():
        records.append({
            "ma_diem_danh": row[0],
            "ma_buoi": row[1],
            "ngay_hoc": row[2].isoformat() if row[2] else None,
            "gio_bat_dau": str(row[3]) if row[3] else None,
            "ten_mon": row[4],
            "giang_vien": row[5],
            "thoi_gian_quet": row[6].isoformat() if row[6] else None,
            "trang_thai": row[7]
        })
    
    cursor.close()
    conn.close()
    return records

# ==================== ANALYTICS ENDPOINTS ====================

@app.get("/api/analytics/dashboard")
async def get_dashboard_stats():
    """Thống kê tổng quan cho dashboard"""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Tổng số sinh viên
    cursor.execute("SELECT COUNT(*) FROM SinhVien WHERE TrangThai = N'Đang học'")
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
    
    cursor.close()
    conn.close()
    
    return {
        "total_students": total_students,
        "today_sessions": today_sessions,
        "today_attendance": today_attendance,
        "late_rate": float(late_rate)
    }

@app.get("/api/analytics/student/{ma_sv}")
async def get_student_analytics(ma_sv: str):
    """Phân tích chuyên cần của sinh viên"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT * FROM VW_DieuKienDuThi WHERE MaSV = ?
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
    
    cursor.close()
    conn.close()
    return stats

@app.get("/api/analytics/class/{ma_lhp}")
async def get_class_analytics(ma_lhp: str):
    """Phân tích chuyên cần của cả lớp"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT * FROM VW_DieuKienDuThi WHERE MaLHP = ?
        ORDER BY TyLeChuyenCan DESC
    """, (ma_lhp,))
    
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
    
    cursor.close()
    conn.close()
    return stats

if __name__ == "__main__":
    import uvicorn
    print("=" * 50)
    print("🚀 Starting Smart Attendance AI API Server...")
    print("=" * 50)
    print("📍 Server: http://localhost:8000")
    print("📚 API Docs: http://localhost:8000/docs")
    print("🔍 Face Database:", "Loaded" if face_database else "Not loaded")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8000)