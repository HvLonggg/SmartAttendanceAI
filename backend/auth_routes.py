from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, Tuple, List

from database.db_connection import get_connection

import os
import io
import re
import unicodedata
import secrets
import hashlib
import hmac
import base64
from datetime import datetime, timedelta, timezone

import smtplib
from email.mime.text import MIMEText

from PIL import Image
import json

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    # python-dotenv optional; nếu không có vẫn chạy với env thật
    pass


auth_router = APIRouter(tags=["auth"])

bearer_scheme = HTTPBearer(auto_error=False)

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

AUTH_JWT_SECRET = os.environ.get("JWT_SECRET", "CHANGE_ME__JWT_SECRET")
JWT_EXP_HOURS = int(os.environ.get("JWT_EXP_HOURS", "48"))

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER)
SMTP_REQUIRED = os.environ.get("SMTP_REQUIRED", "0").strip() in {"1", "true", "True", "YES", "yes"}

OTP_TTL_SECONDS = int(os.environ.get("OTP_TTL_SECONDS", "300"))
OTP_LENGTH = int(os.environ.get("OTP_LENGTH", "6"))

AUTH_AVATARS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "avatars_auth")
os.makedirs(AUTH_AVATARS_DIR, exist_ok=True)


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def synthetic_email_for_username(username: str) -> str:
    """Email nội bộ duy nhất theo username (không cần người dùng nhập email)."""
    u = (username or "").strip().lower()
    safe = re.sub(r"[^a-z0-9._-]+", "_", u, flags=re.IGNORECASE)
    safe = safe.strip("._") or "user"
    if len(safe) > 64:
        safe = safe[:64]
    return f"{safe}@local.smartattendance"


def b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_jwt(payload: Dict[str, Any]) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    now = datetime.now(timezone.utc)
    payload = dict(payload)
    payload.setdefault("iat", int(now.timestamp()))
    payload.setdefault("exp", int((now + timedelta(hours=JWT_EXP_HOURS)).timestamp()))

    header_b = b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b = b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b}.{payload_b}"

    sig = hmac.new(AUTH_JWT_SECRET.encode("utf-8"), signing_input.encode("utf-8"), hashlib.sha256).digest()
    sig_b = b64url_encode(sig)
    return f"{signing_input}.{sig_b}"


def decode_jwt(token: str) -> Dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="JWT không hợp lệ")

    header_b, payload_b, sig_b = parts
    signing_input = f"{header_b}.{payload_b}"
    expected_sig = hmac.new(
        AUTH_JWT_SECRET.encode("utf-8"),
        signing_input.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(b64url_encode(expected_sig), sig_b):
        raise HTTPException(status_code=401, detail="JWT không hợp lệ")

    payload_json = b64url_decode(payload_b).decode("utf-8")
    payload = json.loads(payload_json)
    exp = payload.get("exp")
    if exp is not None and datetime.now(timezone.utc).timestamp() > float(exp):
        raise HTTPException(status_code=401, detail="JWT đã hết hạn")
    return payload


def gen_salt_hex(n_bytes: int = 16) -> str:
    return secrets.token_hex(n_bytes)


def hash_password(password: str, salt_hex: str) -> str:
    # PBKDF2-HMAC-SHA256
    iters = int(os.environ.get("PBKDF2_ITERS", "200000"))
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt_hex),
        iters,
        dklen=32,
    )
    return dk.hex()


def verify_password(password: str, salt_hex: str, password_hash_hex: str) -> bool:
    return hmac.compare_digest(hash_password(password, salt_hex), password_hash_hex)


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def generate_otp_code() -> str:
    # OTP toàn số, độ dài cố định
    return "".join(str(secrets.randbelow(10)) for _ in range(OTP_LENGTH))


def send_email_otp(to_email: str, otp_code: str) -> bool:
    """
    Gửi OTP qua email. Trả True nếu đã gửi qua SMTP, False nếu chạy chế độ dev (in console).
    """
    if not (SMTP_HOST and SMTP_USER and SMTP_PASS and SMTP_FROM):
        if SMTP_REQUIRED:
            raise RuntimeError("SMTP chưa cấu hình. Hãy set SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM trong backend/.env")
        print(f"[OTP] Chưa cấu hình SMTP → in OTP ra console. Email: {to_email} | OTP: {otp_code}")
        return False

    subject = "Smart Attendance AI - OTP xác thực"
    body = f"Mã OTP của bạn là: {otp_code}\n\nHãy nhập mã này để hoàn tất xác thực."

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to_email

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_FROM, [to_email], msg.as_string())
    print(f"[OTP] Đã gửi email tới {to_email}")
    return True


