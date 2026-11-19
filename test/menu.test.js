const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeTestApp, tableCode, dishId } = require('./helpers');
const { setSettings } = require('../server/settings');

test('GET /api/menu lists 13 categories', async () => {
  const { app } = makeTestApp();
  const res = await request(app).get('/api/menu').expect(200);
  assert.equal(res.body.categories.length, 13);
  assert.equal(res.body.categories[0].name, 'Soups');
  assert.equal(res.body.categories[0].dishes.length, 13);
  const gc = res.body.categories[1].dishes.find(d => d.name === 'Gobhi Chilli');
  assert.deepEqual(gc.options.map(o => [o.label, o.price]), [['Dry', 110], ['Gravy', 130]]);
  assert.ok(Array.isArray(gc.ingredients) && gc.ingredients.includes('Cauliflower'));
  assert.equal(gc.isVeg, true);
  assert.equal(res.body.restaurant.name, 'Rolls Rise Signature');
});

test('sold-out dish is listed with available:false', async () => {
  const { app, db } = makeTestApp();
  db.prepare('UPDATE dishes SET available=0 WHERE id=?').run(dishId(db, 'Gobhi 65'));
  const res = await request(app).get('/api/menu');
  const d = res.body.categories[1].dishes.find(x => x.name === 'Gobhi 65');
  assert.equal(d.available, false);
});

test('deleted dish is hidden', async () => {
  const { app, db } = makeTestApp();
  db.prepare('UPDATE dishes SET deleted=1 WHERE id=?').run(dishId(db, 'Gobhi 65'));
  const res = await request(app).get('/api/menu');
  assert.equal(res.body.categories[1].dishes.find(x => x.name === 'Gobhi 65'), undefined);
});

test('aiEnabled false by default; true when ai_enabled and key set', async () => {
  const { app, db } = makeTestApp();
  assert.equal((await request(app).get('/api/menu')).body.aiEnabled, false);
  setSettings(db, { ai_enabled: true });
  assert.equal((await request(app).get('/api/menu')).body.aiEnabled, false);
  setSettings(db, { ai_api_key: 'sk-test' });
  assert.equal((await request(app).get('/api/menu')).body.aiEnabled, true);
});

test('GET /api/tables returns 1..6', async () => {
  const { app, db } = makeTestApp();
  const res = await request(app).get('/api/tables').expect(200);
  assert.deepEqual(res.body.map(t => t.number), [1, 2, 3, 4, 5, 6]);
  const one = await request(app).get(`/api/tables/${tableCode(db, 3)}`).expect(200);
  assert.equal(one.body.number, 3);
  const bad = await request(app).get('/api/tables/nope').expect(404);
  assert.equal(bad.body.error, 'Table not found');
  await request(app).get('/api/nothing-here').expect(404);
});

test('GET /t/<code> returns HTML', async () => {
  const { app, db } = makeTestApp();
  const res = await request(app).get(`/t/${tableCode(db, 1)}`).expect(200);
  assert.match(res.headers['content-type'], /text\/html/);
});
