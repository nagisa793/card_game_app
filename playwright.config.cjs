const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/mobile', timeout: 90000, fullyParallel: false, workers: 1,
  retries: 0, reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8766', hasTouch: true,
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
  },
  webServer: { command: 'python3 local_web.py --no-browser --no-update', url: 'http://localhost:8766/', reuseExistingServer: false }
});