def ensure_auth_tables() -> None:
    conn = get_connection()
    cursor = conn.cursor()

    # LƯU Ý:
    # - Để đồng bộ phong cách CSDL tiếng Việt hiện tại, đổi tên bảng auth thành:
    #   + AuthUsers     -> NguoiDung
    #   + AuthChallenges-> XacThucOtp
    # - Cột giữ nguyên như bản cũ để giảm rủi ro code.

    cursor.execute("""
    IF OBJECT_ID('dbo.NguoiDung', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.NguoiDung (
            Id INT IDENTITY(1,1) PRIMARY KEY,
            Username NVARCHAR(80) NOT NULL UNIQUE,
            HoTen NVARCHAR(120) NULL,
            MaSV NVARCHAR(30) NULL,
            MaGV NVARCHAR(30) NULL,
            Role NVARCHAR(20) NOT NULL,
            Email NVARCHAR(320) NOT NULL UNIQUE,
            Phone NVARCHAR(30) NULL,
            PasswordHash NVARCHAR(128) NOT NULL,
            PasswordSalt NVARCHAR(64) NOT NULL,
            IsVerified BIT NOT NULL DEFAULT(0),
            IsLocked BIT NOT NULL DEFAULT(0),
            LockReason NVARCHAR(255) NULL,
            Avatar NVARCHAR(500) NULL,
            CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
            UpdatedAt DATETIME2 NULL
        );
    END
    """)

    # Nếu bảng đã tồn tại từ trước thì bổ sung cột còn thiếu
    cursor.execute("IF COL_LENGTH('dbo.NguoiDung','HoTen') IS NULL ALTER TABLE dbo.NguoiDung ADD HoTen NVARCHAR(120) NULL")
    cursor.execute("IF COL_LENGTH('dbo.NguoiDung','MaSV') IS NULL ALTER TABLE dbo.NguoiDung ADD MaSV NVARCHAR(30) NULL")
    cursor.execute("IF COL_LENGTH('dbo.NguoiDung','MaGV') IS NULL ALTER TABLE dbo.NguoiDung ADD MaGV NVARCHAR(30) NULL")
    cursor.execute("IF COL_LENGTH('dbo.NguoiDung','MaKhoa') IS NULL ALTER TABLE dbo.NguoiDung ADD MaKhoa NVARCHAR(20) NULL")

    cursor.execute("""
    IF OBJECT_ID('dbo.Khoa', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.Khoa (
            MaKhoa NVARCHAR(20) NOT NULL PRIMARY KEY,
            TenKhoa NVARCHAR(200) NOT NULL,
            GhiChu NVARCHAR(500) NULL
        );
    END
    """)

    cursor.execute("""
    IF OBJECT_ID('dbo.XacThucOtp', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.XacThucOtp (
            Id INT IDENTITY(1,1) PRIMARY KEY,
            UserId INT NULL,
            Email NVARCHAR(320) NOT NULL,
            Purpose NVARCHAR(50) NOT NULL,
            OtpSalt NVARCHAR(64) NOT NULL,
            OtpHash NVARCHAR(128) NOT NULL,
            ExpiresAt DATETIME2 NOT NULL,
            ConsumedAt DATETIME2 NULL,
            CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
    END
    """)

    # ==================== GIẢNG VIÊN ====================
    # Tạo bảng GiangVien và gán MaGV cho LopHocPhan để teacher có mã riêng
    cursor.execute("""
    IF OBJECT_ID('dbo.GiangVien', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.GiangVien (
            MaGV NVARCHAR(30) NOT NULL PRIMARY KEY,
            HoTen NVARCHAR(120) NOT NULL,
            Email NVARCHAR(320) NULL,
            DienThoai NVARCHAR(30) NULL,
            AnhDaiDien NVARCHAR(500) NULL,
            TrangThai NVARCHAR(50) NULL,
            CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE UNIQUE INDEX UX_GiangVien_HoTen ON dbo.GiangVien(HoTen);
    END
    """)

    cursor.execute("IF COL_LENGTH('dbo.LopHocPhan','MaGV') IS NULL ALTER TABLE dbo.LopHocPhan ADD MaGV NVARCHAR(30) NULL")

    # Bảng GiangVien cũ có thể thiếu cột — cần cho PATCH hồ sơ & API quá trình công tác
    cursor.execute("IF COL_LENGTH('dbo.GiangVien','Email') IS NULL ALTER TABLE dbo.GiangVien ADD Email NVARCHAR(320) NULL")
    cursor.execute("IF COL_LENGTH('dbo.GiangVien','DienThoai') IS NULL ALTER TABLE dbo.GiangVien ADD DienThoai NVARCHAR(30) NULL")
    cursor.execute("IF COL_LENGTH('dbo.GiangVien','CreatedAt') IS NULL ALTER TABLE dbo.GiangVien ADD CreatedAt DATETIME2 NULL")
    cursor.execute("UPDATE dbo.GiangVien SET CreatedAt = SYSUTCDATETIME() WHERE CreatedAt IS NULL")

    # Seed giảng viên từ danh sách tên hiện có trong LopHocPhan.GiangVien
    cursor.execute("""
    IF (SELECT COUNT(*) FROM dbo.GiangVien) = 0
    BEGIN
        ;WITH T AS (
            SELECT DISTINCT LTRIM(RTRIM(GiangVien)) AS HoTen
            FROM dbo.LopHocPhan
            WHERE GiangVien IS NOT NULL AND LTRIM(RTRIM(GiangVien)) <> ''
        ),
        N AS (
            SELECT HoTen, ROW_NUMBER() OVER (ORDER BY HoTen) AS rn FROM T
        )
        INSERT INTO dbo.GiangVien (MaGV, HoTen, TrangThai)
        SELECT CONCAT('GV', RIGHT(CONCAT('0000', CAST(rn AS VARCHAR(10))), 4)) AS MaGV,
               HoTen,
               N'Đang dạy'
        FROM N;
    END
    """)

    # Gán LopHocPhan.MaGV theo bảng GiangVien
    cursor.execute("""
    UPDATE lhp
    SET lhp.MaGV = gv.MaGV
    FROM dbo.LopHocPhan lhp
    JOIN dbo.GiangVien gv ON LTRIM(RTRIM(lhp.GiangVien)) = gv.HoTen
    WHERE (lhp.MaGV IS NULL OR LTRIM(RTRIM(lhp.MaGV)) = '')
    """)

    # Cho phép nhiều giảng viên trùng họ tên khi đăng ký mới (bỏ unique HoTen cũ)
    cursor.execute("""
    IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_GiangVien_HoTen' AND object_id = OBJECT_ID(N'dbo.GiangVien')
    )
        DROP INDEX UX_GiangVien_HoTen ON dbo.GiangVien;
    """)

    # Migration dữ liệu từ bảng cũ (nếu bạn đã test/register trước đó)
    cursor.execute("""
    IF OBJECT_ID('dbo.AuthUsers', 'U') IS NOT NULL
    AND (SELECT COUNT(*) FROM dbo.NguoiDung) = 0
    BEGIN
        SET IDENTITY_INSERT dbo.NguoiDung ON;
        INSERT INTO dbo.NguoiDung
            (Id, Username, Role, Email, Phone, PasswordHash, PasswordSalt, IsVerified, IsLocked, LockReason, Avatar, CreatedAt, UpdatedAt)
        SELECT
            Id, Username, Role, Email, Phone, PasswordHash, PasswordSalt, IsVerified, IsLocked, LockReason, Avatar, CreatedAt, UpdatedAt
        FROM dbo.AuthUsers;
        SET IDENTITY_INSERT dbo.NguoiDung OFF;
    END
    """)

    cursor.execute("""
    IF OBJECT_ID('dbo.AuthChallenges', 'U') IS NOT NULL
    AND (SELECT COUNT(*) FROM dbo.XacThucOtp) = 0
    BEGIN
        SET IDENTITY_INSERT dbo.XacThucOtp ON;
        INSERT INTO dbo.XacThucOtp
            (Id, UserId, Email, Purpose, OtpSalt, OtpHash, ExpiresAt, ConsumedAt, CreatedAt)
        SELECT
            Id, UserId, Email, Purpose, OtpSalt, OtpHash, ExpiresAt, ConsumedAt, CreatedAt
        FROM dbo.AuthChallenges;
        SET IDENTITY_INSERT dbo.XacThucOtp OFF;
    END
    """)

    # Bỏ bắt buộc xác thực OTP: tất cả tài khoản được coi là đã kích hoạt
    cursor.execute("UPDATE dbo.NguoiDung SET IsVerified = 1 WHERE IsVerified = 0")

    conn.commit()
    cursor.close()
    conn.close()


ensure_auth_tables()


def seed_initial_admin() -> None:
    init_u = os.environ.get("INITIAL_ADMIN_USERNAME", "").strip()
    init_p = os.environ.get("INITIAL_ADMIN_PASSWORD", "")
    init_e = os.environ.get("INITIAL_ADMIN_EMAIL", "").strip()
    if not (init_u and init_p and init_e):
        return

    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) FROM dbo.NguoiDung WHERE Role = 'ADMIN'")
        if cursor.fetchone()[0] > 0:
            return

        # Avoid conflicts
        cursor.execute("SELECT COUNT(*) FROM dbo.NguoiDung WHERE Username = ?", (init_u,))
        if cursor.fetchone()[0] > 0:
            return
        cursor.execute("SELECT COUNT(*) FROM dbo.NguoiDung WHERE Email = ?", (init_e,))
        if cursor.fetchone()[0] > 0:
            return

        salt = gen_salt_hex()
        pwd_hash = hash_password(init_p, salt)

        cursor.execute(
            """
            INSERT INTO dbo.NguoiDung (Username, Role, Email, Phone, PasswordHash, PasswordSalt, IsVerified, IsLocked, LockReason, Avatar, UpdatedAt)
            VALUES (?, 'ADMIN', ?, NULL, ?, ?, 1, 0, NULL, NULL, SYSUTCDATETIME())
            """,
            (init_u, init_e, pwd_hash, salt),
        )
        conn.commit()
        print(f"[AUTH] Seed initial ADMIN user: {init_u}")
    except Exception as e:
        print(f"[AUTH] Seed ADMIN failed: {e}")
    finally:
        cursor.close()
        conn.close()


seed_initial_admin()


