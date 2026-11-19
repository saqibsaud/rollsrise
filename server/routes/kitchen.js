const express = require('express');
const O = require('../orders');
const { getSettings, verifySecret } = require('../settings');
const { failDelay } = require('../auth');

function kitchenRoutes({ db, events, auth }) {
  const r = express.Router();

  r.post('/login', async (req, res) => {
    auth.checkLocked(req);
    const pin = String(req.body?.pin ?? '');
    if (!verifySecret(pin, getSettings(db).kitchen_pin_hash)) {
      auth.recordFail(req);
      await failDelay();
      return res.status(401).json({ error: 'Wrong PIN' });
    }
    auth.clearFails(req);
    auth.login(res, 'kitchen');
    res.json({ ok: true });
  });

  r.use(auth.requireRole('kitchen'));

  r.get('/orders', (req, res) => res.json(O.listKitchenOrders(db)));

  r.post('/orders/:id/status', (req, res) => {
    const { order, tableCode } = O.setOrderStatus(db, req.params.id, String(req.body?.status ?? ''));
    events.emit('kitchen');
    events.emit('admin');
    events.emit(`table:${tableCode}`);
    res.json(order);
  });

  return r;
}

module.exports = { kitchenRoutes };
