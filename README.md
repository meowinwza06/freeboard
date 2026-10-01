# Smart Bedroom IoT Dashboard

ระบบจำลองห้องนอนอัจฉริยะด้วย ESP32, ESPHome, Firebase Realtime Database และ GitHub Pages

## ข้อมูลที่แสดง

- อุณหภูมิ (°C)
- ความชื้น (%)
- ความสว่าง (lux)
- ฝุ่น PM2.5 (µg/m³)
- คาร์บอนไดออกไซด์ (ppm)
- ระดับเสียง (dB)

Dashboard อ่านข้อมูลจาก Firebase RTDB ที่ `lab/latest` และ `lab/history` โดยอัตโนมัติ หากยังไม่มีข้อมูลหรือเชื่อมต่อไม่ได้ หน้าเว็บจะแสดงข้อมูลจำลองพร้อมระบุสถานะชัดเจน

## โครงสร้าง Firebase

```text
lab/
├── latest/
│   ├── timestamp
│   ├── temperature
│   ├── humidity
│   ├── light
│   ├── pm25
│   ├── co2
│   └── noise
└── history/
    └── <push-id>/
        └── ข้อมูลรูปแบบเดียวกับ latest
```

## แฟลช ESP32

คัดลอก `firmware/secrets.example.yaml` เป็น `firmware/secrets.yaml` แล้วกรอก Wi-Fi ของตัวเอง จากนั้นรัน:

```cmd
esphome run firmware\smart-bedroom-esp32.yaml --device COM7
```

ไฟล์ `secrets.yaml` ถูกละเว้นด้วย `.gitignore` และไม่ควร push ขึ้น repository

## GitHub Pages

ตั้งค่า Pages ให้ deploy จาก branch `main` และโฟลเดอร์ `/ (root)` หน้าเว็บหลักคือ `index.html`
