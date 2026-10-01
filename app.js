const config = window.SMART_BEDROOM_CONFIG || {};
const METRICS = {
  temperature: { label: "อุณหภูมิ", unit: "°C", digits: 1, min: 22, max: 34, start: 27.2, step: 0.35 },
  humidity: { label: "ความชื้น", unit: "%", digits: 0, min: 35, max: 78, start: 58, step: 2.2 },
  light: { label: "ความสว่าง", unit: "lux", digits: 0, min: 25, max: 700, start: 310, step: 38 },
  pm25: { label: "ฝุ่น PM2.5", unit: "µg/m³", digits: 1, min: 4, max: 65, start: 18.4, step: 2.6 },
  co2: { label: "CO₂", unit: "ppm", digits: 0, min: 420, max: 1600, start: 785, step: 35 },
  noise: { label: "ระดับเสียง", unit: "dB", digits: 0, min: 28, max: 75, start: 42, step: 3.5 }
};

const state = { mode: "demo", latest: null, history: [], controls: { light: false, fan: false }, database: null, selectedMetric: "temperature", demoTimer: null, restPolling: null, restStream: null, restBusy: false };
const $ = (selector) => document.querySelector(selector);
const formatTime = (value) => new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(value);
const formatNumber = (value, digits) => Number(value).toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function updateClock() {
  const now = new Date();
  $("#clock").textContent = new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(now);
  $("#dayNumber").textContent = String(now.getDate()).padStart(2, "0");
  $("#fullDate").textContent = new Intl.DateTimeFormat("th-TH", { weekday: "short", month: "long", year: "numeric" }).format(now);
}

function setConnection(mode, title, message) {
  state.mode = mode;
  $("#modeBadge").textContent = mode === "live" ? "เชื่อมต่อจริง" : mode === "error" ? "เชื่อมต่อไม่ได้" : mode === "connecting" ? "กำลังเชื่อมต่อ" : "ข้อมูลจำลอง";
  $("#modeBadge").className = `mode-badge ${mode === "live" ? "live" : mode === "error" ? "error" : ""}`;
  $("#connectionDot").className = `connection-dot ${mode === "live" ? "live" : mode === "error" ? "error" : ""}`;
  $("#connectionTitle").textContent = title;
  $("#connectionMessage").textContent = message;
  $("#footerMode").textContent = mode === "live" ? "ข้อมูลจาก Firebase Realtime Database" : mode === "demo" ? "ข้อมูลจำลองสำหรับการออกแบบระบบ" : message;
  $("#refreshButton").hidden = mode !== "demo";
  renderControls();
}

function nextDemo(previous, timestamp) {
  const record = { timestamp };
  for (const [key, metric] of Object.entries(METRICS)) {
    const prior = previous?.[key] ?? metric.start;
    const towardStart = (metric.start - prior) * 0.035;
    const raw = prior + towardStart + (Math.random() - 0.5) * metric.step * 2;
    record[key] = Number(clamp(raw, metric.min, metric.max).toFixed(metric.digits));
  }
  return record;
}

function startDemo() {
  if (state.demoTimer) return;
  const now = Date.now();
  state.history = [];
  let prior = null;
  for (let i = 23; i >= 0; i--) {
    prior = nextDemo(prior, now - i * 5 * 60_000);
    state.history.push(prior);
  }
  state.latest = prior;
  setConnection("demo", "โหมดจำลอง", "ข้อมูลตัวอย่างอัปเดตอัตโนมัติ");
  render();
  state.demoTimer = setInterval(() => {
    const record = nextDemo(state.latest, Date.now());
    state.latest = record;
    state.history.push(record);
    state.history = state.history.slice(-60);
    render();
  }, 5000);
}

const rootPath = (config.rootPath || "").replace(/^\/+|\/+$/g, "");
const dataPath = (name) => [rootPath, name].filter(Boolean).join("/");

async function connectRest() {
  const base = String(config.databaseURL).replace(/\/+$/, "");
  const urlFor = (name) => `${base}/${dataPath(name)}.json`;
  const getJson = async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };
  const refresh = async () => {
    if (state.restBusy) return;
    state.restBusy = true;
    try {
      const historyUrl = `${urlFor("history")}?orderBy=${encodeURIComponent('"$key"')}&limitToLast=60`;
      const [latestRaw, historyRaw] = await Promise.all([getJson(urlFor("latest")), getJson(historyUrl)]);
      if (state.demoTimer) { clearInterval(state.demoTimer); state.demoTimer = null; }
      state.latest = normalizeRecord(latestRaw);
      state.history = Object.values(historyRaw || {}).map(normalizeRecord).filter(Boolean).sort((a, b) => a.timestamp - b.timestamp);
      setConnection("live", "เชื่อมต่อ Firebase", state.latest ? "กำลังรับข้อมูลเซนเซอร์แบบเรียลไทม์" : `ยังไม่มีข้อมูลที่ ${dataPath("latest")}`);
      render();
      if (!state.restStream && typeof EventSource !== "undefined") {
        state.restStream = new EventSource(urlFor("latest"));
        state.restStream.addEventListener("put", refresh);
        state.restStream.addEventListener("patch", refresh);
      }
    } catch (error) {
      if (!state.demoTimer) startDemo();
      const reason = error?.message === "HTTP 401" ? "Firebase ปฏิเสธสิทธิ์อ่าน (401)" : error?.message || "เชื่อมต่อไม่ได้";
      setConnection("demo", "ยังอ่าน Firebase ไม่ได้", `${reason} · แสดงข้อมูลจำลอง`);
    } finally {
      state.restBusy = false;
    }
  };
  setConnection("connecting", "กำลังเชื่อม Firebase", "กำลังตรวจสิทธิ์อ่านข้อมูล");
  await refresh();
  state.restPolling = setInterval(refresh, 15_000);
}

function normalizeRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const parsedTime = typeof raw.timestamp === "number" ? raw.timestamp : Date.parse(raw.timestamp);
  const record = { timestamp: Number.isFinite(parsedTime) ? parsedTime : Date.now() };
  for (const key of Object.keys(METRICS)) {
    if (raw[key] === undefined || raw[key] === null || raw[key] === "") return null;
    const value = Number(raw[key]);
    if (!Number.isFinite(value)) return null;
    record[key] = value;
  }
  return record;
}

function renderSparkline(svg, values) {
  if (values.length < 2) { svg.innerHTML = ""; return; }
  const min = Math.min(...values), max = Math.max(...values), range = Math.max(1, max - min);
  const points = values.map((value, index) => `${(index / (values.length - 1) * 102).toFixed(1)},${(30 - (value - min) / range * 25).toFixed(1)}`).join(" ");
  svg.innerHTML = `<polyline points="${points}" />`;
}

function renderMetrics() {
  for (const [key, metric] of Object.entries(METRICS)) {
    const card = document.querySelector(`[data-metric="${key}"]`);
    card.querySelector("[data-value]").textContent = state.latest ? formatNumber(state.latest[key], metric.digits) : "—";
    renderSparkline(card.querySelector("[data-sparkline]"), state.history.slice(-12).map((item) => item[key]));
  }
  $("#lastUpdated").textContent = state.latest ? `อัปเดตล่าสุด ${formatTime(state.latest.timestamp)}` : "รอข้อมูลล่าสุด";
}

function renderChart() {
  const key = state.selectedMetric, metric = METRICS[key], data = state.history.slice(-36);
  $("#chartValue").textContent = state.latest ? formatNumber(state.latest[key], metric.digits) : "—";
  $("#chartUnit").textContent = metric.unit;
  const svg = $("#historyChart");
  if (data.length < 2) {
    svg.innerHTML = `<text x="360" y="130" text-anchor="middle" fill="#a0a0a0" font-size="16">ยังไม่มีข้อมูลย้อนหลัง</text>`;
    $("#chartStart").textContent = "—"; $("#chartEnd").textContent = "—";
    return;
  }
  const values = data.map((item) => item[key]);
  const rawMin = Math.min(...values), rawMax = Math.max(...values);
  const pad = Math.max((rawMax - rawMin) * 0.18, key === "temperature" || key === "pm25" ? 1 : 3);
  const min = rawMin - pad, max = rawMax + pad;
  const left = 52, right = 704, top = 18, bottom = 224;
  const x = (index) => left + index / (values.length - 1) * (right - left);
  const y = (value) => bottom - (value - min) / (max - min) * (bottom - top);
  const line = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const area = `${left},${bottom} ${line} ${right},${bottom}`;
  const grid = [0, 1, 2, 3].map((i) => {
    const yy = top + i / 3 * (bottom - top), label = (max - i / 3 * (max - min)).toFixed(metric.digits);
    return `<line x1="${left}" y1="${yy}" x2="${right}" y2="${yy}" stroke="#e6e6e4" stroke-dasharray="4 5"/><text x="42" y="${yy + 4}" text-anchor="end" fill="#a6a7a7" font-size="11">${label}</text>`;
  }).join("");
  svg.innerHTML = `<defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ee694d" stop-opacity=".20"/><stop offset="100%" stop-color="#ee694d" stop-opacity="0"/></linearGradient></defs>${grid}<polygon points="${area}" fill="url(#chartFill)"/><polyline points="${line}" fill="none" stroke="#ee694d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${x(values.length - 1)}" cy="${y(values.at(-1))}" r="6" fill="#ee694d" stroke="#fff" stroke-width="3"/>`;
  $("#chartStart").textContent = formatTime(data[0].timestamp);
  $("#chartEnd").textContent = formatTime(data.at(-1).timestamp);
  svg.setAttribute("aria-label", `กราฟ${metric.label}ย้อนหลัง จาก ${formatTime(data[0].timestamp)} ถึง ${formatTime(data.at(-1).timestamp)}`);
}

