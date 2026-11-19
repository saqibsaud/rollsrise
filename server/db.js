const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS dishes (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  is_veg INTEGER NOT NULL,
  spice INTEGER NOT NULL DEFAULT 0 CHECK (spice BETWEEN 0 AND 3),
  description TEXT NOT NULL DEFAULT '',
  ingredients TEXT NOT NULL DEFAULT '',
  prep_minutes INTEGER NOT NULL DEFAULT 15,
  photo TEXT,
  available INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS dish_options (
  id INTEGER PRIMARY KEY,
  dish_id INTEGER NOT NULL REFERENCES dishes(id),
  label TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY,
  table_id INTEGER NOT NULL REFERENCES tables(id),
  status TEXT NOT NULL CHECK (status IN ('open','bill_requested','closed')),
  opened_at TEXT NOT NULL,
  bill_requested_at TEXT,
  bill_no INTEGER,
  closed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_visit_per_table
  ON visits(table_id) WHERE status != 'closed';
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  visit_id INTEGER NOT NULL REFERENCES visits(id),
  status TEXT NOT NULL CHECK (status IN ('new','preparing','ready','served','cancelled')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  eta_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  dish_id INTEGER,
  dish_name TEXT NOT NULL,
  option_label TEXT NOT NULL,
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_log (
  id INTEGER PRIMARY KEY,
  table_number INTEGER,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDb, tx };
