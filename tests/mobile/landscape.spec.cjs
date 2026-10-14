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
    for (const id of ['appTopMenuToggle', 'appBottomMenuToggle']) {
      const toggle = page.locator(`#${id}`);
      await expect(toggle).toHaveText('');
      await expect(toggle.locator('svg[aria-hidden="true"] path')).toHaveCount(1);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      const circle = await toggle.boundingBox();
      expect(circle.width).toBe(circle.height);
      expect(circle.width).toBeGreaterThanOrEqual(44);
      expect(await toggle.evaluate(button => getComputedStyle(button).borderRadius)).toBe('50%');
    }
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
    await page.screenshot({ path: `test-results/${test.info().project.name}-landscape-${size.width}.png` });
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
    // Repeat the deck and first-player choices, but keep values distinct:
    // Three.js also uses Math.random to assign unique material/texture UUIDs.
    let calls = 0;
    Math.random = () => .1 + (++calls % 65536) / 65536000;
  });
  await page.goto('/');
  await page.waitForFunction(() => !!window.DuelArena);
  await page.locator('#welcome [data-start-mode="com"]').tap();
  await expect(page.locator('#ownHand .card.type-character').first()).toBeVisible({ timeout: 60000 });
  if (renderer === 'WebGL' && await page.evaluate(() => !!window.DuelArena.renderer)) {
    const photoError = await page.evaluate(async () => {
      const arena = window.DuelArena;
      await arena.backgroundReadyPromise;
      const photo = arena.fixed.children.find(mesh => mesh.material.map?.image.src.includes('arena-photoreal-'));
      if (!photo) throw new Error('The original central board photograph is missing');
      const target = arena.staticBackground, camera = arena.camera;
      const expected = document.createElement('canvas');
      expected.width = target.width; expected.height = target.height;
      const ctx = expected.getContext('2d');
      const width = target.width * 24.32 * camera.zoom / (camera.right - camera.left);
      const height = target.height * 15.2 * camera.zoom / (camera.top - camera.bottom);
      ctx.drawImage(photo.material.map.image, (target.width - width) / 2, (target.height - height) / 2, width, height);
      const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      const srgb = value => value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055;
      const color = photo.material.color.toArray();
      let error = 0, count = 0;
      for (const [u, v] of [[.3, .3], [.4, .4], [.5, .5], [.6, .6], [.7, .7]]) {
        const x = Math.floor(target.width / 2 + (u - .5) * width);
        const y = Math.floor(target.height / 2 + (v - .5) * height);
        const original = ctx.getImageData(x, y, 1, 1).data, actual = new Uint8Array(4);
        arena.renderer.readRenderTargetPixels(target, x, target.height - 1 - y, 1, 1, actual);
        for (let c = 0; c < 3; c++) { error += Math.abs(actual[c] - srgb(linear(original[c] / 255) * color[c]) * 255); count++; }
      }
      return error / count;
    });
    expect(photoError, 'The visible original photograph must match the enlarged camera and tap coordinates').toBeLessThan(25);
  }
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
  await page.screenshot({ path: `test-results/${test.info().project.name}-landscape-summon-${renderer}.png` });
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
  await page.screenshot({ path: `test-results/${test.info().project.name}-landscape-tactic-${renderer}.png` });
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
  await page.screenshot({ path: `test-results/${test.info().project.name}-landscape-spectator-compact.png` });
});
