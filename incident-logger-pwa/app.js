// Incident Logger Front-end
// Storage using IndexedDB without external libs
const DB_NAME = 'incident-logger-db';
const STORE = 'logs';
let db;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      store.createIndex('timestamp', 'timestamp');
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function addLog(entry) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(entry).onsuccess = (e) => resolve(e.target.result);
    tx.onerror = () => reject(tx.error);
  });
}

function getAllLogs() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function toLocalDateParts(ts) {
  const d = new Date(ts);
  return { date: d.toLocaleDateString(), time: d.toLocaleTimeString(), weekDay: d.toLocaleString(undefined, { weekday: 'short'}) };
}

// PWA: Service Worker & install
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('installBtn').hidden = false;
});

document.getElementById('installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('installBtn').hidden = true;
});

async function registerSW() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      console.log('SW registered', reg.scope);
      return reg;
    } catch (e) { console.warn('SW registration failed', e); }
  }
}

// Notifications
async function enableNotifications() {
  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        reg.showNotification('Notifications enabled', { body: 'You will see alerts when you log an incident.', icon: '/assets/icons/icon-192.png' });
      }
      document.getElementById('status').textContent = 'Notifications enabled';
    } else {
      document.getElementById('status').textContent = 'Notifications not granted';
    }
  } catch (e) { console.error(e); }
}

// Push subscription (optional)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function createPushSubscription() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const vapidPublicKey = document.getElementById('vapidPublicKey').value.trim();
    if (!vapidPublicKey) {
      document.getElementById('status').textContent = 'Enter a VAPID public key to create a push subscription.';
      return;
    }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
    const json = JSON.stringify(sub, null, 2);
    document.getElementById('subscriptionOutput').textContent = json;
    document.getElementById('status').textContent = 'Push subscription created. Copy it to your backend.';
  } catch (e) {
    console.error(e);
    document.getElementById('status').textContent = 'Push subscription failed: ' + e.message;
  }
}

async function copySubscription() {
  const text = document.getElementById('subscriptionOutput').textContent;
  if (!text) return;
  await navigator.clipboard.writeText(text);
  document.getElementById('status').textContent = 'Subscription copied to clipboard';
}

// Geolocation helper
function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ error: 'Geolocation unavailable' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        resolve({ latitude, longitude, accuracy });
      },
      (err) => resolve({ error: err.message }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// CSV export
function toCSV(rows) {
  const headers = ['id','timestamp','date','time','latitude','longitude','accuracy','note'];
  const csvRows = [headers.join(',')];
  for (const r of rows) {
    const { date, time } = toLocalDateParts(r.timestamp);
    csvRows.push([
      r.id,
      new Date(r.timestamp).toISOString(),
      '"' + date + '"',
      '"' + time + '"',
      r.location?.latitude ?? '',
      r.location?.longitude ?? '',
      r.location?.accuracy ?? '',
      '"' + (r.note || '').replace(/"/g, '""') + '"'
    ].join(','));
  }
  return csvRows.join('\n');
}

// Reports
function startOfWeek(d) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // convert Sun(0) to 6; ISO Monday=0
  date.setHours(0,0,0,0);
  date.setDate(date.getDate() - day);
  return date;
}
function endOfWeek(d) { const s = startOfWeek(d); const e = new Date(s); e.setDate(e.getDate()+7); return e; }
function startOfMonth(d) { const date = new Date(d); date.setDate(1); date.setHours(0,0,0,0); return date; }
function endOfMonth(d) { const s = startOfMonth(d); const e = new Date(s); e.setMonth(e.getMonth()+1); return e; }

function summarize(rangeStart, rangeEnd, logs) {
  const inRange = logs.filter(l => l.timestamp >= rangeStart.getTime() && l.timestamp < rangeEnd.getTime());
  const byDay = {};
  for (const l of inRange) {
    const parts = toLocalDateParts(l.timestamp);
    byDay[parts.date] = (byDay[parts.date] || 0) + 1;
  }
  const list = Object.entries(byDay).sort((a,b) => new Date(a[0]) - new Date(b[0]));
  return { count: inRange.length, byDay: list, first: inRange[0], last: inRange[inRange.length-1] };
}

function renderSummary(el, summary, titleFmt) {
  el.innerHTML = '';
  const countEl = document.createElement('p');
  countEl.innerHTML = `<span class="badge">Total: ${summary.count}</span>`;
  el.appendChild(countEl);
  const ul = document.createElement('ul');
  for (const [date, count] of summary.byDay) {
    const li = document.createElement('li');
    li.textContent = `${date}: ${count}`;
    ul.appendChild(li);
  }
  el.appendChild(ul);
}

// UI rendering
async function refreshUI() {
  const logs = await getAllLogs();
  logs.sort((a,b)=>a.timestamp-b.timestamp);
  const tbody = document.querySelector('#logTable tbody');
  tbody.innerHTML = '';
  for (const l of logs) {
    const tr = document.createElement('tr');
    const parts = toLocalDateParts(l.timestamp);
    const locText = l.location?.latitude ? `${l.location.latitude.toFixed(5)}, ${l.location.longitude.toFixed(5)} (±${Math.round(l.location.accuracy)}m)` : (l.location?.error || '—');
    tr.innerHTML = `<td>${parts.date}</td><td>${parts.time}</td><td>${locText}</td><td>${(l.note||'').replace(/</g,'&lt;')}</td>`;
    tbody.appendChild(tr);
  }
  // Reports
  const now = new Date();
  const wSum = summarize(startOfWeek(now), endOfWeek(now), logs);
  const mSum = summarize(startOfMonth(now), endOfMonth(now), logs);
  renderSummary(document.getElementById('weekSummary'), wSum);
  renderSummary(document.getElementById('monthSummary'), mSum);
}

async function init() {
  await openDb();
  await registerSW();
  refreshUI();
}

// Event handlers

document.getElementById('notifyBtn').addEventListener('click', enableNotifications);

document.getElementById('logBtn').addEventListener('click', async () => {
  document.getElementById('status').textContent = 'Logging…';
  const note = prompt('What happened?');
  const location = await getLocation();
  const timestamp = Date.now();
  const entry = { timestamp, note, location };
  const id = await addLog(entry);
  document.getElementById('status').textContent = `Saved entry #${id}`;
  refreshUI();
  // Local notification on log
  if (Notification.permission === 'granted') {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) reg.showNotification('Incident logged', { body: note || 'No description', icon: '/assets/icons/icon-192.png' });
  }
});

// Tabs
const tabs = document.querySelectorAll('.tabs button');
for (const t of tabs) {
  t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const sel = t.dataset.tab;
    document.getElementById('tab-timeline').hidden = sel !== 'timeline';
    document.getElementById('tab-reports').hidden = sel !== 'reports';
    document.getElementById('tab-settings').hidden = sel !== 'settings';
  });
}

// Export CSV

document.getElementById('exportBtn').addEventListener('click', async () => {
  const logs = await getAllLogs();
  const csv = toCSV(logs);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'incident-logs.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// Push settings

document.getElementById('subscribeBtn').addEventListener('click', createPushSubscription);

document.getElementById('copySubscriptionBtn').addEventListener('click', copySubscription);

init();
