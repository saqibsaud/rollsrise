const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeTestApp, tableCode, optionId } = require('./helpers');
const O = require('../server/orders');
const { computeBill } = require('../server/bill');
const { setSettings } = require('../server/settings');

function billFor(db, code, lines) {
  for (const items of lines) O.placeOrder(db, code, { items });
  for (const o of O.getVisitView(db, code).visit.orders) for (const s of ['preparing', 'ready', 'served']) O.setOrderStatus(db, o.id, s);
  return O.requestBill(db, code);
}

test('merges identical lines', async () => {
  const { db } = makeTestApp();
  const code = tableCode(db, 2);
  const naan = optionId(db, 'Butter Naan');
  const v = billFor(db, code, [[{ optionId: naan, qty: 1 }], [{ optionId: naan, qty: 1 }, { optionId: optionId(db, 'Khubus'), qty: 1 }]]);
  const b = await computeBill(db, v.id);
  assert.deepEqual(b.lines, [
    { name: 'Butter Naan', option: 'Regular', qty: 2, rate: 40, amount: 80 },
    { name: 'Khubus', option: 'Regular', qty: 1, rate: 15, amount: 15 },
  ]);
  assert.equal(b.tableNumber, 2);
  assert.equal(b.billNo, 1);
  assert.equal(b.status, 'bill_requested');
  assert.equal(b.restaurant.name, 'Rolls Rise Signature');
  assert.match(b.footer, /Thank you for dining with us/);
});

test('no tax lines when GST unset', async () => {
  const { db } = makeTestApp();
  const code = tableCode(db, 1);
  const v = billFor(db, code, [[{ optionId: optionId(db, 'Gobhi Chilli', 'Gravy'), qty: 2 }]]);
  const b = await computeBill(db, v.id);
  assert.deepEqual(b.taxes, []);
  assert.equal(b.subtotal, 260);
  assert.equal(b.total, 260);
  assert.equal(b.roundOff, 0);
  assert.equal(b.upi, null);
});

test('GST 5% splits into CGST/SGST', async () => {
  const { db } = makeTestApp();
  setSettings(db, { gst_percent: 5, gstin: '33ABCDE1234F1Z5' });
  const code = tableCode(db, 1);
  const v = billFor(db, code, [[{ optionId: optionId(db, 'Kadai Chicken'), qty: 1 }, { optionId: optionId(db, 'Egg Fried Rice'), qty: 1 }]]);
  const b = await computeBill(db, v.id);
  assert.equal(b.subtotal, 290);
  assert.deepEqual(b.taxes, [{ label: 'CGST @ 2.5%', amount: 7.25 }, { label: 'SGST @ 2.5%', amount: 7.25 }]);
  assert.equal(b.total, 305);
  assert.equal(b.roundOff, 0.5);
  assert.equal(b.restaurant.gstin, '33ABCDE1234F1Z5');
});

test('UPI QR when upi_id set', async () => {
  const { db } = makeTestApp();
  setSettings(db, { upi_id: 'rollsrise@upi' });
  const code = tableCode(db, 1);
  const v = billFor(db, code, [[{ optionId: optionId(db, 'Khubus'), qty: 2 }]]);
  const b = await computeBill(db, v.id);
  assert.match(b.upi.link, /^upi:\/\/pay\?pa=rollsrise%40upi&|^upi:\/\/pay\?pa=rollsrise@upi&/);
  assert.match(b.upi.link, /am=30(&|$)/);
  assert.match(b.upi.link, /cu=INR/);
  assert.ok(b.upi.qrSvg.startsWith('<svg'));
});

test('cancelled order excluded from bill', async () => {
  const { db } = makeTestApp();
  const code = tableCode(db, 1);
  O.placeOrder(db, code, { items: [{ optionId: optionId(db, 'Khubus'), qty: 1 }] });
  const c = O.placeOrder(db, code, { items: [{ optionId: optionId(db, 'Butter Naan'), qty: 1 }] });
  O.setOrderStatus(db, c.id, 'cancelled');
  for (const o of O.getVisitView(db, code).visit.orders) if (o.status !== 'cancelled') for (const s of ['preparing', 'ready', 'served']) O.setOrderStatus(db, o.id, s);
  const v = O.requestBill(db, code);
  const b = await computeBill(db, v.id);
  assert.equal(b.lines.length, 1);
  assert.equal(b.total, 15);
});

test('GET /api/t/:code/bill before request → 404, after → bill', async () => {
  const { app, db } = makeTestApp();
  const code = tableCode(db, 1);
  await request(app).get(`/api/t/${code}/bill`).expect(404);
  O.placeOrder(db, code, { items: [{ optionId: optionId(db, 'Khubus'), qty: 1 }] });
  for (const o of O.getVisitView(db, code).visit.orders) for (const s of ['preparing', 'ready', 'served']) O.setOrderStatus(db, o.id, s);
  const r = await request(app).post(`/api/t/${code}/bill-request`).expect(200);
  assert.equal(r.body.total, 15);
  assert.equal(r.body.billNo, 1);
  const g = await request(app).get(`/api/t/${code}/bill`).expect(200);
  assert.equal(g.body.total, 15);
});
