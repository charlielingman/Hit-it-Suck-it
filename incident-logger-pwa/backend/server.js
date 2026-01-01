// Minimal Push Server using web-push
// Usage:
// 1) npm init -y && npm install express web-push body-parser cors
// 2) node server.js
// 3) POST /subscribe to save subscriptions (in-memory here)
// 4) POST /send { title, body } to send to all saved subs

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const webpush = require('web-push');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Generate VAPID keys once: webpush.generateVAPIDKeys()
// Then set them here or via environment variables
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'REPLACE_WITH_PUBLIC_KEY';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'REPLACE_WITH_PRIVATE_KEY';
webpush.setVapidDetails('mailto:you@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const subs = new Set();

app.post('/subscribe', (req, res) => {
  const sub = req.body;
  subs.add(JSON.stringify(sub));
  res.json({ ok: true });
});

app.post('/send', async (req, res) => {
  const payload = { title: req.body.title || 'Incident Logger', body: req.body.body || 'Update', data: { url: req.body.url || 'https://YOUR_GITHUB_PAGES_URL/index.html' } };
  const all = Array.from(subs).map(s => JSON.parse(s));
  const results = [];
  for (const s of all) {
    try { await webpush.sendNotification(s, JSON.stringify(payload)); results.push({ ok: true }); }
    catch (e) { results.push({ ok: false, error: e.message }); }
  }
  res.json({ sent: results.length, results });
});

app.listen(8080, () => console.log('Push server listening on http://localhost:8080'));
