const crypto = require('node:crypto');
const { HttpError } = require('./errors');

const COOKIE = 'rr_session';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;      // sliding: renewed while the screen is in use
const MAX_FAILS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Sessions live in the database so kitchen and admin screens stay logged in across a server restart.
function createAuth(db) {
  const fails = new Map(); // ip -> { count, first }

  function roleOf(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token) return null;
    const s = db.prepare('SELECT role, expires_at FROM sessions WHERE token=?').get(token);
    if (!s) return null;
    const now = Date.now();
    if (s.expires_at < now) { db.prepare('DELETE FROM sessions WHERE token=?').run(token); return null; }
    if (s.expires_at - now < TTL_MS / 2) db.prepare('UPDATE sessions SET expires_at=? WHERE token=?').run(now + TTL_MS, token);
    return s.role;
  }

  function login(res, role) {
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    db.prepare('INSERT INTO sessions(token, role, expires_at) VALUES (?, ?, ?)').run(token, role, Date.now() + TTL_MS);
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TTL_MS / 1000}`);
  }

  function logout(req, res) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  }

  // Admin may do everything the kitchen can.
  function allowed(role, wanted) {
    return role === 'admin' || wanted.includes(role);
  }

  function requireRole(...wanted) {
    return (req, res, next) => {
      if (allowed(roleOf(req), wanted)) return next();
      res.status(401).json({ error: 'Login required' });
    };
  }

  // Limits PIN/password guessing from one device: 5 wrong tries, then 15 minutes locked.
  function checkLocked(req) {
    const f = fails.get(req.ip);
    if (f && Date.now() - f.first > LOCK_WINDOW_MS) fails.delete(req.ip);
    else if (f && f.count >= MAX_FAILS) throw new HttpError(429, 'Too many wrong attempts. Please wait 15 minutes and try again.');
  }

  function recordFail(req) {
    const f = fails.get(req.ip) || { count: 0, first: Date.now() };
    f.count += 1;
    fails.set(req.ip, f);
  }

  function clearFails(req) { fails.delete(req.ip); }

  return { roleOf, login, logout, requireRole, allowed, checkLocked, recordFail, clearFails };
}

const failDelay = () => new Promise(r => setTimeout(r, 500));

module.exports = { createAuth, failDelay };