def normalize_username(u: str) -> str:
    u = (u or "").strip()
    if not u:
        raise HTTPException(status_code=400, detail="Username không hợp lệ")
    # Cho phép nhiều ký tự (MaSV có số, GiangVien có dấu). Không làm quá chặt.
    return u


def role_allowed(role: str) -> bool:
    return role in {"STUDENT", "TEACHER", "ADMIN"}


class RegisterRequest(BaseModel):
    username: Optional[str] = None  # STUDENT / TEACHER: bắt buộc khi đăng ký
    password: Optional[str] = None  # STUDENT / TEACHER: bắt buộc, tối thiểu 6 ký tự
    role: str  # STUDENT / TEACHER
    ho_ten: str
    ma_sv: Optional[str] = None  # STUDENT: bắt buộc — phải trùng MaSV đã có trong bảng SinhVien
    ma_gv: Optional[str] = None
    ma_khoa: Optional[str] = None  # TEACHER: chọn khoa/bộ môn — hệ thống cấp MaGV tự động
    chuyen_nganh: Optional[str] = None  # TEACHER: chuyên ngành theo khoa trong CSDL
    email: Optional[str] = None  # tuỳ chọn; nếu không có → gán email nội bộ theo username
    phone: Optional[str] = None


class TeacherProfileUpdate(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class VerifyOtpRequest(BaseModel):
    username: str
    otp: str
    purpose: str = "register"  # register / reset_password


class ResendOtpRequest(BaseModel):
    username: str
    purpose: str = "register"  # register / reset_password


class LoginRequest(BaseModel):
    username: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    username: str
    otp: str
    new_password: str


class ResetPasswordEmailRequest(BaseModel):
    email: str
    otp: str
    new_password: str


class MeResponse(BaseModel):
    username: str
    ho_ten: Optional[str] = None
    ma_sv: Optional[str] = None
    ma_gv: Optional[str] = None
    ma_khoa: Optional[str] = None
    ten_khoa: Optional[str] = None
    role: str
    email: str
    phone: Optional[str]
    is_verified: bool
    is_locked: bool
    avatar: Optional[str]
    profile: Dict[str, Any] = {}


class AdminSetLockRequest(BaseModel):
    locked: bool
    reason: Optional[str] = None


class StudentCredentialItem(BaseModel):
    ma_sv: str
    ho_ten: str
    username: str
    password: str


def get_auth_bearer_token(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> str:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập")
    return credentials.credentials


def get_current_user(token: str = Depends(get_auth_bearer_token)) -> Dict[str, Any]:
    payload = decode_jwt(token)
    username = payload.get("username")
    role = payload.get("role")
    user_id = payload.get("uid")
    if not username or not role:
        raise HTTPException(status_code=401, detail="JWT không hợp lệ")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT Id, Username, HoTen, MaSV, MaGV, MaKhoa, Role, Email, Phone, IsVerified, IsLocked, LockReason, Avatar "
        "FROM dbo.NguoiDung WHERE Id = ? AND Username = ?",
        (user_id, username),
    )
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if not row:
        raise HTTPException(status_code=401, detail="Tài khoản không tồn tại")

    return {
        "uid": row[0],
        "username": row[1],
        "ho_ten": row[2],
        "ma_sv": row[3],
        "ma_gv": row[4],
        "ma_khoa": row[5],
        "role": row[6],
        "email": row[7],
        "phone": row[8],
        "is_verified": bool(row[9]),
        "is_locked": bool(row[10]),
        "lock_reason": row[11],
        "avatar": row[12],
    }


def require_role(*roles: str):
    def _dep(current=Depends(get_current_user)) -> Dict[str, Any]:
        if current["is_locked"]:
            raise HTTPException(status_code=403, detail=f"Tài khoản đang bị khóa: {current.get('lock_reason') or ''}".strip())
        if current["role"] not in roles:
            raise HTTPException(status_code=403, detail="Không đủ quyền")
        return current

    return _dep


def get_user_row_by_username(username: str) -> Optional[Tuple]:
    conn = get_connection()
    cursor = conn.cursor()
    # So sánh không phân biệt hoa thường và bỏ khoảng trắng đầu/cuối để tránh đăng nhập sai khi gõ nhầm
    cursor.execute(
        "SELECT Id, Username, Role, Email, Phone, PasswordHash, PasswordSalt, IsVerified, IsLocked, LockReason, Avatar "
        "FROM dbo.NguoiDung WHERE LOWER(LTRIM(RTRIM(Username))) = LOWER(LTRIM(RTRIM(?)))",
        (username or "",),
    )
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return row


def student_exists(ma_sv: str) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM SinhVien WHERE MaSV = ?", (ma_sv,))
    n = cursor.fetchone()[0]
    cursor.close()
    conn.close()
    return n > 0


def ensure_teacher_profile_for_registration(ma_gv: str, ho_ten: str, email: str, phone: Optional[str]) -> None:
    """
    Đăng ký giảng viên MỚI: nếu MaGV chưa có trong GiangVien thì INSERT;
    nếu đã có (từ seed LHP) thì họ tên phải khớp (không phân biệt hoa thường).
    """
    ma_gv = (ma_gv or "").strip()
    ho_ten = (ho_ten or "").strip()
    if not ma_gv or not ho_ten:
        raise HTTPException(status_code=400, detail="Thiếu mã giảng viên hoặc họ tên")

    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT HoTen FROM dbo.GiangVien WHERE LTRIM(RTRIM(MaGV)) = LTRIM(RTRIM(?))",
            (ma_gv,),
        )
        row = cursor.fetchone()
        if row:
            db_ho = (row[0] or "").strip()
            if db_ho.lower() != ho_ten.lower():
                raise HTTPException(
                    status_code=400,
                    detail="Mã giảng viên đã tồn tại trong hệ thống với họ tên khác. Kiểm tra lại MaGV hoặc liên hệ quản trị.",
                )
            conn.commit()
        else:
            cursor.execute(
                """
                INSERT INTO dbo.GiangVien (MaGV, HoTen, Email, DienThoai, TrangThai)
                VALUES (?, ?, ?, ?, N'Đã đăng ký')
                """,
                (ma_gv, ho_ten, email or None, (phone or "").strip() or None),
            )
            conn.commit()

        # Gắn MaGV cho LopHocPhan nếu hệ thống trước đó chỉ lưu tên giảng viên (GiangVien)
        cursor.execute(
            """
            UPDATE dbo.LopHocPhan
            SET MaGV = ?
            WHERE LTRIM(RTRIM(GiangVien)) = LTRIM(RTRIM(?))
              AND (MaGV IS NULL OR LTRIM(RTRIM(MaGV)) = '')
            """,
            (ma_gv, ho_ten),
        )
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        err = str(e)
        if "PRIMARY KEY" in err or "duplicate" in err.lower() or "2627" in err:
            raise HTTPException(status_code=400, detail="Mã giảng viên đã tồn tại trong hệ thống") from e
        raise HTTPException(status_code=500, detail=f"Không thể tạo hồ sơ giảng viên: {e}") from e
    finally:
        cursor.close()
        conn.close()


def _next_ma_gv_auto(cursor) -> str:
    cursor.execute(
        """
        SELECT ISNULL(MAX(
            CASE
                WHEN MaGV LIKE N'GV%' AND TRY_CAST(SUBSTRING(MaGV, 3, 20) AS BIGINT) IS NOT NULL
                THEN TRY_CAST(SUBSTRING(MaGV, 3, 20) AS BIGINT)
                ELSE 0
            END
        ), 0) + 1
        FROM dbo.GiangVien
        """
    )
    n = int(cursor.fetchone()[0])
    return f"GV{n:06d}"


