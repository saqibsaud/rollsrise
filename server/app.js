const path = require('node:path');
const express = require('express');
const { publicRoutes } = require('./routes/public');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function createApp({ db, events, assistant, dataDir = path.join(__dirname, '..', 'data') }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  const ctx = { db, events, assistant, dataDir };
  app.use('/api', publicRoutes(ctx));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  app.get('/t/:code', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
  app.get('/kitchen', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'kitchen.html')));
  app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
  app.use('/photos', express.static(path.join(dataDir, 'photos')));
  app.use(express.static(PUBLIC_DIR));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    const message = status >= 500 ? 'Something went wrong' : err.message;
    res.status(status).json({ error: message });
  });

  return app;
}

module.exports = { createApp };