function renderHistory() {
  const rows = state.history.slice(-5).reverse();
  $("#historyCount").textContent = `${state.history.length} รายการ`;
  $("#historyBody").innerHTML = rows.length ? rows.map((r) => `<tr><td>${formatTime(r.timestamp)}</td><td>${formatNumber(r.temperature, 1)} °C</td><td>${formatNumber(r.humidity, 0)} %</td><td>${formatNumber(r.light, 0)} lux</td><td>${formatNumber(r.pm25, 1)}</td><td>${formatNumber(r.co2, 0)} ppm</td><td>${formatNumber(r.noise, 0)} dB</td></tr>`).join("") : `<tr><td colspan="7" class="empty-cell">ยังไม่มีข้อมูลย้อนหลัง</td></tr>`;
}

function renderControls() {
  const writable = state.mode === "demo" || (state.mode === "live" && config.enableControlWrites === true);
  for (const key of ["light", "fan"]) {
    const button = $(`#${key}Switch`);
    button.disabled = !writable;
    button.setAttribute("aria-checked", String(Boolean(state.controls[key])));
    $(`#${key}State`).textContent = state.controls[key] ? "เปิดอยู่" : "ปิดอยู่";
  }
  $("#controlsNote").textContent = state.mode === "demo" ? "สวิตช์ทำงานเฉพาะบนหน้านี้ในโหมดจำลอง" : state.mode === "live" && writable ? "คำสั่งจะบันทึกลง Firebase RTDB" : "รอเปิดสิทธิ์ควบคุมหลังเชื่อมอุปกรณ์จริง";
  $("#controlFootnote").textContent = state.mode === "live" && writable ? "ตรวจสอบสถานะอุปกรณ์จริงก่อนใช้งาน" : "คำสั่งยังไม่ส่งไปยังอุปกรณ์จริง";
}

function render() { renderMetrics(); renderChart(); renderHistory(); renderControls(); }

async function connectFirebase() {
  setConnection("connecting", "กำลังเชื่อมต่อ", "กำลังรอข้อมูลจาก Firebase RTDB");
  try {
    const [{ initializeApp }, { getDatabase, ref, onValue, query, orderByKey, limitToLast, set }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js")
    ]);
    const database = getDatabase(initializeApp(config.firebase));
    state.database = database;
    state.controlRef = (key) => ref(database, dataPath(`controls/${key}`));
    state.setControl = set;
    const onError = (error) => { setConnection("error", "เชื่อมต่อไม่ได้", error?.code || "ตรวจสอบ Firebase และสิทธิ์อ่านข้อมูล"); };
    onValue(ref(database, dataPath("latest")), (snapshot) => {
      const record = normalizeRecord(snapshot.val());
      state.latest = record;
      setConnection("live", "เชื่อมต่อ Firebase", record ? "กำลังรับข้อมูลเซนเซอร์แบบเรียลไทม์" : "เชื่อมต่อแล้ว แต่ยังไม่มีข้อมูลล่าสุด");
      render();
    }, onError);
    onValue(query(ref(database, dataPath("history")), orderByKey(), limitToLast(60)), (snapshot) => {
      const raw = snapshot.val() || {};
      state.history = Object.values(raw).map(normalizeRecord).filter(Boolean).sort((a, b) => a.timestamp - b.timestamp);
      render();
    }, onError);
    onValue(ref(database, dataPath("controls")), (snapshot) => {
      const raw = snapshot.val() || {};
      state.controls.light = Boolean(raw.light);
      state.controls.fan = Boolean(raw.fan);
      renderControls();
    }, onError);
  } catch (error) {
    setConnection("error", "เชื่อมต่อไม่ได้", error?.message || "ตรวจสอบค่า Firebase ใน config.js");
  }
}

for (const key of ["light", "fan"]) {
  $(`#${key}Switch`).addEventListener("click", async () => {
    const next = !state.controls[key];
    if (state.mode === "demo") { state.controls[key] = next; renderControls(); return; }
    if (state.mode !== "live" || !config.enableControlWrites || !state.setControl) return;
    const button = $(`#${key}Switch`); button.disabled = true;
    try { await state.setControl(state.controlRef(key), next); }
    catch (error) { setConnection("error", "ส่งคำสั่งไม่สำเร็จ", error?.code || "ตรวจสอบสิทธิ์เขียน Firebase"); }
    finally { renderControls(); }
  });
}

$("#chartMetric").addEventListener("change", (event) => { state.selectedMetric = event.target.value; renderChart(); });
$("#refreshButton").addEventListener("click", () => {
  if (state.mode !== "demo") return;
  const record = nextDemo(state.latest, Date.now());
  state.latest = record; state.history.push(record); state.history = state.history.slice(-60); render();
});
updateClock(); setInterval(updateClock, 30_000);
if (config.firebase?.apiKey && config.firebase?.databaseURL && config.firebase?.projectId) connectFirebase();
else if (config.databaseURL) connectRest();
else startDemo();
