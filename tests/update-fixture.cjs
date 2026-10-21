const fs = require('node:fs/promises');
const path = require('node:path');

// Exercise an already-installed legacy page, not a clean first visit.
async function createUpdateFixture(root, name) {
  const directory = path.join(root, name);
  await fs.mkdir(path.join(directory, 'app'), { recursive: true });
  const legacy = `<!doctype html><meta charset="utf-8"><title>Legacy installed game</title>
    <section id="appOrientation">スマホを横向きにして遊んでね！</section>
    <button id="start">対戦開始</button><button id="update">更新を確認</button><p id="state">未開始</p>
    <script>
      let started = false;
      const controlled = !!navigator.serviceWorker.controller;
      document.getElementById('start').onclick = () => { started = true; document.getElementById('state').textContent = '対戦中'; };
      document.getElementById('update').onclick = () => navigator.serviceWorker.register('./sw.js');
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (controlled && !started) location.reload();
      });
    </script>`;
  const legacyWorker = `const CACHE = 'duel-arena-app-legacy-${name}';
    self.addEventListener('install', event => event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      await cache.put('./index.html', new Response(${JSON.stringify(legacy)}, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
      await self.skipWaiting();
    })()));
    self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
    self.addEventListener('fetch', event => {
      if (event.request.mode === 'navigate') event.respondWith(caches.open(CACHE).then(cache => cache.match('./index.html')));
    });`;
  const setup = `<!doctype html><meta charset="utf-8"><button id="install">旧版を保存して開く</button>
    <script>document.getElementById('install').onclick = async () => {
      await navigator.serviceWorker.register('./legacy-worker.js');
      await navigator.serviceWorker.ready;
      location.href = './';
    };</script>`;
  const worker = (await fs.readFile('scripts/service-worker.template.js', 'utf8'))
    .replace('__VERSION__', 'migration-' + name)
    .replace('__FILES__', JSON.stringify(['./index.html', './game.html', './app/viewport.js']));
  await fs.writeFile(path.join(directory, 'setup.html'), setup);
  await fs.writeFile(path.join(directory, 'legacy-worker.js'), legacyWorker);
  await fs.writeFile(path.join(directory, 'sw.js'), worker);
  await fs.copyFile('app/host.html', path.join(directory, 'index.html'));
  await fs.copyFile('app/viewport.js', path.join(directory, 'app/viewport.js'));
  await fs.writeFile(path.join(directory, 'game.html'), '<!doctype html><meta charset="utf-8"><div id="welcome">最新版の横持ち画面</div>');
  return directory;
}
module.exports = { createUpdateFixture };
