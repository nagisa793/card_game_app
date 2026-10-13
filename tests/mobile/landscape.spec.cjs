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
    await expect(page.locator('#appTopMenu')).toBeHidden();
    await expect(page.locator('#appBottomMenu')).toBeHidden();
    await expect(page.locator('#appTopMenuToggle')).toHaveText('◀️');
    await expect(page.locator('#appBottomMenuToggle')).toHaveText('◀️');
    const rect = await page.locator('#battleStage').boundingBox();
    expect(rect.width).toBeLessThanOrEqual(size.width);
    expect(rect.height).toBeLessThanOrEqual(size.height);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    await page.locator('#appTopMenuToggle').tap();
    await page.locator('#rulesBtn').tap();
    await expect(page.locator('#appTopMenu')).toBeHidden();
    await expect(page.locator('#rulesOverlay')).toBeVisible();
    await page.locator('#rulesCloseBtn').click();
    await page.locator('#appTopMenuToggle').tap();
    await page.locator('#settingsBtn').tap();
    await expect(page.locator('#settingsOverlay')).toBeVisible();
    await page.locator('#settingsCloseBtn').click();
    await page.locator('#appTopMenuToggle').tap();
    await page.locator('#cardCatalogBtn').tap();
    await expect(page.locator('#cardCatalogOverlay')).toBeVisible();
    expect(await page.locator('.catalogCard').count()).toBeGreaterThan(30);
    await page.locator('#cardCatalogClose').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    const phase = await page.locator('#phaseBanner').boundingBox();
    const fieldLeft = await page.evaluate(() => {
      const stage = document.querySelector('#battleStage');
      return stage.getBoundingClientRect().left + parseFloat(stage.style.getPropertyValue('--field-left-edge'));
    });
    expect(phase.x + phase.width).toBeLessThan(fieldLeft);
    expect(await page.evaluate(() => window.DuelArena.camera.zoom)).toBeGreaterThan(1);
    await page.screenshot({ path: `test-results/landscape-${size.width}.png` });
  });
}

for (const renderer of ['WebGL', 'software']) {
test(`a finger selects and summons into the actual enlarged ${renderer} field slot`, async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  if (renderer === 'software') await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl2' ? null : getContext.call(this, type, ...args);
    };
  });
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
  await page.screenshot({ path: `test-results/landscape-summon-${renderer}.png` });
  const ownHand = await page.locator('#ownHand').boundingBox();
  expect(ownHand.y + ownHand.height).toBeLessThanOrEqual(390);
  await page.locator('#ownHand .card.type-trap').first().tap();
  const tacticSlot = page.locator('.boardLegalSlot').first();
  await expect(tacticSlot).toBeVisible();
  const tacticBox = await tacticSlot.boundingBox();
  expect(tacticBox.y + tacticBox.height).toBeLessThan(ownHand.y);
  // Use a physical touch inside the polygon near its lower edge, rather than
  // Playwright's relative padding-box coordinates for an SVG element.
  const point = { x: tacticBox.x + tacticBox.width / 2, y: tacticBox.y + tacticBox.height * .8 };
  expect(await page.evaluate(point => !!document.elementFromPoint(point.x, point.y)?.closest('.boardLegalSlot'), point)).toBe(true);
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('#ownTactic .slot.trap')).toHaveCount(1);
  await page.screenshot({ path: `test-results/landscape-tactic-${renderer}.png` });
  const confirm = page.locator('#deckActions button').first();
  if (await confirm.count()) {
    const box = await confirm.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
}

test('both corner menus preserve the original controls during COM spectator playback', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await page.waitForFunction(() => !!window.DuelArena);
  await page.locator('#appTopMenuToggle').tap();
  for (const id of ['cardCatalogBtn', 'rulesBtn', 'comStartBtn', 'autoStartBtn', 'settingsBtn', 'undoBtn', 'redoBtn']) {
    await expect(page.locator(`#appTopMenu #${id}`)).toBeVisible();
  }
  await page.locator('#autoStartBtn').tap();
  await expect(page.locator('#appTopMenu')).toBeHidden();
  await expect(page.locator('#gameStartOverlay')).toBeHidden({ timeout: 60000 });
  // Let a real COM move enter the history before testing undo/redo. Undoing
  // the start itself correctly returns to the original welcome screen.
  await expect(page.locator('#oppBattle .slot.char, #ownBattle .slot.char').first()).toBeAttached({ timeout: 60000 });
  await page.locator('#appTopMenuToggle').tap();
  await page.locator('#autoPauseBtn').tap();
  await expect(page.locator('#appTopMenu')).toBeHidden();
  await page.locator('#appTopMenuToggle').tap();
  await expect(page.locator('#autoPauseBtn')).toHaveText('▶ 再生');
  await page.locator('#undoBtn').tap();
  await page.locator('#appTopMenuToggle').tap();
  await expect(page.locator('#autoPauseBtn')).toHaveText('▶ 再生');
  await page.locator('#redoBtn').tap();
  await page.locator('#appBottomMenuToggle').tap();
  await expect(page.locator('#appTopMenu')).toBeHidden();
  await expect(page.locator('#appBottomMenu')).toBeVisible();
  await page.locator('#appBottomMenu button[aria-controls="controls"]').tap();
  await expect(page.locator('#appBottomMenu')).toBeHidden();
  await expect(page.locator('#controls')).toBeVisible();
  await page.locator('#appBottomMenuToggle').tap();
  await page.locator('#appBottomMenu button[aria-controls="historyArea"]').tap();
  await expect(page.locator('#historyArea')).toBeVisible();
  await page.locator('#appBottomMenuToggle').tap();
  await page.locator('#chainToggleBtn').tap();
  await expect(page.locator('#chainHistoryShell')).toBeVisible();
  await page.locator('#appBottomMenuToggle').tap();
  await page.locator('#chainToggleBtn').tap();
  await expect(page.locator('#chainHistoryShell')).toBeHidden();
  const phase = await page.locator('#phaseBanner').boundingBox();
  const fieldLeft = await page.evaluate(() => {
    const stage = document.querySelector('#battleStage');
    return stage.getBoundingClientRect().left + parseFloat(stage.style.getPropertyValue('--field-left-edge'));
  });
  expect(phase.x + phase.width).toBeLessThan(fieldLeft);
  await page.screenshot({ path: 'test-results/landscape-spectator-compact.png' });
});
