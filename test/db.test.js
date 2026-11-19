const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDb, tx } = require('../server/db');

test('creates all tables', () => {
  const db = openDb(':memory:');
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  for (const t of ['categories', 'dishes', 'dish_options', 'tables', 'visits', 'orders', 'order_items', 'settings', 'ai_log']) {
    assert.ok(names.includes(t), `missing ${t}`);
  }
});

test('one open visit per table', () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO tables(number, code) VALUES (1,'abc')").run();
  const ins = db.prepare("INSERT INTO visits(table_id, status, opened_at) VALUES (1, ?, 'x')");
  ins.run('open');
  assert.throws(() => ins.run('open'));
  assert.throws(() => ins.run('bill_requested'));
  ins.run('closed');
  ins.run('closed');
});

test('tx rolls back on throw', () => {
  const db = openDb(':memory:');
  assert.throws(() => tx(db, () => {
    db.prepare("INSERT INTO categories(name) VALUES ('X')").run();
    throw new Error('boom');
  }), /boom/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM categories').get().n, 0);
  assert.equal(tx(db, () => 42), 42);
});

test('data survives reopen', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rr-')), 'a.db');
  let db = openDb(file);
  db.prepare("INSERT INTO categories(name) VALUES ('Soups')").run();
  db.close();
  db = openDb(file);
  assert.equal(db.prepare('SELECT name FROM categories').get().name, 'Soups');
  db.close();
});