def ensure_teacher_register_with_khoa(ma_khoa: str, ho_ten: str, email: str, phone: Optional[str]) -> str:
    """
    Đăng ký giảng viên theo khoa: kiểm tra MaKhoa, cấp MaGV mới, thêm vào GiangVien.
    """
    ma_khoa = (ma_khoa or "").strip()
    ho_ten = (ho_ten or "").strip()
    if not ma_khoa or not ho_ten:
        raise HTTPException(status_code=400, detail="Thiếu mã khoa hoặc họ tên")

    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) FROM dbo.Khoa WHERE LTRIM(RTRIM(MaKhoa)) = LTRIM(RTRIM(?))", (ma_khoa,))
        if cursor.fetchone()[0] == 0:
            raise HTTPException(status_code=400, detail="Khoa/bộ môn không tồn tại trong hệ thống")
        ma_gv = _next_ma_gv_auto(cursor)
        cursor.execute(
            "SELECT COUNT(*) FROM dbo.GiangVien WHERE LTRIM(RTRIM(MaGV)) = LTRIM(RTRIM(?))",
            (ma_gv,),
        )
        if cursor.fetchone()[0] > 0:
            ma_gv = _next_ma_gv_auto(cursor)
        cursor.execute(
            "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = N'dbo' AND TABLE_NAME = N'GiangVien' AND COLUMN_NAME = N'MaKhoa'"
        )
        has_mk = cursor.fetchone() is not None
        if has_mk:
            cursor.execute(
                """
                INSERT INTO dbo.GiangVien (MaGV, HoTen, Email, DienThoai, TrangThai, MaKhoa)
                VALUES (?, ?, ?, ?, N'Đã đăng ký', ?)
                """,
                (ma_gv, ho_ten, email or None, (phone or "").strip() or None, ma_khoa),
            )
        else:
            cursor.execute(
                """
                INSERT INTO dbo.GiangVien (MaGV, HoTen, Email, DienThoai, TrangThai)
                VALUES (?, ?, ?, ?, N'Đã đăng ký')
                """,
                (ma_gv, ho_ten, email or None, (phone or "").strip() or None),
            )
        conn.commit()
        return ma_gv
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        err = str(e)
        if "PRIMARY KEY" in err or "duplicate" in err.lower() or "2627" in err:
            raise HTTPException(status_code=400, detail="Không thể tạo mã giảng viên, thử lại") from e
        raise HTTPException(status_code=500, detail=f"Không thể tạo hồ sơ giảng viên: {e}") from e
    finally:
        cursor.close()
        conn.close()


def get_student_name(ma_sv: str) -> Optional[str]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT HoTen FROM SinhVien WHERE MaSV = ?", (ma_sv,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return row[0] if row else None


def _strip_accents(s: str) -> str:
    s = (s or "").replace("Đ", "D").replace("đ", "d")
    return "".join(ch for ch in unicodedata.normalize("NFD", s) if unicodedata.category(ch) != "Mn")


def _student_name_parts(ho_ten: str) -> List[str]:
    return [p for p in re.split(r"\s+", (ho_ten or "").strip()) if p]


def _build_student_username_base(ho_ten: str) -> str:
    parts = _student_name_parts(ho_ten)
    if not parts:
        return "student"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1]}"


def _build_student_password(ho_ten: str) -> str:
    parts = _student_name_parts(ho_ten)
    token = parts[-1] if parts else "Student"
    token = _strip_accents(token)
    token = re.sub(r"[^A-Za-z0-9]", "", token)
    token = (token[:1].upper() + token[1:].lower()) if token else "Student"
    return f"{token}123@"


def _next_student_username(cursor, base: str) -> str:
    candidate = (base or "").strip() or "student"
    cursor.execute("SELECT COUNT(*) FROM dbo.NguoiDung WHERE Username = ?", (candidate,))
    if cursor.fetchone()[0] == 0:
        return candidate

    idx = 2
    while idx < 10000:
        next_u = f"{candidate} {idx}"
        cursor.execute("SELECT COUNT(*) FROM dbo.NguoiDung WHERE Username = ?", (next_u,))
        if cursor.fetchone()[0] == 0:
            return next_u
        idx += 1
    raise HTTPException(status_code=500, detail="Không thể cấp username tự động cho sinh viên")


@auth_router.get("/khoa")
async def list_khoa():
    """Danh sách khoa/bộ môn (đăng ký giảng viên)."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT MaKhoa, TenKhoa, GhiChu FROM dbo.Khoa ORDER BY MaKhoa"
        )
        return [
            {"ma_khoa": r[0], "ten_khoa": r[1], "ghi_chu": r[2]}
            for r in cursor.fetchall()
        ]
    finally:
        cursor.close()
        conn.close()


@auth_router.get("/khoa-structure")
async def list_khoa_structure():
    """
    Danh sách khoa kèm chuyên ngành đang có trong MonHoc để đăng ký giảng viên.
    """
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT k.MaKhoa, k.TenKhoa, k.GhiChu
            FROM dbo.Khoa k
            ORDER BY k.MaKhoa
            """
        )
        khoa_rows = cursor.fetchall()
        data = []
        for r in khoa_rows:
            ma_khoa = (r[0] or "").strip()
            cursor.execute(
                """
                SELECT DISTINCT mh.ChuyenNganh
                FROM dbo.MonHoc mh
                WHERE LTRIM(RTRIM(ISNULL(mh.MaKhoa,''))) = LTRIM(RTRIM(?))
                  AND ISNULL(LTRIM(RTRIM(mh.ChuyenNganh)), '') <> ''
                ORDER BY mh.ChuyenNganh
                """,
                (ma_khoa,),
            )
            chuyen_nganh = [(x[0] or "").strip() for x in cursor.fetchall() if x and x[0]]
            data.append(
                {
                    "ma_khoa": ma_khoa,
                    "ten_khoa": r[1],
                    "ghi_chu": r[2],
                    "chuyen_nganh": chuyen_nganh,
                }
            )
        return {"khoa": data}
    finally:
        cursor.close()
        conn.close()


