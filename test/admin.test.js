const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { makeTestApp, tableCode, optionId, dishId } = require('./helpers');
const O = require('../server/orders');
const { setSettings, getSettings, verifySecret } = require('../server/settings');

async function adminAgent(app) {
  const agent = request.agent(app);
  await agent.post('/api/admin/setup').send({ password: 'secret123' }).expect(200);
  return agent;
}
const sampleDish = (db, extra = {}) => ({
  name: 'Test Biryani', categoryId: db.prepare("SELECT id FROM categories WHERE name='Rice'").get().id,
  isVeg: false, spice: 2, description: 'Fragrant rice with chicken.', ingredients: 'Rice, chicken, spices',
  prepMinutes: 20, available: true, options: [{ label: 'Regular', price: 150 }], ...extra,
});
function serve(db, code) {
  for (const o of O.getVisitView(db, code).visit.orders) for (const s of ['preparing', 'ready', 'served']) O.setOrderStatus(db, o.id, s);
}

test('admin setup only once', async () => {
  const { app } = makeTestApp();
  assert.equal((await request(app).get('/api/admin/setup-needed')).body.needed, true);
  await request(app).post('/api/admin/setup').send({ password: '123' }).expect(400);
  await adminAgent(app);
  assert.equal((await request(app).get('/api/admin/setup-needed')).body.needed, false);
  await request(app).post('/api/admin/setup').send({ password: 'another1' }).expect(403);
  await request(app).post('/api/admin/login').send({ password: 'wrong' }).expect(401);
  const a = request.agent(app);
  await a.post('/api/admin/login').send({ password: 'secret123' }).expect(200);
  await a.get('/api/admin/dishes').expect(200);
  await a.post('/api/admin/logout').expect(200);
  await a.get('/api/admin/dishes').expect(401);
});

test('admin can use kitchen API', async () => {
  const { app } = makeTestApp();
  const a = await adminAgent(app);
  await a.get('/api/kitchen/orders').expect(200);
});

test('customer cannot reach admin API', async () => {
  const { app } = makeTestApp();
  await request(app).get('/api/admin/dishes').expect(401);
  await request(app).get('/api/admin/settings').expect(401);
  const k = request.agent(app);
  await k.post('/api/kitchen/login').send({ pin: '1234' });
  await k.get('/api/admin/settings').expect(401);
});

test('save dish validation', async () => {
  const { app, db } = makeTestApp();
  const a = await adminAgent(app);
  await a.post('/api/admin/dishes').send(sampleDish(db, { options: [] })).expect(400);
  await a.post('/api/admin/dishes').send(sampleDish(db, { spice: 5 })).expect(400);
  await a.post('/api/admin/dishes').send(sampleDish(db, { name: '' })).expect(400);
  await a.post('/api/admin/dishes').send(sampleDish(db, { categoryId: 9999 })).expect(400);
  await a.post('/api/admin/dishes').send(sampleDish(db, { options: [{ label: 'Regular', price: -5 }] })).expect(400);
});

test('new dish appears in public menu', async () => {
  const { app, db, emitted } = makeTestApp();
  const a = await adminAgent(app);
  const res = await a.post('/api/admin/dishes').send(sampleDish(db)).expect(201);
  const menu = await request(app).get('/api/menu');
  const rice = menu.body.categories.find(c => c.name === 'Rice');
  const d = rice.dishes.find(x => x.id === res.body.id);
  assert.equal(d.name, 'Test Biryani');
  assert.deepEqual(d.ingredients, ['Rice', 'chicken', 'spices']);
  assert.ok(emitted.includes('menu'));
  await a.post(`/api/admin/dishes/${res.body.id}/available`).send({ available: false }).expect(200);
  const m2 = await request(app).get('/api/menu');
  assert.equal(m2.body.categories.find(c => c.name === 'Rice').dishes.find(x => x.id === res.body.id).available, false);
  await a.delete(`/api/admin/dishes/${res.body.id}`).expect(200);
  const m3 = await request(app).get('/api/menu');
  assert.equal(m3.body.categories.find(c => c.name === 'Rice').dishes.find(x => x.id === res.body.id), undefined);
});

test('edit price doesn\'t change existing bill', async () => {
  const { app, db } = makeTestApp();
  const a = await adminAgent(app);
  const code = tableCode(db, 1);
  O.placeOrder(db, code, { items: [{ optionId: optionId(db, 'Khubus'), qty: 2 }] });
  serve(db, code);
  const v = O.requestBill(db, code);
  const id = dishId(db, 'Khubus');
  const dishes = (await a.get('/api/admin/dishes')).body;
  const k = dishes.find(d => d.id === id);
  await a.put(`/api/admin/dishes/${id}`).send({ ...k, options: [{ label: 'Regular', price: 99 }] }).expect(200);
  const bill = await a.get(`/api/admin/visits/${v.id}/bill`).expect(200);
  assert.equal(bill.body.total, 30);
});

test('settings never return secrets', async () => {
  const { app, db } = makeTestApp();
  setSettings(db, { ai_api_key: 'sk-secret' });
  const a = await adminAgent(app);
  const s = (await a.get('/api/admin/settings').expect(200)).body;
  assert.equal(s.ai_api_key, undefined);
  assert.equal(s.kitchen_pin_hash, undefined);
  assert.equal(s.admin_password_hash, undefined);
  assert.equal(s.hasApiKey, true);
  assert.equal(s.restaurant_name, 'Rolls Rise Signature');
});

