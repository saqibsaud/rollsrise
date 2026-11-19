const { test, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3310;
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-restart-'));

function startServer() {
  const proc = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir }, stdio: 'ignore',
  });
  return proc;
}
async function waitUp() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/api/tables`)).ok) return; } catch { /* not yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}
async function placeOrder(tableNumber) {
  const tables = await (await fetch(`${BASE}/api/tables`)).json();
  const menu = await (await fetch(`${BASE}/api/menu`)).json();
  const code = tables.find(t => t.number === tableNumber).code;
  const optionId = menu.categories[0].dishes[0].options[0].id;
  const r = await fetch(`${BASE}/api/t/${code}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ optionId, qty: 1 }] }) });
  expect(r.status).toBe(201);
}

test('kitchen screen keeps working across a server restart', async ({ browser }) => {
  let server = startServer();
  await waitUp();
  try {
    const kitchen = await browser.newPage();
    await kitchen.goto(`${BASE}/kitchen`);
    await kitchen.fill('#pin', '1234');
    await kitchen.click('text=Open kitchen screen');
    await expect(kitchen.locator('#liveText')).toHaveText('Live');

    server.kill();
    await new Promise(r => server.on('exit', r));
    server = startServer();
    await waitUp();
    await placeOrder(5);
    await expect(kitchen.locator('.card', { hasText: 'Table 5' })).toBeVisible({ timeout: 15000 });

    // A screen whose login is gone shows the PIN form instead of silently freezing.
    await kitchen.context().clearCookies();
    server.kill();
    await new Promise(r => server.on('exit', r));
    server = startServer();
    await waitUp();
    await expect(kitchen.locator('#login')).toBeVisible({ timeout: 15000 });
  } finally {
    server.kill();
  }
});