@auth_router.post("/register")
async def register(req: RegisterRequest):
    username_in = (req.username or "").strip()
    role = req.role.strip().upper()
    if not role_allowed(role) or role == "ADMIN":
        # ADMIN vẫn cho phép tạo qua admin seed, không qua register thường
        raise HTTPException(status_code=400, detail="Role không hợp lệ")

    ho_ten = (req.ho_ten or "").strip()
    if not ho_ten:
        raise HTTPException(status_code=400, detail="Họ tên không hợp lệ")

    ma_sv: Optional[str] = None
    ma_gv = (req.ma_gv or "").strip() or None
    ma_khoa_in = (req.ma_khoa or "").strip() or None
    chuyen_nganh_in = (req.chuyen_nganh or "").strip() or None
    ma_khoa_user: Optional[str] = None

    if not username_in:
        raise HTTPException(status_code=400, detail="Thiếu username")
    pwd = (req.password or "").strip()
    if len(pwd) < 6:
        raise HTTPException(status_code=400, detail="Password phải >= 6 ký tự")
    username_base = normalize_username(username_in)
    password_plain = pwd

    raw_email = (req.email or "").strip()
    conn = get_connection()
    cursor = conn.cursor()
    try:
        if role == "STUDENT":
            username = username_base
            ma_sv_in = (req.ma_sv or "").strip()
            if not ma_sv_in:
                raise HTTPException(status_code=400, detail="Vui lòng nhập mã sinh viên")
            ma_sv = ma_sv_in
            cursor.execute(
                "SELECT HoTen FROM dbo.SinhVien WHERE LTRIM(RTRIM(MaSV)) = LTRIM(RTRIM(?))",
                (ma_sv,),
            )
            row_sv = cursor.fetchone()
            if not row_sv:
                raise HTTPException(
                    status_code=400,
                    detail="Mã sinh viên không đúng hoặc chưa có trong hệ thống. Vui lòng kiểm tra lại.",
                )
            db_hoten = (row_sv[0] or "").strip()
            if db_hoten:
                ho_ten = db_hoten
        else:
            username = username_base

        if raw_email:
            final_email = normalize_email(raw_email)
            if not EMAIL_REGEX.match(final_email):
                raise HTTPException(status_code=400, detail="Email không hợp lệ")
        else:
            final_email = synthetic_email_for_username(username)

        gv_email = (
            None
            if final_email.endswith("@local.smartattendance")
            else final_email
        )

        if role == "TEACHER":
            if ma_khoa_in and chuyen_nganh_in:
                cursor.execute(
                    """
                    SELECT COUNT(*)
                    FROM dbo.MonHoc
                    WHERE LTRIM(RTRIM(ISNULL(MaKhoa,''))) = LTRIM(RTRIM(?))
                      AND LTRIM(RTRIM(ISNULL(ChuyenNganh,''))) = LTRIM(RTRIM(?))
                    """,
                    (ma_khoa_in, chuyen_nganh_in),
                )
                if cursor.fetchone()[0] == 0:
                    raise HTTPException(
                        status_code=400,
                        detail="Chuyên ngành không thuộc khoa đã chọn trong CSDL",
                    )
            if ma_khoa_in:
                ma_gv = ensure_teacher_register_with_khoa(ma_khoa_in, ho_ten, gv_email, req.phone)
                ma_khoa_user = ma_khoa_in
            elif ma_gv:
                conn_chk = get_connection()
                cur_chk = conn_chk.cursor()
                try:
                    cur_chk.execute(
                        "SELECT COUNT(*) FROM dbo.NguoiDung WHERE Role = N'TEACHER' AND LTRIM(RTRIM(ISNULL(MaGV,''))) = LTRIM(RTRIM(?))",
                        (ma_gv,),
                    )
                    if cur_chk.fetchone()[0] > 0:
                        raise HTTPException(status_code=400, detail="Mã giảng viên đã được dùng để đăng ký tài khoản khác")
                finally:
                    cur_chk.close()
                    conn_chk.close()
                ensure_teacher_profile_for_registration(ma_gv, ho_ten, gv_email, req.phone)
                conn_gv = get_connection()
                cur_gv = conn_gv.cursor()
                try:
                    cur_gv.execute(
                        "SELECT MaKhoa FROM dbo.GiangVien WHERE LTRIM(RTRIM(MaGV)) = LTRIM(RTRIM(?))",
                        (ma_gv,),
                    )
                    rmk = cur_gv.fetchone()
                    if rmk and rmk[0]:
                        ma_khoa_user = (rmk[0] or "").strip() or None
                finally:
                    cur_gv.close()
                    conn_gv.close()
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Chọn khoa giảng dạy (ma_khoa) hoặc nhập mã giảng viên có sẵn (ma_gv)",
                )

        if role == "STUDENT":
            cursor.execute(
                "SELECT COUNT(*) FROM dbo.NguoiDung WHERE Role = N'STUDENT' AND LTRIM(RTRIM(ISNULL(MaSV,''))) = LTRIM(RTRIM(?))",
                (ma_sv,),
            )
            if cursor.fetchone()[0] > 0:
                raise HTTPException(status_code=400, detail="Mã sinh viên đã có tài khoản đăng nhập")

        # Check username/email tồn tại
        cursor.execute("SELECT COUNT(*) FROM dbo.NguoiDung WHERE Username = ?", (username,))
        if cursor.fetchone()[0] > 0:
            raise HTTPException(status_code=400, detail="Username đã tồn tại")

        cursor.execute("SELECT COUNT(*) FROM dbo.NguoiDung WHERE Email = ?", (final_email,))
        if cursor.fetchone()[0] > 0:
            raise HTTPException(status_code=400, detail="Email đã tồn tại")

        salt = gen_salt_hex()
        pwd_hash = hash_password(password_plain, salt)

        cursor.execute(
            """
            INSERT INTO dbo.NguoiDung (Username, HoTen, MaSV, MaGV, MaKhoa, Role, Email, Phone, PasswordHash, PasswordSalt, IsVerified, IsLocked, LockReason, Avatar, UpdatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NULL, NULL, SYSUTCDATETIME())
            """,
            (username, ho_ten, ma_sv, ma_gv, ma_khoa_user, role, final_email, req.phone, pwd_hash, salt),
        )
        conn.commit()

        return {
            "success": True,
            "message": "Đăng ký thành công. Bạn có thể đăng nhập ngay bằng username và mật khẩu.",
            "username": username,
            "password": None,
            "ma_sv": ma_sv if role == "STUDENT" else None,
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@auth_router.post("/verify-otp")
async def verify_otp(req: VerifyOtpRequest):
    username = normalize_username(req.username)
    purpose = (req.purpose or "register").strip().lower()
    if purpose not in {"register", "reset_password"}:
        raise HTTPException(status_code=400, detail="Purpose không hợp lệ")

    row = get_user_row_by_username(username)
    if not row:
        raise HTTPException(status_code=404, detail="Tài khoản không tồn tại")

    user_id = row[0]
    email = row[3]

    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT TOP 1 Id, OtpSalt, OtpHash, ExpiresAt, ConsumedAt
            FROM dbo.XacThucOtp
            WHERE UserId = ? AND Purpose = ? AND ConsumedAt IS NULL
            ORDER BY CreatedAt DESC
            """,
            (user_id, purpose),
        )
        chal = cursor.fetchone()
        if not chal:
            raise HTTPException(status_code=400, detail="OTP không tồn tại hoặc đã hết hạn")

        otp_salt = chal[1]
        otp_hash = chal[2]
        expires_at = chal[3]
        if expires_at and datetime.now(timezone.utc) > expires_at.replace(tzinfo=timezone.utc) if hasattr(expires_at, "replace") else expires_at:
            raise HTTPException(status_code=400, detail="OTP đã hết hạn")

        # verify
        candidate_hash = sha256_hex(f"{otp_salt}:{req.otp.strip()}")
        if not hmac.compare_digest(candidate_hash, otp_hash):
            raise HTTPException(status_code=400, detail="OTP không đúng")

        # consume challenge
        cursor.execute("UPDATE dbo.XacThucOtp SET ConsumedAt = SYSUTCDATETIME() WHERE Id = ?", (chal[0],))

        if purpose == "register":
            cursor.execute("UPDATE dbo.NguoiDung SET IsVerified = 1, UpdatedAt = SYSUTCDATETIME() WHERE Id = ?", (user_id,))

        conn.commit()
        return {"success": True, "message": "Xác thực OTP thành công"}
    finally:
        cursor.close()
        conn.close()


@auth_router.post("/resend-otp")
async def resend_otp(req: ResendOtpRequest):
    """Gửi lại mã OTP cho tài khoản chưa xác thực (register) hoặc để đặt lại MK (reset_password)."""
    username = normalize_username(req.username)
    purpose = (req.purpose or "register").strip().lower()
    if purpose not in {"register", "reset_password"}:
        raise HTTPException(status_code=400, detail="Purpose không hợp lệ")

    row = get_user_row_by_username(username)
    if not row:
        raise HTTPException(status_code=404, detail="Tài khoản không tồn tại")

    user_id, _, role, email, phone, pwd_hash, pwd_salt, is_verified, is_locked, lock_reason, avatar = row
    if is_locked:
        raise HTTPException(status_code=403, detail="Tài khoản đang bị khóa")
    if purpose == "register" and is_verified:
        raise HTTPException(status_code=400, detail="Tài khoản đã xác thực, không cần gửi lại OTP")

    otp_code = generate_otp_code()
    otp_salt = gen_salt_hex(8)
    otp_hash = sha256_hex(f"{otp_salt}:{otp_code}")
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=OTP_TTL_SECONDS)

    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO dbo.XacThucOtp (UserId, Email, Purpose, OtpSalt, OtpHash, ExpiresAt)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (user_id, email, purpose, otp_salt, otp_hash, expires_at),
        )
        conn.commit()

        try:
            sent = send_email_otp(email, otp_code)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Không gửi được OTP email: {e}")

        out = {"success": True, "message": "Đã gửi lại mã OTP tới email."}
        if not sent:
            out["dev_otp"] = otp_code
            out["message"] = "Chưa cấu hình gửi email. Dùng mã OTP bên dưới (chế độ dev)."
        return out
    finally:
        cursor.close()
        conn.close()


@auth_router.post("/login")
async def login(req: LoginRequest):
    username = normalize_username(req.username)
    row = get_user_row_by_username(username)
    if not row:
        raise HTTPException(status_code=401, detail="Sai tài khoản hoặc mật khẩu")

    user_id, db_username, role, email, phone, pwd_hash, pwd_salt, is_verified, is_locked, lock_reason, avatar = row
    # Dùng username lưu trong DB để trả về token (thống nhất), hash/salt bỏ khoảng trắng lỡ DB lưu thừa
    username = (db_username or "").strip() or username
    pwd_hash = (pwd_hash or "").strip()
    pwd_salt = (pwd_salt or "").strip()
    password = (req.password or "").strip()

    if is_locked:
        raise HTTPException(status_code=403, detail=f"Tài khoản đang bị khóa: {lock_reason or ''}".strip())
    if not verify_password(password, pwd_salt, pwd_hash):
        raise HTTPException(status_code=401, detail="Sai tài khoản hoặc mật khẩu")

    token = create_jwt({"uid": user_id, "username": username, "role": role})
    return {"success": True, "token": token, "role": role, "username": username, "email": email}


@auth_router.post("/change-password")
async def change_password(req: ChangePasswordRequest, current=Depends(get_current_user)):
    """Đổi mật khẩu khi đã đăng nhập (không dùng email/OTP)."""
    if current.get("is_locked"):
        raise HTTPException(status_code=403, detail="Tài khoản đang bị khóa")
    if len((req.new_password or "").strip()) < 6:
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải >= 6 ký tự")

    row = get_user_row_by_username(current["username"])
    if not row:
        raise HTTPException(status_code=401, detail="Tài khoản không tồn tại")

    user_id = row[0]
    pwd_hash = (row[5] or "").strip()
    pwd_salt = (row[6] or "").strip()
    old_pwd = (req.old_password or "").strip()

    if not verify_password(old_pwd, pwd_salt, pwd_hash):
        raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không đúng")

    new_salt = gen_salt_hex()
    new_hash = hash_password(req.new_password.strip(), new_salt)

    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            UPDATE dbo.NguoiDung
            SET PasswordSalt = ?, PasswordHash = ?, UpdatedAt = SYSUTCDATETIME()
            WHERE Id = ?
            """,
            (new_salt, new_hash, user_id),
        )
        conn.commit()
        return {"success": True, "message": "Đã đổi mật khẩu thành công"}
    finally:
        cursor.close()
        conn.close()


