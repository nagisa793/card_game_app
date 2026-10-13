const { test, expect } = require('@playwright/test');

for (const size of [{ width: 844, height: 390 }, { width: 740, height: 360 }, { width: 667, height: 375 }, { width: 568, height: 320 }, { width: 932, height: 430 }]) {
  test(`landscape ${size.width}×${size.height}: original controls and menus stay reachable`, async ({ page }) => {
    await page.setViewportSize(size);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.waitForFunction(() => !!window.DuelArena);
    await expect(page.locator('#appOrientation')).toBeHidden();
    await expect(page.locator('#welcome')).toBeVisible();
    const rect = await page.locator('#battleStage').boundingBox();
    expect(rect.width).toBeLessThanOrEqual(size.width);
    expect(rect.height).toBeLessThanOrEqual(size.height);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    await page.locator('#rulesBtn').click();
    await expect(page.locator('#rulesOverlay')).toBeVisible();
    await page.locator('#rulesCloseBtn').click();
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settingsOverlay')).toBeVisible();
    await page.locator('#settingsCloseBtn').click();
    await page.locator('#cardCatalogBtn').click();
    await expect(page.locator('#cardCatalogOverlay')).toBeVisible();
    expect(await page.locator('.catalogCard').count()).toBeGreaterThan(30);
    await page.locator('#cardCatalogClose').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('a finger selects a hand card and summons it into the actual highlighted field slot', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.addInitScript(() => {
    // Deterministic deck and first-player selection only in the test browser.
    Math.random = () => 0.1;
  });
  await page.goto('/');
  await page.waitForFunction(() => !!window.DuelArena);
  await page.locator('#welcome [data-start-mode="com"]').tap();
  await expect(page.locator('#ownHand .card.type-character').first()).toBeVisible({ timeout: 60000 });
  const card = page.locator('#ownHand .card.type-character').first();
  const name = await card.getAttribute('data-inspect-title');
  await card.tap();
  await expect(page.locator('#boardCardPreview')).toBeVisible();
  await expect(page.locator('#boardCardPreview .boardCardText strong')).toContainText(name);
  await expect(page.locator('.boardLegalSlot').first()).toBeVisible();
  const slot = page.locator('.boardLegalSlot').first();
  const slotBox = await slot.boundingBox();
  expect(slotBox.x).toBeGreaterThan(0);
  expect(slotBox.x + slotBox.width).toBeLessThan(844);
  await slot.tap();
  await expect(page.locator('#ownBattle .slot.char')).toHaveCount(1);
  const ownHand = await page.locator('#ownHand').boundingBox();
  expect(ownHand.y + ownHand.height).toBeLessThanOrEqual(390);
  const confirm = page.locator('#deckActions button').first();
  if (await confirm.count()) {
    const box = await confirm.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
