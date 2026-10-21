import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

test('an update already downloading when registration resolves is not missed', async () => {
  const dom = new JSDOM('<body class="duelApp"><div id="battleStage"></div></body>', {
    url: 'https://app.invalid', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  const service = new w.EventTarget(), registration = new w.EventTarget(), installing = new w.EventTarget();
  let activations = 0;
  installing.state = 'installing';
  installing.postMessage = () => activations++;
  registration.installing = installing;
  registration.waiting = null;
  registration.update = async () => registration;
  service.controller = {};
  service.register = async () => registration;
  Object.defineProperty(w.navigator, 'serviceWorker', { value: service });
  Object.defineProperty(w, 'isSecureContext', { value: true });
  w.DuelEngine = { view: () => null };
  w.eval((await readFile('app/mobile.js', 'utf8')).replaceAll('export function', 'function'));
  await Promise.resolve();
  installing.state = 'installed';
  registration.waiting = installing;
  installing.dispatchEvent(new w.Event('statechange'));
  assert.ok(activations > 0, 'the in-flight worker must be observed even if updatefound was already dispatched');
  dom.window.close();
});

async function installWorker(failingAsset = false) {
  const handlers = {}, saved = [];
  let activations = 0;
  const source = (await readFile('scripts/service-worker.template.js', 'utf8'))
    .replace('__VERSION__', 'migration-test').replace('__FILES__', '["./index.html","./game.html"]');
  vm.runInNewContext(source, {
    self: {
      addEventListener: (name, callback) => { handlers[name] = callback; },
      skipWaiting: async () => { activations++; },
      location: { origin: 'https://app.invalid', href: 'https://app.invalid/card_game_app/sw.js' },
    },
    caches: { open: async () => ({ put: async key => saved.push(key) }) },
    Request: class { constructor(url) { this.url = url; } },
    fetch: async request => new Response(request.url, { status: failingAsset && request.url === './game.html' ? 404 : 200 }),
    URL, Response, Headers,
  });
  let completed;
  handlers.install({ waitUntil: promise => { completed = promise; } });
  assert.equal(activations, 0, 'incomplete assets must never take control');
  if (failingAsset) await assert.rejects(completed, /Missing APP asset/);
  else await completed;
  return { activations, saved };
}

test('a complete update replaces a legacy worker without relying on its old page to activate it', async () => {
  const result = await installWorker();
  assert.deepEqual(result.saved, ['./index.html', './game.html']);
  assert.equal(result.activations, 1);
});

test('a failed update leaves the installed game in control', async () => {
  assert.equal((await installWorker(true)).activations, 0);
});
