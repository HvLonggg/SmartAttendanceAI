from database.db_connection import get_connection

def get_student(ma_sv):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT MaSV, HoTen, Lop, Email
        FROM SinhVien
        WHERE MaSV = ?
    """, ma_sv)

    row = cursor.fetchone()
    conn.close()

    if row:
        return {
            "MaSV": row[0],
            "HoTen": row[1],
            "Lop": row[2],
            "Email": row[3]
        }
    return None
