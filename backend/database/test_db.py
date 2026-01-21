import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost;"
    "DATABASE=SmartAttendanceAI;"
    "Trusted_Connection=yes;"
)

cursor = conn.cursor()

cursor.execute("SELECT name FROM sys.tables")
tables = cursor.fetchall()

print("KẾT NỐI OK. CÁC BẢNG:")
for t in tables:
    print("-", t[0])

conn.close()
