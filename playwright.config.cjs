const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/mobile', timeout: 90000, fullyParallel: false, workers: 1,
  retries: 0, reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8000', hasTouch: true,
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
  },
  webServer: { command: 'python3 -m http.server 8000 --bind 127.0.0.1 --directory www', url: 'http://127.0.0.1:8000/', reuseExistingServer: false }
});
