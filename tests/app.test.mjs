import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
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
  assert.match(entry, /class="duelApp"/);
  assert.match(entry, /app\/landscape\.css/);
  assert.match(entry, /app\/mobile\.js/);
  assert.doesNotMatch(entry, /https?:\/\//);
});

test('landscape viewport follows real pixels and cancelled touches do not activate cards', async () => {
  const dom = new JSDOM('<body class="duelApp"><div id="battleStage"></div></body>', { url: 'https://test.invalid', runScripts: 'outside-only' });
  const w = dom.window;
  const viewport = new w.EventTarget();
  viewport.width = 844; viewport.height = 390;
  Object.defineProperty(w, 'visualViewport', { value: viewport });
  let resized = 0, blurred = 0, clicked = 0;
  w.DuelArena = { resize: () => resized++ };
  w.requestAnimationFrame = callback => { callback(); return 1; };
  w.addEventListener('blur', () => blurred++);
  w.document.addEventListener('click', () => clicked++);
  const source = (await readFile('app/mobile.js', 'utf8')).replaceAll('export function', 'function');
  w.eval(source);
  const gate = w.document.getElementById('appOrientation');
  assert.equal(gate.hidden, true);
  assert.equal(w.document.body.style.getPropertyValue('--app-height'), '390px');
  viewport.width = 390; viewport.height = 844;
  viewport.dispatchEvent(new w.Event('resize'));
  assert.equal(gate.hidden, false);
  assert(w.document.body.classList.contains('appPortrait'));
  viewport.width = 932; viewport.height = 430;
  w.dispatchEvent(new w.Event('orientationchange'));
  assert.equal(gate.hidden, true);
  assert.equal(w.document.body.style.getPropertyValue('--app-width'), '932px');
  w.document.dispatchEvent(new w.Event('pointercancel'));
  assert.equal(blurred, 1);
  assert.equal(clicked, 0);
  assert.equal(resized, 3);
  dom.window.close();
});

test('offline BGM serves proper byte ranges and rejects an invalid range', async () => {
  const listeners = {};
  const source = (await readFile('scripts/service-worker.template.js', 'utf8'))
    .replace('__VERSION__', 'test').replace('__FILES__', '[]');
  let key;
  const cache = { match: async requestKey => { key = requestKey; return new Response('0123456789', { headers: { 'Content-Type': 'audio/mp4' } }); } };
  vm.runInNewContext(source, {
    self: { addEventListener: (name, handler) => listeners[name] = handler, location: { origin: 'https://app.invalid' } },
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
});

test('native orientation configuration remains valid after repeated Capacitor sync', async () => {
  execFileSync('node', ['scripts/configure-native.mjs']);
  const paths = ['android/app/src/main/AndroidManifest.xml', 'ios/App/App/Info.plist', 'ios/App/App.xcodeproj/project.pbxproj'];
  const before = await Promise.all(paths.map(file => readFile(file, 'utf8')));
  execFileSync('node', ['scripts/configure-native.mjs']);
  assert.deepEqual(await Promise.all(paths.map(file => readFile(file, 'utf8'))), before);
  assert.match(before[0], /screenOrientation="sensorLandscape"/);
  assert.match(before[1], /UIInterfaceOrientationLandscapeLeft/);
  assert.match(before[1], /UIInterfaceOrientationLandscapeRight/);
  assert.doesNotMatch(before[1], /<string>UIInterfaceOrientationPortrait/);
  const plist = new JSDOM(before[1], { contentType: 'text/xml' });
  const rootKeys = [...plist.window.document.querySelector('plist > dict').children];
  for (const key of ['UIRequiresFullScreen', 'UIStatusBarHidden']) {
    assert.equal(rootKeys.find(node => node.localName === 'key' && node.textContent === key)?.nextElementSibling?.localName, 'true');
  }
  plist.window.close();
  assert.match(before[2], /IPHONEOS_DEPLOYMENT_TARGET = 17\.0;/);
});
