const crypto = require('node:crypto');

const COOKIE = 'rr_session';
const TTL_MS = 12 * 60 * 60 * 1000;

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function createAuth() {
  const sessions = new Map();

  function roleOf(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const s = token && sessions.get(token);
    if (!s) return null;
    if (s.expires < Date.now()) { sessions.delete(token); return null; }
    return s.role;
  }

  function login(res, role) {
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { role, expires: Date.now() + TTL_MS });
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TTL_MS / 1000}`);
  }

  function logout(req, res) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) sessions.delete(token);
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

  return { roleOf, login, logout, requireRole, allowed };
}

const failDelay = () => new Promise(r => setTimeout(r, 500));

module.exports = { createAuth, failDelay };
