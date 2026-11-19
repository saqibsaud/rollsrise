const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../server/db');
const { seedIfEmpty } = require('../server/seed/seed');
const { getSettings, verifySecret } = require('../server/settings');

function fresh() { const db = openDb(':memory:'); seedIfEmpty(db); return db; }
const optionsOf = (db, name) => db.prepare(
  'SELECT o.label, o.price FROM dish_options o JOIN dishes d ON d.id=o.dish_id WHERE d.name=? ORDER BY o.sort'
).all(name).map(r => ({ ...r }));

test('seeds 13 categories in menu order', () => {
  const db = fresh();
  const names = db.prepare('SELECT name FROM categories ORDER BY sort').all().map(r => r.name);
  assert.deepEqual(names, ['Soups', 'Starters – Veg', 'Starters – Non-Veg', 'Tandoor & BBQ', 'Combos', 'Burgers',
    'Rice', 'Noodles', 'Main Course – Veg', 'Main Course – Non-Veg', 'Breads', 'Shawarma', 'Rolls']);
});

test('seeds 126 dishes with details', () => {
  const db = fresh();
  const dishes = db.prepare('SELECT * FROM dishes').all();
  assert.equal(dishes.length, 126);
  for (const d of dishes) {
    assert.ok(d.description.length > 10, `${d.name} description`);
    assert.ok(d.ingredients.split(',').length >= 3, `${d.name} ingredients`);
    assert.ok(d.prep_minutes >= 3 && d.prep_minutes <= 45, `${d.name} prep`);
    const n = db.prepare('SELECT COUNT(*) n FROM dish_options WHERE dish_id=?').get(d.id).n;
    assert.ok(n >= 1, `${d.name} options`);
  }
});

test('seeds multi-price options', () => {
  const db = fresh();
  assert.deepEqual(optionsOf(db, 'Gobhi Chilli'), [{ label: 'Dry', price: 110 }, { label: 'Gravy', price: 130 }]);
  assert.deepEqual(optionsOf(db, 'BBQ Chicken'), [{ label: 'Full', price: 440 }, { label: 'Half', price: 220 }, { label: 'Qtr', price: 120 }]);
  assert.deepEqual(optionsOf(db, 'Khubus'), [{ label: 'Regular', price: 15 }]);
});

test('veg flags', () => {
  const db = fresh();
  const veg = n => db.prepare('SELECT is_veg FROM dishes WHERE name=?').get(n).is_veg;
  assert.equal(veg('Paneer Butter Masala'), 1);
  assert.equal(veg('Butter Chicken'), 0);
  assert.equal(veg('Egg Fried Rice'), 0);
  assert.equal(veg('Butter Naan'), 1);
  assert.equal(veg('Kathi Roll'), 0);
});

test('seeds tables 1-6 with unique 8-char codes', () => {
  const db = fresh();
  const t = db.prepare('SELECT number, code FROM tables ORDER BY number').all();
  assert.deepEqual(t.map(r => r.number), [1, 2, 3, 4, 5, 6]);
  assert.equal(new Set(t.map(r => r.code)).size, 6);
  for (const r of t) assert.match(r.code, /^[a-z2-7]{8}$/);
});

test('seeding twice is a no-op', () => {
  const db = fresh();
  seedIfEmpty(db);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM dishes').get().n, 126);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tables').get().n, 6);
});

test('settings defaults', () => {
  const s = getSettings(fresh());
  assert.equal(s.restaurant_name, 'Rolls Rise Signature');
  assert.equal(s.gst_percent, 0);
  assert.equal(s.ai_enabled, false);
  assert.equal(s.next_bill_no, 1);
  assert.equal(s.ai_model, 'claude-haiku-5-5');
  assert.equal(s.admin_password_hash, '');
  assert.equal(verifySecret('1234', s.kitchen_pin_hash), true);
  assert.equal(verifySecret('0000', s.kitchen_pin_hash), false);
});
