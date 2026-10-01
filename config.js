// ใส่ค่า Firebase Web App เมื่อพร้อมเชื่อมฐานข้อมูลจริง
// ค่า config ของ Firebase Web App แสดงในเว็บได้ แต่สิทธิ์การอ่าน/เขียนต้องคุมด้วย RTDB Rules
window.SMART_BEDROOM_CONFIG = {
  firebase: null,
  databaseURL: "https://iot-108-41795-default-rtdb.asia-southeast1.firebasedatabase.app",
  rootPath: "lab",
  enableControlWrites: false
};
