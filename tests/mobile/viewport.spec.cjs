const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.waitForFunction(() => window.DuelArena && document.body.classList.contains('appCompactUI'));
}
async function fullScreen(page, size) {
  await expect.poll(() => page.locator('#sceneCanvas').evaluate(canvas => {
    const r = canvas.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  })).toEqual([0, 0, size.width, size.height]);
  await expect(page.locator('#appOrientation')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function geometry(page) {
  return page.evaluate(() => {
    const box = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return [r.x, r.y, r.width, r.height].map(x => Math.round(x * 100) / 100);
    };
    return { stage: box('#battleStage'), canvas: box('#sceneCanvas'), hand: box('#ownHand'), top: box('#appTopMenuToggle'), bottom: box('#appBottomMenuToggle'), zoom: Math.round(window.DuelArena.camera.zoom * 10000) / 10000 };
  });
}
async function initInsets(page, insets) {
  await page.addInitScript(values => {
    window.__setInsets = insets => {
      for (const [key, value] of Object.entries(insets)) document.body.style.setProperty('--app-' + key, value + 'px');
    };
    document.addEventListener('DOMContentLoaded', () => window.__setInsets(values));
  }, insets);
}

for (const size of [
  { width: 568, height: 320 }, { width: 667, height: 375 }, { width: 740, height: 360 },
  { width: 844, height: 390 }, { width: 932, height: 430 }
]) {
  test(`entry paths converge at ${size.width}×${size.height}, including notch and home indicator`, async ({ page }) => {
    await page.setViewportSize(size);
    const insets = size.width >= 844 ? { left: 44, right: 44, bottom: 21, top: 0 } : { left: 0, right: 0, bottom: 0, top: 0 };
    await initInsets(page, insets);
    await page.goto('/game.html'); await ready(page); await fullScreen(page, size);
    // Wait for the first viewport/safe-area settling pass before recording.
    await expect.poll(async () => (await geometry(page)).bottom[1] + 44).toBe(size.height - insets.bottom - 4);
    const direct = await geometry(page);
    for (let rotation = 0; rotation < 2; rotation++) {
      await page.setViewportSize({ width: size.height, height: size.width });
      await page.evaluate(() => { window.__setInsets({ top: 47, bottom: 34, left: 0, right: 0 }); dispatchEvent(new Event('orientationchange')); });
      await expect(page.locator('#appOrientation')).toBeHidden();
      await page.setViewportSize(size);
      await page.evaluate(insets => { window.__setInsets(insets); dispatchEvent(new Event('orientationchange')); }, insets);
      await fullScreen(page, size);
      await expect.poll(() => geometry(page)).toEqual(direct);
    }
    await page.reload(); await ready(page); await fullScreen(page, size);
    await expect.poll(() => geometry(page)).toEqual(direct);
    await page.locator('#appTopMenuToggle').tap();
    await expect(page.locator('#appTopMenu')).toBeVisible();
    await page.locator('#appBottomMenuToggle').tap();
    await expect(page.locator('#appTopMenu')).toBeHidden();
    await expect(page.locator('#appBottomMenu')).toBeVisible();
    await page.locator('#appBottomMenuToggle').tap();
    await page.screenshot({ path: `test-results/${test.info().project.name}-entry-paths-${size.width}.png` });
  });
}

test('cold landscape entry tolerates stale, zero and zoomed visualViewport values', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.addInitScript(() => {
    const mock = new EventTarget();
    Object.assign(mock, { width: 390, height: 844, scale: 1, offsetLeft: 0, offsetTop: 0 });
    Object.defineProperty(window, 'visualViewport', { get: () => mock });
    window.__viewportMock = mock;
  });
  await page.goto('/game.html'); await ready(page);
  await fullScreen(page, { width: 844, height: 390 });
  const direct = await geometry(page);
  for (const state of [
    { width: 0, height: 0, scale: 1 }, { width: 844, height: 369, scale: 1 },
    { width: 422, height: 195, scale: 2 }, { width: 844, height: 390, scale: 1 }
  ]) {
    await page.evaluate(state => { Object.assign(window.__viewportMock, state); window.__viewportMock.dispatchEvent(new Event('resize')); }, state);
    await fullScreen(page, { width: 844, height: 390 });
    await expect.poll(() => geometry(page)).toEqual(direct);
  }
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect.poll(() => geometry(page)).toEqual(direct);
});

