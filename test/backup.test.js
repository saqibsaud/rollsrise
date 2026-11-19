const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDb } = require('../server/db');
const { seedIfEmpty } = require('../server/seed/seed');
const { backupDb } = require('../server/backup');

test('creates dated backup and keeps 14', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-bk-'));
  const db = openDb(path.join(root, 'live.db'));
  seedIfEmpty(db);
  const dir = path.join(root, 'backups');
  fs.mkdirSync(dir);
  for (let i = 1; i <= 15; i++) fs.writeFileSync(path.join(dir, `rollsrise-2020-01-${String(i).padStart(2, '0')}.db`), 'old');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'keep me');
  const file = backupDb(db, dir, 14);
  const backups = fs.readdirSync(dir).filter(f => f.startsWith('rollsrise-'));
  assert.equal(backups.length, 14);
  assert.ok(backups.includes(path.basename(file)));
  assert.ok(!backups.includes('rollsrise-2020-01-01.db'));
  assert.ok(fs.existsSync(path.join(dir, 'notes.txt')));
  const copy = openDb(file);
  assert.equal(copy.prepare('SELECT COUNT(*) n FROM categories').get().n, 13);
  copy.close();
  // a second backup on the same day overwrites rather than failing
  assert.equal(backupDb(db, dir, 14), file);
});
