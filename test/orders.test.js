const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeTestApp, tableCode, optionId, dishId } = require('./helpers');
const O = require('../server/orders');

function setup() {
  const ctx = makeTestApp();
  ctx.code = tableCode(ctx.db, 1);
  ctx.place = (items, note) => O.placeOrder(ctx.db, ctx.code, { items, note });
  return ctx;
}
const serveAll = (db, code) => {
  for (const o of O.getVisitView(db, code).visit.orders) {
    if (o.status === 'cancelled') continue;
    for (const s of ['preparing', 'ready', 'served']) { try { O.setOrderStatus(db, o.id, s); } catch { /* already past */ } }
  }
};

test('places order and snapshots price', () => {
  const { db, code, place } = setup();
  const opt = optionId(db, 'Gobhi Chilli', 'Gravy');
  place([{ optionId: opt, qty: 2 }]);
  let v = O.getVisitView(db, code).visit;
  assert.equal(v.orders[0].items[0].price, 130);
  assert.equal(v.orders[0].items[0].qty, 2);
  assert.equal(v.orders[0].items[0].name, 'Gobhi Chilli');
  assert.equal(v.orders[0].items[0].option, 'Gravy');
  assert.equal(v.orders[0].status, 'new');
  db.prepare('UPDATE dish_options SET price=999 WHERE id=?').run(opt);
  v = O.getVisitView(db, code).visit;
  assert.equal(v.total, 260);
});

test('eta uses longest prep time', () => {
  const { db, place } = setup();
  const order = place([{ optionId: optionId(db, 'Khubus'), qty: 1 }, { optionId: optionId(db, 'BBQ Chicken', 'Full'), qty: 1 }]);
  assert.equal(new Date(order.etaAt) - new Date(order.createdAt), 30 * 60000);
});

test('two orders share one visit', () => {
  const { db, code, place } = setup();
  const a = place([{ optionId: optionId(db, 'Khubus'), qty: 1 }]);
  const b = place([{ optionId: optionId(db, 'Butter Naan'), qty: 1 }]);
  assert.equal(a.visitId, b.visitId);
  assert.equal(O.getVisitView(db, code).visit.orders.length, 2);
});

test('rejects sold-out dish', () => {
  const { db, place } = setup();
  db.prepare('UPDATE dishes SET available=0 WHERE id=?').run(dishId(db, 'Gobhi 65'));
  assert.throws(() => place([{ optionId: optionId(db, 'Gobhi 65'), qty: 1 }]),
    e => e.status === 409 && e.message === 'Gobhi 65 is sold out');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM visits').get().n, 0);
});

