const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeTestApp, tableCode, optionId } = require('./helpers');
const O = require('../server/orders');

test('kitchen endpoints need login', async () => {
  const { app } = makeTestApp();
  await request(app).get('/api/kitchen/orders').expect(401);
  await request(app).post('/api/kitchen/login').send({ pin: '0000' }).expect(401);
  const agent = request.agent(app);
  await agent.post('/api/kitchen/login').send({ pin: '1234' }).expect(200);
  const res = await agent.get('/api/kitchen/orders').expect(200);
  assert.deepEqual(res.body, []);
});

test('kitchen moves order to served', async () => {
  const { app, db, emitted } = makeTestApp();
  const code = tableCode(db, 4);
  const o = O.placeOrder(db, code, { items: [{ optionId: optionId(db, 'Khubus'), qty: 1 }] });
  const agent = request.agent(app);
  await agent.post('/api/kitchen/login').send({ pin: '1234' });
  const list = await agent.get('/api/kitchen/orders');
  assert.equal(list.body[0].tableNumber, 4);
  for (const status of ['preparing', 'ready', 'served']) {
    await agent.post(`/api/kitchen/orders/${o.id}/status`).send({ status }).expect(200);
  }
  await agent.post(`/api/kitchen/orders/${o.id}/status`).send({ status: 'ready' }).expect(409);
  assert.ok(emitted.includes(`table:${code}`));
  const v = await request(app).get(`/api/t/${code}/visit`);
  assert.equal(v.body.visit.orders[0].status, 'served');
  assert.equal(v.body.visit.canRequestBill, true);
});

test('kitchen SSE channel needs login', async () => {
  const { app } = makeTestApp();
  await request(app).get('/api/events?channel=kitchen').expect(401);
  await request(app).get('/api/events?channel=admin').expect(401);
  await request(app).get('/api/events?channel=table:nope').expect(404);
  await request(app).get('/api/events?channel=bogus').expect(400);
});

test('kitchen login survives a server restart', async () => {
  const { createApp } = require('../server/app');
  const { createEvents } = require('../server/events');
  const { app, db } = makeTestApp();
  const res = await request(app).post('/api/kitchen/login').send({ pin: '1234' }).expect(200);
  const cookie = res.headers['set-cookie'][0].split(';')[0];
  const restarted = createApp({ db, events: createEvents(), assistant: { ask: async () => ({}) } });
  await request(restarted).get('/api/kitchen/orders').set('Cookie', cookie).expect(200);
});

test('too many wrong PINs locks login for a while', async () => {
  const { app } = makeTestApp();
  for (let i = 0; i < 5; i++) await request(app).post('/api/kitchen/login').send({ pin: '0000' }).expect(401);
  const locked = await request(app).post('/api/kitchen/login').send({ pin: '1234' }).expect(429);
  assert.match(locked.body.error, /Too many wrong attempts/);
  await request(app).post('/api/admin/login').send({ password: 'whatever' }).expect(429);
});
