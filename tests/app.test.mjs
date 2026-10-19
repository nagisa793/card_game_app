import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { inventory } from '../scripts/files.mjs';

test('the entire game and all original assets are preserved in the APP build', async () => {
  const provenance = JSON.parse(await readFile('upstream.json', 'utf8'));
  const original = await inventory('web');
  assert.deepEqual(original, provenance.files);
  const output = await inventory('www');
  for (const [file, hash] of Object.entries(original)) {
    if (file !== 'index.html') assert.equal(output[file], hash, file);
  }
  const entry = await readFile('www/index.html', 'utf8');
  assert.match(entry, /viewport-fit=cover/);
  assert.match(entry, /id="gameViewport" src="\.\/game.html"/);
  assert.match(entry, /app\/viewport\.js/);
  const game = await readFile('www/game.html', 'utf8');
  assert.match(game, /class="duelApp"/);
  assert.match(game, /app\/landscape\.css/);
  assert.match(game, /app\/mobile\.js/);
  assert.match(game, /class="brand" href="\.\/index.html" target="_top"/);
  assert.doesNotMatch(entry, /https?:\/\//);
});

test('landscape viewport follows real pixels and cancelled touches do not activate cards', async () => {
  const dom = new JSDOM('<body class="duelApp"><div id="battleStage"></div></body>', { url: 'https://test.invalid', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const viewport = new w.EventTarget();
  viewport.width = 844; viewport.height = 390;
  w.innerWidth = 844; w.innerHeight = 390;
  Object.defineProperty(w, 'visualViewport', { value: viewport });
  let resized = 0, blurred = 0, clicked = 0;
  w.DuelArena = { resize: () => resized++ };
  w.requestAnimationFrame = callback => { callback(); return 1; };
  w.addEventListener('blur', () => blurred++);
  w.document.addEventListener('click', () => clicked++);
  const source = (await readFile('app/mobile.js', 'utf8')).replaceAll('export function', 'function');
  w.eval(source);
  assert.equal(w.document.getElementById('appOrientation'), null);
  assert.equal(w.document.body.style.getPropertyValue('--app-height'), '390px');
  viewport.width = 390; viewport.height = 844;
  w.innerWidth = 390; w.innerHeight = 844;
  viewport.dispatchEvent(new w.Event('resize'));
  assert.equal(w.document.getElementById('appOrientation'), null);
  viewport.width = 932; viewport.height = 430;
  w.innerWidth = 932; w.innerHeight = 430;
  w.dispatchEvent(new w.Event('orientationchange'));
  assert.equal(w.document.body.style.getPropertyValue('--app-width'), '932px');
  w.document.dispatchEvent(new w.Event('pointercancel'));
  assert.equal(blurred, 1);
  assert.equal(clicked, 0);
  assert.equal(resized, 3);
  dom.window.close();
});

test('landscape entry ignores stale/zoomed visual viewports and follows the complete CSS viewport on restore', async () => {
  const dom = new JSDOM('<body class="duelApp"><div id="battleStage"></div></body>', { url: 'https://test.invalid', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, viewport = new w.EventTarget();
  w.innerWidth = 844; w.innerHeight = 390;
  Object.assign(viewport, { width: 390, height: 844, scale: 1 });
  Object.defineProperty(w, 'visualViewport', { value: viewport });
  w.requestAnimationFrame = callback => { callback(); return 1; };
  w.eval((await readFile('app/mobile.js', 'utf8')).replaceAll('export function', 'function'));
  assert.equal(w.document.body.style.getPropertyValue('--app-height'), '390px');
  assert.equal(w.document.getElementById('appOrientation'), null);
  const probe = w.document.getElementById('appViewportProbe');
  let size = { width: 844, height: 390 };
  probe.getBoundingClientRect = () => size;
  Object.assign(viewport, { width: 844, height: 369 }); // safe area was already subtracted
  viewport.dispatchEvent(new w.Event('resize'));
  assert.equal(w.document.body.style.getPropertyValue('--app-height'), '390px');
  Object.assign(viewport, { width: 422, height: 195, scale: 2 });
  viewport.dispatchEvent(new w.Event('resize'));
  assert.equal(w.document.body.style.getPropertyValue('--app-width'), '844px');
  size = { width: 844, height: 340 }; // browser chrome changes the CSS viewport
  w.dispatchEvent(new w.Event('pageshow'));
  assert.equal(w.document.body.style.getPropertyValue('--app-height'), '340px');
  size = { width: 390, height: 844 };
  w.dispatchEvent(new w.Event('orientationchange'));
  assert.equal(w.document.getElementById('appOrientation'), null);
  size = { width: 844, height: 390 };
  w.dispatchEvent(new w.Event('focus'));
  assert.equal(w.document.getElementById('appOrientation'), null);
  dom.window.close();
});

test('start controls close their corner menu even when the original startup handler stops propagation', async () => {
  const dom = new JSDOM('<body class="duelApp"><div class="top-bar"><div><button id="autoStartBtn">COM同士を観戦</button><button id="undoBtn" disabled>一つ戻る</button></div></div><div id="battleStage"><nav class="boardDock"><button>履歴</button></nav></div></body>', { url: 'https://test.invalid', runScripts: 'outside-only' });
  const w = dom.window;
  w.requestAnimationFrame = callback => { callback(); return 1; };
  const originalStart = w.document.getElementById('autoStartBtn');
  let starts = 0;
  originalStart.addEventListener('click', event => { starts++; event.stopImmediatePropagation(); }, { capture: true });
  w.eval((await readFile('app/mobile.js', 'utf8')).replaceAll('export function', 'function'));
  const toggle = w.document.getElementById('appTopMenuToggle');
  const panel = w.document.getElementById('appTopMenu');
  toggle.click();
  assert.equal(panel.hidden, false);
  w.document.getElementById('undoBtn').click();
  assert.equal(panel.hidden, false);
  originalStart.click();
  assert.equal(starts, 1);
  assert.equal(panel.hidden, true);
  assert.equal(w.document.getElementById('autoStartBtn'), originalStart);
  dom.window.close();
});

test('offline BGM serves proper byte ranges and rejects an invalid range', async () => {
  const listeners = {};
  const source = (await readFile('scripts/service-worker.template.js', 'utf8'))
    .replace('__VERSION__', 'test').replace('__FILES__', '[]');
  let key;
  const cache = { match: async requestKey => { key = requestKey; return new Response('0123456789', { headers: { 'Content-Type': 'audio/mp4' } }); } };
  vm.runInNewContext(source, {
    self: { addEventListener: (name, handler) => listeners[name] = handler, location: { origin: 'https://app.invalid', href: 'https://app.invalid/card_game_app/sw.js' } },
    caches: { open: async () => cache }, URL, Request, Response, Headers,
    fetch: () => { throw new Error('Offline: the network must not be needed for a cached track'); }
  });
  for (const [range, text] of [['bytes=2-4', '234'], ['bytes=-3', '789'], ['bytes=6-', '6789']]) {
    let response;
    listeners.fetch({ request: new Request('https://app.invalid/card_game_app/assets/bgm.m4a?v=102', { headers: { Range: range } }), respondWith: promise => response = promise });
    const result = await response;
    assert.equal(result.status, 206);
    assert.equal(await result.text(), text);
    assert.equal(key, '/card_game_app/assets/bgm.m4a');
  }
  let response;
  listeners.fetch({ request: new Request('https://app.invalid/assets/bgm.m4a', { headers: { Range: 'bytes=99-' } }), respondWith: promise => response = promise });
  assert.equal((await response).status, 416);
  for (const [pathname, expected] of [['game.html', './game.html'], ['', './index.html']]) {
    listeners.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://app.invalid/card_game_app/' + pathname, headers: new Headers() }, respondWith: promise => response = promise });
    await response;
    assert.equal(key, expected, 'offline frame navigation must not recursively serve its host');
  }
});

test('WEB app manifest uses standalone landscape display', async () => {
  const manifest = JSON.parse(await readFile('www/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'landscape');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
});


test('first cache installation never reloads and game-start taps block update activation', async () => {
  const dom = new JSDOM('<body class="duelApp"><div id="battleStage"></div><button data-start-mode="com">Start</button></body>', { url: 'https://test.invalid', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, worker = new w.EventTarget(), registration = new w.EventTarget();
  let reloads = 0, activations = 0;
  registration.waiting = { postMessage: () => activations++ };
  worker.controller = null;
  worker.register = async () => registration;
  Object.defineProperty(w.navigator, 'serviceWorker', { value: worker });
  Object.defineProperty(w, 'isSecureContext', { value: true });
  w.__reload = () => reloads++;
  w.DuelEngine = { view: () => null };
  w.eval((await readFile('app/mobile.js', 'utf8')).replaceAll('export function', 'function').replace('location.reload()', 'window.__reload()'));
  worker.dispatchEvent(new w.Event('controllerchange'));
  assert.equal(reloads, 0);
  w.document.querySelector('button').click();
  await Promise.resolve();
  assert.equal(activations, 0);
  worker.dispatchEvent(new w.Event('controllerchange'));
  assert.equal(reloads, 0);
  dom.window.close();
});