test('browser chrome, reverse landscape and restored matches preserve geometry and state', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await initInsets(page, { top: 0, left: 44, right: 44, bottom: 21 });
  await page.addInitScript(() => { let calls = 0; Math.random = () => .1 + (++calls % 65536) / 65536000; });
  await page.goto('/game.html'); await ready(page);
  await page.locator('#welcome [data-start-mode="com"]').tap();
  await expect(page.locator('#gameStartOverlay')).toBeHidden({ timeout: 60000 });
  await page.evaluate(() => { window.__savedArena = window.DuelArena; window.__savedEngine = window.DuelEngine; });
  const initial = await geometry(page);
  for (const height of [320, 270, 340, 390]) {
    await page.setViewportSize({ width: 844, height });
    await fullScreen(page, { width: 844, height });
    await page.locator('#appTopMenuToggle').tap();
    await page.locator('#settingsBtn').tap();
    await expect(page.locator('#settingsOverlay')).toBeVisible();
    await page.locator('#settingsCloseBtn').tap();
  }
  await expect.poll(() => geometry(page)).toEqual(initial);
  await page.evaluate(() => {
    window.__setInsets({ top: 0, left: 0, right: 44, bottom: 21 });
    dispatchEvent(new Event('orientationchange'));
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    dispatchEvent(new Event('focus'));
  });
  await fullScreen(page, { width: 844, height: 390 });
  await page.evaluate(() => { window.__setInsets({ top: 0, left: 44, right: 44, bottom: 21 }); });
  await expect.poll(() => geometry(page)).toEqual(initial);
  await page.evaluate(() => { window.__hidden = true; Object.defineProperty(document, 'hidden', { get: () => window.__hidden, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('#appOrientation')).toBeHidden();
  await page.setViewportSize({ width: 844, height: 390 });
  await fullScreen(page, { width: 844, height: 390 });
  await expect.poll(() => geometry(page)).toEqual(initial);
  expect(await page.evaluate(() => window.DuelArena === window.__savedArena && window.DuelEngine === window.__savedEngine)).toBe(true);
  await page.locator('#ownHand .card.type-character').first().tap();
  await page.locator('.boardLegalSlot').first().tap();
  await expect(page.locator('#ownBattle .slot.char')).toHaveCount(1);
  await page.locator('#ownHand .card.type-trap').first().tap();
  const slot = await page.locator('.boardLegalSlot').first().boundingBox(), hand = await page.locator('#ownHand').boundingBox();
  expect(slot.y + slot.height).toBeLessThan(hand.y);
  await page.touchscreen.tap(slot.x + slot.width / 2, slot.y + slot.height * .8);
  await expect(page.locator('#ownTactic .slot.trap')).toHaveCount(1);
  await page.screenshot({ path: `test-results/${test.info().project.name}-restored-match-safe-area.png` });
});

for (const fallback of [false, true]) {
  test(`short landscape has textured scenery to every edge (${fallback ? 'software' : 'default'})`, async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 270 });
    await initInsets(page, { top: 0, left: 44, right: 44, bottom: 21 });
    if (fallback) await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return kind === 'webgl2' ? null : original.call(this, kind, ...args); };
    });
    await page.goto('/game.html'); await ready(page); await fullScreen(page, { width: 844, height: 270 });
    await page.evaluate(() => window.DuelArena.backgroundReadyPromise);
    await expect.poll(() => page.evaluate(() => {
      const arena = window.DuelArena;
      const w = arena.ctx ? arena.background?.width : arena.staticBackground.width;
      const h = arena.ctx ? arena.background?.height : arena.staticBackground.height;
      if (!w || !h) return 0;
      const contrasts = [];
      for (const x of [2, w - 3]) {
        const values = [];
        for (let i = 1; i < 9; i++) {
          const y = Math.floor(h * i / 10);
          let pixel;
          if (arena.ctx) pixel = arena.background.getContext('2d').getImageData(x, y, 1, 1).data;
          else { pixel = new Uint8Array(4); arena.renderer.readRenderTargetPixels(arena.staticBackground, x, y, 1, 1, pixel); }
          values.push(pixel[0] + pixel[1] + pixel[2]);
        }
        contrasts.push(Math.max(...values) - Math.min(...values));
      }
      return Math.min(...contrasts);
    })).toBeGreaterThan(12);
    await page.screenshot({ path: `test-results/${test.info().project.name}-short-landscape-${fallback ? 'software' : 'default'}.png` });
  });
}
