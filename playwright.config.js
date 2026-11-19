const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-e2e-'));

module.exports = {
  testDir: 'test/e2e',
  timeout: 60000,
  use: { baseURL: 'http://localhost:3300' },
  webServer: {
    command: 'node --no-warnings=ExperimentalWarning server/index.js',
    url: 'http://localhost:3300/api/tables',
    env: { PORT: '3300', DATA_DIR: dataDir },
    reuseExistingServer: false,
  },
};
