const fs = require('node:fs');
const path = require('node:path');

function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Copies the live database to <dir>/rollsrise-YYYY-MM-DD.db and keeps the newest `keep` copies.
function backupDb(db, dir, keep = 14) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rollsrise-${localDate()}.db`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  db.prepare('VACUUM INTO ?').run(file);
  const backups = fs.readdirSync(dir).filter(f => /^rollsrise-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - keep))) fs.unlinkSync(path.join(dir, old));
  return file;
}

module.exports = { backupDb };
