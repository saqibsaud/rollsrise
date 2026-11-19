// Starts the Rolls Rise ordering server on this computer.
const path = require('node:path');
const fs = require('node:fs');
const { openDb } = require('./db');
const { seedIfEmpty } = require('./seed/seed');
const { createEvents } = require('./events');
const { createApp } = require('./app');
const { createAssistant } = require('./ai');
const { backupDb } = require('./backup');
const { lanAddresses } = require('./routes/admin');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const DAY_MS = 24 * 60 * 60 * 1000;

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = openDb(path.join(DATA_DIR, 'rollsrise.db'));
if (seedIfEmpty(db)) console.log('First start: menu, tables 1–6 and default settings created.');

function runBackup() {
  try {
    const file = backupDb(db, path.join(DATA_DIR, 'backups'));
    console.log(`Backup saved: ${file}`);
  } catch (err) {
    console.error('Backup failed:', err.message);
  }
}
runBackup();
setInterval(runBackup, DAY_MS).unref();

const app = createApp({ db, events: createEvents(), assistant: createAssistant(), dataDir: DATA_DIR });
const server = app.listen(PORT, '0.0.0.0', () => {
  const ips = lanAddresses();
  const base = ips.length ? `http://${ips[0]}:${PORT}` : `http://localhost:${PORT}`;
  console.log('\nRolls Rise ordering is running.\n');
  console.log(`  Customers: ${base}`);
  console.log(`  Kitchen:   ${base}/kitchen`);
  console.log(`  Admin:     ${base}/admin`);
  if (ips.length > 1) console.log(`  (Other addresses for this computer: ${ips.slice(1).join(', ')})`);
  console.log('\nKeep this window open while the restaurant is open. Close it to stop.\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. Is the ordering system already running in another window?`);
  else console.error(err);
  process.exit(1);
});

function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
