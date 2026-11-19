const express = require('express');
const { getPublicMenu } = require('../menu');
const { getSettings } = require('../settings');
const { HttpError } = require('../errors');
const O = require('../orders');
const { computeBill } = require('../bill');

function publicRoutes({ db, events }) {
  const r = express.Router();
  const changed = (code) => { events.emit(`table:${code}`); events.emit('kitchen'); events.emit('admin'); };

  r.get('/menu', (req, res) => {
    const s = getSettings(db);
    res.json({
      ...getPublicMenu(db),
      aiEnabled: Boolean(s.ai_enabled && s.ai_api_key),
      restaurant: { name: s.restaurant_name, tagline: s.tagline },
    });
  });

  r.get('/tables', (req, res) => {
    res.json(db.prepare('SELECT number, code FROM tables WHERE deleted=0 ORDER BY number').all().map(t => ({ ...t })));
  });

  r.get('/tables/:code', (req, res) => {
    const t = db.prepare('SELECT number, code FROM tables WHERE code=? AND deleted=0').get(req.params.code);
    if (!t) throw new HttpError(404, 'Table not found');
    res.json({ ...t });
  });

  r.get('/t/:code/visit', (req, res) => res.json(O.getVisitView(db, req.params.code)));

  r.post('/t/:code/orders', (req, res) => {
    const order = O.placeOrder(db, req.params.code, req.body || {});
    changed(req.params.code);
    res.status(201).json(order);
  });

  r.post('/t/:code/bill-request', async (req, res) => {
    const visit = O.requestBill(db, req.params.code);
    changed(req.params.code);
    res.json(await computeBill(db, visit.id));
  });

  r.get('/t/:code/bill', async (req, res) => {
    const table = O.getTableByCode(db, req.params.code);
    const v = O.getActiveVisit(db, table.id);
    if (!v || v.status !== 'bill_requested') throw new HttpError(404, 'No bill yet');
    res.json(await computeBill(db, v.id));
  });

  return r;
}

module.exports = { publicRoutes };
