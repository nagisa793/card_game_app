import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory } from './files.mjs';
import { createHash } from 'node:crypto';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const upstream = JSON.parse(await readFile(path.join(root, 'upstream.json'), 'utf8'));
const files = await inventory(path.join(root, 'web'));
if (JSON.stringify(files) !== JSON.stringify(upstream.files)) {
  throw new Error('web/ differs from the recorded WEB source. Run npm run sync:web; keep APP changes in app/.');
}
const output = path.join(root, 'www');
await rm(output, { recursive: true, force: true });
await cp(path.join(root, 'web'), output, { recursive: true });
await mkdir(path.join(output, 'app'), { recursive: true });
await cp(path.join(root, 'app'), path.join(output, 'app'), { recursive: true });
let html = await readFile(path.join(output, 'index.html'), 'utf8');
if (!/name="viewport"/.test(html) || !html.includes('</head>') || !html.includes('</body>')) {
  throw new Error('The upstream entry point changed; review APP injection before building.');
}
html = html.replace(/(<meta name="viewport" content=")[^"]*(">)/,
  '$1width=device-width, initial-scale=1.0, viewport-fit=cover$2');
html = html.replace('<body>', '<body class="duelApp">');
html = html.replace('</head>', '<meta name="theme-color" content="#070f14">\n<link rel="manifest" href="./manifest.webmanifest">\n<link rel="apple-touch-icon" href="./app/icon-192.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<link rel="stylesheet" href="./app/landscape.css">\n</head>');
html = html.replace('</body>', '<script type="module" src="./app/mobile.js"></script>\n</body>');
await writeFile(path.join(output, 'index.html'), html);
await writeFile(path.join(output, 'version.json'), JSON.stringify({ commit: upstream.commit, webVersion: upstream.webVersion }, null, 2) + '\n');
await writeFile(path.join(output, 'manifest.webmanifest'), JSON.stringify({
  id: './', name: 'DUEL ARENA', short_name: 'DUEL ARENA', lang: 'ja', start_url: './', scope: './',
  display: 'standalone', orientation: 'landscape', background_color: '#070f14', theme_color: '#070f14',
  icons: [192, 512].map(size => ({ src: `./app/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' }))
}, null, 2) + '\n');
const builtFiles = Object.fromEntries(Object.entries(await inventory(output)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
const cached = Object.keys(builtFiles).map(file => './' + file);
const appRevision = createHash('sha256').update(JSON.stringify(builtFiles)).digest('hex').slice(0, 16);
const sw = (await readFile(path.join(root, 'scripts/service-worker.template.js'), 'utf8'))
  .replace('__VERSION__', upstream.commit + '-' + appRevision).replace('__FILES__', JSON.stringify(cached));
await writeFile(path.join(output, 'sw.js'), sw);
console.log(`Built APP from WEB v${upstream.webVersion} (${upstream.commit.slice(0, 7)}); ${Object.keys(files).length} original files verified.`);
