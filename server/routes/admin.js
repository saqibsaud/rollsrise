const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const M = require('../menu');
const O = require('../orders');
const { computeBill } = require('../bill');
const { HttpError } = require('../errors');
const { randomCode } = require('../seed/seed');
const { getSettings, setSettings, hashSecret, verifySecret } = require('../settings');
const { failDelay } = require('../auth');

const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const SECRET_KEYS = ['kitchen_pin_hash', 'admin_password_hash', 'ai_api_key'];
const TEXT_KEYS = ['restaurant_name', 'tagline', 'address', 'phone', 'bill_footer', 'gstin', 'upi_id', 'ai_model'];

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
}

// QR codes must hold an address phones can reach. If the admin page was opened as
// "localhost" on the laptop itself, swap in the laptop's network address.
function publicOrigin(protocol, host, lanIps = lanAddresses()) {
  const [name, port] = String(host).split(':');
  const local = ['localhost', '127.0.0.1', '[', '::1'].includes(name);
  if (!local || !lanIps.length) return `${protocol}://${host}`;
  return `${protocol}://${lanIps[0]}${port ? `:${port}` : ''}`;
}

function localMidnightIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function adminRoutes({ db, events, auth, dataDir }) {
  const r = express.Router();
  const menuChanged = () => { events.emit('menu'); events.emit('admin'); };
  const tableChanged = (code) => { events.emit('admin'); events.emit('kitchen'); if (code) events.emit(`table:${code}`); };
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(PHOTO_TYPES[file.mimetype] ? null : new HttpError(400, 'Photo must be a JPG, PNG or WebP image'), Boolean(PHOTO_TYPES[file.mimetype])),
  });

  // ---- login ----
  const setupNeeded = () => getSettings(db).admin_password_hash === '';

  r.get('/setup-needed', (req, res) => res.json({ needed: setupNeeded() }));

  r.post('/setup', (req, res) => {
    if (!setupNeeded()) throw new HttpError(403, 'Admin password is already set');
    const password = String(req.body?.password ?? '');
    if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
    setSettings(db, { admin_password_hash: hashSecret(password) });
    auth.login(res, 'admin');
    res.json({ ok: true });
  });

  r.post('/login', async (req, res) => {
    if (!verifySecret(String(req.body?.password ?? ''), getSettings(db).admin_password_hash)) {
      await failDelay();
      return res.status(401).json({ error: 'Wrong password' });
    }
    auth.login(res, 'admin');
    res.json({ ok: true });
  });

  r.post('/logout', (req, res) => { auth.logout(req, res); res.json({ ok: true }); });

  r.use(auth.requireRole('admin'));

  // ---- live tables & bills ----
  r.get('/tables/live', (req, res) => {
    const tables = db.prepare('SELECT * FROM tables WHERE deleted=0 ORDER BY number').all();
    res.json(tables.map(t => {
      const view = O.getVisitView(db, t.code).visit;
      if (!view) return { number: t.number, code: t.code, state: 'free', visitId: null, total: 0, openOrders: 0, billNo: null };
      return {
        number: t.number,
        code: t.code,
        state: view.status === 'bill_requested' ? 'bill_requested' : 'ordering',
        visitId: view.id,
        total: view.total,
        openOrders: view.orders.filter(o => !['served', 'cancelled'].includes(o.status)).length,
        billNo: view.billNo,
      };
    }));
  });

  r.get('/visits/:id/bill', async (req, res) => res.json(await computeBill(db, Number(req.params.id))));

  r.post('/visits/:id/paid', (req, res) => {
    const v = O.closeVisit(db, Number(req.params.id));
    tableChanged(v.tableCode);
    res.json(v);
  });

  r.post('/visits/:id/reopen', (req, res) => {
    const v = O.reopenVisit(db, Number(req.params.id));
    tableChanged(v.tableCode);
    res.json(v);
  });

  r.post('/orders/:id/status', (req, res) => {
    const { order, tableCode } = O.setOrderStatus(db, req.params.id, String(req.body?.status ?? ''));
    tableChanged(tableCode);
    res.json(order);
  });

  r.get('/today', async (req, res) => {
    const since = localMidnightIso();
    const orders = db.prepare("SELECT COUNT(*) n FROM orders WHERE created_at >= ? AND status != 'cancelled'").get(since).n;
    const closed = db.prepare("SELECT id FROM visits WHERE status='closed' AND closed_at >= ? AND bill_no IS NOT NULL").all(since);
    let totalBilled = 0;
    for (const v of closed) totalBilled += (await computeBill(db, v.id)).total;
    res.json({ orders, billsClosed: closed.length, totalBilled });
  });

  // ---- menu ----
  r.get('/dishes', (req, res) => res.json(M.listAdminDishes(db)));

  r.post('/dishes', (req, res) => {
    const id = M.saveDish(db, req.body);
    menuChanged();
    res.status(201).json({ id });
  });

  r.put('/dishes/:id', (req, res) => {
    const id = M.saveDish(db, req.body, Number(req.params.id));
    menuChanged();
    res.json({ id });
  });

  r.delete('/dishes/:id', (req, res) => {
    M.deleteDish(db, Number(req.params.id));
    menuChanged();
    res.json({ ok: true });
  });

  r.post('/dishes/:id/available', (req, res) => {
    M.setAvailable(db, Number(req.params.id), Boolean(req.body?.available));
    menuChanged();
    res.json({ ok: true });
  });

  r.post('/dishes/:id/photo', upload.single('photo'), (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose a photo to upload');
    const id = Number(req.params.id);
    const dir = path.join(dataDir, 'photos');
    fs.mkdirSync(dir, { recursive: true });
    const file = `${id}-${Date.now()}.${PHOTO_TYPES[req.file.mimetype]}`;
    fs.writeFileSync(path.join(dir, file), req.file.buffer);
    M.setPhoto(db, id, `/photos/${file}`);
    menuChanged();
    res.json({ photo: `/photos/${file}` });
  });

  r.get('/categories', (req, res) => res.json(M.listCategories(db)));

  r.post('/categories', (req, res) => {
    const id = M.saveCategory(db, req.body);
    menuChanged();
    res.status(201).json({ id });
  });

  r.put('/categories/:id', (req, res) => {
    M.saveCategory(db, req.body, Number(req.params.id));
    menuChanged();
    res.json({ ok: true });
  });

  // ---- tables ----
  r.post('/tables', (req, res) => {
    const number = req.body?.number;
    if (!Number.isInteger(number) || number < 1 || number > 999) throw new HttpError(400, 'Table number must be 1 to 999');
    const existing = db.prepare('SELECT id, deleted FROM tables WHERE number=?').get(number);
    if (existing && !existing.deleted) throw new HttpError(409, `Table ${number} already exists`);
    if (existing) db.prepare('UPDATE tables SET deleted=0, code=? WHERE id=?').run(randomCode(), existing.id);
    else db.prepare('INSERT INTO tables(number, code) VALUES (?, ?)').run(number, randomCode());
    events.emit('admin');
    res.status(201).json({ ok: true });
  });

  r.delete('/tables/:number', (req, res) => {
    const t = db.prepare('SELECT id FROM tables WHERE number=? AND deleted=0').get(Number(req.params.number));
    if (!t) throw new HttpError(404, 'Table not found');
    if (O.getActiveVisit(db, t.id)) throw new HttpError(409, 'This table has an open order. Free it first.');
    db.prepare('UPDATE tables SET deleted=1 WHERE id=?').run(t.id);
    events.emit('admin');
    res.json({ ok: true });
  });

  r.get('/tables/qr', async (req, res) => {
    const origin = publicOrigin(req.protocol, req.get('host'));
    const tables = db.prepare('SELECT number, code FROM tables WHERE deleted=0 ORDER BY number').all();
    res.json(await Promise.all(tables.map(async t => {
      const url = `${origin}/t/${t.code}`;
      return { number: t.number, url, svg: await QRCode.toString(url, { type: 'svg', margin: 1 }) };
    })));
  });

  // ---- settings ----
  r.get('/settings', (req, res) => {
    const s = getSettings(db);
    const out = { ...s, hasApiKey: Boolean(s.ai_api_key) };
    for (const k of SECRET_KEYS) delete out[k];
    res.json(out);
  });

  r.put('/settings', (req, res) => {
    const body = req.body || {};
    const patch = {};
    for (const [key, value] of Object.entries(body)) {
      if (TEXT_KEYS.includes(key)) {
        if (typeof value !== 'string' || value.length > 300) throw new HttpError(400, `Invalid ${key}`);
        patch[key] = value.trim();
      } else if (key === 'gst_percent') {
        const g = Number(value);
        if (!Number.isFinite(g) || g < 0 || g > 28) throw new HttpError(400, 'GST must be between 0 and 28 percent');
        patch.gst_percent = g;
      } else if (key === 'ai_enabled') {
        patch.ai_enabled = Boolean(value);
      } else if (key === 'ai_api_key') {
        if (typeof value === 'string' && value.trim() !== '') patch.ai_api_key = value.trim();
      } else if (key === 'kitchen_pin') {
        if (!/^\d{4,8}$/.test(String(value))) throw new HttpError(400, 'Kitchen PIN must be 4 to 8 digits');
        patch.kitchen_pin_hash = hashSecret(String(value));
      } else if (key === 'admin_password') {
        if (typeof value !== 'string' || value.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
        patch.admin_password_hash = hashSecret(value);
      } else {
        throw new HttpError(400, `Unknown setting: ${key}`);
      }
    }
    setSettings(db, patch);
    events.emit('menu');
    events.emit('admin');
    res.json({ ok: true });
  });

  r.get('/ai-log', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    res.json(db.prepare('SELECT * FROM ai_log ORDER BY id DESC LIMIT ?').all(limit).map(r2 => ({ ...r2 })));
  });

  return r;
}

module.exports = { adminRoutes, publicOrigin, lanAddresses };
