// HTTPS certificate setup, shared by server.js (auto-bootstrap on startup)
// and scripts/generate-trusted-cert.js (manual re-run, e.g. after a LAN IP
// change). Certs are cached under certs/ and gitignored — every clone of
// this repo generates its own, so nobody's private key or machine-specific
// cert (baked with a particular LAN IP) ever ends up in git.
//
// Preferred path: if mkcert (https://github.com/FiloSottile/mkcert) is on
// PATH, it installs a local Certificate Authority into this machine's own
// OS/browser trust store and issues a cert signed by it — trusted with zero
// browser warnings, and specific to whoever's machine it runs on.
//
// Fallback: if mkcert isn't installed, an untrusted self-signed cert is
// generated instead so the server still starts. Browsers will show a "not
// trusted" warning until mkcert is installed and the server is restarted
// (or `npm run setup:https` is run).

const { execFileSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const selfsigned = require('selfsigned');

const CERT_DIR = path.join(__dirname, 'certs');
const CERT_PATH = path.join(CERT_DIR, 'cert.pem');
const KEY_PATH = path.join(CERT_DIR, 'key.pem');

const MKCERT_INSTALL_HELP = [
  'Install mkcert for a trusted certificate with no browser warnings:',
  '  Windows (winget): winget install -e --id FiloSottile.mkcert',
  '  Windows (choco):  choco install mkcert',
  '  macOS (brew):     brew install mkcert',
  '  Linux:            https://github.com/FiloSottile/mkcert#installation',
  'Then restart the server (or run `npm run setup:https`) to switch to it.',
];

function getLanIps() {
  const ips = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

function mkcertAvailable() {
  try {
    execFileSync('mkcert', ['-version'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function generateWithMkcert() {
  fs.mkdirSync(CERT_DIR, { recursive: true });
  // Installs (or reuses) this machine's own local CA in its own trust
  // store — never shared across machines, so this is safe to run on
  // anyone's clone of the repo. A 15s timeout keeps a headless/non-
  // interactive elevation prompt (e.g. sudo on Linux) from hanging startup
  // forever; getOrCreateCertificate() falls back to self-signed on failure.
  execFileSync('mkcert', ['-install'], { stdio: 'ignore', timeout: 15000 });
  const names = ['localhost', '127.0.0.1', '::1', 'ai-gos.local', ...getLanIps()];
  execFileSync(
    'mkcert',
    ['-cert-file', CERT_PATH, '-key-file', KEY_PATH, ...names],
    { stdio: 'ignore', cwd: CERT_DIR, timeout: 15000 }
  );
  return { cert: fs.readFileSync(CERT_PATH), key: fs.readFileSync(KEY_PATH) };
}

async function generateSelfSigned() {
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'ai-gos.local' }], {
    days: 3650,
    keySize: 2048,
    extensions: [{ name: 'basicConstraints', cA: true }]
  });
  fs.mkdirSync(CERT_DIR, { recursive: true });
  fs.writeFileSync(CERT_PATH, pems.cert);
  fs.writeFileSync(KEY_PATH, pems.private);
  return { cert: pems.cert, key: pems.private };
}

async function getOrCreateCertificate({ forceRegenerate = false } = {}) {
  if (!forceRegenerate && fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH)) {
    return { cert: fs.readFileSync(CERT_PATH), key: fs.readFileSync(KEY_PATH) };
  }

  if (mkcertAvailable()) {
    console.log('Setting up a trusted local HTTPS certificate via mkcert...');
    try {
      const result = generateWithMkcert();
      console.log('Trusted certificate ready — no browser warning expected.');
      return result;
    } catch (err) {
      console.warn(`mkcert failed (${err.message}); falling back to a self-signed certificate.`);
    }
  } else {
    console.log('mkcert not found — using an untrusted self-signed certificate for now.');
    for (const line of MKCERT_INSTALL_HELP) console.log('  ' + line);
  }
  return generateSelfSigned();
}

module.exports = { getOrCreateCertificate, getLanIps, mkcertAvailable, CERT_DIR, CERT_PATH, KEY_PATH };