@auth_router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    # trả response chung để chống dò email
    req.email = normalize_email(req.email)
    if not EMAIL_REGEX.match(req.email or ""):
        return {"success": True, "message": "Nếu email tồn tại, hệ thống sẽ gửi OTP."}
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT Id, Username FROM dbo.NguoiDung WHERE Email = ?", (req.email,))
        user = cursor.fetchone()
        if not user:
            return {"success": True, "message": "Nếu email tồn tại, hệ thống sẽ gửi OTP."}

        user_id = user[0]

        otp_code = generate_otp_code()
        otp_salt = gen_salt_hex(8)
        otp_hash = sha256_hex(f"{otp_salt}:{otp_code}")
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=OTP_TTL_SECONDS)

        cursor.execute(
            """
            INSERT INTO dbo.XacThucOtp (UserId, Email, Purpose, OtpSalt, OtpHash, ExpiresAt)
            VALUES (?, ?, 'reset_password', ?, ?, ?)
            """,
            (user_id, req.email, otp_salt, otp_hash, expires_at),
        )
        conn.commit()

        try:
            sent = send_email_otp(req.email, otp_code)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Không gửi được OTP email: {e}")
        out = {"success": True, "message": "Đã gửi OTP đặt lại mật khẩu tới email."}
        if not sent:
            out["dev_otp"] = otp_code
            out["message"] = "Chưa cấu hình gửi email. Dùng mã OTP bên dưới (chế độ dev)."
        return out
    finally:
        cursor.close()
        conn.close()


