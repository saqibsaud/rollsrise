const path = require('node:path');
const express = require('express');
const multer = require('multer');
const { publicRoutes } = require('./routes/public');
const { kitchenRoutes } = require('./routes/kitchen');
const { adminRoutes } = require('./routes/admin');
const { createAuth } = require('./auth');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function createApp({ db, events, assistant, dataDir = path.join(__dirname, '..', 'data') }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  const auth = createAuth(db);
  const ctx = { db, events, assistant, dataDir, auth };

  app.get('/api/events', (req, res) => {
    const channel = String(req.query.channel || '');
    if (channel.startsWith('table:')) {
      const ok = db.prepare('SELECT 1 FROM tables WHERE code=? AND deleted=0').get(channel.slice(6));
      if (!ok) return res.status(404).json({ error: 'Table not found' });
    } else if (channel === 'kitchen') {
      if (!auth.allowed(auth.roleOf(req), ['kitchen'])) return res.status(401).json({ error: 'Login required' });
    } else if (channel === 'admin') {
      if (!auth.allowed(auth.roleOf(req), [])) return res.status(401).json({ error: 'Login required' });
    } else if (channel !== 'menu') {
      return res.status(400).json({ error: 'Unknown channel' });
    }
    events.subscribe(channel, res);
  });

  app.use('/api/kitchen', kitchenRoutes(ctx));
  app.use('/api/admin', adminRoutes(ctx));
  app.use('/api', publicRoutes(ctx));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  app.get('/t/:code', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
  app.get('/kitchen', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'kitchen.html')));
  app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
  app.use('/photos', express.static(path.join(dataDir, 'photos')));
  app.use(express.static(PUBLIC_DIR));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err instanceof multer.MulterError ? 400 : (err.status || err.statusCode || 500);
    if (status >= 500) console.error(err);
    const message = status >= 500 ? 'Something went wrong' : err.message;
    res.status(status).json({ error: message });
  });

  return app;
}

module.exports = { createApp };
