const { test, expect } = require('@playwright/test');

test('portrait entry rotates the live game, preserves taps, and never reloads on rotation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { let calls = 0; Math.random = () => .1 + (++calls % 65536) / 65536000; });
  await page.goto('/');
  const game = page.frameLocator('#gameViewport');
  await expect(game.locator('#welcome')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.DuelAppViewport?.rotated)).toBe(true);
  await expect(game.locator('#appOrientation')).toHaveCount(0);
  await game.locator('#appTopMenuToggle').tap();
  await game.locator('#rulesBtn').tap();
  await expect(game.locator('#rulesOverlay')).toBeVisible();
  await game.locator('#rulesCloseBtn').tap();
  await game.locator('#welcome [data-start-mode="com"]').tap();
  await expect(game.locator('#ownHand .card.type-character').first()).toBeVisible({ timeout: 60000 });
  const frame = page.frames().find(frame => frame.url().includes('/game.html'));
  await frame.evaluate(() => { window.__savedArena = window.DuelArena; window.__savedEngine = window.DuelEngine; });
  await game.locator('#ownHand .card.type-character').first().tap();
  await game.locator('.boardLegalSlot').first().tap();
  await expect(game.locator('#ownBattle .slot.char')).toHaveCount(1);
  for (const size of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await expect.poll(() => page.evaluate(() => window.DuelAppViewport?.rotated)).toBe(size.height > size.width);
    expect(await frame.evaluate(() => window.DuelArena === window.__savedArena && window.DuelEngine === window.__savedEngine)).toBe(true);
    await expect(game.locator('#ownBattle .slot.char')).toHaveCount(1);
    await game.locator('#appBottomMenuToggle').tap();
    await expect(game.locator('#appBottomMenu')).toBeVisible();
    await game.locator('#appBottomMenuToggle').tap();
  }
  await page.screenshot({ path: `test-results/${test.info().project.name}-portrait-live-game.png` });
});
