// Vercel routes every /api/auth/* request to this one function, passing the
// full path through untouched (req.url is "/api/auth/login", not "/login"),
// so the router below must be mounted at "/api/auth" — not "/" — to match.
const express = require('express');
const cookieParser = require('cookie-parser');
const { router: authRouter, ensureAdminFromEnv } = require('../_lib/auth');

const app = express();
app.use(express.json());
app.use(cookieParser());

// Runs once per cold start, not per request — a warm Lambda instance reuses
// this module (and this flag) across invocations.
let adminSeeded = false;
app.use(async (req, res, next) => {
  if (!adminSeeded) {
    adminSeeded = true;
    try {
      await ensureAdminFromEnv();
    } catch (err) {
      console.error('[Auth] Admin seed failed:', err);
    }
  }
  next();
});

app.use('/api/auth', authRouter);

module.exports = app;
