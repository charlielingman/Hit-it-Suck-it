
# Incident Logger (PWA)

A lightweight, installable web app that lets you log incidents with one click. It captures date, time, and geolocation; asks "what happened"; stores entries offline; and generates weekly and monthly summaries. Optional push notifications backend included.

## Features
- ✅ One-click logging with prompt for details
- 📍 Geolocation (lat, lon, accuracy)
- 🗄️ Offline-ready PWA with service worker caching
- 🔔 Local notifications; optional Web Push (requires backend & VAPID keys)
- 📊 Weekly & monthly report summaries
- 📤 Export to CSV
- 📱 Installable (Add to Home screen)

## Running locally
1. Open `index.html` in a local server (VS Code Live Server or `npx serve`).
2. Click **Enable Notifications** and **Log an incident** to try it.
3. Use **Export CSV** to download your data.

> Note: Geolocation & notifications require HTTPS or `http://localhost`.

## Publishing to GitHub Pages
1. Create a new GitHub repo, e.g., `incident-logger-pwa`.
2. Push the files in this folder to the repo root.
3. In GitHub → Settings → Pages → **Deploy from branch** (select `main`, folder `/root`).
4. After the site is live, your app will be available at `https://<username>.github.io/incident-logger-pwa/`.

## Optional: Real Push Notifications
Web Push (notifications when the app is closed) needs a backend service.

### Generate VAPID keys
```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
```
Take the `publicKey` and `privateKey`.

### Start the backend locally
```bash
cd backend
npm install
export VAPID_PUBLIC_KEY=YOUR_PUBLIC_KEY
export VAPID_PRIVATE_KEY=YOUR_PRIVATE_KEY
npm start
```
This exposes endpoints:
- `POST /subscribe` (save subscriptions)
- `POST /send` with JSON `{ title, body, url }` to push to all subscribers

### Wire the frontend
1. Paste your **public** VAPID key into Settings → "VAPID Public Key".
2. Click **Create/Refresh Push Subscription**, then **Copy Subscription JSON**.
3. POST the subscription to your backend:
```bash
curl -X POST http://localhost:8080/subscribe   -H 'Content-Type: application/json'   -d @subscription.json
```
4. Send a test push:
```bash
curl -X POST http://localhost:8080/send   -H 'Content-Type: application/json'   -d '{"title":"Weekly Report Ready","body":"Open the app to view.","url":"https://<username>.github.io/incident-logger-pwa/"}'
```

> For production, deploy `backend/` to a host (Azure App Service, Render, Fly.io, etc.). Update the URL in `/send` payload.

## Data model
```json
{
  "id": 1,
  "timestamp": 1735707600000,
  "note": "Projector failure fixed",
  "location": { "latitude": -36.85, "longitude": 174.76, "accuracy": 12 }
}
```

Data is stored in IndexedDB (`incident-logger-db`, store `logs`).
