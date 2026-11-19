const crypto = require('node:crypto');

const DEFAULT_SETTINGS = {
  restaurant_name: 'Rolls Rise Signature',
  tagline: 'Indian · Chinese · Arabian',
  address: 'Iqbal Road, (Near Jadeed Mosque) Vaniyambadi',
  phone: '8122776332',
  bill_footer: 'Thank you for dining with us. Every meal is made with passion and served with gratitude.',
  gstin: '',
  gst_percent: 0,
  upi_id: '',
  kitchen_pin_hash: '',
  admin_password_hash: '',
  ai_enabled: false,
  ai_api_key: '',
  ai_model: 'claude-haiku-5-5',
  next_bill_no: 1,
};

const NUMBER_KEYS = new Set(['gst_percent', 'next_bill_no']);
const BOOLEAN_KEYS = new Set(['ai_enabled']);

function decode(key, raw) {
  if (NUMBER_KEYS.has(key)) return Number(raw);
  if (BOOLEAN_KEYS.has(key)) return raw === 'true';
  return raw;
}

function getSettings(db) {
  const out = { ...DEFAULT_SETTINGS };
  for (const { key, value } of db.prepare('SELECT key, value FROM settings').all()) {
    out[key] = decode(key, value);
  }
  return out;
}

function setSettings(db, partial) {
  const stmt = db.prepare(
    'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  for (const [key, value] of Object.entries(partial)) stmt.run(key, String(value));
}

function hashSecret(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifySecret(plain, stored) {
  if (!stored || typeof plain !== 'string') return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(plain, salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

module.exports = { DEFAULT_SETTINGS, getSettings, setSettings, hashSecret, verifySecret };