@auth_router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest):
    username = normalize_username(req.username)
    row = get_user_row_by_username(username)
    if not row:
        raise HTTPException(status_code=404, detail="Tài khoản không tồn tại")

    user_id = row[0]
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT TOP 1 Id, OtpSalt, OtpHash, ExpiresAt, ConsumedAt
            FROM dbo.XacThucOtp
            WHERE UserId = ? AND Purpose = 'reset_password' AND ConsumedAt IS NULL
            ORDER BY CreatedAt DESC
            """,
            (user_id,),
        )
        chal = cursor.fetchone()
        if not chal:
            raise HTTPException(status_code=400, detail="OTP không tồn tại hoặc đã hết hạn")

        otp_salt = chal[1]
        otp_hash = chal[2]
        expires_at = chal[3]
        if datetime.now(timezone.utc) > expires_at.replace(tzinfo=timezone.utc) if hasattr(expires_at, "replace") else expires_at:
            raise HTTPException(status_code=400, detail="OTP đã hết hạn")

        candidate_hash = sha256_hex(f"{otp_salt}:{req.otp.strip()}")
        if not hmac.compare_digest(candidate_hash, otp_hash):
            raise HTTPException(status_code=400, detail="OTP không đúng")

        new_salt = gen_salt_hex()
        new_hash = hash_password(req.new_password, new_salt)

        cursor.execute("UPDATE dbo.XacThucOtp SET ConsumedAt = SYSUTCDATETIME() WHERE Id = ?", (chal[0],))
        cursor.execute(
            """
            UPDATE dbo.NguoiDung
            SET PasswordSalt = ?, PasswordHash = ?, UpdatedAt = SYSUTCDATETIME()
            WHERE Id = ?
            """,
            (new_salt, new_hash, user_id),
        )
        conn.commit()
        return {"success": True, "message": "Đã đặt lại mật khẩu thành công"}
    finally:
        cursor.close()
        conn.close()


@auth_router.post("/reset-password-email")
async def reset_password_email(req: ResetPasswordEmailRequest):
    # Cho phép reset mật khẩu theo email (phù hợp luồng "quên mật khẩu" của UI)
    req.email = normalize_email(req.email)
    if not EMAIL_REGEX.match(req.email or ""):
        raise HTTPException(status_code=400, detail="Email không hợp lệ")

    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT Id FROM dbo.NguoiDung WHERE Email = ?", (req.email,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Tài khoản không tồn tại")

        user_id = row[0]

        cursor.execute(
            """
            SELECT TOP 1 Id, OtpSalt, OtpHash, ExpiresAt, ConsumedAt
            FROM dbo.XacThucOtp
            WHERE UserId = ? AND Purpose = 'reset_password' AND ConsumedAt IS NULL
            ORDER BY CreatedAt DESC
            """,
            (user_id,),
        )
        chal = cursor.fetchone()
        if not chal:
            raise HTTPException(status_code=400, detail="OTP không tồn tại hoặc đã hết hạn")

        otp_salt = chal[1]
        otp_hash = chal[2]
        expires_at = chal[3]
        if datetime.now(timezone.utc) > expires_at.replace(tzinfo=timezone.utc) if hasattr(expires_at, "replace") else expires_at:
            raise HTTPException(status_code=400, detail="OTP đã hết hạn")

        candidate_hash = sha256_hex(f"{otp_salt}:{req.otp.strip()}")
        if not hmac.compare_digest(candidate_hash, otp_hash):
            raise HTTPException(status_code=400, detail="OTP không đúng")

        new_salt = gen_salt_hex()
        new_hash = hash_password(req.new_password, new_salt)

        cursor.execute("UPDATE dbo.XacThucOtp SET ConsumedAt = SYSUTCDATETIME() WHERE Id = ?", (chal[0],))
        cursor.execute(
            """
            UPDATE dbo.NguoiDung
            SET PasswordSalt = ?, PasswordHash = ?, UpdatedAt = SYSUTCDATETIME()
            WHERE Id = ?
            """,
            (new_salt, new_hash, user_id),
        )
        conn.commit()
        return {"success": True, "message": "Đã đặt lại mật khẩu thành công"}
    finally:
        cursor.close()
        conn.close()


@auth_router.get("/me", response_model=MeResponse)
async def me(current=Depends(require_role("ADMIN", "TEACHER", "STUDENT"))):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        if current["role"] == "STUDENT":
            cursor.execute(
                """
                SELECT MaSV, HoTen, NgaySinh, GioiTinh, Lop, Khoa, Email, TrangThai, AnhDaiDien
                FROM SinhVien WHERE MaSV = ?
                """,
                (current["ma_sv"],),
            )
            row = cursor.fetchone()
            profile = {}
            if row:
                ad_raw = row[8]
                ad = str(ad_raw).strip() if ad_raw is not None and str(ad_raw).strip() else None
                profile = {
                    "ma_sv": row[0],
                    "ho_ten": row[1],
                    "ngay_sinh": row[2].isoformat() if row[2] else None,
                    "gioi_tinh": row[3],
                    "lop": row[4],
                    "khoa": row[5],
                    "trang_thai": row[7],
                    "anh_dai_dien": ad,
                }
            return MeResponse(
                username=current["username"],
                ho_ten=current.get("ho_ten"),
                ma_sv=current.get("ma_sv"),
                ma_gv=current.get("ma_gv"),
                ma_khoa=current.get("ma_khoa"),
                ten_khoa=None,
                role=current["role"],
                email=current["email"],
                phone=current["phone"],
                is_verified=current["is_verified"],
                is_locked=current["is_locked"],
                avatar=current["avatar"],  # Auth avatar (nếu có)
                profile=profile,
            )

        # TEACHER / ADMIN
        ten_khoa = None
        mk = (current.get("ma_khoa") or "").strip()
        if mk:
            conn_k = get_connection()
            cur_k = conn_k.cursor()
            try:
                cur_k.execute("SELECT TenKhoa FROM dbo.Khoa WHERE MaKhoa = ?", (mk,))
                rr = cur_k.fetchone()
                if rr:
                    ten_khoa = rr[0]
            finally:
                cur_k.close()
                conn_k.close()
        prof = {"note": "Profile teacher/admin được hỗ trợ ở phần RBAC sâu hơn."}
        if current["role"] == "TEACHER":
            prof = {
                "ma_gv": current.get("ma_gv"),
                "ma_khoa": mk or None,
                "ten_khoa": ten_khoa,
            }
        return MeResponse(
            username=current["username"],
            ho_ten=current.get("ho_ten"),
            ma_sv=current.get("ma_sv"),
            ma_gv=current.get("ma_gv"),
            ma_khoa=mk or None,
            ten_khoa=ten_khoa,
            role=current["role"],
            email=current["email"],
            phone=current["phone"],
            is_verified=current["is_verified"],
            is_locked=current["is_locked"],
            avatar=current["avatar"],
            profile=prof,
        )
    finally:
        cursor.close()
        conn.close()


@auth_router.post("/admin/users/{username}/set-lock")
async def set_lock(
    username: str,
    body: AdminSetLockRequest,
    current=Depends(require_role("ADMIN")),
):
    username = normalize_username(username)
    locked = body.locked
    reason_in = (body.reason or "").strip() or None
    lock_reason = reason_in if locked else None

    if locked:
        cur_un = (current.get("username") or "").strip().lower()
        if cur_un == (username or "").strip().lower():
            raise HTTPException(
                status_code=400,
                detail="Không thể khóa chính tài khoản admin đang đăng nhập.",
            )

    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE dbo.NguoiDung SET IsLocked = ?, LockReason = ?, UpdatedAt = SYSUTCDATETIME() WHERE Username = ?",
            (1 if locked else 0, lock_reason, username),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Không tìm thấy user")
        conn.commit()
        return {"success": True}
    finally:
        cursor.close()
        conn.close()


@auth_router.patch("/teacher/profile")
async def patch_teacher_profile(body: TeacherProfileUpdate, current=Depends(require_role("TEACHER"))):
    """Cập nhật email / điện thoại giảng viên (NguoiDung + GiangVien)."""
    ma_gv = (current.get("ma_gv") or "").strip()
    uid = current["uid"]
    email_in = (body.email or "").strip() if body.email is not None else None
    phone_in = (body.phone or "").strip() if body.phone is not None else None

    if email_in is not None:
        if not email_in:
            raise HTTPException(status_code=400, detail="Email không được để trống")
        if not EMAIL_REGEX.match(email_in):
            raise HTTPException(status_code=400, detail="Email không hợp lệ")

    conn = get_connection()
    cursor = conn.cursor()
    try:
        if email_in is not None:
            cursor.execute(
                "SELECT COUNT(*) FROM dbo.NguoiDung WHERE Email = ? AND Id <> ?",
                (email_in, uid),
            )
            if cursor.fetchone()[0] > 0:
                raise HTTPException(status_code=400, detail="Email đã được dùng bởi tài khoản khác")

        sets_nd = []
        params_nd: List[Any] = []
        if email_in is not None:
            sets_nd.append("Email = ?")
            params_nd.append(email_in)
        if phone_in is not None:
            sets_nd.append("Phone = ?")
            params_nd.append(phone_in or None)
        if sets_nd:
            sets_nd.append("UpdatedAt = SYSUTCDATETIME()")
            sql_nd = f"UPDATE dbo.NguoiDung SET {', '.join(sets_nd)} WHERE Id = ?"
            params_nd.append(uid)
            cursor.execute(sql_nd, tuple(params_nd))

        if ma_gv and (email_in is not None or phone_in is not None):
            sets_gv = []
            params_gv: List[Any] = []
            if email_in is not None:
                sets_gv.append("Email = ?")
                params_gv.append(email_in or None)
            if phone_in is not None:
                sets_gv.append("DienThoai = ?")
                params_gv.append(phone_in or None)
            if sets_gv:
                sql_gv = f"UPDATE dbo.GiangVien SET {', '.join(sets_gv)} WHERE LTRIM(RTRIM(MaGV)) = LTRIM(RTRIM(?))"
                params_gv.append(ma_gv)
                cursor.execute(sql_gv, tuple(params_gv))

        conn.commit()
        return {"success": True, "message": "Đã cập nhật hồ sơ"}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        cursor.close()
        conn.close()


def _clear_teacher_auth_avatar(uid: int) -> None:
    """Xóa Avatar trong DB + file trong avatars_auth (dùng cho DELETE và POST)."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT Avatar FROM dbo.NguoiDung WHERE Id = ?", (uid,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")
        fn = (row[0] or "").strip() if row else ""
        cursor.execute(
            "UPDATE dbo.NguoiDung SET Avatar = NULL, UpdatedAt = SYSUTCDATETIME() WHERE Id = ?",
            (uid,),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=400, detail="Không cập nhật được ảnh đại diện")
        conn.commit()
        if fn:
            path = os.path.join(AUTH_AVATARS_DIR, fn)
            if os.path.isfile(path):
                try:
                    os.remove(path)
                except OSError:
                    pass
    finally:
        cursor.close()
        conn.close()


@auth_router.delete("/teacher/avatar")
async def delete_teacher_avatar(current=Depends(require_role("TEACHER"))):
    """Xóa ảnh đại diện tài khoản giảng viên."""
    _clear_teacher_auth_avatar(current["uid"])
    return {"success": True}


@auth_router.post("/teacher/avatar/clear")
async def post_clear_teacher_avatar(current=Depends(require_role("TEACHER"))):
    """Giống DELETE /teacher/avatar — một số proxy/client gặp lỗi với DELETE hoặc mất Authorization khi redirect."""
    _clear_teacher_auth_avatar(current["uid"])
    return {"success": True}


@auth_router.post("/teacher/avatar")
async def upload_teacher_avatar(
    file: UploadFile = File(...),
    current=Depends(require_role("TEACHER")),
):
    # Lưu avatar theo username của teacher account
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="File rỗng")
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        safe_name = re.sub(r"[^0-9A-Za-z_-]+", "_", current["username"]).strip("_")[:60] or "teacher"
        out_path = os.path.join(AUTH_AVATARS_DIR, f"{safe_name}.jpg")
        img.save(out_path, "JPEG", quality=88)
    except Exception:
        raise HTTPException(status_code=400, detail="File không phải ảnh hợp lệ")

    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE dbo.NguoiDung SET Avatar = ?, UpdatedAt = SYSUTCDATETIME() WHERE Id = ?", (f"{safe_name}.jpg", current["uid"]))
        conn.commit()
        return {"success": True}
    finally:
        cursor.close()
        conn.close()


