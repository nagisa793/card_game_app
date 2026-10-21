const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createUpdateFixture } = require('../update-fixture.cjs');

async function fixture(page, info) {
  const root = execFileSync('python3', ['-c', 'from pathlib import Path; from local_web import installed_game; print(installed_game(Path.cwd()))'], { encoding: 'utf8' }).trim();
  const name = `__update-${info.project.name}-${info.testId.replace(/[^a-z0-9]/gi, '').slice(-16)}`;
  const directory = await createUpdateFixture(root, name);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/${name}/setup.html`);
  await page.locator('#install').click();
  await expect(page.locator('#appOrientation')).toHaveText('スマホを横向きにして遊んでね！');
  return { directory, name };
}

test('an installed old orientation gate updates without a page-side activation message', async ({ page }, info) => {
  const { directory, name } = await fixture(page, info);
  try {
    await page.locator('#update').click();
    await expect(page.locator('#appOrientation')).toHaveCount(0);
    await expect(page.frameLocator('#gameViewport').locator('#welcome')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.DuelAppViewport?.rotated)).toBe(true);
    await page.context().setOffline(true);
    await page.reload();
    await expect(page.frameLocator('#gameViewport').locator('#welcome')).toBeVisible();
    await expect(page.locator('#appOrientation')).toHaveCount(0);
  } finally {
    await page.context().setOffline(false);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('activating an update preserves a legacy match until its next launch', async ({ page }, info) => {
  const { directory } = await fixture(page, info);
  try {
    await page.locator('#start').click();
    await page.locator('#update').click();
    await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js'));
    await expect(page.locator('#state')).toHaveText('対戦中');
    await page.reload();
    await expect(page.frameLocator('#gameViewport').locator('#welcome')).toBeVisible();
    await expect(page.locator('#appOrientation')).toHaveCount(0);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
