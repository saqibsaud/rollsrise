const express = require('express');
const { getPublicMenu } = require('../menu');
const { getSettings } = require('../settings');
const { HttpError } = require('../errors');

function publicRoutes({ db }) {
  const r = express.Router();

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

  return r;
}

module.exports = { publicRoutes };