@auth_router.get("/avatar/{username}")
async def get_avatar(username: str, current=Depends(require_role("ADMIN", "TEACHER", "STUDENT"))):
    """
    Trả avatar của tài khoản.
    - ADMIN xem được avatar mọi người
    - TEACHER/STUDENT chỉ xem được chính mình
    """
    username = normalize_username(username)
    if current["role"] != "ADMIN" and current["username"] != username:
        raise HTTPException(status_code=403, detail="Không có quyền truy cập ảnh đại diện")

    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT Avatar FROM dbo.NguoiDung WHERE Username = ?", (username,))
        row = cursor.fetchone()
        if not row or not row[0]:
            raise HTTPException(status_code=404, detail="Chưa có ảnh đại diện")

        avatar_file = str(row[0]).strip()
        path = os.path.join(AUTH_AVATARS_DIR, avatar_file)
        if not os.path.isfile(path):
            raise HTTPException(status_code=404, detail="File ảnh không tồn tại")

        return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "no-store"})
    finally:
        cursor.close()
        conn.close()


@auth_router.get("/admin/users")
async def admin_list_users(current=Depends(require_role("ADMIN"))):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT Username, Role, Email, Phone, IsVerified, IsLocked, LockReason, Avatar, CreatedAt
            FROM dbo.NguoiDung
            ORDER BY CreatedAt DESC
            """
        )
        rows = cursor.fetchall()
        data = []
        for r in rows:
            data.append(
                {
                    "username": r[0],
                    "role": r[1],
                    "email": r[2],
                    "phone": r[3],
                    "is_verified": bool(r[4]),
                    "is_locked": bool(r[5]),
                    "lock_reason": r[6],
                    "avatar": r[7],
                    "created_at": r[8].isoformat() if r[8] else None,
                }
            )
        return {"users": data}
    finally:
        cursor.close()
        conn.close()


@auth_router.post("/admin/provision-student-accounts")
async def admin_provision_student_accounts(current=Depends(require_role("ADMIN"))):
    """
    Tạo tài khoản đăng nhập cho toàn bộ SinhVien chưa có user STUDENT.
    Quy tắc:
    - username: "Họ đầu + Tên" (nếu trùng thì thêm hậu tố số)
    - password mặc định: TenKhongDau123@
    """
    conn = get_connection()
    cursor = conn.cursor()
    created: List[StudentCredentialItem] = []
    try:
        cursor.execute(
            """
            SELECT sv.MaSV, sv.HoTen
            FROM dbo.SinhVien sv
            LEFT JOIN dbo.NguoiDung u
              ON u.Role = N'STUDENT'
             AND LTRIM(RTRIM(ISNULL(u.MaSV, ''))) = LTRIM(RTRIM(ISNULL(sv.MaSV, '')))
            WHERE u.Id IS NULL
            ORDER BY sv.MaSV
            """
        )
        rows = cursor.fetchall()
        for row in rows:
            ma_sv = (row[0] or "").strip()
            ho_ten = (row[1] or "").strip() or f"Sinh viên {ma_sv}"
            username = _next_student_username(cursor, _build_student_username_base(ho_ten))
            plain_password = _build_student_password(ho_ten)
            email = synthetic_email_for_username(username)
            salt = gen_salt_hex()
            pwd_hash = hash_password(plain_password, salt)
            cursor.execute(
                """
                INSERT INTO dbo.NguoiDung
                  (Username, HoTen, MaSV, MaGV, MaKhoa, Role, Email, Phone, PasswordHash, PasswordSalt, IsVerified, IsLocked, LockReason, Avatar, UpdatedAt)
                VALUES (?, ?, ?, NULL, NULL, N'STUDENT', ?, NULL, ?, ?, 1, 0, NULL, NULL, SYSUTCDATETIME())
                """,
                (username, ho_ten, ma_sv, email, pwd_hash, salt),
            )
            created.append(
                StudentCredentialItem(
                    ma_sv=ma_sv,
                    ho_ten=ho_ten,
                    username=username,
                    password=plain_password,
                )
            )

        conn.commit()
        return {
            "success": True,
            "created_count": len(created),
            "created": [item.model_dump() for item in created],
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể tạo tài khoản sinh viên: {e}") from e
    finally:
        cursor.close()
        conn.close()