test('blank ai_api_key keeps existing key', async () => {
  const { app, db } = makeTestApp();
  setSettings(db, { ai_api_key: 'sk-secret' });
  const a = await adminAgent(app);
  await a.put('/api/admin/settings').send({ ai_api_key: '', gst_percent: 5, upi_id: 'rr@upi', ai_enabled: true }).expect(200);
  const s = getSettings(db);
  assert.equal(s.ai_api_key, 'sk-secret');
  assert.equal(s.gst_percent, 5);
  assert.equal(s.upi_id, 'rr@upi');
  assert.equal(s.ai_enabled, true);
  await a.put('/api/admin/settings').send({ gst_percent: 40 }).expect(400);
  await a.put('/api/admin/settings').send({ kitchen_pin: '12' }).expect(400);
  await a.put('/api/admin/settings').send({ kitchen_pin: '5678' }).expect(200);
  assert.equal(verifySecret('5678', getSettings(db).kitchen_pin_hash), true);
  await a.put('/api/admin/settings').send({ next_bill_no: 1 }).expect(400);
});

test('cannot delete table with active visit', async () => {
  const { app, db } = makeTestApp();
  const a = await adminAgent(app);
  O.placeOrder(db, tableCode(db, 2), { items: [{ optionId: optionId(db, 'Khubus'), qty: 1 }] });
  await a.delete('/api/admin/tables/2').expect(409);
  await a.delete('/api/admin/tables/3').expect(200);
  await a.post('/api/admin/tables').send({ number: 1 }).expect(409);
  await a.post('/api/admin/tables').send({ number: 7 }).expect(201);
  await a.post('/api/admin/tables').send({ number: 3 }).expect(201);
  const nums = (await request(app).get('/api/tables')).body.map(t => t.number);
  assert.deepEqual(nums, [1, 2, 3, 4, 5, 6, 7]);
  const qr = (await a.get('/api/admin/tables/qr').expect(200)).body;
  assert.equal(qr.length, 7);
  assert.match(qr[0].url, /\/t\/[a-z2-7]{8}$/);
  assert.ok(qr[0].svg.startsWith('<svg'));
});

test('live tables shows bill_requested state and paid frees table', async () => {
  const { app, db } = makeTestApp();
  const a = await adminAgent(app);
  const code = tableCode(db, 5);
  O.placeOrder(db, code, { items: [{ optionId: optionId(db, 'Butter Naan'), qty: 3 }] });
  let live = (await a.get('/api/admin/tables/live')).body;
  let t5 = live.find(t => t.number === 5);
  assert.equal(t5.state, 'ordering');
  assert.equal(t5.total, 120);
  assert.equal(t5.openOrders, 1);
  assert.equal(live.find(t => t.number === 1).state, 'free');
  serve(db, code);
  O.requestBill(db, code);
  live = (await a.get('/api/admin/tables/live')).body;
  t5 = live.find(t => t.number === 5);
  assert.equal(t5.state, 'bill_requested');
  assert.equal(t5.billNo, 1);
  await a.post(`/api/admin/visits/${t5.visitId}/paid`).expect(200);
  live = (await a.get('/api/admin/tables/live')).body;
  assert.equal(live.find(t => t.number === 5).state, 'free');
  const today = (await a.get('/api/admin/today').expect(200)).body;
  assert.equal(today.billsClosed, 1);
  assert.equal(today.totalBilled, 120);
});

test('photo upload rejects non-image', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-'));
  const { app, db } = makeTestApp({ dataDir });
  const a = await adminAgent(app);
  const id = dishId(db, 'Khubus');
  await a.post(`/api/admin/dishes/${id}/photo`).attach('photo', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' }).expect(400);
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const ok = await a.post(`/api/admin/dishes/${id}/photo`).attach('photo', png, { filename: 'k.png', contentType: 'image/png' }).expect(200);
  assert.match(ok.body.photo, /^\/photos\/\d+-\d+\.png$/);
  assert.ok(fs.existsSync(path.join(dataDir, 'photos', path.basename(ok.body.photo))));
});

test('categories can be added and renamed', async () => {
  const { app } = makeTestApp();
  const a = await adminAgent(app);
  const c = await a.post('/api/admin/categories').send({ name: 'Desserts', sort: 20 }).expect(201);
  await a.put(`/api/admin/categories/${c.body.id}`).send({ name: 'Sweets', sort: 21 }).expect(200);
  const cats = (await a.get('/api/admin/categories')).body;
  assert.ok(cats.some(x => x.name === 'Sweets'));
  await a.post('/api/admin/categories').send({ name: 'Sweets' }).expect(409);
});

test('ai log is listed for admin', async () => {
  const { app, db } = makeTestApp();
  db.prepare("INSERT INTO ai_log(table_number, question, answer, created_at) VALUES (1,'spicy?','yes','2026-01-01')").run();
  const a = await adminAgent(app);
  const log = (await a.get('/api/admin/ai-log').expect(200)).body;
  assert.equal(log[0].question, 'spicy?');
});

test('QR codes use the LAN address when admin is opened on localhost', () => {
  const { publicOrigin } = require('../server/routes/admin');
  assert.equal(publicOrigin('http', 'localhost:3000', ['192.168.1.20']), 'http://192.168.1.20:3000');
  assert.equal(publicOrigin('http', '127.0.0.1:3000', ['192.168.1.20']), 'http://192.168.1.20:3000');
  assert.equal(publicOrigin('http', 'localhost', ['10.0.0.5']), 'http://10.0.0.5');
  assert.equal(publicOrigin('http', '192.168.1.20:3000', ['192.168.1.20']), 'http://192.168.1.20:3000');
  assert.equal(publicOrigin('http', 'localhost:3000', []), 'http://localhost:3000');
});
