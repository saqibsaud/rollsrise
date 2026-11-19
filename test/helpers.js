const { openDb } = require('../server/db');
const { seedIfEmpty } = require('../server/seed/seed');
const { createEvents } = require('../server/events');
const { createApp } = require('../server/app');

function makeTestApp(opts = {}) {
  const db = openDb(':memory:');
  seedIfEmpty(db);
  const events = createEvents();
  const emitted = [];
  const realEmit = events.emit;
  events.emit = (channel) => { emitted.push(channel); realEmit(channel); };
  const assistant = opts.assistant || { ask: async () => ({ answer: 'ok', dishIds: [] }) };
  const app = createApp({ db, events, assistant, dataDir: opts.dataDir });
  return { app, db, events, emitted, assistant };
}

const tableCode = (db, number) => db.prepare('SELECT code FROM tables WHERE number=?').get(number).code;
const optionId = (db, dish, label = 'Regular') => db.prepare(
  'SELECT o.id FROM dish_options o JOIN dishes d ON d.id=o.dish_id WHERE d.name=? AND o.label=?'
).get(dish, label).id;
const dishId = (db, name) => db.prepare('SELECT id FROM dishes WHERE name=?').get(name).id;

module.exports = { makeTestApp, tableCode, optionId, dishId };
