require('dotenv').config();

const express = require('express');
const https = require('https');
const os = require('os');
const crypto = require('crypto');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { router: authRouter, requireAuth, getUserFromToken, parseCookieHeader, COOKIE_NAME, ensureAdminFromEnv } = require('./auth');
const db = require('./db');
// Phone camera capture (getUserMedia) requires a "secure context", and the
// phone reaches this server over the LAN by IP (not localhost), so this
// server must speak HTTPS. getOrCreateCertificate() auto-provisions a
// trusted cert via mkcert when available (see certSetup.js) — every clone
// of this repo generates and trusts its own on first run, with nothing
// machine-specific ever committed to git (certs/ is gitignored).
const { getOrCreateCertificate, getRootCaPath } = require('./certSetup');

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

async function main() {
  await ensureAdminFromEnv();

  const app = express();
  const { cert, key, trusted: certTrusted } = await getOrCreateCertificate();
  // Not passed as the requestListener here — Socket.io's own 'request'
  // listener below must be attached to `server` BEFORE Express's is, so it
  // always gets first look at every request. Otherwise both listeners fire
  // for every request (Node calls all 'request' listeners, in registration
  // order) and it becomes a race: Express's static-file fallback is
  // fs.stat-based (a tick of I/O) vs Socket.io's synchronous path check, so
  // locally Socket.io's response reliably lands first — but proxied through
  // something like a Cloudflare Tunnel, the added latency was enough to flip
  // that race, and Express's 404 won instead, breaking every /socket.io/*
  // request with no error on the tunnel's side to point to.
  const server = https.createServer({ cert, key });
  const rootCaPath = certTrusted ? getRootCaPath() : null;
  // Session cookies need credentials on cross-origin requests (frontend on
  // Vite's port, backend on 5000), which browsers refuse to send unless the
  // server echoes back the exact request origin (not '*') with
  // Access-Control-Allow-Credentials: true. Reflecting whatever origin asks
  // is appropriate here — this is a personal local-network tool, not a
  // public API with untrusted origins to defend against.
  const corsOptions = { origin: (origin, cb) => cb(null, origin || true), credentials: true };

  const io = new Server(server, {
    cors: corsOptions,
    // The telemetry payload is a mostly-incompressible base64 JPEG; spending
    // CPU trying to deflate it every frame only adds latency for no benefit.
    perMessageDeflate: false
  });
  // Registered after `io`, so Socket.io's listener (attached above) always
  // runs first and only Express sees requests it didn't claim.
  server.on('request', app);

  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(cookieParser());
  // The gos/ single-page frontend is served from the same origin as this
  // API (replacing the old ai-gos-hud Vite dev server on a separate port),
  // so its fetch()/Socket.io calls hit relative URLs with no CORS or
  // cross-origin cookie concerns.
  app.use(express.static(path.join(__dirname, '..')));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/api/auth', authRouter);

  const PORT = process.env.PORT || 5000;

  // User's Exact VirtualEnv Python Executable & Script Path
  const venvPythonPath = path.join(__dirname, '..', '..', 'AI-VIRTUAL-MOUSE', '.venv', 'Scripts', 'python.exe');
  const ultimateScriptPath = path.join(__dirname, '..', '..', 'AI-VIRTUAL-MOUSE', 'ultimate_gesture_control.py');
  const fallbackBridgePath = path.join(__dirname, '..', '..', 'AI-VIRTUAL-MOUSE', 'ai_engine_bridge.py');

  let pythonProcess = null;
  let engineRunning = false;
  let currentCameraSource = '';
  let latestTelemetry = {
    status: 'Idle',
    source: 'Pending',
    fps: 0,
    latency: 0,
    confidence: 0,
    gesture: 'IDLE',
    landmarks: [],
    pointer: { x: 1039, y: 291 },
    frame: null,
    engineActive: false
  };

  // --- Phone camera session (one active phone at a time, matching the
  // single-engine-instance design of the rest of this app) ---
  let activePhoneSessionId = null;
  let latestPhoneFrame = null;
  let latestPhoneFrameTime = 0;
  let phoneConnected = false;
  const PHONE_FRAME_STALE_MS = 3000;

  setInterval(() => {
    const stale = !latestPhoneFrameTime || (Date.now() - latestPhoneFrameTime > PHONE_FRAME_STALE_MS);
    if (phoneConnected && stale) {
      phoneConnected = false;
      io.emit('phone-status', { connected: false });
    }
  }, 1000);

  function startPythonEngine(cameraSource, mouseSpeed) {
    if (pythonProcess) return;

    // Determine python executable (.venv if present, otherwise global python)
    const pythonCmd = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python';
    const scriptPath = fs.existsSync(ultimateScriptPath) ? ultimateScriptPath : fallbackBridgePath;

    currentCameraSource = (cameraSource || '').trim();
    // 0.5x-3x, matching MOUSE_SPEED_MIN/MAX in ultimate_gesture_control.py
    // (which re-clamps this independently — the source of truth for the
    // valid range lives there, not here).
    const parsedSpeed = Number(mouseSpeed);
    const startupMouseSpeed = Number.isFinite(parsedSpeed) ? parsedSpeed : 1.0;
    console.log(`[Express Backend] Spawning Python Engine Command: ${pythonCmd} ${scriptPath}` +
      (currentCameraSource ? ` (camera: ${currentCameraSource})` : ' (camera: local webcam)') +
      ` (mouse speed: ${startupMouseSpeed}x)`);
    engineRunning = true;

    try {
      pythonProcess = spawn(pythonCmd, ['-u', scriptPath], {
        cwd: path.join(__dirname, '..', '..', 'AI-VIRTUAL-MOUSE'),
        env: {
          ...process.env,
          // No OS window: stream the processed camera frame to the web HUD
          // instead, and accept K/H/G/etc. shortcuts as stdin commands.
          AI_GOS_HEADLESS: '1',
          // Optional phone camera ('phone' = poll this backend's latest phone
          // frame) or IP-camera URL / device index, instead of the PC webcam.
          AI_GOS_CAMERA_SOURCE: currentCameraSource,
          // So the 'phone' source knows where to poll for frames.
          AI_GOS_BACKEND_PORT: String(PORT),
          // Initial cursor-speed multiplier — the "Mouse Speed" slider in
          // the web HUD's Phone & Settings tab. Adjustable live afterward
          // via the SET_MOUSE_SPEED: engine command (see /api/engine/command).
          AI_GOS_MOUSE_SPEED: String(startupMouseSpeed)
        }
      });

      // JSON telemetry (now including a base64 JPEG frame) arrives as one
      // line per frame, but a single stdout 'data' chunk can split a line
      // mid-message. Buffer partial lines across chunks instead of dropping them.
      let stdoutBuffer = '';
      pythonProcess.stdout.on('data', (data) => {
        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop();
        lines.forEach((line) => {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line.trim());
              latestTelemetry = { ...parsed, engineActive: true };
              io.emit('ai-frame', latestTelemetry);
            } catch (err) {
              // Ignore non-JSON lines (e.g. stray prints)
            }
          }
        });
      });

      pythonProcess.stderr.on('data', (data) => {
        console.error(`[Python stderr]: ${data.toString()}`);
      });

      pythonProcess.on('close', (code) => {
        console.log(`[Python Engine Process] Exited with code ${code}.`);
        pythonProcess = null;
        engineRunning = false;
        latestTelemetry.engineActive = false;
        io.emit('ai-frame', { ...latestTelemetry, engineActive: false });
        io.emit('engine-status', { active: false });
      });

      // Without this handler, a spawn failure (e.g. bad path, missing
      // interpreter) emits an unhandled 'error' event that crashes the
      // entire Express process instead of just failing to start the engine.
      pythonProcess.on('error', (err) => {
        console.error('Failed to spawn Python process:', err);
        pythonProcess = null;
        engineRunning = false;
        latestTelemetry.engineActive = false;
        io.emit('ai-frame', { ...latestTelemetry, engineActive: false });
        io.emit('engine-status', { active: false });
      });
    } catch (err) {
      console.error('Failed to spawn Python process:', err);
    }
  }

  function stopPythonEngine() {
    if (pythonProcess) {
      console.log(`[Express Backend] Terminating Python AI Engine process...`);
      pythonProcess.kill('SIGTERM');
      pythonProcess = null;
      engineRunning = false;
      latestTelemetry.engineActive = false;
      io.emit('ai-frame', { ...latestTelemetry, engineActive: false });
      io.emit('engine-status', { active: false });
    }
  }

  // Forward a web-HUD button press to the running engine's stdin, where
  // _stdin_command_reader() in ultimate_gesture_control.py picks it up.
  function sendEngineCommand(command) {
    if (pythonProcess && pythonProcess.stdin.writable) {
      pythonProcess.stdin.write(`${command}\n`);
      return true;
    }
    return false;
  }

  // Engine starts only when requested from the frontend's "Start Engine" button
  // (via /api/engine/toggle or the 'toggle-engine' socket event), not on boot.

  // REST API Endpoints — everything below requires a logged-in session.
  app.get('/api/status', requireAuth, (req, res) => {
    res.json({
      backend: 'Node.js Express + Socket.io Active',
      engineActive: engineRunning,
      telemetry: latestTelemetry,
      phoneConnected
    });
  });

  // Toggle HALT / START Engine Command
  app.post('/api/engine/toggle', requireAuth, (req, res) => {
    if (engineRunning) {
      stopPythonEngine();
      res.json({ success: true, engineActive: false, message: 'Python AI Engine HALTED' });
    } else {
      startPythonEngine(req.body && req.body.cameraSource, req.body && req.body.mouseSpeed);
      res.json({ success: true, engineActive: true, message: 'Python AI Engine STARTED' });
    }
  });

  // Relay a keyboard-shortcut-equivalent command (H/G/M/P/T/V/C) to the engine
  app.post('/api/engine/command', requireAuth, (req, res) => {
    const { command } = req.body || {};
    if (!command) {
      return res.status(400).json({ success: false, message: 'Missing command' });
    }
    const sent = sendEngineCommand(command);
    if (sent) {
      res.json({ success: true });
    } else {
      res.status(409).json({ success: false, message: 'Engine is not running' });
    }
  });

  app.post('/api/mode', requireAuth, (req, res) => {
    const { mode } = req.body;
    io.emit('mode-change', { mode });
    res.json({ success: true, mode });
  });

  // --- Phone camera session endpoints ---

  // Whether this server's HTTPS cert is a trusted mkcert-issued one (in
  // which case installing the CA below removes the phone's warning
  // entirely) or an untrusted selfsigned fallback (in which case there's no
  // CA worth installing — "Advanced -> Proceed" on the leaf cert is the
  // only option). Unauthenticated like /phone-cam/:sessionId itself: the
  // phone reaches this before it has any session of its own, and none of
  // this is sensitive — it's metadata about a public certificate.
  app.get('/api/cert-info', (req, res) => {
    res.json({ trusted: !!certTrusted, caDownloadAvailable: !!rootCaPath });
  });

  // Serves mkcert's public root CA certificate so a phone can install it as
  // a trusted authority — the private key backing it never leaves this
  // machine's mkcert install, so handing out this file grants no more than
  // "trust HTTPS certs this dev machine issues for itself", the same trust
  // this PC's own browser already extends via `mkcert -install`.
  app.get('/root-ca.pem', (req, res) => {
    if (!rootCaPath) {
      return res.status(404).send('No trusted CA available on this server (it is using a self-signed certificate).');
    }
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', 'attachment; filename="ai-gos-ca.pem"');
    res.sendFile(rootCaPath);
  });

  // Start a new phone-pairing session: generates a fresh session id, a QR
  // code, and invalidates any previously active phone session.
  app.get('/api/phone-session/new', requireAuth, async (req, res) => {
    activePhoneSessionId = crypto.randomUUID();
    latestPhoneFrame = null;
    latestPhoneFrameTime = 0;
    phoneConnected = false;
    const url = `https://${getLanIp()}:${PORT}/phone-cam/${activePhoneSessionId}`;
    try {
      const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 320 });
      res.json({ sessionId: activePhoneSessionId, url, qr: qrDataUrl, certTrusted: !!certTrusted, caDownloadAvailable: !!rootCaPath });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Failed to generate QR code' });
    }
  });

  app.get('/api/phone-session/status', requireAuth, (req, res) => {
    res.json({ connected: phoneConnected, sessionId: activePhoneSessionId });
  });

  // Polled by the phone's own capture page to draw the hand-tracking points
  // it sent frames for back onto its own preview — the engine (MediaPipe)
  // only runs on the PC, so the phone has no landmarks of its own. No
  // requireAuth, matching /phone-cam/:sessionId's own unauthenticated
  // design (the phone never logs in); gated on the engine actually
  // consuming the phone as its camera source instead, so a phone doesn't
  // render stale or unrelated points from a PC-webcam session. Landmark
  // coordinates aren't sensitive, so a plain poll (like /api/phone-frame/
  // latest already does) is simpler here than standing up a second,
  // separately-authenticated Socket.io namespace just for this.
  app.get('/api/phone-session/landmarks', (req, res) => {
    const isPhoneSource = engineRunning && currentCameraSource === 'phone';
    res.json({
      active: isPhoneSource,
      landmarks: isPhoneSource ? (latestTelemetry.landmarks || []) : [],
      gesture: isPhoneSource ? (latestTelemetry.gesture || 'IDLE') : null,
      confidence: isPhoneSource ? (latestTelemetry.confidence || 0) : 0,
    });
  });

  // Explicit user-initiated disconnect (as opposed to the staleness timeout
  // above, which only notices a phone that went quiet on its own). Ends the
  // session immediately: the phone's next frame POST gets a 410 and its
  // capture page stops trying, and every connected browser is told right
  // away instead of waiting up to PHONE_FRAME_STALE_MS.
  app.post('/api/phone-session/disconnect', requireAuth, (req, res) => {
    activePhoneSessionId = null;
    latestPhoneFrame = null;
    latestPhoneFrameTime = 0;
    if (phoneConnected) {
      phoneConnected = false;
      io.emit('phone-status', { connected: false });
    }
    res.json({ success: true });
  });

  // Serve the phone's own capture page for any session id (validity is
  // checked when it actually starts posting frames, not on page load).
  app.get('/phone-cam/:sessionId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'phone-cam.html'));
  });

  // The phone posts one JPEG frame at a time here.
  app.post('/api/phone-frame/:sessionId', express.raw({ type: '*/*', limit: '3mb' }), (req, res) => {
    if (req.params.sessionId !== activePhoneSessionId) {
      return res.status(410).json({ success: false, message: 'Session ended' });
    }
    latestPhoneFrame = req.body;
    latestPhoneFrameTime = Date.now();
    if (!phoneConnected) {
      phoneConnected = true;
      io.emit('phone-status', { connected: true });
    }
    res.json({ success: true });
  });

  // Polled locally by ultimate_gesture_control.py when AI_GOS_CAMERA_SOURCE=phone.
  // The phone only pushes a new frame a few times a second (see phone-cam.html's
  // capture interval), but Python can poll far faster than that. Without the
  // ?since= check below, every poll between real phone frames would still
  // return the same bytes, making the pipeline re-process (and count as "new")
  // an unchanged image — inflating the reported FPS with meaningless repeats
  // and making MediaPipe redo work on a frame it already saw. Only return the
  // frame (with its timestamp) when it's actually newer than what the caller
  // has already processed.
  //
  // This is an internal endpoint (only the locally-spawned Python process
  // calls it) with no user in the loop to authenticate, so it's restricted
  // to loopback instead of requireAuth — otherwise anyone on the LAN could
  // fetch it directly and see the last frame the phone uploaded.
  app.get('/api/phone-frame/latest', (req, res) => {
    const remote = req.socket.remoteAddress || '';
    const isLoopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
    if (!isLoopback) {
      return res.status(403).end();
    }
    const stale = !latestPhoneFrameTime || (Date.now() - latestPhoneFrameTime > PHONE_FRAME_STALE_MS);
    if (!latestPhoneFrame || stale) {
      return res.status(204).end();
    }
    const since = Number(req.query.since) || 0;
    if (latestPhoneFrameTime <= since) {
      return res.status(204).end();
    }
    res.set('Content-Type', 'image/jpeg');
    res.set('X-Frame-Time', String(latestPhoneFrameTime));
    res.send(latestPhoneFrame);
  });

  // The socket handshake carries the browser's cookies just like a normal
  // HTTP request, but Socket.io doesn't parse them — do that manually and
  // reject the connection outright if there's no valid session, so the
  // realtime channel (telemetry, engine/phone control) is gated exactly
  // like the REST API.
  io.use(async (socket, next) => {
    try {
      const cookies = parseCookieHeader(socket.handshake.headers.cookie);
      const user = await getUserFromToken(cookies[COOKIE_NAME]);
      if (!user) {
        return next(new Error('Not authenticated'));
      }
      socket.user = user;
      next();
    } catch (err) {
      next(err);
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.io] React Frontend Connected: ${socket.id} (user: ${socket.user.username})`);
    socket.emit('ai-frame', { ...latestTelemetry, engineActive: engineRunning });
    socket.emit('phone-status', { connected: phoneConnected });

    socket.on('toggle-engine', (payload) => {
      if (engineRunning) stopPythonEngine();
      else startPythonEngine(payload && payload.cameraSource, payload && payload.mouseSpeed);
    });

    socket.on('engine-command', (command) => {
      if (typeof command === 'string') sendEngineCommand(command);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.io] React Frontend Disconnected: ${socket.id}`);
    });
  });

  server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Express AI-GOS Server active on https://localhost:${PORT}`);
    console.log(`   LAN address for phone pairing: https://${getLanIp()}:${PORT}`);
    if (certTrusted) {
      console.log(`   ✅ Trusted local certificate (mkcert) — no warning on this PC.`);
      console.log(`      Phones can install the same CA from the "Secure connection" panel on the pairing page.`);
    } else {
      console.log(`   ⚠️  Using a self-signed certificate — run "npm run setup:https" for a trusted one (needs mkcert).`);
    }
    console.log(`=======================================================`);
  });
}

main().catch((err) => {
  console.error('Failed to start AI-GOS backend:', err);
  process.exit(1);
});
