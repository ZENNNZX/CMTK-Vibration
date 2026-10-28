# ภาพ ML — batch job ไม่ใช่ web service จึงไม่ EXPOSE พอร์ตใด ๆ
FROM python:3.11-slim

WORKDIR /app

# ลง dependency ก่อนคัดลอกโค้ด — แก้โค้ดแล้ว layer นี้ยังใช้ cache เดิมได้
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.py ./

# ไม่รันด้วย root — container นี้ต่อฐานข้อมูลที่มีข้อมูลการผลิต (NFR-07)
RUN useradd --create-home --uid 10001 ml
USER ml

CMD ["python", "-u", "job.py"]
