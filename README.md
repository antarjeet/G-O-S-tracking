# 🚀 AI-GOS - Single Page Frontend

This is the frontend for **AI-GOS (Next Generation AI Operating System)**. It's a
single static `index.html` (React + Babel + Chart.js + Socket.io, all via CDN — no
build step), and it is now the real UI wired to the Node/Express backend in
`../backend`. It replaces `ai-gos-hud` as the app's frontend.

## ▶️ How to Run

This page needs the backend to actually do anything (login, live gesture
telemetry, engine start/stop, phone camera pairing), so don't open the file
directly — the backend serves it for you on the same origin:

```
cd ../backend
npm install   # first time only
npm start
```

Then visit **https://localhost:5000** in your browser (accept the one-time
self-signed certificate warning — see `../backend/server.js` for why). Log in
or sign up, then use Start Engine / Connect Phone Camera as normal.

## ✨ Included Features
- 🏠 **01 Landing Page**: Hero section with an interactive 21-point hand skeleton
  canvas (real landmarks + live camera frame once the engine is running,
  animated demo otherwise) and feature highlights.
- 📊 **02 Dashboard (Live Control Center)**: Live camera feed, real AI decision
  engine confidence/gesture/latency, live engine status grid, and system
  performance gauges (real CPU/GPU once the engine is live).
- 📈 **03 Gesture Analytics**: Chart.js time-series and distribution charts
  (static demo data — no analytics history endpoint yet).
- 🎙️ **04 Voice AI**: Voice-dictation status and Claude-powered Jarvis assistant
  once the engine is running, plus real engine command buttons (H/G/M/P/T/V/C).
- 📱 **05 Phone Camera & Settings**: Real phone pairing via QR code (the phone
  streams JPEG frames to the backend over HTTPS, not a WebRTC peer
  connection), live
  connection status, and camera source display.
- 🔐 **Auth**: Log in / sign up against the backend's session-cookie auth, plus a
  lightweight admin user-management panel for admin accounts.

## 📁 Project Structure
```
gos/
├── index.html       # this frontend
└── backend/         # Node/Express + Socket.io backend (see backend/README or server.js)
```

## 🔗 Related repositories

The Python hand-gesture AI engine (`ultimate_gesture_control.py`) that this
backend spawns lives in a separate repo:
[G-O-S-tracking-engine](https://github.com/antarjeet/G-O-S-tracking-engine).