test('rejects bad quantities', () => {
  const { db, place } = setup();
  const opt = optionId(db, 'Khubus');
  for (const qty of [0, -1, 1.5, 51, '2', null]) {
    assert.throws(() => place([{ optionId: opt, qty }]), e => e.status === 400, `qty ${qty}`);
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
});

test('rejects unknown option', () => {
  const { place } = setup();
  assert.throws(() => place([{ optionId: 999999, qty: 1 }]), e => e.status === 400 && e.message === 'Invalid item');
});

test('rejects empty items', () => {
  const { place } = setup();
  assert.throws(() => place([]), e => e.status === 400);
  assert.throws(() => place(undefined), e => e.status === 400);
});

test('rejects deleted dish', () => {
  const { db, place } = setup();
  db.prepare('UPDATE dishes SET deleted=1 WHERE id=?').run(dishId(db, 'Khubus'));
  assert.throws(() => place([{ optionId: optionId(db, 'Khubus'), qty: 1 }]), e => e.status === 400);
});

test('unknown table is 404', () => {
  const { db } = setup();
  assert.throws(() => O.placeOrder(db, 'nope', { items: [{ optionId: optionId(db, 'Khubus'), qty: 1 }] }), e => e.status === 404);
});

test('status moves forward only', () => {
  const { db, place } = setup();
  const o = place([{ optionId: optionId(db, 'Khubus'), qty: 1 }]);
  assert.throws(() => O.setOrderStatus(db, o.id, 'ready'), e => e.status === 409 && e.message === 'Cannot change order from new to ready');
  O.setOrderStatus(db, o.id, 'preparing');
  O.setOrderStatus(db, o.id, 'ready');
  const r = O.setOrderStatus(db, o.id, 'served');
  assert.equal(r.order.status, 'served');
  assert.equal(typeof r.tableCode, 'string');
  assert.throws(() => O.setOrderStatus(db, o.id, 'cancelled'), e => e.status === 409);
  assert.throws(() => O.setOrderStatus(db, 99999, 'served'), e => e.status === 404);
});

test('bill request needs all served', () => {
  const { db, code, place } = setup();
  const o = place([{ optionId: optionId(db, 'Khubus'), qty: 1 }]);
  O.setOrderStatus(db, o.id, 'preparing');
  O.setOrderStatus(db, o.id, 'ready');
  assert.equal(O.getVisitView(db, code).visit.canRequestBill, false);
  assert.throws(() => O.requestBill(db, code), e => e.status === 409 && e.message === 'Bill can be requested after all food is served');
  O.setOrderStatus(db, o.id, 'served');
  const v = O.requestBill(db, code);
  assert.equal(v.billNo, 1);
  assert.equal(O.requestBill(db, code).billNo, 1, 'idempotent');
  O.closeVisit(db, v.id);
  const o2 = place([{ optionId: optionId(db, 'Khubus'), qty: 1 }]);
  serveAll(db, code);
  assert.equal(O.requestBill(db, code).billNo, 2);
  assert.ok(o2);
});

test('no visit means bill request is 409', () => {
  const { db, code } = setup();
  assert.throws(() => O.requestBill(db, code), e => e.status === 409);
});

test('blocks orders after bill request', () => {
  const { db, code, place } = setup();
  place([{ optionId: optionId(db, 'Khubus'), qty: 1 }]);
  serveAll(db, code);
  O.requestBill(db, code);
  assert.throws(() => place([{ optionId: optionId(db, 'Khubus'), qty: 1 }]),
    e => e.status === 409 && e.message === 'Bill already requested. Please ask staff.');
});

test('cancelled orders don\'t block bill and aren\'t counted', () => {
  const { db, code, place } = setup();
  place([{ optionId: optionId(db, 'Khubus'), qty: 1 }]);
  const b = place([{ optionId: optionId(db, 'Butter Naan'), qty: 1 }]);
  O.setOrderStatus(db, b.id, 'cancelled');
  serveAll(db, code);
  const v = O.getVisitView(db, code).visit;
  assert.equal(v.canRequestBill, true);
  assert.equal(v.total, 15);
});

test('only cancelled orders cannot request bill', () => {
  const { db, code, place } = setup();
  const a = place([{ optionId: optionId(db, 'Khubus'), qty: 1 }]);
  O.setOrderStatus(db, a.id, 'cancelled');
  assert.equal(O.getVisitView(db, code).visit.canRequestBill, false);
  O.closeVisit(db, a.visitId);
  assert.equal(O.getVisitView(db, code).visit, null);
});

test('close then new visit', () => {
  const { db, code, place } = setup();
  const a = place([{ optionId: optionId(db, 'Khubus'), qty: 1 }]);
  assert.throws(() => O.closeVisit(db, a.visitId), e => e.status === 409);
  serveAll(db, code);
  O.requestBill(db, code);
  O.closeVisit(db, a.visitId);
  assert.equal(O.getVisitView(db, code).visit, null);
  const b = place([{ optionId: optionId(db, 'Khubus'), qty: 1 }]);
  assert.notEqual(b.visitId, a.visitId);
});

test('reopen allows more orders', () => {
  const { db, code, place } = setup();
  const a = place([{ optionId: optionId(db, 'Khubus'), qty: 1 }]);
  serveAll(db, code);
  O.requestBill(db, code);
  O.reopenVisit(db, a.visitId);
  const b = place([{ optionId: optionId(db, 'Khubus'), qty: 1 }]);
  assert.equal(b.visitId, a.visitId);
  assert.equal(O.getVisitView(db, code).visit.billNo, 1);
});

test('notes are trimmed to 140 chars', () => {
  const { db, place } = setup();
  const o = place([{ optionId: optionId(db, 'Khubus'), qty: 1, note: 'x'.repeat(300) }], 'y'.repeat(300));
  assert.equal(o.note.length, 140);
  assert.equal(o.items[0].note.length, 140);
});

test('listKitchenOrders shows active orders oldest first', () => {
  const { db, place } = setup();
  const a = place([{ optionId: optionId(db, 'Khubus'), qty: 2 }]);
  const b = place([{ optionId: optionId(db, 'Butter Naan'), qty: 1 }]);
  O.setOrderStatus(db, b.id, 'cancelled');
  const list = O.listKitchenOrders(db);
  assert.deepEqual(list.map(o => o.id), [a.id]);
  assert.equal(list[0].tableNumber, 1);
  assert.equal(list[0].items[0].qty, 2);
});

test('HTTP: POST /api/t/:code/orders emits kitchen and table events', async () => {
  const { app, db, code, emitted } = setup();
  const res = await request(app).post(`/api/t/${code}/orders`).send({ items: [{ optionId: optionId(db, 'Khubus'), qty: 1 }] }).expect(201);
  assert.equal(res.body.status, 'new');
  assert.ok(emitted.includes('kitchen'));
  assert.ok(emitted.includes(`table:${code}`));
  assert.ok(emitted.includes('admin'));
  const v = await request(app).get(`/api/t/${code}/visit`).expect(200);
  assert.equal(v.body.table.number, 1);
  assert.equal(v.body.visit.orders.length, 1);
  const bad = await request(app).post(`/api/t/${code}/orders`).send({ items: [{ optionId: 1, qty: 0 }] }).expect(400);
  assert.ok(bad.body.error);
});
