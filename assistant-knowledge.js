// Static Q&A about AI-GOS itself for the dashboard's built-in assistant (see
// getAssistantReply in index.html's App component). Kept as a plain global
// script (not a module, no build step) so it loads before the Babel-parsed
// inline script and PROJECT_KNOWLEDGE_BASE is simply available as a global.
//
// Each entry lists trigger phrases (`keywords`, any-of substring match).
// Kept specific/multi-word on purpose: a bare "keyboard" or "voice" here
// would shadow the actual TOGGLE_KEYBOARD/TOGGLE_VOICE action commands
// getAssistantReply checks afterward.
const PROJECT_KNOWLEDGE_BASE = [
  // --- What is this / architecture ---
  {
    keywords: ['what is ai-gos', 'what is this project', 'about this project', 'about ai-gos',
      'what does this project do', 'what does ai-gos do'],
    answer: "AI-GOS is a touchless, webcam-driven computer control system: move your hand in front of a camera to move the real OS cursor, click, scroll, control volume, switch windows, type on an on-screen keyboard, and dictate by voice — no mouse or keyboard touching required."
  },
  {
    keywords: ['architecture', 'how is this built', 'tech stack', 'how does this work', 'how it works'],
    answer: "It's three programs working together: a Python engine (OpenCV + MediaPipe) that reads the camera and drives the real OS mouse/keyboard/volume, a Node.js/Express + Socket.io backend that starts/stops that engine and relays its telemetry, and this single-file React dashboard you're looking at. The backend spawns the Python script as a child process and streams its output over Socket.io — this page never does the gesture recognition itself."
  },
  {
    keywords: ['why three separate programs', 'why three programs', 'why not one program'],
    answer: "Each piece stays in the language best suited to its job: computer vision and Windows desktop automation (pycaw, pyautogui) is Python's strength, a polished animated dashboard is far cheaper to build in React than as an OpenCV overlay, and something needs to own the Python process's lifecycle and bridge its stdout to WebSocket clients — a small Node server is a natural fit since the frontend already speaks Socket.io."
  },
  {
    keywords: ['what does the backend do', 'what does server.js do', 'what does the node backend do'],
    answer: "backend/server.js is an Express + Socket.io server: it starts/stops the Python engine as a child process, relays its per-frame telemetry to the browser over Socket.io, gates everything behind login, and handles phone-camera pairing (QR codes, receiving the phone's JPEG frames over HTTPS)."
  },
  {
    keywords: ['what does the python engine do', 'what does the engine do', 'what does ultimate_gesture_control.py do'],
    answer: "ultimate_gesture_control.py reads the camera, runs MediaPipe hand tracking, recognizes gestures, and drives the real OS mouse/keyboard/volume/windows via pyautogui and pycaw — it's the only part of AI-GOS that actually does gesture recognition."
  },
  {
    keywords: ['what does the frontend do', 'what does this dashboard do', 'what does index.html do'],
    answer: "gos/index.html is a single-file React dashboard (no build step, React/Babel/Chart.js/Socket.io all loaded from a CDN) — it starts/stops the engine, shows the live camera feed and telemetry, and sends gesture-equivalent commands, but does none of the actual hand tracking itself."
  },
  {
    keywords: ['what does ai_gos_features.py do', 'what is ai_gos_features'],
    answer: "ai_gos_features.py (the AdvancedGestureEngine class) adds second-hand gestures, contexts, accessibility profiles, custom gesture training, and the confidence/analytics numbers — all layered on top of the original first-hand mouse controls without changing them."
  },
  {
    keywords: ['what does handtrackingmodule do', 'what is handtrackingmodule'],
    answer: "HandTrackingModule.py wraps MediaPipe's hand-landmark detection into a reusable HandDetector class — find_hands, find_position, fingersUp, find_Distance for single-hand legacy scripts, plus find_all_positions for AI-GOS's multi-hand support."
  },
  {
    keywords: ['what does voice_typing.py do', 'what is voice_typing.py'],
    answer: "voice_typing.py runs speech recognition on its own background thread (so it never blocks the gesture loop) and dictates recognized phrases into the same keyboard text buffer that gesture typing uses, including spoken commands like \"clear\", \"space\", \"enter\", and \"delete\"."
  },
  {
    keywords: ['what does db.js do', 'what does auth.js do'],
    answer: "auth.js handles signup/login/logout and session cookies; db.js is the MongoDB-backed store behind it (users, sessions, and now the assistant's learned Q&A) — both live in backend/."
  },
  {
    keywords: ['how is telemetry sent', 'how does telemetry work', 'stdout json', 'how are commands sent to the engine'],
    answer: "One-way telemetry flows Python → backend → browser: the engine prints one JSON line per frame to stdout (landmarks, gesture, base64 JPEG, keyboard/voice state), which the backend re-emits over Socket.io. Commands flow the other way as newline-delimited text on the engine's stdin (K/H/G/M/P/T/V/C or the dashboard's named commands like TOGGLE_KEYBOARD)."
  },
  {
    keywords: ['why https', 'why self-signed cert', 'why self signed certificate', 'certificate warning'],
    answer: "The phone-camera feature needs getUserMedia, which browsers only allow in a \"secure context\" — HTTPS, even for a LAN IP. Since this is a local dev tool, the backend generates its own self-signed certificate rather than needing a real one; that's why your browser (and your phone) shows a one-time \"not trusted\" warning that's safe to click through for a server you're running yourself."
  },
  {
    keywords: ['why mongodb', 'why does this use mongodb'],
    answer: "An earlier version used a flat JSON-file store, but that got replaced with MongoDB once a real instance was available in this environment — it avoids needing a native build toolchain (better-sqlite3 needs one) and is the more standard choice for a real database."
  },
  {
    keywords: ['what node packages does the backend use', 'backend dependencies', 'npm start vs npm run dev'],
    answer: "express, socket.io, mongodb, bcryptjs, cookie-parser, cors, dotenv, qrcode, and selfsigned, run under nodemon (so editing server.js/db.js auto-restarts it) — npm start and npm run dev are identical, both just run nodemon server.js."
  },
  {
    keywords: ['what is headless mode', 'ai_gos_headless', 'headless mode'],
    answer: "When the backend spawns the engine, it sets AI_GOS_HEADLESS=1: no OpenCV window opens, the fully-drawn camera frame streams to the web dashboard instead, and the K/H/G/M/P/T/V/C keyboard shortcuts arrive as newline-delimited commands over stdin rather than needing a focused cv2 window."
  },
  {
    keywords: ['what resolution is the camera feed', 'stream quality', 'jpeg quality', 'stream resolution'],
    answer: "The camera works internally at 640×480, and the streamed frame the dashboard sees is also 640×480 JPEG at quality 85 — high enough to look sharp over a local Wi-Fi/loopback Socket.io connection without adding meaningful latency."
  },
  {
    keywords: ['why windows only', 'why windows required', 'does this work on mac', 'does this work on linux'],
    answer: "Windows is required specifically for the volume control, which uses pycaw (a Windows Core Audio API wrapper) — the rest (OpenCV, MediaPipe, pyautogui) is cross-platform, but volume gestures need Windows."
  },
  {
    keywords: ['what python libraries', 'what libraries does the engine use', 'python dependencies'],
    answer: "OpenCV and MediaPipe for camera capture and hand tracking, pyautogui and autopy for OS mouse/keyboard control, pycaw + comtypes for Windows volume control, and optionally SpeechRecognition + PyAudio for PC-mic voice typing."
  },

  // --- Primary-hand gestures ---
  {
    keywords: ['what gestures', 'list gestures', 'gestures supported', 'gesture list', 'what hand gestures'],
    answer: "Index finger alone moves the cursor, index+middle clicks, index+middle+ring right-clicks, index+middle+ring+pinky (thumb down) toggles the keyboard, an open palm switches to the next tab/window, a fist goes back, thumb+index controls volume, and index+pinky (\"rock on\") scrolls. Press H to swap which hand is primary when both are visible."
  },
  {
    keywords: ['how do i move the cursor', 'how do i move the mouse', 'move cursor gesture'],
    answer: "Point with just your index finger extended (all other fingers down) — the cursor follows it, smoothed over a few frames so it doesn't feel jittery."
  },
  {
    keywords: ['how do i left click', 'how do i click', 'left click gesture'],
    answer: "Extend index and middle fingers and bring their tips close together (under 40px apart) — that pinch-like closing triggers a left click."
  },
  {
    keywords: ['how do i right click', 'right click gesture'],
    answer: "Extend index, middle, and ring fingers together (pinky down). There's a 0.6s cooldown between right-clicks so holding the pose doesn't spam the context menu."
  },
  {
    keywords: ['how do i scroll', 'scroll gesture', 'how does scrolling work'],
    answer: "Extend index and pinky only (\"rock on\", thumb-independent so it's reliable regardless of thumb position) and move your hand up or down."
  },
  {
    keywords: ['how do i control volume', 'volume gesture', 'how does volume control work'],
    answer: "Extend thumb and index finger — the distance between their tips maps to system volume (pycaw), same distance range as the original hand-volume example (50–218px)."
  },
  {
    keywords: ['how do i switch tabs', 'how do i switch windows', 'next tab gesture', 'previous tab gesture'],
    answer: "An open hand (all 5 fingers) sends Alt+Tab (next window); a closed fist sends Alt+Shift+Tab (previous). Both are debounced half a second so a held pose doesn't repeat-fire."
  },
  {
    keywords: ['what does h do', 'swap hand', 'swap primary hand', 'the h key'],
    answer: "H swaps which visible hand is \"primary\" (runs the mouse/click/volume/keyboard gestures) — only meaningful when both hands are visible, since AI-GOS's second-hand gestures need the other hand free."
  },
  {
    keywords: ['pinch distance', 'click distance threshold', 'how close do fingers need to be'],
    answer: "The base pinch/click threshold is 38px between fingertips, scaled by your profile's sensitivity (1.0× on Default, 1.35× on Accessible — so Accessible tolerates a looser pinch)."
  },
  {
    keywords: ['mouse smoothening', 'why does the cursor lag', 'cursor smoothing'],
    answer: "Cursor movement is smoothed with a 1/3 low-pass filter per frame (smoothening=3) — each frame the cursor moves a third of the way to your fingertip's mapped position, trading a little lag for less jitter. It used to be smoothening=7 (slower-feeling) before being tuned down."
  },

  // --- AI-GOS keyboard ---
  {
    keywords: ['how does the keyboard work', 'how do i type', 'how does typing work', 'explain keyboard',
      'how does air typing work'],
    answer: "Open the on-screen keyboard (4-finger gesture or the K command), point at a key with your index finger, then pinch thumb-to-index to type it — or just hold your pointer over a key for a moment (\"dwell\" typing) if pinching is unreliable for you. Swipes do shortcuts (left/right = delete/space, up/down = enter/clear), and pinching a predicted word inserts it. Typed keys are also sent as real OS keystrokes to whatever field currently has focus, the same way the AI-controlled cursor's clicks do."
  },
  {
    keywords: ['dwell typing', 'what is dwell', 'dwell time', 'dwell seconds'],
    answer: "Dwell typing selects a key by hovering over it without pinching — 0.65 seconds by default, or 1.0 seconds on the Accessible profile. It's a fallback for when pinch detection is unreliable."
  },
  {
    keywords: ['predictive keyboard', 'word prediction', 'how does autocomplete work'],
    answer: "The keyboard predicts up to 3 words from what you've typed so far, weighted toward words you've used more often — pinch or dwell-select a prediction chip to insert the whole word plus a trailing space."
  },
  {
    keywords: ['adaptive key size', 'why are keys different sizes', 'adaptive keyboard sizing'],
    answer: "Keys you type more often get proportionally wider (bounded so neighboring keys stay tappable) — the same adaptive-sizing idea a phone keyboard uses, recalculated from your typing frequency each session."
  },
  {
    keywords: ['emoji mode', 'how do i type emoji', 'emoji keyboard'],
    answer: "A second keyboard layout with emoji plus YES/NO/OK/DEL/SPACE/ABC controls — ABC switches back to the regular letter layout."
  },
  {
    keywords: ['swipe shortcuts', 'keyboard swipe gestures', 'what do swipes do'],
    answer: "While the keyboard's open: swipe left = delete, swipe right = space, swipe up = enter, swipe down = clear all text. A swipe needs to cover about 115px within 0.45s to register, so it won't misfire from normal pointing."
  },
  {
    keywords: ['does typing go into other apps', 'does air typing work in other programs', 'real keystrokes'],
    answer: "Yes — typed keys, predicted words, and dictated voice text are all sent as real OS keystrokes (via pyautogui) to whatever window/field currently has focus, in addition to updating the dashboard's own display. So air-typing works in Notepad, a browser address bar, or anywhere else you've clicked with the AI-controlled cursor."
  },
  {
    keywords: ['keyboard layout', 'what keys are on the ai-gos keyboard'],
    answer: "Three QWERTY-ish rows (Q-P, A-L+DEL, Z-M+.,+SPACE), plus the separate emoji layout — DEL and SPACE get extra width since they're used constantly."
  },

  // --- Voice typing ---
  {
    keywords: ['how does voice', 'explain voice', 'voice typing work'],
    answer: "Two independent voice paths exist: this browser's own microphone (Web Speech API, click Start Listening — works from any device with the dashboard open), and the PC's own microphone via the Python engine (toggle with V or \"start listening\" here when the browser has no speech API). Both dictate into the same keyboard buffer and now also type as real keystrokes into whatever field has OS focus."
  },
  {
    keywords: ['voice commands', 'spoken commands', 'what can i say to voice typing'],
    answer: "Saying \"clear\"/\"clear text\"/\"clear all\" clears the buffer, \"space\" inserts a space, \"enter\"/\"new line\" inserts a newline, and \"delete\"/\"backspace\"/\"delete word\"/\"undo\" removes the last dictated word — anything else is typed literally."
  },
  {
    keywords: ['voice typing requirements', 'what do i need for voice typing', 'pyaudio speechrecognition'],
    answer: "The browser-mic path needs nothing extra (Chrome/Edge's built-in Web Speech API). The PC-mic path (used automatically in browsers without that API, like Firefox) needs the SpeechRecognition and PyAudio Python packages installed."
  },

  // --- Advanced second-hand gestures ---
  {
    keywords: ['drag and drop', 'how do i drag', 'drag gesture'],
    answer: "On the second hand, pinch thumb-to-index and hold it still for about 0.35s to start a drag; release the pinch to drop. Moving right after pinching scrolls instead — see \"pinch scroll\"."
  },
  {
    keywords: ['pinch scroll', 'pinch and move scroll', 'second hand scroll'],
    answer: "Pinch thumb-to-index on the second hand and immediately move vertically to scroll — this replaced an earlier, less reliable air-wheel gesture. Two fingers (index+middle) on the second hand also scroll, independently of the pinch."
  },
  {
    keywords: ['maximize window gesture', 'how do i maximize a window'],
    answer: "Four fingers up on the second hand (thumb down) sends Win+Up to maximize the active window."
  },
  {
    keywords: ['context shortcut gesture', 'open palm second hand'],
    answer: "An open palm on the second hand fires the current context's shortcut — see \"what are contexts\" for what each one does."
  },
  {
    keywords: ['rotation zoom', 'how do i zoom', 'three finger rotation'],
    answer: "With three fingers extended on the second hand, rotating your hand around the primary hand's index finger sends Ctrl+Plus/Minus to zoom in or out — useful in a browser or editor."
  },
  {
    keywords: ['why does ai-gos need a second hand', 'why two hands for advanced gestures'],
    answer: "Advanced gestures deliberately live on a second hand so they never conflict with the original first-hand mouse/click/volume/tab gestures — show only one hand and everything works exactly like the original, no-AI-GOS version."
  },

  // --- Contexts ---
  {
    keywords: ['what are contexts', 'what is context mode', 'general browser coding media'],
    answer: "Four contexts — General, Browser, Coding, Media — cycled with M, each changing what the second hand's open-palm gesture does: General shows the desktop (Win+D), Browser focuses the address bar (Ctrl+L), Coding opens the command palette (Ctrl+Shift+P), and Media plays/pauses (Space)."
  },
  {
    keywords: ['what does m do', 'the m key', 'cycle context'],
    answer: "M cycles through the four contexts (General → Browser → Coding → Media → back to General), changing what the open-palm context shortcut does."
  },

  // --- Profiles ---
  {
    keywords: ['what are profiles', 'default vs accessible profile', 'accessibility profile'],
    answer: "Two built-in profiles: Default (sensitivity 1.0×, 0.65s dwell) and Accessible (sensitivity 1.35×, 1.0s dwell — a looser pinch threshold and longer hover-to-select time). Press P to cycle between them; each also keeps its own set of trained custom gestures."
  },
  {
    keywords: ['what does p do', 'the p key', 'cycle profile'],
    answer: "P cycles between the Default and Accessible profiles, and any gesture you've trained is remembered per-profile."
  },
  {
    keywords: ['where are profiles saved', 'gesture_profiles.json'],
    answer: "Profiles (and any custom-trained gestures) are saved to gesture_profiles.json next to the engine script, so they persist across restarts."
  },

  // --- Custom gestures ---
  {
    keywords: ['how do i train a gesture', 'custom gesture training', 'what does t do', 'the t key'],
    answer: "Show the pose you want on your primary hand and press T — it's saved to the current profile as gesture_1, gesture_2, etc. (by which fingers are up), and gets recognized and labeled from then on."
  },

  // --- Confidence / recognition ---
  {
    keywords: ['what does confidence mean', 'is confidence a real ai score', 'confidence heuristic'],
    answer: "Confidence is a hand-visibility heuristic (how much of the camera frame your hand's bounding box occupies, scaled to 35–99%), not a trained model's probability — it's a proxy for \"is your hand clearly in frame\", not gesture-recognition certainty."
  },
  {
    keywords: ['what gestures does the recognizer detect', 'recognized gesture labels'],
    answer: "The analytics recognizer labels Single/Two/Three/Four/Five Fingers, Pinch, Grab, Air Scroll, Swipe, Air Hold, Air Tap, Circle, any of your Custom-trained poses, and Rotation (second hand) — this classification is separate from and doesn't interfere with the actual control gestures."
  },

  // --- Keys reference ---
  {
    keywords: ['what does g do', 'the g key', 'toggle ai-gos'],
    answer: "G toggles the AI-GOS advanced layer on or off — off, only the original first-hand mouse/click/volume/tab controls run, with none of the second-hand/context/profile features."
  },
  {
    keywords: ['what does c do', 'the c key', 'clear keyboard shortcut'],
    answer: "C clears the AI-GOS keyboard's typed text buffer — same as the swipe-down shortcut or saying \"clear\" to voice typing."
  },
  {
    keywords: ['what does k do', 'the k key', 'open keyboard shortcut key'],
    answer: "K opens or closes AI-GOS keyboard mode — the same as the four-finger (thumb down) gesture."
  },
  {
    keywords: ['what does esc do', 'exit the engine', 'how do i quit the engine'],
    answer: "Esc exits the engine when it's running with its own OpenCV window (standalone mode). In headless/web-dashboard mode there's no window to focus, so use the Stop Engine button instead."
  },
  {
    keywords: ['all the keyboard shortcuts', 'full list of keys', 'what keys can i press'],
    answer: "G: toggle AI-GOS layer, M: cycle context, P: cycle profile, T: train a gesture, V: toggle voice capture, H: swap primary hand, C: clear keyboard, K: toggle keyboard, Esc: exit (standalone mode only)."
  },

  // --- Phone camera ---
  {
    keywords: ['how does the phone camera', 'explain phone camera', 'what is the qr code', 'phone camera work'],
    answer: "Go to 05 Phone & Settings and click Connect Phone Camera to get a QR code. Scan it with your phone (same Wi-Fi network required) — your phone captures its own camera locally and repeatedly POSTs JPEG frames to the backend over HTTPS (not a live video stream), and once connected, Start Engine automatically prefers the phone's feed over your PC webcam."
  },
  {
    keywords: ['what if my phone disconnects', 'phone camera disconnect', 'phone camera stale'],
    answer: "If no new frame arrives from the phone for 3 seconds, it's marked disconnected and the engine falls back to the PC webcam automatically — you'll also see the phone-connected status update on every dashboard watching it."
  },
  {
    keywords: ['can i use an ip camera', 'droidcam', 'ivcam', 'alternate camera source'],
    answer: "Yes — set the AI_GOS_CAMERA_SOURCE environment variable to an IP-camera stream URL (e.g. the Android \"IP Webcam\" app) or a virtual-webcam device index (DroidCam/iVCam) instead of using the QR-pairing flow."
  },
  {
    keywords: ['how often does the phone send frames', 'phone camera frame rate', 'phone camera fps'],
    answer: "The phone's capture page grabs a frame and POSTs it about every 33ms (~30 fps) as a JPEG at 0.85 quality — that rate is deliberately tied to how smooth the resulting cursor movement feels."
  },
  {
    keywords: ['flip camera', 'switch front and back camera', 'front facing camera phone'],
    answer: "The phone capture page has a Flip Camera button that toggles between the back (\"environment\") and front (\"user\") camera via getUserMedia's facingMode."
  },

  // --- Account / auth ---
  {
    keywords: ['need an account', 'why log in', 'why do i need to log in', 'is my data safe', 'is my password safe'],
    answer: "Logging in keeps anyone else on your Wi-Fi from starting your engine or pairing a phone camera without your say-so. Accounts are stored in MongoDB on this PC only, passwords hashed with bcrypt — nothing is sent anywhere external."
  },
  {
    keywords: ['how long does login last', 'session length', 'session expire'],
    answer: "Sessions last 30 days from login before you'd need to log in again."
  },
  {
    keywords: ['what does admin do', 'admin panel', 'admin account'],
    answer: "There's no permission-tier system beyond admin — the only thing \"admin\" currently means is being able to see and manage the account list (promote/demote/delete users) in the Users panel. Any account, admin or not, can control the engine and phone camera."
  },
  {
    keywords: ['how do i become admin', 'how do i make myself admin', 'first admin account'],
    answer: "Set ADMIN_USERNAME, ADMIN_EMAIL, and ADMIN_PASSWORD together in backend/.env before starting the backend — on startup it creates that account as admin if it doesn't exist, or promotes it if you already signed up normally, without ever overwriting a password you've since changed."
  },
  {
    keywords: ['what is in .env', 'backend .env config', 'environment variables backend', 'mongo_url', 'mongo_db_name'],
    answer: "backend/.env configures MONGO_URL and MONGO_DB_NAME (defaults to a local MongoDB on the standard port), the optional ADMIN_USERNAME/ADMIN_EMAIL/ADMIN_PASSWORD seeding trio, and an optional PORT override (defaults to 5000). See backend/.env.example for the template."
  },
  {
    keywords: ['does mongodb need to be running', 'what if mongodb is down', 'mongodb required'],
    answer: "Yes — db.js connects to MongoDB on first use (lazily, not strictly at startup), but every auth/session/knowledge-base call awaits that connection, so if MongoDB isn't reachable, login, signup, and the assistant's teach-and-remember feature will all hang or fail until it is."
  },

  // --- Dashboard tabs ---
  {
    keywords: ['what are the tabs', 'what sections', 'what does the dashboard show'],
    answer: "01 Landing Page is the intro/hero, 02 Dashboard is the live control center with the camera feed and engine status, 03 Gesture Analytics has usage charts, 04 Virtual Keyboard & Voice AI shows live air-typed text and voice status, and 05 Phone & Settings handles phone-camera pairing and engine settings."
  },
  {
    keywords: ['what does the landing page show', 'landing page tab'],
    answer: "A hero section with an animated 21-point hand-tracking preview and feature highlight cards — mostly a demo/marketing view, since the actual controls live on the Dashboard tab."
  },
  {
    keywords: ['what does the dashboard tab show', 'dashboard tab', 'live control center'],
    answer: "The live camera feed with tracked landmarks, real engine status (gesture/confidence/latency), and CPU/GPU performance gauges — real numbers once the engine is running, simulated demo values otherwise."
  },
  {
    keywords: ['what does gesture analytics show', 'analytics tab', 'gesture analytics charts'],
    answer: "A time-series chart of gesture frequency and a distribution chart across gesture types — currently populated with static demo data rather than a real analytics-history endpoint."
  },
  {
    keywords: ['what does the keyboard tab show', 'virtual keyboard tab', 'voice ai tab'],
    answer: "Live air-typed text and voice status once the engine is running, a manual on-screen keyboard demo when it isn't, and the Voice AI Assistant panel with the Start/Stop Listening button."
  },
  {
    keywords: ['what does phone and settings tab show', 'settings tab', 'phone settings tab'],
    answer: "Phone-camera QR pairing and connection status, the active camera source, a mouse-speed slider, and engine settings."
  },
  {
    keywords: ['does the mouse speed slider work', 'does save engine settings do anything', 'mouse speed setting'],
    answer: "Not yet — the Mouse Speed slider and Save Engine Settings button on the Settings tab are currently decorative (Save just shows a confirmation alert); they aren't wired to the engine's actual cursor-smoothing value."
  },

  // --- Legacy / misc ---
  {
    keywords: ['what are the other python files', 'standalone scripts', 'legacy scripts',
      'ai_virtual_mouse.py', 'combined_gesture_control.py'],
    answer: "The all-in-one ultimate_gesture_control.py is the recommended entry point, but earlier standalone examples still work independently: AI_virtual_mouse.py (original mouse example), combined_gesture_control.py (original mouse+volume+tabs), HandTracking.py and hand_volume_control.py (hand-volume controllers), virtual_keyboard.py (standalone legacy keyboard), and HandTrackingMin.py (minimal landmark-tracking demo)."
  },
  {
    keywords: ['is this project open source', 'where is the code', 'related repositories'],
    answer: "It's split across two repos: the gesture engine (AI-VIRTUAL-MOUSE) and the web dashboard + backend (gos, which includes backend/) — they're designed to be cloned side by side, since the backend spawns the engine via a relative path."
  }
];
