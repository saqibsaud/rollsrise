const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeTestApp, tableCode, dishId } = require('./helpers');
const { buildMenuContext, createAssistant } = require('../server/ai');
const { getPublicMenu } = require('../server/menu');
const { setSettings } = require('../server/settings');

function fakeClient(replyText, calls = []) {
  return {
    calls,
    messages: {
      create: async (req) => {
        calls.push(req);
        if (replyText instanceof Error) throw replyText;
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: typeof replyText === 'function' ? replyText(req) : replyText }] };
      },
    },
  };
}
function enabled(db) { setSettings(db, { ai_enabled: true, ai_api_key: 'sk-test' }); }
const ask = (assistant, db, q, table = 1) => assistant.ask({ db, tableNumber: table, messages: [{ role: 'user', content: q }] });

test('menu context includes prices and veg flags', () => {
  const { db } = makeTestApp();
  const ctx = buildMenuContext(getPublicMenu(db));
  assert.match(ctx, /Gobhi Chilli \[veg\]/);
  assert.match(ctx, /Dry ₹110, Gravy ₹130/);
  assert.match(ctx, /Butter Chicken \[non-veg\]/);
  assert.match(ctx, /## Soups/);
});

test('sold-out dishes are marked in context', () => {
  const { db } = makeTestApp();
  db.prepare('UPDATE dishes SET available=0 WHERE id=?').run(dishId(db, 'Gobhi 65'));
  assert.match(buildMenuContext(getPublicMenu(db)), /Gobhi 65 .*SOLD OUT/);
});

test('returns answer and filters dish ids', async () => {
  const { db } = makeTestApp();
  enabled(db);
  const id = dishId(db, 'Paneer Dragon');
  const client = fakeClient(JSON.stringify({ answer: 'Spicy!', dishIds: [id, 99999] }));
  const a = createAssistant({ makeClient: () => client });
  const r = await ask(a, db, 'something spicy?');
  assert.deepEqual(r, { answer: 'Spicy!', dishIds: [id] });
});

test('uses configured model and sends menu in system prompt', async () => {
  const { db } = makeTestApp();
  enabled(db);
  setSettings(db, { ai_model: 'claude-test-model' });
  const calls = [];
  let key;
  const a = createAssistant({ makeClient: (k) => { key = k; return fakeClient('{"answer":"ok","dishIds":[]}', calls); } });
  await ask(a, db, 'hi');
  assert.equal(key, 'sk-test');
  assert.equal(calls[0].model, 'claude-test-model');
  const system = JSON.stringify(calls[0].system);
  assert.match(system, /Rolls Rise Signature/);
  assert.match(system, /Gobhi Chilli/);
  assert.equal(calls[0].messages.at(-1).content, 'hi');
});

test('503 when disabled', async () => {
  const { db } = makeTestApp();
  const a = createAssistant({ makeClient: () => fakeClient('{}') });
  await assert.rejects(ask(a, db, 'hi'), e => e.status === 503 && e.message === 'Assistant unavailable');
  setSettings(db, { ai_enabled: true });
  await assert.rejects(ask(a, db, 'hi'), e => e.status === 503);
});

test('503 when client throws', async () => {
  const { db } = makeTestApp();
  enabled(db);
  const a = createAssistant({ makeClient: () => fakeClient(new Error('network down')), log: () => {} });
  await assert.rejects(ask(a, db, 'hi'), e => e.status === 503 && e.message === 'Assistant unavailable');
});

test('429 after 20 questions from one table', async () => {
  const { db } = makeTestApp();
  enabled(db);
  const a = createAssistant({ makeClient: () => fakeClient('{"answer":"ok","dishIds":[]}') });
  for (let i = 0; i < 20; i++) await ask(a, db, `q${i}`, 1);
  await assert.rejects(ask(a, db, 'one more', 1), e => e.status === 429 && e.message === 'Too many questions. Please ask our staff.');
  await ask(a, db, 'other table', 2);
});

test('logs question and answer', async () => {
  const { db } = makeTestApp();
  enabled(db);
  const a = createAssistant({ makeClient: () => fakeClient('{"answer":"Yes, it is mild.","dishIds":[]}') });
  await ask(a, db, 'Is malai tikka mild?', 3);
  const row = db.prepare('SELECT * FROM ai_log').get();
  assert.equal(row.table_number, 3);
  assert.equal(row.question, 'Is malai tikka mild?');
  assert.equal(row.answer, 'Yes, it is mild.');
});

test('non-JSON reply falls back to text', async () => {
  const { db } = makeTestApp();
  enabled(db);
  const a = createAssistant({ makeClient: () => fakeClient('Just plain text.') });
  assert.deepEqual(await ask(a, db, 'hi'), { answer: 'Just plain text.', dishIds: [] });
});

test('JSON wrapped in a code fence is parsed', async () => {
  const { db } = makeTestApp();
  enabled(db);
  const a = createAssistant({ makeClient: () => fakeClient('```json\n{"answer":"Fenced","dishIds":[]}\n```') });
  assert.equal((await ask(a, db, 'hi')).answer, 'Fenced');
});

test('rejects bad message lists', async () => {
  const { db } = makeTestApp();
  enabled(db);
  const a = createAssistant({ makeClient: () => fakeClient('{"answer":"ok","dishIds":[]}') });
  await assert.rejects(a.ask({ db, tableNumber: 1, messages: [] }), e => e.status === 400);
  await assert.rejects(a.ask({ db, tableNumber: 1, messages: [{ role: 'assistant', content: 'x' }] }), e => e.status === 400);
  await assert.rejects(a.ask({ db, tableNumber: 1, messages: [{ role: 'user', content: '' }] }), e => e.status === 400);
});

test('only the last 10 messages are sent and long ones are cut', async () => {
  const { db } = makeTestApp();
  enabled(db);
  const calls = [];
  const a = createAssistant({ makeClient: () => fakeClient('{"answer":"ok","dishIds":[]}', calls) });
  const msgs = [];
  for (let i = 0; i < 15; i++) msgs.push({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(900) });
  await a.ask({ db, tableNumber: 1, messages: msgs });
  assert.ok(calls[0].messages.length <= 10 && calls[0].messages.length >= 9);
  assert.equal(calls[0].messages[0].role, 'user');
  assert.ok(calls[0].messages.every(m => m.content.length <= 500));
});

test('HTTP: POST /api/t/:code/ask', async () => {
  const assistant = { ask: async ({ tableNumber, messages }) => ({ answer: `T${tableNumber}:${messages.at(-1).content}`, dishIds: [] }) };
  const { app, db } = makeTestApp({ assistant });
  const res = await request(app).post(`/api/t/${tableCode(db, 2)}/ask`).send({ messages: [{ role: 'user', content: 'hello' }] }).expect(200);
  assert.equal(res.body.answer, 'T2:hello');
  await request(app).post('/api/t/nope/ask').send({ messages: [{ role: 'user', content: 'x' }] }).expect(404);
});
